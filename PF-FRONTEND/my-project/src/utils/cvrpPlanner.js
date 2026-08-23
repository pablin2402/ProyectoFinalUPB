const R = 6371;
const EPS = 1e-9;
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

const sweepOrder = (nodes, depot) => {
  const ang = nodes.map((n) => Math.atan2(n.lat - depot.lat, n.lng - depot.lng));
  const zones = new Map();
  nodes.forEach((n, i) => {
    const key = n.zone || "sin-zona";
    if (!zones.has(key)) zones.set(key, []);
    zones.get(key).push(i);
  });
  const meanAngle = (idxs) => {
    const x = idxs.reduce((s, i) => s + Math.cos(ang[i]), 0) / idxs.length;
    const y = idxs.reduce((s, i) => s + Math.sin(ang[i]), 0) / idxs.length;
    return Math.atan2(y, x);
  };
  return [...zones.values()]
    .sort((a, b) => meanAngle(a) - meanAngle(b))
    .flatMap((idxs) => idxs.slice().sort((a, b) => ang[a] - ang[b]));
};

const interRouteImprove = (clusters, D, demands, passes = 4) => {
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
          const before = A.cost + B.cost;
          const after = seqCost(strippedA, D) + ins.cost;
          if (after < before - EPS) {
            A.seq = strippedA;
            A.load -= demands[node];
            A.cost = seqCost(strippedA, D);
            B.seq = ins.seq;
            B.load += demands[node];
            B.cost = ins.cost;
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
            const after = seqCost(oa, D) + seqCost(ob, D);
            if (after < A.cost + B.cost - EPS) {
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
  const totalDemand = demands.reduce((s, d) => s + d, 0);
  const D = buildMatrix(nodes, depot);

  let k = 0;
  let covered = 0;
  while (k < fleet.length && covered < totalDemand) {
    covered += fleet[k].capacity;
    k += 1;
  }
  k = Math.max(1, Math.min(k, fleet.length, nodes.length));

  const used = fleet.slice(0, Math.min(fleet.length, nodes.length)).sort((a, b) => a.capacity - b.capacity);
  const softTarget = Math.ceil(totalDemand / k);

  const order = sweepOrder(nodes, depot);
  const suffix = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + demands[order[i]];

  const clusters = used.map((v) => ({ vehicle: v, seq: [], load: 0, cost: 0 }));
  const leftover = [];
  let ci = 0;

  order.forEach((node, idx) => {
    while (ci < clusters.length) {
      const c = clusters[ci];
      const capLeft = c.vehicle.capacity - c.load;
      if (demands[node] > capLeft) {
        ci += 1;
        continue;
      }
      const restCapacity = clusters.slice(ci + 1).reduce((s, r) => s + r.vehicle.capacity, 0);
      const mustFill = suffix[idx + 1] > restCapacity;
      if (c.load + demands[node] <= softTarget || mustFill || !c.seq.length) {
        c.seq.push(node);
        c.load += demands[node];
        return;
      }
      ci += 1;
    }
    leftover.push(node);
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
        const base = seqCost(c.seq, D);
        const ins = bestInsertion(c.seq, node, D);
        const delta = ins.cost - base;
        const emptyBonus = c.seq.length ? 0 : -EPS;
        if (delta + emptyBonus < bestDelta) {
          bestDelta = delta + emptyBonus;
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

  interRouteImprove(clusters, D, demands);

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