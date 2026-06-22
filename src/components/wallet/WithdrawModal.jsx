import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, Shield, AlertCircle, CheckCircle, CreditCard, Building } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

export default function WithdrawModal({ isOpen, onClose, user, availableBalance }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("paypal");

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    
    if (!withdrawAmount || withdrawAmount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }

    if (withdrawAmount < 10) {
      toast({ title: "Minimum Withdrawal", description: "Minimum withdrawal is $10.00", variant: "destructive" });
      return;
    }

    if (withdrawAmount > availableBalance) {
      toast({ title: "Insufficient Balance", description: "You don't have enough withdrawable balance", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('withdrawFromWallet', { 
        amount: withdrawAmount,
        payment_method: paymentMethod 
      });
      
      if (response.data.success) {
        toast({ 
          title: "Withdrawal Requested", 
          description: response.data.message || "Your withdrawal will be processed in 1-3 business days" 
        });
        onClose();
      } else {
        toast({ 
          title: "Error", 
          description: response.data.error || "Failed to process withdrawal", 
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error("Withdraw error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to process withdrawal", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-xl border border-white/10 max-w-lg w-full"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Withdraw Funds</h2>
              <p className="text-xs text-vapor">Secure withdrawal to your account</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-all">
              <X className="w-5 h-5 text-vapor" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Available Balance */}
            <div className="bg-green/5 border border-green/20 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-vapor">Available Balance</span>
                <CheckCircle className="w-4 h-4 text-green" />
              </div>
              <p className="text-2xl font-bold text-green font-mono">${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
              <label className="text-sm font-bold text-foreground mb-2 block">Withdrawal Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-vapor" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-secondary border border-white/5 rounded-lg pl-12 pr-4 py-4 text-lg font-mono text-foreground focus:border-green/30 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={() => setAmount(availableBalance.toString())}
                  className="text-xs text-cyan hover:underline"
                >
                  Max: ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </button>
                <span className="text-xs text-vapor">Min: $10.00</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <label className="text-sm font-bold text-foreground mb-2 block">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod("paypal")}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    paymentMethod === "paypal"
                      ? "border-cyan bg-cyan/10"
                      : "border-white/5 bg-secondary/30 hover:border-white/10"
                  }`}
                >
                  <DollarSign className="w-6 h-6 mx-auto mb-2 text-vapor" />
                  <p className="text-xs font-bold text-foreground">PayPal</p>
                </button>
                <button
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    paymentMethod === "bank_transfer"
                      ? "border-cyan bg-cyan/10"
                      : "border-white/5 bg-secondary/30 hover:border-white/10"
                  }`}
                >
                  <Building className="w-6 h-6 mx-auto mb-2 text-vapor" />
                  <p className="text-xs font-bold text-foreground">Bank Transfer</p>
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-400 mb-1">Processing Time</p>
                  <p className="text-xs text-vapor">
                    Withdrawals are processed within 1-3 business days. Minimum withdrawal: $10.00
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleWithdraw}
              disabled={!amount || parseFloat(amount) < 10 || loading}
              className="w-full py-4 bg-gradient-to-r from-green to-green/80 text-background font-bold text-sm rounded-lg hover:from-green/90 hover:to-green/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Withdraw ${amount ? parseFloat(amount).toFixed(2) : "0.00"}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
