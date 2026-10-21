import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet as WalletIcon, DollarSign, Clock, TrendingUp, ArrowUpRight, ArrowDownLeft,
  Shield, CheckCircle, CreditCard, InfoIcon
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import TransactionHistory from "@/components/wallet/TransactionHistory";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";
import { publicCommerceEnabled } from "@/lib/commerce";
import AccountPageHero from "@/components/ui/AccountPageHero";
import PageLoader from "@/components/ui/PageLoader";
import useRouteSection from "@/hooks/useRouteSection";


export default function Wallet() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useRouteSection("tab", "overview", ["overview", "transactions", "wagers"]);

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
    return <PageLoader label="Loading wallet" />;
  }

  const walletData = user?.wallet;
  const walletBalance = Number(walletData?.available_balance ?? 0);
  const credits = user?.credits || 0;
  const pendingWagers = walletData?.pending_balance || 0;
  const withdrawable = Number(walletData?.withdrawable_balance ?? walletBalance);
  const totalEarnings = walletData?.total_earnings || user?.lifetime_earnings || 0;
  const wagerWins = Number(user?.wager_wins || 0);
  const wagerLosses = Number(user?.wager_losses || 0);
  const wagerWinRate = wagerWins + wagerLosses > 0
    ? Math.round((wagerWins / (wagerWins + wagerLosses)) * 100)
    : 0;

  return (
    <div className="account-page wallet-page competition-surface page-shell" data-competition="wallet">
      <div className="page-container">
        
        <AccountPageHero mode="wallet" description={publicCommerceEnabled ? "View your available balance, winnings and transaction history." : "View your test balance and transaction history."} metadata={publicCommerceEnabled ? "Your wallet activity" : "Virtual test credits · No cash value"} action={<>
          <Link to="/my-matches" className="competition-action-pill account-primary-action"><TrendingUp size={16} />My Matches</Link>
          <Link to="/my-tickets" className="competition-action-pill"><Shield size={16} />Get support</Link>
        </>} />

        <CommercePausedNotice className="mb-6" />

        {/* Balance Cards */}
        <div className="wallet-balance-grid grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Available Balance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="wallet-balance-card account-panel" data-tone="cyan"
          >
            <div className="bg-cyan/5 border-b border-cyan/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <WalletIcon className="w-5 h-5 text-cyan" />
                <span className="text-xs font-mono font-semibold text-cyan uppercase tracking-wider">{publicCommerceEnabled ? "Available Balance" : "Test Balance"}</span>
              </div>
              <p className="text-3xl font-black text-cyan font-mono">${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <button
                type="button"
                disabled
                className="mb-2 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] py-3 text-sm font-bold uppercase tracking-wider text-vapor"
              >
                <ArrowDownLeft className="w-4 h-4" /> {publicCommerceEnabled ? "Deposits coming soon" : "Deposits Paused"}
              </button>
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] py-3 text-sm font-bold uppercase tracking-wider text-vapor"
              >
                <ArrowUpRight className="w-4 h-4" /> {publicCommerceEnabled ? "Withdrawals coming soon" : "Withdrawals Paused"}
              </button>
            </div>
          </motion.div>

          {/* Pending Wagers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="wallet-balance-card account-panel" data-tone="gold"
          >
            <div className="bg-orange/5 border-b border-orange/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange" />
                <span className="text-xs font-mono font-semibold text-orange uppercase tracking-wider">{publicCommerceEnabled ? "Pending Wagers" : "Pending Test Entries"}</span>
              </div>
              <p className="text-3xl font-black text-orange font-mono">${pendingWagers.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-vapor mb-2">{publicCommerceEnabled ? "Funds locked in active matches" : "Test credits used in active matches"}</p>
              <Link to="/wagers" className="text-cyan text-sm hover:underline">View Active Wagers →</Link>
            </div>
          </motion.div>

          {/* Withdrawable */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="wallet-balance-card account-panel" data-tone="green"
          >
            <div className="bg-green/5 border-b border-green/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green" />
                <span className="text-xs font-mono font-semibold text-green uppercase tracking-wider">{publicCommerceEnabled ? "Withdrawable" : "Test Winnings"}</span>
              </div>
              <p className="text-3xl font-black text-green font-mono">${withdrawable.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-vapor mb-2">{publicCommerceEnabled ? "Available for withdrawal" : "Virtual credits · No cash value"}</p>
              <div className="flex items-center gap-2 text-xs text-vapor">
                <Shield className="w-3 h-3" />
                <span>{publicCommerceEnabled ? "Secure withdrawals" : "Cannot be redeemed or paid out"}</span>
              </div>
            </div>
          </motion.div>

          {/* Total Earnings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="wallet-balance-card account-panel" data-tone="purple"
          >
            <div className="bg-purple/5 border-b border-purple/20 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <span className="text-xs font-mono font-semibold text-purple-400 uppercase tracking-wider">{publicCommerceEnabled ? "Total Earnings" : "Total Test Earnings"}</span>
              </div>
              <p className="text-3xl font-black text-purple-400 font-mono">${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-6">
              <p className="text-xs text-vapor mb-2">{publicCommerceEnabled ? "Lifetime wager winnings" : "Lifetime test-credit winnings"}</p>
              <Link to="/dashboard" className="text-cyan text-sm hover:underline">View Stats →</Link>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="account-panel wallet-activity-panel overflow-hidden mb-6">
          <div className="account-section-tabs arena-tabs mx-3 mt-3 flex" aria-label="Wallet sections">
            <button
              aria-pressed={activeTab === "overview"} onClick={() => setActiveTab("overview")}
              className={`arena-tab flex-1 px-3 py-3 text-xs font-bold transition-colors ${
                activeTab === "overview"
                  ? "text-cyan"
                  : "text-vapor"
              }`}
            >
              Overview
            </button>
            <button
              aria-pressed={activeTab === "transactions"} onClick={() => setActiveTab("transactions")}
              className={`arena-tab flex-1 px-3 py-3 text-xs font-bold transition-colors ${
                activeTab === "transactions"
                  ? "text-cyan"
                  : "text-vapor"
              }`}
            >
              Transaction History
            </button>
            <button
              aria-pressed={activeTab === "wagers"} onClick={() => setActiveTab("wagers")}
              className={`arena-tab flex-1 px-3 py-3 text-xs font-bold transition-colors ${
                activeTab === "wagers"
                  ? "text-cyan"
                  : "text-vapor"
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
                      <span className="text-xs text-vapor uppercase">Wager Win Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-green font-mono">{wagerWins + wagerLosses > 0 ? `${wagerWinRate}%` : "N/A"}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-orange" />
                      <span className="text-xs text-vapor uppercase">Wager Record</span>
                    </div>
                    <p className="text-2xl font-bold text-orange font-mono">{wagerWins}W / {wagerLosses}L</p>
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
                      {publicCommerceEnabled ? "Deposits will be available once payment processing is connected. Contact support for questions about your balance." : "Deposits are disabled in the app test version. Staff can grant virtual test credits with no monetary value."}
                    </p>
                  </div>
                  <div className="bg-green/5 border border-green/20 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-green mb-2 flex items-center gap-2">
                      <InfoIcon className="w-4 h-4" />
                      About Withdrawals
                    </h3>
                    <p className="text-xs text-vapor leading-relaxed">
                      {publicCommerceEnabled ? "Your withdrawable balance is shown above. Contact support for withdrawal assistance while self-service withdrawals are being prepared." : "App test credits have no monetary value and cannot be paid out or redeemed. Your displayed balance is only for testing supported competition features."}
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
      </div>
    </div>
  );
}
