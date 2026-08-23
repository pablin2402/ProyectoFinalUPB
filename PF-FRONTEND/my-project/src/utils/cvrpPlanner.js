const R = 6371;
const EPS = 1e-9;
const SPLIT_FACTOR = 1.5;
const toRad = (d) => (d * Math.PI) / 180;

export const haversine = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const getLoad = (loc) => {
  const orders = Array.isArray(loc?.orders) ? loc.orders : [loc?.id_order || loc];
  let boxes = 0;
  let loose = 0;
  let lines = 0;
  orders.forEach((o) => {
    (o?.products || []).forEach((p) => {
      const qty = Number(p?.cantidad) || 0;
      const perBox = Number(p?.unidadesPorCaja) || 0;
      const full = Number(p?.caja);
      boxes += Number.isFinite(full) && full > 0 ? full : perBox ? Math.floor(qty / perBox) : 0;
      loose += perBox ? qty % perBox : qty;
      lines += 1;
    });
  });
  return { boxes, loose, lines };
};

const buildMatrix = (nodes, depot) => {
  const pts = [depot, ...nodes];
  const n = pts.length;
  const D = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = haversine(pts[i], pts[j]);
      D[i][j] = v;
      D[j][i] = v;
    }
  }
  return D;
};

const seqCost = (seq, D) => {
  if (!seq.length) return 0;
  let c = D[0][seq[0] + 1];
  for (let i = 0; i < seq.length - 1; i++) c += D[seq[i] + 1][seq[i + 1] + 1];
  return c + D[seq[seq.length - 1] + 1][0];
};

const makePenalty = (zones, zoneDepotKm) => (seq) => {
  if (seq.length < 2) return 0;
  const counts = new Map();
  seq.forEach((i) => {
    const z = zones[i];
    counts.set(z, (counts.get(z) || 0) + 1);
  });
  if (counts.size <= 1) return 0;
  let dominant = null;
  let dominantCount = -1;
  counts.forEach((c, z) => {
    if (c > dominantCount) {
      dominantCount = c;
      dominant = z;
    }
  });
  let p = 0;
  counts.forEach((c, z) => {
    if (z === dominant) return;
    p += c * 2 * (zoneDepotKm[z] || 0) * SPLIT_FACTOR;
  });
  return p;
};

const twoOpt = (seq, D) => {
  if (seq.length < 3) return seq;
  let best = seq;
  let bestC = seqCost(best, D);
  let guard = 0;
  let improved = true;
  while (improved && guard++ < 80) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const c = seqCost(cand, D);
        if (c < bestC - EPS) {
          best = cand;
          bestC = c;
          improved = true;
        }
      }
    }
  }
  return best;
};

const bestInsertion = (seq, node, D) => {
  let bestSeq = null;
  let bestC = Infinity;
  for (let p = 0; p <= seq.length; p++) {
    const cand = seq.slice(0, p).concat([node], seq.slice(p));
    const c = seqCost(cand, D);
    if (c < bestC) {
      bestC = c;
      bestSeq = cand;
    }
  }
  return { seq: bestSeq, cost: bestC };
};

const insertMany = (seq, list, D) => {
  let cur = seq.slice();
  list.forEach((n) => {
    cur = bestInsertion(cur, n, D).seq;
  });
  cur = twoOpt(cur, D);
  return { seq: cur, cost: seqCost(cur, D) };
};

const mergeRoutes = (clusters, D) => {
  let merged = true;
  let guard = 0;
  while (merged && guard++ < 20) {
    merged = false;
    for (let a = 0; a < clusters.length && !merged; a++) {
      for (let b = 0; b < clusters.length && !merged; b++) {
        if (a === b) continue;
        const A = clusters[a];
        const B = clusters[b];
        if (!A.seq.length || !B.seq.length) continue;
        const total = A.load + B.load;
        const host = A.vehicle.capacity >= B.vehicle.capacity ? A : B;
        const guest = host === A ? B : A;
        if (total > host.vehicle.capacity) continue;
        const combined = twoOpt(host.seq.concat(guest.seq), D);
        const after = seqCost(combined, D);
        if (after <= A.cost + B.cost + EPS) {
          host.seq = combined;
          host.load = total;
          host.cost = after;
          guest.seq = [];
          guest.load = 0;
          guest.cost = 0;
          merged = true;
        }
      }
    }
  }
  return clusters;
};

const interRouteImprove = (clusters, D, demands, penalty, passes = 8) => {
  const sc = (seq) => seqCost(seq, D) + penalty(seq);
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let a = 0; a < clusters.length; a++) {
      for (let b = 0; b < clusters.length; b++) {
        if (a === b) continue;
        const A = clusters[a];
        const B = clusters[b];
        for (let i = 0; i < A.seq.length; i++) {
          const node = A.seq[i];
          if (B.load + demands[node] > B.vehicle.capacity) continue;
          const strippedA = A.seq.filter((_, k) => k !== i);
          const ins = bestInsertion(B.seq, node, D);
          const before = sc(A.seq) + sc(B.seq);
          const after = sc(strippedA) + sc(ins.seq);
          if (after < before - EPS) {
            A.seq = strippedA;
            A.load -= demands[node];
            A.cost = seqCost(strippedA, D);
            B.seq = ins.seq;
            B.load += demands[node];
            B.cost = seqCost(ins.seq, D);
            changed = true;
            break;
          }
        }
      }
    }
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const A = clusters[a];
        const B = clusters[b];
        let done = false;
        for (let i = 0; i < A.seq.length && !done; i++) {
          for (let j = 0; j < B.seq.length && !done; j++) {
            const na = A.seq[i];
            const nb = B.seq[j];
            if (A.load - demands[na] + demands[nb] > A.vehicle.capacity) continue;
            if (B.load - demands[nb] + demands[na] > B.vehicle.capacity) continue;
            const sa = A.seq.slice();
            const sb = B.seq.slice();
            sa[i] = nb;
            sb[j] = na;
            const oa = twoOpt(sa, D);
            const ob = twoOpt(sb, D);
            const before = sc(A.seq) + sc(B.seq);
            const after = sc(oa) + sc(ob);
            if (after < before - EPS) {
              A.seq = oa;
              B.seq = ob;
              A.load += demands[nb] - demands[na];
              B.load += demands[na] - demands[nb];
              A.cost = seqCost(oa, D);
              B.cost = seqCost(ob, D);
              changed = true;
              done = true;
            }
          }
        }
      }
    }
    if (!changed) break;
    clusters.forEach((c) => {
      c.seq = twoOpt(c.seq, D);
      c.cost = seqCost(c.seq, D);
    });
  }
  return clusters;
};

export const planRoutes = ({ orders, depot, vehicles, defaultCapacity = 0 }) => {
  const valid = (orders || [])
    .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng))
    .map((o) => ({ ...o, boxes: Math.max(0, Number(o.boxes) || 0) }));

  const fleet = (vehicles || [])
    .map((v) => ({ ...v, capacity: Number(v.capacity) || Number(defaultCapacity) || 0 }))
    .filter((v) => v.capacity > 0)
    .sort((a, b) => b.capacity - a.capacity);

  const empty = {
    assignments: [],
    unassigned: valid,
    oversize: [],
    totals: { distance: 0, boxes: 0, stops: 0, vehicles: 0, avgUtilization: 0 },
  };
  if (!valid.length || !fleet.length) return empty;

  const maxCap = fleet[0].capacity;
  const oversize = valid.filter((o) => o.boxes > maxCap);
  const nodes = valid.filter((o) => o.boxes <= maxCap);
  if (!nodes.length) return { ...empty, unassigned: [], oversize };

  const demands = nodes.map((n) => n.boxes);
  const zones = nodes.map((n) => n.zone || "sin-zona");
  const D = buildMatrix(nodes, depot);
  const depotKm = nodes.map((n) => haversine(depot, n));

  const zoneGroups = new Map();
  nodes.forEach((n, i) => {
    const z = zones[i];
    if (!zoneGroups.has(z)) zoneGroups.set(z, { zone: z, idx: [], demand: 0, far: 0 });
    const g = zoneGroups.get(z);
    g.idx.push(i);
    g.demand += demands[i];
    g.far = Math.max(g.far, depotKm[i]);
  });

  const zoneDepotKm = {};
  zoneGroups.forEach((g, z) => {
    zoneDepotKm[z] = g.idx.reduce((s, i) => s + depotKm[i], 0) / g.idx.length;
  });
  const penalty = makePenalty(zones, zoneDepotKm);

  const clusters = fleet
    .slice(0, Math.min(fleet.length, nodes.length))
    .map((v) => ({ vehicle: v, seq: [], load: 0, cost: 0 }));

  const groups = [...zoneGroups.values()].sort((a, b) => b.far - a.far);
  const leftover = [];

  groups.forEach((g) => {
    const members = g.idx.slice().sort((a, b) => depotKm[b] - depotKm[a]);
    let pending = members;

    while (pending.length) {
      const pendingDemand = pending.reduce((s, i) => s + demands[i], 0);

      let target = null;
      let targetSeq = null;
      let bestDelta = Infinity;

      clusters.forEach((c) => {
        if (c.load + pendingDemand > c.vehicle.capacity) return;
        const trial = insertMany(c.seq, pending, D);
        const delta = (trial.cost + penalty(trial.seq)) - (c.cost + penalty(c.seq));
        if (delta < bestDelta - EPS) {
          bestDelta = delta;
          target = c;
          targetSeq = trial.seq;
        }
      });

      if (target) {
        target.seq = targetSeq;
        target.load += pendingDemand;
        target.cost = seqCost(targetSeq, D);
        break;
      }

      let host = null;
      let hostFree = -1;
      let hostScore = Infinity;
      clusters.forEach((c) => {
        const free = c.vehicle.capacity - c.load;
        if (free <= 0) return;
        const nearest = pending.reduce(
          (best, i) => Math.min(best, c.seq.length ? Math.min(...c.seq.map((j) => D[i + 1][j + 1])) : depotKm[i]),
          Infinity
        );
        const s2 = nearest - free * 0.05;
        if (s2 < hostScore - EPS) {
          hostScore = s2;
          hostFree = free;
          host = c;
        }
      });

      if (!host || hostFree <= 0) {
        leftover.push(...pending);
        break;
      }

      const take = [];
      const rest = [];
      let used = host.load;
      pending.forEach((i) => {
        if (used + demands[i] <= host.vehicle.capacity) {
          take.push(i);
          used += demands[i];
        } else {
          rest.push(i);
        }
      });

      if (!take.length) {
        leftover.push(...rest);
        break;
      }

      const placed = insertMany(host.seq, take, D);
      host.seq = placed.seq;
      host.load = used;
      host.cost = placed.cost;

      pending = rest;
    }
  });

  const stillLeft = [];
  leftover
    .slice()
    .sort((a, b) => demands[b] - demands[a])
    .forEach((node) => {
      let target = null;
      let targetSeq = null;
      let bestDelta = Infinity;
      clusters.forEach((c) => {
        if (c.load + demands[node] > c.vehicle.capacity) return;
        const base = seqCost(c.seq, D) + penalty(c.seq);
        const ins = bestInsertion(c.seq, node, D);
        const delta = seqCost(ins.seq, D) + penalty(ins.seq) - base;
        if (delta < bestDelta) {
          bestDelta = delta;
          target = c;
          targetSeq = ins.seq;
        }
      });
      if (target) {
        target.seq = targetSeq;
        target.load += demands[node];
      } else {
        stillLeft.push(node);
      }
    });

  clusters.forEach((c) => {
    c.seq = twoOpt(c.seq, D);
    c.cost = seqCost(c.seq, D);
  });

  interRouteImprove(clusters, D, demands, penalty);
  mergeRoutes(clusters, D);
  interRouteImprove(clusters, D, demands, penalty, 4);

  const assignments = clusters
    .filter((c) => c.seq.length)
    .map((c) => ({
      vehicle: c.vehicle,
      stops: c.seq.map((i) => nodes[i]),
      boxes: c.load,
      distance: c.cost,
      utilization: c.vehicle.capacity ? c.load / c.vehicle.capacity : 0,
    }))
    .sort((a, b) => b.boxes - a.boxes);

  return {
    assignments,
    unassigned: stillLeft.map((i) => nodes[i]),
    oversize,
    totals: {
      distance: assignments.reduce((s, a) => s + a.distance, 0),
      boxes: assignments.reduce((s, a) => s + a.boxes, 0),
      stops: assignments.reduce((s, a) => s + a.stops.length, 0),
      vehicles: assignments.length,
      avgUtilization: assignments.length
        ? assignments.reduce((s, a) => s + a.utilization, 0) / assignments.length
        : 0,
    },
  };
};

export const baselineManual = ({ orders, depot }) => {
  const nodes = (orders || []).filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng));
  if (!nodes.length) return { distance: 0, stops: 0 };
  const D = buildMatrix(nodes, depot);
  return { distance: seqCost(nodes.map((_, i) => i), D), stops: nodes.length };
};