import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import {
  FaCheckCircle, FaTimesCircle, FaReceipt, FaUser, FaDollarSign,
  FaCalendarAlt, FaImage, FaShieldAlt, FaCheck, FaTimes, FaCopy,
  FaCube, FaFileContract, FaExclamationTriangle, FaLock,
  FaChevronDown, FaChevronUp, FaLink, FaFingerprint,
} from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../config";

const POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com";

const truncate = (s, a = 6, b = 4) => (s && s.length > a + b + 3 ? `${s.slice(0, a)}…${s.slice(-b)}` : s || "");
const fmtBs = (n) => `Bs. ${Number(n || 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDateTime = (ts) => new Date(Number(ts) * 1000).toLocaleString("es-BO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" }) : "—";

const timeAgo = (ts) => {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000 - Number(ts));
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `hace ${h}h ${m}min`;
  }
  return `hace ${Math.floor(diff / 86400)} días`;
};

const Field = ({ icon, label, value, danger, accent }) => (
  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-gray-400 text-xs">{icon}</span>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
    </div>
    <p className={`text-sm font-bold ${danger ? "text-[#D3423E]" : accent ? "text-emerald-700" : "text-gray-900"}`}>{value}</p>
  </div>
);

const StatusPill = ({ status }) => {
  const variants = {
    idle: { label: "No verificado", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
    verifying: { label: "Leyendo cadena…", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500 animate-pulse" },
    verified: { label: "Verificado on-chain", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    mismatch: { label: "Discrepancia detectada", bg: "bg-red-50", text: "text-[#D3423E]", dot: "bg-[#D3423E]" },
    error: { label: "Error de consulta", bg: "bg-red-50", text: "text-[#D3423E]", dot: "bg-[#D3423E]" },
  };
  const v = variants[status] || variants.idle;
  return (
    <div className={`inline-flex items-center gap-2 ${v.bg} ${v.text} px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </div>
  );
};

const ComparisonRow = ({ label, db, chain, ok, mono = true }) => (
  <div className="px-4 py-3 grid grid-cols-[110px_1fr_1fr_auto] gap-3 items-center text-xs border-b border-gray-100 last:border-b-0">
    <p className="text-gray-500 font-bold">{label}</p>
    <p className={`${mono ? "font-mono" : ""} text-gray-700 truncate`} title={db}>{db}</p>
    <p className={`${mono ? "font-mono" : ""} text-gray-900 font-semibold truncate`} title={chain}>{chain}</p>
    {ok ? <FaCheckCircle className="text-emerald-500 flex-shrink-0" size={14} /> : <FaTimesCircle className="text-[#D3423E] flex-shrink-0" size={14} />}
  </div>
);

const AdvField = ({ label, value, mono, small, onCopy, copied }) => (
  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
    <div className="flex items-center justify-between mb-1">
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
      {onCopy && (
        <button onClick={onCopy} className="text-gray-400 hover:text-[#D3423E] transition-colors">
          {copied ? <FaCheck size={9} className="text-emerald-500" /> : <FaCopy size={9} />}
        </button>
      )}
    </div>
    <p className={`${small ? "text-[11px]" : "text-xs"} ${mono ? "font-mono" : ""} font-bold text-gray-900 break-all`}>{value}</p>
  </div>
);

export const PaymentDetailModal = ({ open, item, onClose, onUpdateStatus }) => {
  const [confirmed, setConfirmed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);
  const [showImage, setShowImage] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [verifyStatus, setVerifyStatus] = useState("idle");
  const [chainData, setChainData] = useState(null);
  const [confirmations, setConfirmations] = useState(null);
  const [chainError, setChainError] = useState(null);

  useEffect(() => {
    if (open) {
      setConfirmed(null);
      setChainData(null);
      setConfirmations(null);
      setChainError(null);
      setVerifyStatus("idle");
      setShowAdvanced(false);
    }
  }, [open, item?._id]);

  const copyTo = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch (e) {}
  };

  const verifyOnChain = async () => {
    setVerifyStatus("verifying");
    setChainError(null);
    try {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
      const [receipt, tx, currentBlock] = await Promise.all([
        provider.getTransactionReceipt(item.txHash),
        provider.getTransaction(item.txHash),
        provider.getBlockNumber(),
      ]);

      if (!receipt) {
        setChainError("La transacción no se encontró en Polygon.");
        setVerifyStatus("error");
        return;
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const eventTopic = contract.interface.getEvent("PaymentRegistered").topicHash;
      const log = receipt.logs.find(
        (l) => l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() && l.topics[0] === eventTopic
      );

      if (!log) {
        setChainError("La transacción no emite el evento del contrato registrado.");
        setVerifyStatus("error");
        return;
      }

      const parsed = contract.interface.parseLog(log);
      const fee = tx?.gasPrice && receipt?.gasUsed
        ? ethers.formatEther((receipt.gasUsed * tx.gasPrice).toString())
        : null;

      const onChain = {
        orderId: parsed.args.orderId,
        amountBs: Number(parsed.args.amount) / 100,
        payer: parsed.args.payer,
        sender: parsed.args.sender,
        timestamp: Number(parsed.args.timestamp),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        feeMatic: fee,
        from: receipt.from,
      };

      setChainData(onChain);
      setConfirmations(currentBlock - receipt.blockNumber + 1);

      const dbAmount = Number(item.total);
      const dbOrderId = String(item.orderId?._id || item.orderId || "");
      const dbPayer = item.note || "";
      const ok = onChain.orderId === dbOrderId &&
                 Math.abs(onChain.amountBs - dbAmount) < 0.01 &&
                 onChain.payer === dbPayer;
      setVerifyStatus(ok ? "verified" : "mismatch");
    } catch (e) {
      console.error(e);
      setChainError(e.message || "No se pudo conectar con Polygon.");
      setVerifyStatus("error");
    }
  };

  const matches = useMemo(() => {
    if (!chainData) return null;
    const dbAmount = Number(item.total);
    const dbOrderId = String(item.orderId?._id || item.orderId || "");
    const dbPayer = item.note || "";
    return {
      orderId: chainData.orderId === dbOrderId,
      amount: Math.abs(chainData.amountBs - dbAmount) < 0.01,
      payer: chainData.payer === dbPayer,
      db: { orderId: dbOrderId, amount: dbAmount, payer: dbPayer },
    };
  }, [chainData, item]);

  const immutabilityScore = useMemo(() => {
    if (!confirmations) return null;
    if (confirmations < 12) return { level: "low", label: "Reciente", text: "Pago acaba de registrarse. Espera unos minutos para máxima inmutabilidad." };
    if (confirmations < 1000) return { level: "med", label: "Asegurado", text: `Con ${confirmations.toLocaleString()} confirmaciones, alterar este pago requeriría rehacer toda la cadena posterior.` };
    return { level: "high", label: "Inmutable", text: `${confirmations.toLocaleString()} bloques de profundidad. Computacionalmente irreversible.` };
  }, [confirmations]);

  if (!open || !item) return null;

  const hasChain = Boolean(item.txHash);

  const handleSave = async () => {
    if (!confirmed) return;
    setSaving(true);
    try {
      await onUpdateStatus(item._id, item.orderId, confirmed);
      onClose();
    } catch (e) {} finally { setSaving(false); }
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <FaReceipt size={14} className="text-[#D3423E]" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">
                    {item.paymentStatus === "paid" ? "Verificación de pago" : "Detalles del pago"}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 ml-10">Nota #{item.orderId?.receiveNumber}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasChain && <StatusPill status={verifyStatus} />}
                <button onClick={onClose} className="w-9 h-9 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl flex items-center justify-center transition-colors">
                  <FaTimes />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Información del recibo</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field icon={<FaReceipt />} label="N° de nota" value={`#${item.orderId?.receiveNumber}`} />
                  <Field icon={<FaDollarSign />} label="Monto pagado" value={fmtBs(item.total)} accent />
                  <Field icon={<FaUser />} label="Cliente" value={`${item.id_client?.name || ""} ${item.id_client?.lastName || ""}`.trim() || "—"} />
                  <Field icon={<FaCalendarAlt />} label="Fecha registro" value={fmtDate(item.creationDate)} />
                  <Field icon={<FaDollarSign />} label="Deuda actual" value={item.debt !== undefined ? fmtBs(item.debt) : "—"} danger={item.debt > 0} />
                  <Field icon={<FaDollarSign />} label="Monto total" value={fmtBs(item.orderId?.totalAmount || 0)} />
                </div>
              </div>

              {hasChain && (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-br from-gray-50 to-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                        <FaFileContract size={16} className="text-[#D3423E]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900">Contrato inteligente</p>
                        <p className="text-[11px] text-gray-500 truncate">Polygon · Chain 137 · {truncate(CONTRACT_ADDRESS, 6, 4)}</p>
                      </div>
                    </div>
                    <a
                      href={`https://polygonscan.com/tx/${item.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold text-gray-600 hover:text-[#D3423E] flex items-center gap-1.5 transition-colors flex-shrink-0"
                    >
                      PolygonScan <FiExternalLink size={11} />
                    </a>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <FaFingerprint size={10} className="text-gray-400" />
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Hash de transacción</p>
                          </div>
                          <button
                            onClick={() => copyTo(item.txHash, "tx")}
                            className="text-[10px] text-gray-500 hover:text-[#D3423E] font-bold flex items-center gap-1 transition-colors"
                          >
                            {copied === "tx" ? <><FaCheck size={9} /> Copiado</> : <><FaCopy size={9} /> Copiar</>}
                          </button>
                        </div>
                        <p className="font-mono text-[11px] text-gray-700 break-all leading-tight">{item.txHash}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FaCube size={10} className="text-gray-400" />
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Bloque</p>
                        </div>
                        <p className="font-mono text-base font-bold text-gray-900">#{Number(item.blockNumber || 0).toLocaleString()}</p>
                        {chainData?.timestamp && (
                          <p className="text-[10px] text-gray-500 mt-0.5">{timeAgo(chainData.timestamp)} · {fmtDateTime(chainData.timestamp)}</p>
                        )}
                      </div>
                    </div>

                    {verifyStatus === "idle" && (
                      <button
                        onClick={verifyOnChain}
                        className="w-full py-3 rounded-xl font-black text-sm bg-[#D3423E] text-white hover:bg-[#bb3330] transition-colors shadow-sm shadow-red-200 flex items-center justify-center gap-2"
                      >
                        <FaShieldAlt size={14} /> Verificar contra la blockchain
                      </button>
                    )}

                    {verifyStatus === "verifying" && (
                      <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center gap-3">
                        <div className="flex gap-1 items-end h-6">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-2 bg-[#D3423E] rounded-sm"
                              animate={{ height: ["30%", "100%", "30%"] }}
                              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                              style={{ height: "30%" }}
                            />
                          ))}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">Leyendo bloques de Polygon…</p>
                          <p className="text-[11px] text-gray-500">Consultando contrato sin intermediarios</p>
                        </div>
                      </div>
                    )}

                    {chainError && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                        <FaExclamationTriangle className="text-[#D3423E] mt-0.5 flex-shrink-0" size={13} />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#D3423E]">No se pudo verificar</p>
                          <p className="text-[11px] text-red-600 mt-0.5">{chainError}</p>
                          <button onClick={verifyOnChain} className="text-[11px] text-[#D3423E] underline mt-1 font-bold">Reintentar</button>
                        </div>
                      </div>
                    )}

                    {chainData && matches && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className={`rounded-xl p-3 border ${verifyStatus === "verified" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                          <div className="flex items-start gap-2.5">
                            {verifyStatus === "verified"
                              ? <FaLock className="text-emerald-600 mt-0.5 flex-shrink-0" size={14} />
                              : <FaExclamationTriangle className="text-[#D3423E] mt-0.5 flex-shrink-0" size={14} />}
                            <div>
                              <p className={`text-sm font-black ${verifyStatus === "verified" ? "text-emerald-800" : "text-[#D3423E]"}`}>
                                {verifyStatus === "verified" ? "Integridad criptográfica confirmada" : "Discrepancia con la cadena"}
                              </p>
                              <p className={`text-[11px] mt-0.5 ${verifyStatus === "verified" ? "text-emerald-700" : "text-red-700"}`}>
                                {verifyStatus === "verified"
                                  ? "Los datos del recibo coinciden exactamente con lo registrado en el contrato."
                                  : "Algún dato del recibo no coincide con la blockchain. La cadena es la fuente de verdad."}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="grid grid-cols-[110px_1fr_1fr_auto] gap-3 px-4 py-2 bg-gray-50 border border-gray-200 rounded-t-xl text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            <span>Campo</span>
                            <span>Base de datos</span>
                            <span>Blockchain</span>
                            <span className="text-right">OK</span>
                          </div>
                          <div className="border-x border-b border-gray-200 rounded-b-xl">
                            <ComparisonRow label="ID pedido" db={truncate(matches.db.orderId, 8, 6)} chain={truncate(chainData.orderId, 8, 6)} ok={matches.orderId} />
                            <ComparisonRow label="Monto" db={fmtBs(matches.db.amount)} chain={fmtBs(chainData.amountBs)} ok={matches.amount} mono={false} />
                            <ComparisonRow label="Pagador" db={matches.db.payer || "—"} chain={chainData.payer || "—"} ok={matches.payer} mono={false} />
                          </div>
                        </div>

                        {immutabilityScore && (
                          <div className="rounded-xl border border-gray-200 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <FaLink size={11} className="text-gray-400" />
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Score de inmutabilidad</p>
                              </div>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                immutabilityScore.level === "high" ? "bg-emerald-100 text-emerald-700"
                                : immutabilityScore.level === "med" ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-600"
                              }`}>
                                {immutabilityScore.label.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex items-end gap-1 mb-2 h-6">
                              {Array.from({ length: 24 }, (_, i) => {
                                const filled = i < Math.min(24, Math.floor((confirmations / 50) * 24));
                                return (
                                  <motion.div
                                    key={i}
                                    initial={{ scaleY: 0 }}
                                    animate={{ scaleY: 1 }}
                                    transition={{ delay: i * 0.02 }}
                                    className={`flex-1 rounded-sm ${filled ? "bg-emerald-500" : "bg-gray-200"}`}
                                    style={{ height: filled ? `${40 + (i % 4) * 12}%` : "30%" }}
                                  />
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-gray-600 leading-snug">{immutabilityScore.text}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{confirmations?.toLocaleString()} confirmaciones</p>
                          </div>
                        )}

                        <button
                          onClick={() => setShowAdvanced((s) => !s)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 rounded-xl border border-gray-200 transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <FaFingerprint size={10} />
                            Trazabilidad criptográfica avanzada
                          </span>
                          {showAdvanced ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
                        </button>

                        <AnimatePresence>
                          {showAdvanced && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-2 gap-2 p-1">
                                <AdvField label="Wallet firmante" value={truncate(chainData.sender, 6, 4)} mono onCopy={() => copyTo(chainData.sender, "sender")} copied={copied === "sender"} />
                                <AdvField label="Gas pagado" value={chainData.feeMatic ? `${Number(chainData.feeMatic).toFixed(6)} POL` : "—"} />
                                <AdvField label="Gas usado" value={Number(chainData.gasUsed).toLocaleString()} mono />
                                <AdvField label="Sellado on-chain" value={fmtDateTime(chainData.timestamp)} small />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {item.saleImage && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FaImage size={11} className="text-gray-500" />
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Comprobante</label>
                  </div>
                  <div
                    onClick={() => setShowImage(true)}
                    className="relative rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-[#D3423E] transition-colors group"
                  >
                    <img src={item.saleImage} alt="Recibo" className="w-full max-h-60 object-contain bg-gray-50" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <span className="text-white opacity-0 group-hover:opacity-100 bg-black/60 px-3 py-1 rounded-full text-xs font-bold">Ver imagen completa</span>
                    </div>
                  </div>
                </div>
              )}

              {item.paymentStatus === "paid" && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <p className="text-sm font-black text-gray-800 mb-3">¿Validar este pago?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { val: "confirmado", icon: FaCheck, label: "Confirmar", color: "emerald" },
                      { val: "rechazado", icon: FaTimes, label: "Rechazar", color: "red" },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const sel = confirmed === opt.val;
                      const cls = opt.color === "emerald"
                        ? sel ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                        : sel ? "border-[#D3423E] bg-[#D3423E] text-white shadow-sm shadow-red-200" : "border-gray-200 bg-white text-gray-700 hover:border-red-300";
                      return (
                        <button
                          key={opt.val} onClick={() => setConfirmed(opt.val)}
                          className={`p-3 rounded-xl border-2 flex items-center justify-center gap-2 font-black text-sm transition-all ${cls}`}
                        >
                          <Icon size={14} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                {item.paymentStatus === "paid" ? (
                  <>
                    <button onClick={onClose} className="flex-1 px-4 py-3 bg-gray-100 rounded-xl text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave} disabled={!confirmed || saving}
                      className={`flex-1 px-4 py-3 rounded-xl font-black text-sm text-white transition-all ${
                        !confirmed || saving ? "bg-gray-300 cursor-not-allowed" : "bg-[#D3423E] hover:bg-[#bb3330] shadow-sm shadow-red-200"
                      }`}
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </>
                ) : (
                  <button onClick={onClose} className="w-full px-4 py-3 bg-gray-100 rounded-xl text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showImage && item?.saleImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            onClick={() => setShowImage(false)}
          >
            <div className="relative max-w-4xl w-full">
              <img src={item.saleImage} alt="Comprobante" className="w-full max-h-[90vh] object-contain rounded-2xl" onClick={(e) => e.stopPropagation()} />
              <button onClick={() => setShowImage(false)} className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-100 shadow-xl">
                <FaTimes />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};