import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Trophy, CreditCard, Clock, DollarSign } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function TransactionHistory({ type = "all" }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
  }, [type]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me();
      if (!user) return;

      const [walletTransactions, creditTransactions, creditPurchases] = await Promise.all([
        base44.entities.WalletTransaction.filter({ user_id: user.id }),
        base44.entities.CreditTransaction.filter({ user_id: user.id }),
        base44.entities.CreditPurchase.filter({ user_id: user.id })
      ]);
      
      const formattedWallet = walletTransactions
        .filter(tx => type === "all" || tx.reference_type === "Wager" || tx.type?.startsWith("wager"))
        .map(tx => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          status: tx.status,
          date: tx.created_date,
          description: tx.description || tx.type,
        }));

      const formattedCredits = type === "wagers" ? [] : creditTransactions.map(tx => ({
        id: tx.id,
        type: tx.amount >= 0 ? "credit_gain" : "credit_spend",
        amount: tx.amount,
        credits: Math.abs(tx.amount),
        status: "completed",
        date: tx.created_date,
        description: tx.description || "Credit transaction",
      }));

      const formattedPurchases = type === "wagers" ? [] : creditPurchases.map(purchase => ({
        id: purchase.id,
        type: "deposit",
        amount: Number(purchase.price || 0),
        credits: purchase.credits,
        status: purchase.status,
        date: purchase.created_date,
        description: `Credit Purchase - ${purchase.credits} Credits`,
      }));

      setTransactions([...formattedWallet, ...formattedCredits, ...formattedPurchases].sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case "deposit":
        return <ArrowDownLeft className="w-5 h-5 text-green" />;
      case "withdrawal":
        return <ArrowUpRight className="w-5 h-5 text-orange" />;
      case "wager_win":
      case "wager_payout":
        return <Trophy className="w-5 h-5 text-cyan" />;
      case "wager_loss":
        return <DollarSign className="w-5 h-5 text-red-400" />;
      case "wager_escrow":
        return <Clock className="w-5 h-5 text-orange" />;
      default:
        return <CreditCard className="w-5 h-5 text-vapor" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "text-green bg-green/10 border-green/20";
      case "pending":
        return "text-orange bg-orange/10 border-orange/20";
      case "processing":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      default:
        return "text-vapor bg-secondary border-white/5";
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
        <p className="text-vapor text-sm">Loading transactions...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-vapor/30 mx-auto mb-4" />
        <p className="text-vapor text-sm">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx, idx) => (
        <motion.div
          key={tx.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="flex items-center gap-4 p-4 bg-secondary/30 rounded-lg border border-white/5 hover:border-white/10 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            {getTransactionIcon(tx.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{tx.description}</p>
            <p className="text-xs text-vapor">{new Date(tx.date).toLocaleDateString()}</p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-bold font-mono ${
              tx.type === "deposit" || tx.type === "wager_payout" || tx.type === "credit_gain" ? "text-green" : "text-red-400"
            }`}>
              {tx.type === "deposit" || tx.type === "wager_payout" || tx.type === "credit_gain" ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
            </p>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${getStatusColor(tx.status)}`}>
              {tx.status}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
