import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet as WalletIcon, DollarSign, Clock, TrendingUp, ArrowUpRight, ArrowDownLeft,
  Shield, CheckCircle, CreditCard, InfoIcon
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import DepositModal from "@/components/wallet/DepositModal";
import WithdrawModal from "@/components/wallet/WithdrawModal";
import TransactionHistory from "@/components/wallet/TransactionHistory";


export default function Wallet() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await base44.auth.me();
      if (!userData) return;
      
      setUser(userData);

      // Load wallet data
      const wallets = await base44.entities.Wallet.filter({ user_id: userData.id });
      if (wallets.length > 0) {
        setUser(prev => ({ ...prev, wallet: wallets[0] }));
      }
    } catch (error) {
      console.error("Failed to load user:", error);
      toast({
        title: "Error",
        description: "Failed to load wallet data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-obsidian">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading wallet...</p>
        </div>
      </div>
    );
  }

  const walletData = user?.wallet;
  const walletBalance = Number(walletData?.available_balance ?? 0);
  const credits = user?.credits || 0;
  const pendingWagers = walletData?.pending_balance || 0;
  const withdrawable = Number(walletData?.withdrawable_balance ?? walletBalance);
  const totalEarnings = walletData?.total_earnings || user?.lifetime_earnings || 0;

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-heading mb-2">Topfragg Wallet</h1>
          <p className="text-vapor">Manage your funds for skill-based wagers</p>
        </div>

        {/* Balance Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Available Balance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl border border-cyan/20 overflow-hidden"
          >
            <div className="bg-cyan/5 border-b border-cyan/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <WalletIcon className="w-5 h-5 text-cyan" />
                <span className="text-xs font-mono font-semibold text-cyan uppercase tracking-wider">Available Balance</span>
              </div>
              <p className="text-3xl font-black text-cyan font-mono">${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <button
                onClick={() => setShowDeposit(true)}
                className="w-full py-3 bg-cyan/10 text-cyan font-bold text-sm rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 mb-2"
              >
                <ArrowDownLeft className="w-4 h-4" /> Deposit
              </button>
              <button
                onClick={() => setShowWithdraw(true)}
                disabled={withdrawable <= 0}
                className="w-full py-3 bg-green/10 text-green font-bold text-sm rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowUpRight className="w-4 h-4" /> Withdraw
              </button>
            </div>
          </motion.div>

          {/* Pending Wagers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl border border-orange/20 overflow-hidden"
          >
            <div className="bg-orange/5 border-b border-orange/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange" />
                <span className="text-xs font-mono font-semibold text-orange uppercase tracking-wider">Pending Wagers</span>
              </div>
              <p className="text-3xl font-black text-orange font-mono">${pendingWagers.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-vapor mb-2">Funds locked in active matches</p>
              <Link to="/wagers" className="text-cyan text-sm hover:underline">View Active Wagers →</Link>
            </div>
          </motion.div>

          {/* Withdrawable */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl border border-green/20 overflow-hidden"
          >
            <div className="bg-green/5 border-b border-green/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green" />
                <span className="text-xs font-mono font-semibold text-green uppercase tracking-wider">Withdrawable</span>
              </div>
              <p className="text-3xl font-black text-green font-mono">${withdrawable.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-vapor mb-2">Available for withdrawal</p>
              <div className="flex items-center gap-2 text-xs text-vapor">
                <Shield className="w-3 h-3" />
                <span>Secure withdrawals</span>
              </div>
            </div>
          </motion.div>

          {/* Total Earnings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl border border-purple/20 overflow-hidden"
          >
            <div className="bg-purple/5 border-b border-purple/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <span className="text-xs font-mono font-semibold text-purple-400 uppercase tracking-wider">Total Earnings</span>
              </div>
              <p className="text-3xl font-black text-purple-400 font-mono">${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-vapor mb-2">Lifetime wager winnings</p>
              <Link to="/dashboard" className="text-cyan text-sm hover:underline">View Stats →</Link>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="glass rounded-xl border border-white/5 overflow-hidden mb-6">
          <div className="flex border-b border-white/5">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "overview"
                  ? "bg-cyan/10 text-cyan border-b-2 border-cyan"
                  : "text-vapor hover:bg-secondary/50"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("transactions")}
              className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "transactions"
                  ? "bg-cyan/10 text-cyan border-b-2 border-cyan"
                  : "text-vapor hover:bg-secondary/50"
              }`}
            >
              Transaction History
            </button>
            <button
              onClick={() => setActiveTab("wagers")}
              className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === "wagers"
                  ? "bg-cyan/10 text-cyan border-b-2 border-cyan"
                  : "text-vapor hover:bg-secondary/50"
              }`}
            >
              Wager History
            </button>
          </div>

          <div className="p-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Quick Stats */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-secondary/50 rounded-lg p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-4 h-4 text-cyan" />
                      <span className="text-xs text-vapor uppercase">Credits Balance</span>
                    </div>
                    <p className="text-2xl font-bold text-cyan font-mono">{credits.toLocaleString()}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-green" />
                      <span className="text-xs text-vapor uppercase">Avg. Win Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-green font-mono">67%</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-orange" />
                      <span className="text-xs text-vapor uppercase">Protected Balance</span>
                    </div>
                    <p className="text-2xl font-bold text-orange font-mono">100%</p>
                  </div>
                </div>

                {/* Info Cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-cyan/5 border border-cyan/20 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-cyan mb-2 flex items-center gap-2">
                      <InfoIcon className="w-4 h-4" />
                      About Deposits
                    </h3>
                    <p className="text-xs text-vapor leading-relaxed">
                      Deposit funds securely via Base44 Payments. Funds are available instantly for wagers. 
                      Minimum deposit: $5.00. All transactions are protected and secure.
                    </p>
                  </div>
                  <div className="bg-green/5 border border-green/20 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-green mb-2 flex items-center gap-2">
                      <InfoIcon className="w-4 h-4" />
                      About Withdrawals
                    </h3>
                    <p className="text-xs text-vapor leading-relaxed">
                      Withdraw your winnings anytime. Processing time: 1-3 business days. 
                      Minimum withdrawal: $10.00. Must have no active wagers.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "transactions" && (
              <TransactionHistory type="all" />
            )}

            {activeTab === "wagers" && (
              <TransactionHistory type="wagers" />
            )}
          </div>
        </div>

        {/* Modals */}
        <DepositModal
          isOpen={showDeposit}
          onClose={() => {
            setShowDeposit(false);
            loadUserData();
          }}
        />
        <WithdrawModal
          isOpen={showWithdraw}
          onClose={() => {
            setShowWithdraw(false);
            loadUserData();
          }}
          availableBalance={withdrawable}
        />
      </div>
    </div>
  );
}
