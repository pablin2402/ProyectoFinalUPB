import { useEffect, useRef, useState } from "react";

const keyOf = (a) => `${a.vehicle.id}|${a.stops.map((s) => s._id).join(",")}`;

export const useRoutePlanDirections = (plan, depot, isLoaded) => {
  const cache = useRef(new Map());
  const [, bump] = useState(0);

  useEffect(() => {
    if (!isLoaded || !plan?.assignments?.length) return;
    const svc = new window.google.maps.DirectionsService();
    let cancelled = false;
    const pending = plan.assignments.filter((a) => !cache.current.has(keyOf(a)));
    if (!pending.length) return;
    Promise.all(
      pending.map(
        (a) =>
          new Promise((res) => {
            svc.route(
              {
                origin: depot,
                destination: depot,
                waypoints: a.stops.slice(0, 23).map((s) => ({ location: { lat: s.lat, lng: s.lng }, stopover: true })),
                optimizeWaypoints: false,
                travelMode: window.google.maps.TravelMode.DRIVING,
              },
              (r, status) => res([keyOf(a), status === "OK" ? r : null])
            );
          })
      )
    ).then((entries) => {
      if (cancelled) return;
      entries.forEach(([k, r]) => { if (r) cache.current.set(k, r); });
      bump((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [plan, depot, isLoaded]);

  const out = {};
  (plan?.assignments || []).forEach((a) => {
    const r = cache.current.get(keyOf(a));
    if (r) out[a.vehicle.id] = r;
  });
  return out;
};