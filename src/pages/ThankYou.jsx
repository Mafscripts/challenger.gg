import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, Coins, Loader2, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ThankYou() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const query = new URLSearchParams(location.search);
  const paymentConfirmed = query.get("status") === "success" || query.get("checkout") === "success" || query.has("session_id");

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl border border-white/5 p-8 max-w-md w-full mx-4 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${paymentConfirmed ? "bg-green/15" : "bg-orange/12"}`}
        >
          {paymentConfirmed ? <CheckCircle className="h-8 w-8 text-green" /> : <ShieldAlert className="h-8 w-8 text-orange" />}
        </motion.div>
        <h1 className="mb-2 text-2xl font-black">{paymentConfirmed ? "Payment confirmed" : "Payment status unavailable"}</h1>
        <p className="mb-6 text-sm text-vapor">
          {paymentConfirmed
            ? "Your confirmed balance is shown below."
            : "No verified checkout confirmation was found. Your balance has not been presented as a successful payment."}
        </p>

        {loading ? (
          <Loader2 className="w-6 h-6 text-cyan animate-spin mx-auto" />
        ) : (
          <div className="bg-secondary/50 rounded-lg p-4 mb-6 border border-white/5">
            <div className="flex items-center justify-center gap-2">
              <Coins className="w-6 h-6 text-green" />
              <span className="text-3xl font-black font-mono text-green">{user?.credits || 0}</span>
            </div>
            <p className="text-xs text-vapor uppercase tracking-wider mt-1">Current Balance</p>
          </div>
        )}

        <Link
          to="/wallet"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-cyan/10 text-cyan text-sm font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all"
        >
          Back to Wallet
        </Link>
      </motion.div>
    </div>
  );
}
