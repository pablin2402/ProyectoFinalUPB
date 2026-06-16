import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import {
  FaCheckCircle, FaTimesCircle, FaReceipt, FaUser, FaDollarSign,
  FaCalendarAlt, FaImage, FaShieldAlt, FaCheck, FaTimes, FaCopy,
  FaCube, FaFileContract, FaExclamationTriangle, FaLock,
} from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../config";

const POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com";

const InfoCell = ({ icon, label, value, danger, highlight }) => (
  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-gray-400 text-xs">{icon}</span>
      <p className="text-[10px] text-gray-500 font-black uppercase tracking-wider">{label}</p>
    </div>
    <p className={`text-sm font-bold ${danger ? "text-[#D3423E]" : highlight ? "text-emerald-700" : "text-gray-900"}`}>
      {value}
    </p>
  </div>
);

const truncate = (s, a = 6, b = 4) => (s && s.length > a + b + 3 ? `${s.slice(0, a)}…${s.slice(-b)}` : s || "");

const fmtBs = (n) => `Bs. ${Number(n || 0).toFixed(2)}`;
const fmtDate = (ts) => {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString("es-BO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const PaymentDetailModal = ({ open, item, onClose, onUpdateStatus }) => {
  const [confirmed, setConfirmed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);
  const [showImage, setShowImage] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null);
  const [chainData, setChainData] = useState(null);
  const [confirmations, setConfirmations] = useState(null);
  const [chainError, setChainError] = useState(null);

  useEffect(() => {
    if (open) {
      setConfirmed(null);
      setVerified(null);
      setChainData(null);
      setConfirmations(null);
      setChainError(null);
    }
  }, [open, item?._id]);

  if (!open || !item) return null;

  const copyTo = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch (e) { }
  };

  const verifyOnChain = async () => {
    setVerifying(true);
    setVerified(null);
    setChainData(null);
    setChainError(null);
    try {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

      const [receipt, tx, currentBlock] = await Promise.all([
        provider.getTransactionReceipt(item.txHash),
        provider.getTransaction(item.txHash),
        provider.getBlockNumber(),
      ]);

      if (!receipt) {
        setChainError("Transacción no encontrada en Polygon");
        setVerified(false);
        return;
      }

      const block = await provider.getBlock(receipt.blockNumber);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const eventTopic = contract.interface.getEvent("PaymentRegistered").topicHash;
      const log = receipt.logs.find(
        (l) => l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() && l.topics[0] === eventTopic
      );

      if (!log) {
        setChainError("La transacción no emite el evento PaymentRegistered de este contrato");
        setVerified(false);
        return;
      }

      const parsed = contract.interface.parseLog(log);
      const onChain = {
        orderId: parsed.args.orderId,
        amountCents: Number(parsed.args.amount),
        amountBs: Number(parsed.args.amount) / 100,
        payer: parsed.args.payer,
        sender: parsed.args.sender,
        timestamp: Number(parsed.args.timestamp),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx?.gasPrice
          ? ethers.formatUnits(tx.gasPrice.toString(), "gwei")
          : null,

        feeMatic:
          tx?.gasPrice && receipt?.gasUsed
            ? ethers.formatEther(
              (receipt.gasUsed * tx.gasPrice).toString()
            )
            : null,
        status: receipt.status,
        from: receipt.from,
        to: receipt.to,
        blockTimestamp: block?.timestamp,
      };

      setChainData(onChain);
      setConfirmations(currentBlock - receipt.blockNumber + 1);
      setVerified(true);
    } catch (e) {
      console.error(e);
      setChainError(e.message || "Error al consultar la blockchain");
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  };

  const dbAmount = Number(item.total);
  const dbOrderId = String(item.orderId?._id || item.orderId || "");
  const dbPayer = item.note || "";
  const matches = chainData ? {
    orderId: chainData.orderId === dbOrderId,
    amount: Math.abs(chainData.amountBs - dbAmount) < 0.01,
    payer: chainData.payer === dbPayer,
  } : null;
  const allMatch = matches && matches.orderId && matches.amount && matches.payer;

  const handleSave = async () => {
    if (!confirmed) return;
    setSaving(true);
    try {
      await onUpdateStatus(item._id, item.orderId, confirmed);
      onClose();
    } catch (e) { } finally { setSaving(false); }
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-gradient-to-br from-[#D3423E] to-red-700 text-white flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-lg font-black">
                  {item.paymentStatus === "paid" ? "Verificación de pago" : "Detalles del pago"}
                </h3>
                <p className="text-xs text-red-100 mt-0.5">Nota #{item.orderId?.receiveNumber}</p>
              </div>
              <button onClick={onClose} className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors">
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Información del recibo (base de datos)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <InfoCell icon={<FaReceipt />} label="N° de nota" value={`#${item.orderId?.receiveNumber}`} />
                  <InfoCell icon={<FaDollarSign />} label="Monto pagado" value={fmtBs(item.total)} highlight />
                  <InfoCell icon={<FaUser />} label="Cliente" value={`${item.id_client?.name || ""} ${item.id_client?.lastName || ""}`.trim() || "—"} />
                  <InfoCell icon={<FaCalendarAlt />} label="Fecha registro" value={item.creationDate ? new Date(item.creationDate).toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" }) : "—"} />
                  <InfoCell icon={<FaDollarSign />} label="Deuda actual" value={item.debt !== undefined ? fmtBs(item.debt) : "—"} danger={item.debt > 0} />
                  <InfoCell icon={<FaDollarSign />} label="Monto total" value={fmtBs(item.orderId?.totalAmount || 0)} />
                </div>
              </div>

              {item.txHash && (
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-5 shadow-xl border border-purple-900/50">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                        <FaFileContract className="text-purple-300" size={18} />
                      </div>
                      <div>
                        <h3 className="font-black text-base tracking-wide">CONTRATO INTELIGENTE</h3>
                        <p className="text-xs text-purple-300">Polygon Mainnet · Chain ID 137</p>
                      </div>
                    </div>
                    {verified === true && allMatch && (
                      <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-full px-3 py-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-black text-emerald-300">VERIFICADO</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] uppercase text-purple-300 font-black tracking-wider">Transaction Hash</p>
                        <button
                          onClick={() => copyTo(item.txHash, "tx")}
                          className="text-[10px] text-purple-300 hover:text-white font-bold flex items-center gap-1"
                        >
                          {copied === "tx" ? <><FaCheck size={9} /> Copiado</> : <><FaCopy size={9} /> Copiar</>}
                        </button>
                      </div>
                      <p className="font-mono text-xs break-all">{item.txHash}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] uppercase text-purple-300 font-black tracking-wider flex items-center gap-1"><FaCube size={9} /> Bloque</p>
                        </div>
                        <p className="font-mono text-sm">#{Number(item.blockNumber || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] uppercase text-purple-300 font-black tracking-wider">Contrato</p>
                          <button onClick={() => copyTo(CONTRACT_ADDRESS, "contract")} className="text-[10px] text-purple-300 hover:text-white">
                            {copied === "contract" ? <FaCheck size={9} /> : <FaCopy size={9} />}
                          </button>
                        </div>
                        <p className="font-mono text-xs">{truncate(CONTRACT_ADDRESS, 8, 6)}</p>
                      </div>
                    </div>
                  </div>

                  {verified === null && (
                    <button
                      onClick={verifyOnChain}
                      disabled={verifying}
                      className="w-full bg-purple-500 hover:bg-purple-400 transition-all rounded-xl py-3 font-black flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {verifying ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Leyendo blockchain...
                        </>
                      ) : (
                        <>
                          <FaShieldAlt size={14} /> Verificar contra el smart contract
                        </>
                      )}
                    </button>
                  )}

                  {chainError && (
                    <div className="bg-red-500/20 border border-red-400/40 rounded-xl p-3 text-sm flex items-start gap-2">
                      <FaExclamationTriangle className="text-red-300 mt-0.5 flex-shrink-0" size={14} />
                      <div>
                        <p className="font-black text-red-200">No se pudo verificar</p>
                        <p className="text-xs text-red-300 mt-0.5">{chainError}</p>
                        <button onClick={verifyOnChain} className="text-xs text-red-200 underline mt-1 font-bold">Reintentar</button>
                      </div>
                    </div>
                  )}

                  {chainData && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <div className={`rounded-xl p-3 border ${allMatch ? "bg-emerald-500/10 border-emerald-400/40" : "bg-amber-500/10 border-amber-400/40"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {allMatch ? <FaLock className="text-emerald-300" /> : <FaExclamationTriangle className="text-amber-300" />}
                          <p className="font-black text-sm">
                            {allMatch ? "Integridad criptográfica confirmada" : "Discrepancia detectada"}
                          </p>
                        </div>
                        <p className="text-xs text-purple-100">
                          {allMatch
                            ? "Los datos guardados en nuestra base coinciden exactamente con los registrados en el smart contract."
                            : "Algún dato en la base no coincide con la blockchain. La fuente de verdad es el contrato."}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase font-black text-purple-300 tracking-wider mb-2">Datos leídos directamente del contrato</p>
                        <div className="bg-black/30 rounded-xl border border-white/10 divide-y divide-white/10">
                          <ComparisonRow label="ID de pedido" db={truncate(dbOrderId, 8, 6)} chain={truncate(chainData.orderId, 8, 6)} ok={matches.orderId} />
                          <ComparisonRow label="Monto pagado" db={fmtBs(dbAmount)} chain={fmtBs(chainData.amountBs)} ok={matches.amount} />
                          <ComparisonRow label="Pagador" db={dbPayer || "—"} chain={chainData.payer || "—"} ok={matches.payer} />
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase font-black text-purple-300 tracking-wider mb-2">Metadatos del bloque</p>
                        <div className="grid grid-cols-2 gap-2">
                          <ChainStat label="Wallet firmante" value={truncate(chainData.sender, 6, 4)} mono />
                          <ChainStat label="Confirmaciones" value={confirmations?.toLocaleString() || "—"} />
                          <ChainStat label="Sellado en cadena" value={fmtDate(chainData.timestamp)} small />
                          <ChainStat label="Gas pagado" value={chainData.feeMatic ? `${Number(chainData.feeMatic).toFixed(6)} POL` : "—"} small />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <a
                    href={`https://polygonscan.com/tx/${item.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full mt-3 bg-white text-purple-700 hover:bg-purple-50 transition-all rounded-xl py-3 font-black flex items-center justify-center gap-2"
                  >
                    Ver en PolygonScan <FiExternalLink />
                  </a>
                </div>
              )}

              {item.saleImage && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FaImage size={11} className="text-gray-500" />
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Comprobante</label>
                  </div>
                  <div
                    onClick={() => setShowImage(true)}
                    className="relative rounded-xl border-2 border-gray-200 overflow-hidden cursor-pointer hover:border-[#D3423E] transition-colors"
                  >
                    <img src={item.saleImage} alt="Recibo" className="w-full max-h-60 object-contain bg-gray-50" />
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
                      const colors = opt.color === "emerald"
                        ? sel ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                        : sel ? "border-[#D3423E] bg-[#D3423E] text-white" : "border-gray-200 bg-white text-gray-700 hover:border-red-300";
                      return (
                        <button key={opt.val} onClick={() => setConfirmed(opt.val)}
                          className={`p-3 rounded-xl border-2 flex items-center justify-center gap-2 font-black text-sm transition-all ${colors}`}>
                          <Icon size={14} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {item.paymentStatus === "paid" ? (
                  <>
                    <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 bg-white rounded-xl text-gray-700 font-black text-sm hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave} disabled={!confirmed || saving}
                      className={`flex-1 px-4 py-3 rounded-xl font-black text-sm text-white transition-all ${!confirmed || saving ? "bg-gray-300 cursor-not-allowed" : "bg-[#D3423E] hover:bg-red-700 shadow-lg"
                        }`}
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                  </>
                ) : (
                  <button onClick={onClose} className="w-full px-4 py-3 border-2 border-[#D3423E] bg-white rounded-xl text-[#D3423E] font-black text-sm hover:bg-red-50">
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

const ComparisonRow = ({ label, db, chain, ok }) => (
  <div className="px-3 py-2.5 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center text-xs">
    <p className="text-purple-300 font-bold">{label}</p>
    <p className="font-mono text-purple-100 truncate" title={db}>{db}</p>
    <p className="font-mono text-white truncate" title={chain}>{chain}</p>
    {ok ? <FaCheckCircle className="text-emerald-400 flex-shrink-0" size={14} /> : <FaTimesCircle className="text-red-400 flex-shrink-0" size={14} />}
  </div>
);

const ChainStat = ({ label, value, mono, small }) => (
  <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
    <p className="text-[9px] uppercase text-purple-300 font-black tracking-wider mb-1">{label}</p>
    <p className={`${small ? "text-[11px]" : "text-xs"} ${mono ? "font-mono" : ""} font-bold text-white`}>{value}</p>
  </div>
);