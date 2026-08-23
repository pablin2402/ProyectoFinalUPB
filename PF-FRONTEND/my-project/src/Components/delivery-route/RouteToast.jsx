import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaExclamationTriangle, FaInfoCircle, FaCheckCircle, FaTimes, FaTimesCircle } from "react-icons/fa";

const TONES = {
  warning: { bar: "#F59E0B", bg: "#FFFBEB", icon: FaExclamationTriangle, color: "#B45309" },
  info: { bar: "#2563EB", bg: "#EFF6FF", icon: FaInfoCircle, color: "#1D4ED8" },
  success: { bar: "#16A34A", bg: "#F0FDF4", icon: FaCheckCircle, color: "#15803D" },
  error: { bar: "#D3423E", bg: "#FEF2F2", icon: FaTimesCircle, color: "#B32E2A" },
};

export const RouteToast = ({ toast, onClose }) => {
  const tone = TONES[toast?.tone] || TONES.warning;
  const Icon = tone.icon;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] w-[min(92%,420px)]"
        >
          <div
            className="flex items-start gap-3 rounded-2xl border border-black/5 shadow-xl overflow-hidden"
            style={{ background: tone.bg }}
          >
            <div style={{ width: 5, alignSelf: "stretch", background: tone.bar }} />
            <div className="flex items-start gap-3 py-3.5 pr-3 flex-1">
              <Icon size={16} style={{ color: tone.bar, marginTop: 2, flexShrink: 0 }} />
              <div className="flex-1">
                {toast.title && (
                  <p className="text-[13px] font-black leading-tight" style={{ color: tone.color }}>
                    {toast.title}
                  </p>
                )}
                {toast.message && (
                  <p className="text-[12px] text-gray-700 font-medium mt-0.5 leading-snug">
                    {toast.message}
                  </p>
                )}
                {toast.hint && (
                  <p className="text-[11px] text-gray-500 font-medium mt-1 leading-snug">
                    {toast.hint}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 shrink-0"
              >
                <FaTimes size={11} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};