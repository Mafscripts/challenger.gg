import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, Coins, Zap, Check, Flame } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function ForgeModal({ open, onClose }) {
  const [user, setUser] = useState(null);
  const [forging, setForging] = useState(false);
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      base44.auth.me().then(async (currentUser) => {
        const wallets = await base44.entities.Wallet.filter({ user_id: currentUser.id });
        setUser({ ...currentUser, wallet_balance: Number(wallets[0]?.available_balance ?? 0) });
      }).catch(() => {});
    } else {
      setSuccess(false);
      setResult(null);
      setForging(false);
    }
  }, [open]);

  const walletBalance = user?.wallet_balance || 0;
  const credits = user?.credits || 0;
  const potentialCredits = Math.floor(walletBalance);

  const handleForge = async () => {
    setForging(true);
    try {
      const res = await base44.functions.invoke("forgeMoneyToCredits", {});
      if (res?.data?.success) {
        setResult(res.data);
        setTimeout(() => {
          setSuccess(true);
          setForging(false);
          toast({ title: "Forge complete!", description: `${res.data.forged_amount} credits added to your account.` });
          setTimeout(() => {
            onClose();
          }, 5000);
        }, 2200);
      } else {
        toast({ variant: "destructive", title: "Forge failed", description: res?.data?.error || "Something went wrong." });
        setForging(false);
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Forge failed", description: "Something went wrong." });
      setForging(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl border border-white/10 p-8 w-full max-w-md relative overflow-hidden"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-orange/10 rounded-full blur-[80px]" />

            <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-vapor hover:text-foreground hover:bg-white/5 transition-all z-10">
              <X className="w-4 h-4" />
            </button>

            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-orange/20 flex items-center justify-center">
                  <Flame className="w-6 h-6 text-orange" />
                </div>
                <div>
                  <h2 className="text-xl font-black">Forge Credits</h2>
                  <p className="text-vapor text-xs">Convert tournament winnings to credits</p>
                </div>
              </div>

              {!forging && !success && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="glass rounded-xl p-4 border border-green/20 text-center">
                      <Wallet className="w-5 h-5 text-green mx-auto mb-2" />
                      <p className="text-2xl font-black font-mono text-green">${walletBalance.toFixed(2)}</p>
                      <p className="text-[10px] text-vapor uppercase tracking-wider">Wallet</p>
                    </div>
                    <div className="glass rounded-xl p-4 border border-cyan/20 text-center">
                      <Coins className="w-5 h-5 text-cyan mx-auto mb-2" />
                      <p className="text-2xl font-black font-mono text-cyan">{credits}</p>
                      <p className="text-[10px] text-vapor uppercase tracking-wider">Credits</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 mb-6 text-sm">
                    <span className="text-green font-mono font-bold">${walletBalance.toFixed(2)}</span>
                    <Zap className="w-4 h-4 text-orange" />
                    <span className="text-cyan font-mono font-bold">{potentialCredits} Credits</span>
                  </div>

                  <button
                    onClick={handleForge}
                    disabled={walletBalance <= 0}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-orange to-orange/80 text-white font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-orange/25 transition-all uppercase tracking-wider disabled:opacity-50"
                  >
                    <Flame className="w-4 h-4" /> Forge Now
                  </button>

                  {walletBalance <= 0 && (
                    <p className="text-center text-xs text-vapor mt-3">No tournament winnings to forge.</p>
                  )}
                </>
              )}

              {forging && (
                <div className="py-10 flex flex-col items-center relative">
                  {/* Transformation flow: Money → Forge → Credits */}
                  <div className="flex items-center justify-center gap-5 mb-6 relative">
                    {/* Money (wallet) - pulsing into forge */}
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1], scale: [1, 0.85, 1], y: [0, -4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-14 h-14 rounded-xl bg-green/20 border border-green/30 flex items-center justify-center">
                        <Wallet className="w-7 h-7 text-green" />
                      </div>
                      <span className="text-[10px] text-green font-mono font-bold mt-1.5 uppercase">Money</span>
                    </motion.div>

                    {/* Energy beam left */}
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3], x: [-3, 3, -3] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Zap className="w-5 h-5 text-orange" />
                    </motion.div>

                    {/* Forge crucible - central glowing core */}
                    <div className="relative">
                      <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className="absolute inset-0 rounded-full bg-orange/30 blur-xl"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.7, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                        className="absolute inset-0 rounded-full bg-orange/20 blur-2xl"
                      />
                      <motion.div
                        animate={{ rotate: 360, scale: [1, 1.15, 1] }}
                        transition={{ rotate: { duration: 3, repeat: Infinity, ease: "linear" }, scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } }}
                        className="relative w-20 h-20 rounded-full bg-gradient-to-br from-orange via-orange/80 to-orange/30 flex items-center justify-center glow-orange"
                      >
                        <Flame className="w-10 h-10 text-white drop-shadow-lg" />
                      </motion.div>
                    </div>

                    {/* Energy beam right */}
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3], x: [3, -3, 3] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Zap className="w-5 h-5 text-cyan" />
                    </motion.div>

                    {/* Credits (coins) - emerging from forge */}
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1], scale: [1, 1.2, 1], y: [0, -4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-14 h-14 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
                        <Coins className="w-7 h-7 text-cyan" />
                      </div>
                      <span className="text-[10px] text-cyan font-mono font-bold mt-1.5 uppercase">Credits</span>
                    </motion.div>
                  </div>

                  {/* Flying coin particles - money to credits */}
                  <div className="relative h-6 w-full overflow-hidden mb-2">
                    {[...Array(8)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -40, y: 0, scale: 0.5 }}
                        animate={{ opacity: [0, 1, 0], x: [-40, 40], y: [0, -25 - (i % 3) * 8, 0], scale: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.22, ease: "easeOut" }}
                        className="absolute left-1/2"
                      >
                        <Coins className="w-4 h-4 text-cyan drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]" />
                      </motion.div>
                    ))}
                  </div>

                  {/* Spark particles from forge */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={`spark-${i}`}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], y: [0, -50 - (i % 2) * 20], x: [(i - 3) * 8] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeOut" }}
                      className="absolute top-10 left-1/2"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-orange shadow-[0_0_6px_rgba(249,115,22,0.8)]" />
                    </motion.div>
                  ))}

                  <motion.p
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="text-orange font-bold text-sm uppercase tracking-wider mt-2"
                  >
                    Forging...
                  </motion.p>
                </div>
              )}

              {success && result && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-8 flex flex-col items-center text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                    className="w-20 h-20 rounded-full bg-green/20 flex items-center justify-center mb-4"
                  >
                    <Check className="w-10 h-10 text-green" />
                  </motion.div>
                  <p className="text-2xl font-black text-green mb-1">+{result.forged_amount} Credits</p>
                  <p className="text-vapor text-sm mb-6">Successfully forged from tournament winnings</p>
                  <button onClick={onClose} className="px-6 py-2 bg-cyan/10 text-cyan text-sm font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all">
                    Done
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
