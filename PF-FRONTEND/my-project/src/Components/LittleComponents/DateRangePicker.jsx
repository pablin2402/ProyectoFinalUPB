import React, { useState, useMemo, useRef, useEffect } from "react";
import { FaChevronLeft, FaChevronRight, FaRegCalendarAlt, FaArrowRight } from "react-icons/fa";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fromKey = (s) => {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const sameDay = (a, b) => a && b && toKey(a) === toKey(b);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const label = (s) => {
  const d = fromKey(s);
  if (!d) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()} ${d.getFullYear()}`;
};

const buildGrid = (cursor) => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7) cells.push(null);
  return cells;
};

export const DateRangePicker = ({ startDate, endDate, setStartDate, setEndDate, minDate }) => {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => fromKey(startDate) || new Date());
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  const start = fromKey(startDate);
  const end = fromKey(endDate);
  const min = minDate ? startOfDay(fromKey(minDate) || new Date(minDate)) : startOfDay(new Date());

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const cells = useMemo(() => buildGrid(cursor), [cursor]);
  const rangeEnd = end || hover;

  const inRange = (d) => {
    if (!start || !rangeEnd) return false;
    const t = d.getTime();
    return t > Math.min(start.getTime(), rangeEnd.getTime()) && t < Math.max(start.getTime(), rangeEnd.getTime());
  };

  const pick = (d) => {
    if (!start || (start && end)) {
      setStartDate(toKey(d));
      setEndDate("");
      setHover(null);
      return;
    }
    if (d < start) {
      setStartDate(toKey(d));
      return;
    }
    setEndDate(toKey(d));
    setOpen(false);
  };

  const quick = (days) => {
    const s = startOfDay(new Date());
    const e = new Date(s);
    e.setDate(e.getDate() + days);
    setStartDate(toKey(s));
    setEndDate(toKey(e));
    setCursor(s);
    setOpen(false);
  };

  const nights = start && end ? Math.round((end - start) / 86400000) : null;

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 bg-white border rounded-2xl transition-all text-left ${
          open ? "border-[#D3423E] ring-2 ring-red-100" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
          <FaRegCalendarAlt size={13} className="text-[#D3423E]" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Vigencia de la ruta</span>
          <span className="flex items-center gap-2 mt-0.5">
            <span className={`text-sm font-bold ${start ? "text-gray-900" : "text-gray-400"}`}>
              {label(startDate) || "Inicio"}
            </span>
            <FaArrowRight size={9} className="text-gray-300" aria-hidden="true" />
            <span className={`text-sm font-bold ${end ? "text-gray-900" : "text-gray-400"}`}>
              {label(endDate) || "Fin"}
            </span>
          </span>
        </span>
        {nights != null && (
          <span className="text-[11px] font-black px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
            {nights + 1}d
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-2 w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                {[["Hoy", 0], ["3 días", 2], ["Semana", 6]].map(([txt, d]) => (
                  <button
                    key={txt}
                    type="button"
                    onClick={() => quick(d)}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-[11px] font-bold text-gray-600 transition-colors"
                  >
                    {txt}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                  aria-label="Mes anterior"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  <FaChevronLeft size={11} aria-hidden="true" />
                </button>
                <span className="text-sm font-extrabold text-gray-900">
                  {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
                </span>
                <button
                  type="button"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                  aria-label="Mes siguiente"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  <FaChevronRight size={11} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d, i) => (
                  <span key={i} className="text-[10px] font-black text-gray-400 text-center py-1">{d}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setHover(null)}>
                {cells.map((d, i) => {
                  if (!d) return <span key={i} />;
                  const disabled = d < min;
                  const isStart = sameDay(d, start);
                  const isEnd = sameDay(d, end);
                  const mid = inRange(d);
                  const isToday = sameDay(d, startOfDay(new Date()));
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(d)}
                      onMouseEnter={() => start && !end && setHover(d)}
                      className={`relative h-9 text-[13px] font-bold transition-colors ${
                        disabled ? "text-gray-300 cursor-not-allowed" : "text-gray-700 hover:bg-gray-100"
                      } ${mid ? "bg-red-50 text-[#D3423E]" : ""} ${isStart ? "rounded-l-lg" : ""} ${
                        isEnd ? "rounded-r-lg" : ""
                      } ${!mid && !isStart && !isEnd ? "rounded-lg" : ""}`}
                    >
                      <span
                        className={`absolute inset-0.5 rounded-lg flex items-center justify-center ${
                          isStart || isEnd ? "bg-[#D3423E] text-white shadow-sm" : ""
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {isToday && !isStart && !isEnd && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#D3423E]" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-500">
                  {!start ? "Elegí la fecha de inicio" : !end ? "Ahora la fecha de fin" : `${nights + 1} día(s) de vigencia`}
                </span>
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); setHover(null); }}
                  className="text-[11px] font-bold text-gray-400 hover:text-[#D3423E] transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};