import React, { useMemo, useRef, useEffect } from "react";
import { GoogleMap, Marker, Polyline, OverlayView, Polygon } from "@react-google-maps/api";
import { MUNICIPIOS_COCHABAMBA } from "../../utils/CochabambaMunicipios";
import { MAP_STYLE_MODERN, CONTAINER_STYLE } from "../../utils/MapDetails";
import { getTripColor } from "../../utils/RouteOptimizer";
import { MapSkeleton } from "./RouteSkeletons";

export const ROUTE_PALETTE = ["#D3423E", "#1A73E8", "#188038", "#E37400", "#6A3AB2", "#00897B", "#C5221F", "#5F6368"];
const PALE_FILL = "#D7DDE5";
const PALE_RING = "#E2E8F0";

export const routeColorFor = (id) => {
  const s = String(id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ROUTE_PALETTE[h % ROUTE_PALETTE.length];
};

const CHANNEL_COLORS = {
  mayorista: "#8B5CF6",
  tienda: "#3B82F6",
  bar: "#F59E0B",
  restaurante: "#EF4444",
};

const channelColor = (ch) => CHANNEL_COLORS[String(ch || "").toLowerCase()] || "#64748B";

const getLoad = (loc) => {
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

const radiusFor = (n) => (n >= 40 ? 25 : n >= 15 ? 22.5 : n >= 5 ? 20.5 : 18.5);

const fontFor = (n) => {
  const d = String(n).length;
  return d >= 4 ? 12 : d === 3 ? 14.5 : d === 2 ? 17 : 18.5;
};

const buildLoadIcon = ({ count, loose = 0, color, stopIndex = null, ringColor = null, faded = false, dashed = false }) => {
  const r = radiusFor(count);
  const fs = fontFor(count);
  const label = count > 0 ? count : loose;
  const opacity = faded ? 0.32 : 1;
  const textColor = faded ? "#94A3B8" : "#FFFFFF";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs><filter id="sh" x="-60%" y="-60%" width="220%" height="220%">
<feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#0F172A" flood-opacity="${faded ? 0.12 : 0.32}"/>
</filter></defs>
<g opacity="${opacity}">
<circle cx="32" cy="32" r="${r + 5}" fill="${ringColor || color}" opacity="0.16"/>
<circle cx="32" cy="32" r="${r}" fill="#FFFFFF" filter="url(#sh)"/>
${ringColor ? `<circle cx="32" cy="32" r="${r - 1}" fill="none" stroke="${ringColor}" stroke-width="2.6"${dashed ? ' stroke-dasharray="4 3"' : ""}/>` : ""}
<circle cx="32" cy="32" r="${r - 3.4}" fill="${color}"/>
<text x="32" y="${32 + fs * 0.35}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${fs}" font-weight="700" fill="${textColor}">${label}</text>
${count > 0 && loose > 0 ? `<circle cx="${32 + r * 0.72}" cy="${32 + r * 0.72}" r="4.6" fill="#FFFFFF"/><circle cx="${32 + r * 0.72}" cy="${32 + r * 0.72}" r="3" fill="${color}"/>` : ""}
${stopIndex != null ? `<g transform="translate(${32 + r * 0.78}, ${32 - r * 0.78})"><circle r="9.5" fill="${faded ? PALE_RING : ringColor || "#0F172A"}"/><circle r="9.5" fill="none" stroke="#FFFFFF" stroke-width="2"/><text x="0" y="3.6" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="${faded ? "#94A3B8" : "#FFFFFF"}">${stopIndex}</text></g>` : ""}
</g></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const DEPOT_PIN = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="76" height="92" viewBox="0 0 76 92">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#B32E2A"/>
</linearGradient>
<filter id="d" x="-60%" y="-60%" width="220%" height="220%">
<feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#0F172A" flood-opacity="0.45"/>
</filter>
</defs>
<ellipse cx="38" cy="84" rx="11" ry="3.5" fill="#0F172A" opacity="0.25"/>
<g filter="url(#d)">
<path d="M38 4C22.5 4 10 16.5 10 32c0 20 28 48 28 48s28-28 28-48C66 16.5 53.5 4 38 4z" fill="url(#g)"/>
<path d="M38 4C22.5 4 10 16.5 10 32c0 20 28 48 28 48s28-28 28-48C66 16.5 53.5 4 38 4z" fill="none" stroke="#FFFFFF" stroke-width="3"/>
<circle cx="38" cy="31" r="16" fill="#FFFFFF"/>
<path d="M38 20 L52 29.5 L52 43 L47 43 L47 33 L29 33 L29 43 L24 43 L24 29.5 Z" fill="#000000"/>
<rect x="31.5" y="35.5" width="13" height="7.5" rx="1" fill="#000000"/>
</g>
</svg>`)}`;

const legPaths = (result, color) => {
  const route = result?.routes?.[0];
  if (!route) return [];
  const legs = route.legs || [];
  const built = legs
    .map((leg, i) => ({
      path: (leg.steps || []).flatMap((s) => s.lat_lngs || s.path || []),
      color,
      key: `${i}-${leg.start_address ?? i}`,
    }))
    .filter((l) => l.path.length > 1);
  if (built.length) return built;
  return route.overview_path?.length ? [{ path: route.overview_path, color, key: "ov" }] : [];
};

export const RouteMap = ({
  isLoaded, center, mapZoom, mapRef,
  showMunicipios = true, selectedMunicipio, setSelectedMunicipio, fitMunicipio,
  filteredMarkers, selectedMarkers, selectedTripView,
  iconsReady, handleMarkerClick, handleDelete,
  directionsResponse, vehicleCapacity,
  plan, planDirections, focusedVehicleId, onFocusVehicle, onStopClick, hidePlanOverlay,
}) => {
  const routeColor = selectedTripView ? getTripColor(selectedTripView) : "#D3423E";
  const hasZoneFilter = Boolean(selectedMunicipio);
  const planActive = Boolean(plan?.assignments?.length);
  const routeActive = Boolean(directionsResponse) || planActive;
  const planId = plan?.id ?? "none";

  const linesRef = useRef([]);

  const keepLine = (line) => {
    if (line) linesRef.current.push(line);
  };

  const dropLine = (line) => {
    if (!line) return;
    line.setMap(null);
    linesRef.current = linesRef.current.filter((l) => l !== line);
  };

  useEffect(() => {
    if (!planActive && !directionsResponse) {
      linesRef.current.forEach((l) => {
        try { l.setMap(null); } catch (e) { }
      });
      linesRef.current = [];
    }
  }, [planActive, directionsResponse, planId]);

  useEffect(() => {
    return () => {
      linesRef.current.forEach((l) => {
        try { l.setMap(null); } catch (e) { }
      });
      linesRef.current = [];
    };
  }, []);

  const planned = useMemo(() => {
    if (!planActive) return { byId: {}, routes: [] };
    const byId = {};
    const ids = plan.assignments.map((a) => a.vehicle.id).sort();
    const routes = plan.assignments.map((a) => {
      const color = ROUTE_PALETTE[ids.indexOf(a.vehicle.id) % ROUTE_PALETTE.length];
      a.stops.forEach((s, si) => {
        byId[s._id] = { color, stopIndex: si + 1, vehicleId: a.vehicle.id, vehicleName: a.vehicle.name };
      });
      return { ...a, color };
    });
    return { byId, routes };
  }, [plan, planActive]);

  const legacyLegs = useMemo(() => (planActive ? [] : legPaths(directionsResponse, routeColor)), [directionsResponse, routeColor, planActive]);
  const legacyPath = useMemo(() => legacyLegs.flatMap((l) => l.path), [legacyLegs]);

  const cumulativeByStop = useMemo(() => {
    let acc = 0;
    return selectedMarkers.map((c) => {
      acc += getLoad(c).boxes;
      return acc;
    });
  }, [selectedMarkers]);

  const totalLoose = useMemo(() => selectedMarkers.reduce((s, c) => s + getLoad(c).loose, 0), [selectedMarkers]);
  const totalBoxes = cumulativeByStop.length ? cumulativeByStop[cumulativeByStop.length - 1] : 0;
  const overCapacity = Boolean(vehicleCapacity) && totalBoxes > vehicleCapacity;

  if (!isLoaded) return <MapSkeleton />;

  const arrow = (color) => ({
    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 1.8,
    strokeColor: "#FFFFFF",
    strokeWeight: 1,
    fillColor: color,
    fillOpacity: 1,
  });

  const iconSize = new window.google.maps.Size(58, 58);
  const iconAnchor = new window.google.maps.Point(29, 29);
  const hasFocus = Boolean(focusedVehicleId);
  const stateOf = (id) => (!hasFocus ? "idle" : focusedVehicleId === id ? "on" : "off");

  return (
    <GoogleMap
      mapContainerStyle={CONTAINER_STYLE}
      center={center}
      zoom={mapZoom}
      onLoad={(map) => {
        mapRef.current = map;
        new window.google.maps.Marker({
          position: { lat: -17.39012, lng: -66.16321 },
          map,
          icon: {
            url: DEPOT_PIN,
            scaledSize: new window.google.maps.Size(58, 70),
            anchor: new window.google.maps.Point(29, 70),
          },
          title: "Depósito · punto de partida",
          zIndex: 99999,
        });
      }}
      options={{
        disableDefaultUI: true,
        zoomControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: "greedy",
        styles: MAP_STYLE_MODERN,
      }}
    >
            {showMunicipios && Object.values(MUNICIPIOS_COCHABAMBA).map((m) => {
        const isSelected = selectedMunicipio === m.id;
        const isDimmed = (hasZoneFilter && !isSelected) || routeActive;
        
        return (
          <React.Fragment key={m.id}>
            <Polygon
              paths={m.paths}
              options={{
                fillColor: m.fillColor,
                fillOpacity: isSelected && !routeActive ? 0.18 : isDimmed ? 0.05 : m.fillOpacity,
                strokeColor: isSelected ? m.strokeColor : m.strokeColor || "#94A3B8",
                strokeOpacity: isDimmed ? 0.5 : Math.max(m.strokeOpacity ?? 0, 0.8),
                strokeWeight: isSelected ? 2 : 1.2,
                zIndex: 1,
                clickable: !routeActive,
              }}
              onClick={() => {
                setSelectedMunicipio(isSelected ? "" : m.id);
                if (!isSelected) fitMunicipio(m.id);
              }}
            />
            <OverlayView position={m.center} mapPaneName={OverlayView.OVERLAY_LAYER}>
              <div
                className="pointer-events-none select-none"
                style={{
                  transform: "translate(-50%, -50%)",
                  background: isSelected && !routeActive ? m.strokeColor : "rgba(255,255,255,0.92)",
                  color: isSelected && !routeActive ? "#FFFFFF" : "#475569",
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  borderRadius: 999,
                  boxShadow: "0 1px 4px rgba(15, 23, 42, 0.18)",
                  opacity: isDimmed ? 0.25 : 0.95,
                  whiteSpace: "nowrap",
                }}
              >
                {m.name}
              </div>
            </OverlayView>
          </React.Fragment>
        );
      })}

      {planActive && planned.routes.map((r) => {
        const st = stateOf(r.vehicle.id);
        if (st === "off") return null;
        const dirs = planDirections?.[r.vehicle.id];
        if (!dirs) return null;
        const legs = legPaths(dirs, r.color);
        const w = st === "on" ? 4 : 2.6;
        return (
          <React.Fragment key={`${planId}-${r.vehicle.id}-${r.stops.length}`}>
            {legs.map((leg) => (
              <Polyline
                key={`${r.vehicle.id}-${leg.key}`}
                path={leg.path}
                onLoad={keepLine}
                onUnmount={dropLine}
                options={{
                  strokeColor: r.color,
                  strokeOpacity: 1,
                  strokeWeight: w,
                  zIndex: st === "on" ? 20 : 15,
                  clickable: true,
                                    icons: [
                    {
                      icon: {
                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 2,
                        strokeColor: r.color,
                        strokeWeight: 1,
                        fillColor: r.color,
                        fillOpacity: 1,
                      },
                      offset: "40px",
                      repeat: "140px",
                    },
                  ],
                }}
                onClick={() => onFocusVehicle && onFocusVehicle(st === "on" ? null : r.vehicle.id)}
              />
            ))}
          </React.Fragment>
        );
      })}

      {planActive && planned.routes.flatMap((r) => {
        const st = stateOf(r.vehicle.id);
        const off = st === "off";
        return r.stops.map((s) => {
          const meta = planned.byId[s._id];
          const load = getLoad(s.raw || s);
          return (
            <Marker
              key={`${planId}-ps-${s._id}`}
              position={{ lat: s.lat, lng: s.lng }}
              icon={{
                url: buildLoadIcon({
                  count: load.boxes || s.boxes || 0,
                  loose: load.loose,
                  color: off ? PALE_FILL : channelColor(s.raw?.id_client?.userCategory || s.raw?.userCategory),
                  stopIndex: meta.stopIndex,
                  ringColor: off ? PALE_RING : meta.color,
                  faded: off,
                }),
                scaledSize: iconSize,
                anchor: iconAnchor,
              }}
              title={`${meta.vehicleName} · parada ${meta.stopIndex} — ${load.boxes || s.boxes || 0} caja(s)`}
              onClick={() => (onFocusVehicle ? onFocusVehicle(meta.vehicleId) : undefined)}
              zIndex={off ? 500 : 1500 + meta.stopIndex}
            />
          );
        });
      })}

      {planActive && (plan.unassigned || []).map((s) => {
        const load = getLoad(s.raw || s);
        return (
          <Marker
            key={`${planId}-un-${s._id}`}
            position={{ lat: s.lat, lng: s.lng }}
            icon={{
              url: buildLoadIcon({
                count: load.boxes || s.boxes || 0,
                loose: load.loose,
                color: hasFocus ? PALE_FILL : "#94A3B8",
                ringColor: hasFocus ? PALE_RING : "#475569",
                dashed: true,
                faded: hasFocus,
              }),
              scaledSize: iconSize,
              anchor: iconAnchor,
            }}
            title={`Sin asignar — ${load.boxes || s.boxes || 0} caja(s)`}
            onClick={() => (onStopClick ? onStopClick(s, null) : undefined)}
            zIndex={800}
          />
        );
      })}

      {!planActive && filteredMarkers.map((loc, i) => {
        const cl = loc.id_client?.client_location || loc.client_location;
        if (!cl?.latitud || !cl?.longitud) return null;
        if (selectedMarkers.some((m) => m._id === loc._id)) return null;
        const ch = loc.id_client?.userCategory || loc.userCategory;
        const load = getLoad(loc);
        return (
          <Marker
            key={`a-${loc._id || i}`}
            position={{ lat: Number(cl.latitud), lng: Number(cl.longitud) }}
            icon={{
              url: buildLoadIcon({ count: load.boxes, loose: load.loose, color: channelColor(ch), faded: routeActive }),
              scaledSize: iconSize,
              anchor: iconAnchor,
            }}
            title={`${loc.id_client?.name ?? ""} ${loc.id_client?.lastName ?? ""} — ${load.boxes} caja(s)${load.loose ? ` + ${load.loose} u` : ""}`.trim()}
            onClick={() => handleMarkerClick(loc)}
            zIndex={1}
          />
        );
      })}

      {!planActive && selectedMarkers.map((c, i) => {
        if (!c.client_location?.latitud || !c.client_location?.longitud) return null;
        const ch = c.id_client?.userCategory || c.userCategory;
        const load = getLoad(c);
        return (
          <Marker
            key={`s-${c._id}`}
            position={{ lat: Number(c.client_location.latitud), lng: Number(c.client_location.longitud) }}
            icon={{
              url: buildLoadIcon({
                count: load.boxes,
                loose: load.loose,
                color: channelColor(ch),
                stopIndex: i + 1,
                ringColor: routeColor,
              }),
              scaledSize: iconSize,
              anchor: iconAnchor,
            }}
            title={`Parada ${i + 1} — ${load.boxes} caja(s) · acumulado ${cumulativeByStop[i]} — clic para quitar`}
            onClick={() => handleDelete(c._id)}
            zIndex={1000 + i}
          />
        );
      })}

      {!planActive && legacyPath.length > 0 && (
        <Polyline
          path={legacyPath}
          onLoad={keepLine}
          onUnmount={dropLine}
          options={{ strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: 5, zIndex: 10 }}
        />
      )}

      {!planActive && legacyLegs.map((leg) => (
        <Polyline
          key={leg.key}
          path={leg.path}
          onLoad={keepLine}
          onUnmount={dropLine}
          options={{
            strokeColor: leg.color,
            strokeOpacity: 0.95,
            strokeWeight: 2.6,
            zIndex: 11,
            icons: [{ icon: arrow(leg.color), offset: "30px", repeat: "120px" }],
          }}
        />
      ))}

      {planActive && !hidePlanOverlay && (
        <div
          className="pointer-events-none select-none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            padding: "8px 14px",
            background: "rgba(255,255,255,0.96)",
            borderRadius: 12,
            boxShadow: "0 4px 14px rgba(15,23,42,0.18)",
            zIndex: 20,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>
            {plan.totals.vehicles} rutas · {plan.totals.distance.toFixed(1)} km
          </span>
        </div>
      )}

      {!planActive && selectedMarkers.length > 0 && (
        <div
          className="pointer-events-none select-none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            background: "rgba(255,255,255,0.96)",
            borderRadius: 12,
            boxShadow: "0 4px 14px rgba(15,23,42,0.18)",
            borderLeft: `4px solid ${overCapacity ? "#EF4444" : routeColor}`,
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: "#64748B", textTransform: "uppercase" }}>
              Carga de la ruta
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: overCapacity ? "#991B1B" : "#0F172A" }}>
              {totalBoxes} cajas
              {vehicleCapacity ? <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}> / {vehicleCapacity}</span> : null}
              {totalLoose > 0 ? <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}> + {totalLoose} u</span> : null}
            </span>
          </div>
          <div style={{ width: 1, height: 26, background: "#E2E8F0" }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: "#64748B", textTransform: "uppercase" }}>
              Paradas
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{selectedMarkers.length}</span>
          </div>
        </div>
      )}
    </GoogleMap>
  );
};