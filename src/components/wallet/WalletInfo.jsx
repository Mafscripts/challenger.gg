import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, DollarSign, Shield, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";

export default function WalletInfo({ user, wagerAmount }) {
  const [walletBalance, setWalletBalance] = useState(user?.wallet_balance || 0);

  useEffect(() => {
    const loadWallet = async () => {
      if (!user?.id) {
        setWalletBalance(0);
        return;
      }
      try {
        const wallets = await base44.entities.Wallet.filter({ user_id: user.id });
        setWalletBalance(wallets[0]?.available_balance ?? user.wallet_balance ?? 0);
      } catch (error) {
        setWalletBalance(user.wallet_balance || 0);
      }
    };
    loadWallet();
  }, [user?.id, user?.wallet_balance]);

  const safeWagerAmount = wagerAmount || 0;
  const canAfford = walletBalance >= safeWagerAmount;
  const insufficientAmount = safeWagerAmount - walletBalance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-white/5 p-4 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-green" />
          <h3 className="text-sm font-bold text-foreground">Your Wallet</h3>
        </div>
        <Link to="/wallet" className="text-xs text-cyan hover:underline">
          Manage Wallet →
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Available Balance */}
        <div className="bg-secondary/50 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green" />
            <span className="text-[10px] text-vapor uppercase">Available</span>
          </div>
          <p className={`text-lg font-bold font-mono ${canAfford ? "text-green" : "text-red-400"}`}>
            ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Wager Amount */}
        <div className="bg-secondary/50 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-orange" />
            <span className="text-[10px] text-vapor uppercase">Entry Fee</span>
          </div>
          <p className="text-lg font-bold font-mono text-orange">
            ${safeWagerAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Potential Payout */}
        <div className="bg-secondary/50 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-cyan" />
            <span className="text-[10px] text-vapor uppercase">Pot (Win)</span>
          </div>
          <p className="text-lg font-bold font-mono text-cyan">
            ${(safeWagerAmount * 2).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {!canAfford && (
        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400 font-bold">Insufficient Balance</span>
              <span className="text-xs text-vapor">Need ${insufficientAmount.toFixed(2)} more</span>
            </div>
            <Link
              to="/wallet"
              className="px-3 py-1.5 bg-green/10 text-green text-xs font-bold rounded hover:bg-green/20 transition-all uppercase"
            >
              Deposit
            </Link>
          </div>
        </div>
      )}
    </motion.div>
  );
}
