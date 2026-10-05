import React, { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { DollarSign } from "lucide-react";

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function WagerMoneyResultOverlay({ result, onContinue, matchLabel = "Wager", continueLabel = "Continue to wagers" }) {
  const reduceMotion = useReducedMotion();
  const balance = useMotionValue(Number(result.previous_balance || 0));
  const displayedBalance = useTransform(balance, (value) => formatMoney(value));
  const [showContinue, setShowContinue] = useState(Boolean(reduceMotion));
  const won = Boolean(result.won);
  const delta = Number(result.match_delta || 0);

  useEffect(() => {
    balance.set(Number(result.previous_balance || 0));
    if (reduceMotion) {
      balance.set(Number(result.new_balance || 0));
      setShowContinue(true);
      return undefined;
    }
    setShowContinue(false);
    const controls = animate(balance, Number(result.new_balance || 0), {
      delay: 0.72,
      duration: 1.55,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setShowContinue(true),
    });
    return () => controls.stop();
  }, [balance, reduceMotion, result.new_balance, result.previous_balance]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div initial={{ opacity: 0, y: 32, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-2xl ${won ? "border-green/35" : "border-red-500/35"}`}>
        <motion.div className={`absolute inset-x-0 top-0 h-1 origin-left ${won ? "bg-green" : "bg-red-500"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.15, duration: 0.7 }} />
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}><DollarSign className="h-8 w-8" /></div>
        <p className={`mt-5 text-xs font-black uppercase tracking-[0.24em] ${won ? "text-green" : "text-red-400"}`}>{won ? `${matchLabel} won` : `${matchLabel} lost`}</p>
        <h2 className="mt-2 text-4xl font-black">{result.score || "Match complete"}</h2>

        <div className="mt-6 rounded-2xl border border-white/5 bg-background/45 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Wallet balance</p>
          <motion.p className={`mt-2 font-mono text-4xl font-black tabular-nums ${won ? "text-green" : "text-red-400"}`}>{displayedBalance}</motion.p>
          <p className={`mt-2 font-mono text-lg font-black ${delta > 0 ? "text-green" : delta < 0 ? "text-red-400" : "text-vapor"}`}>{delta > 0 ? `+${formatMoney(delta)}` : delta < 0 ? `-${formatMoney(Math.abs(delta))}` : formatMoney(0)}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-vapor">{delta > 0 ? "Net profit" : delta < 0 ? "Entry lost" : "No personal balance change"}</p>
          <div className="mt-4 flex justify-between text-xs text-vapor"><span>{formatMoney(result.previous_balance)}</span><span>→</span><span className="font-bold text-white">{formatMoney(result.new_balance)}</span></div>
        </div>

        <AnimatePresence>{showContinue && <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={onContinue} className="mt-6 w-full rounded-xl bg-green px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">{continueLabel}</motion.button>}</AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
