import React, { useState } from "react";
import { FaTruck, FaRoute, FaChevronDown, FaTimes, FaBoxes, FaExclamationTriangle } from "react-icons/fa";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ROUTE_PALETTE } from "./RouteMap";

export const FleetPlanPanel = ({
  plan, baselineKm, focusedVehicleId, onFocusVehicle, onCreateRoute, onClear, onStopClick,
}) => {
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(null);
  const saved = baselineKm > 0 ? ((baselineKm - plan.totals.distance) / baselineKm) * 100 : 0;

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Plan de flota</span>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-bold text-gray-400 hover:text-[#D3423E] flex items-center gap-1 transition-colors"
          >
            <FaTimes size={9} aria-hidden="true" /> Descartar
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            ["Rutas", plan.totals.vehicles],
            ["Paradas", plan.totals.stops],
            ["Cajas", plan.totals.boxes],
            ["Uso", `${Math.round(plan.totals.avgUtilization * 100)}%`],
          ].map(([k, v]) => (
            <div key={k} className="bg-white rounded-xl border border-gray-100 py-2 text-center">
              <div className="text-base font-black text-gray-900 tabular-nums">{v}</div>
              <div className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">{k}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200 flex items-baseline justify-between">
          <span className="text-xs font-bold text-gray-500">Recorrido total</span>
          <div className="flex items-baseline gap-2">
            {baselineKm > 0 && (
              <span className="text-[11px] font-bold text-gray-400 line-through tabular-nums">
                {baselineKm.toFixed(1)} km
              </span>
            )}
            <span className="text-lg font-black text-gray-900 tabular-nums">
              {plan.totals.distance.toFixed(1)} km
            </span>
          </div>
        </div>

        {saved > 0 && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
            <span className="text-[11px] font-extrabold text-emerald-700">
              −{saved.toFixed(1)}% de kilometraje frente al orden manual
            </span>
          </div>
        )}
      </div>

      {plan.assignments.map((a) => {
        const ids = plan.assignments.map((x) => x.vehicle.id).sort();
        const color = ROUTE_PALETTE[ids.indexOf(a.vehicle.id) % ROUTE_PALETTE.length];
        const focused = focusedVehicleId === a.vehicle.id;
        const open = expanded === a.vehicle.id;
        const pct = Math.min(Math.round(a.utilization * 100), 100);
        return (
          <div
            key={a.vehicle.id}
            className={`rounded-2xl border bg-white transition-all ${focused ? "border-transparent ring-2 shadow-md" : "border-gray-200"}`}
            style={focused ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
          >
            <button
              type="button"
              onClick={() => onFocusVehicle(focused ? null : a.vehicle.id)}
              className="w-full px-4 pt-3 pb-2 text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}1A` }}>
                  <FaTruck size={12} style={{ color }} aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold text-gray-900 truncate">{a.vehicle.name}</span>
                  <span className="block text-[11px] font-semibold text-gray-500">
                    {a.stops.length} paradas · {a.distance.toFixed(1)} km
                  </span>
                </span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: `${color}1A`, color }}>
                  {pct}%
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={reducedMotion ? false : { width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: reducedMotion ? 0 : 0.4 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <span className="text-[10px] font-bold text-gray-500 tabular-nums flex items-center gap-1">
                  <FaBoxes size={9} className="text-gray-400" aria-hidden="true" />
                  {a.boxes}/{a.vehicle.capacity}
                </span>
              </div>
            </button>

            <div className="px-4 pb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onCreateRoute(a)}
                className="flex-1 px-3 py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                style={{ backgroundColor: color }}
              >
                <FaRoute size={11} aria-hidden="true" /> Crear ruta
              </button>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : a.vehicle.id)}
                aria-label="Ver paradas"
                className="px-3 py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors"
              >
                <motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-flex">
                  <FaChevronDown size={11} aria-hidden="true" />
                </motion.span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {open && (
                <motion.ul
                  initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-gray-100"
                >
                  {a.stops.map((s, si) => (
                    <li key={s._id}>
                      <button
                        type="button"
                        onClick={() => onStopClick && onStopClick(s)}
                        className="w-full px-4 py-2 flex items-center gap-2.5 hover:bg-gray-50 text-left transition-colors"
                      >
                        <span
                          className="w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {si + 1}
                        </span>
                        <span className="flex-1 min-w-0 text-xs font-semibold text-gray-700 truncate">
                          {s.raw?.id_client?.name
                            ? `${s.raw.id_client.name} ${s.raw.id_client.lastName ?? ""}`.trim()
                            : s.raw?.razonSocial || s._id}
                        </span>
                        <span className="text-[11px] font-bold text-gray-400 tabular-nums">{s.boxes} cj</span>
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {(plan.unassigned?.length > 0 || plan.oversize?.length > 0) && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <FaExclamationTriangle size={11} className="text-red-500" aria-hidden="true" />
            <span className="text-[10px] font-black text-red-700 uppercase tracking-wide">Sin cubrir</span>
          </div>
          <p className="text-[11px] font-semibold text-red-700 leading-relaxed">
            {plan.unassigned?.length || 0} pedido(s) quedaron fuera por falta de flota disponible
            {plan.oversize?.length ? `, y ${plan.oversize.length} exceden la capacidad de cualquier camión` : ""}.
          </p>
        </div>
      )}
    </div>
  );
};