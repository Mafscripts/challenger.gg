import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, CreditCard, Zap, Shield } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const creditPacks = [
  { id: "starter", name: "Starter Pack", credits: 5, price: 5.00, bonus: 0, popular: false },
  { id: "pro", name: "Pro Pack", credits: 10, price: 10.00, bonus: 0, popular: true },
  { id: "mega", name: "Mega Pack", credits: 30, price: 25.00, bonus: 5, popular: false },
  { id: "ultimate", name: "Ultimate Pack", credits: 60, price: 50.00, bonus: 10, popular: false },
];

export default function DepositModal({ isOpen, onClose }) {
  const [selectedPack, setSelectedPack] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreditPurchase = async () => {
    if (!selectedPack) return;
    
    setLoading(true);
    try {
      const response = await base44.functions.invoke('create-checkout', { pack_id: selectedPack.id });
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      } else {
        toast({
          title: "Error",
          description: response.data.error || "Failed to create checkout",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Error",
        description: "Failed to process purchase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl border border-white/10 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Add Funds</h2>
                <p className="text-xs text-vapor">Secure checkout for credits</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-all">
                <X className="w-5 h-5 text-vapor" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Info Banner */}
              <div className="bg-cyan/5 border border-cyan/20 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-cyan mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-cyan mb-1">Secure Payment</p>
                    <p className="text-xs text-vapor">
                      Wallet deposits require verified provider webhooks. Credits are added after confirmed checkout.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {creditPacks.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => setSelectedPack(pack)}
                    className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                      selectedPack?.id === pack.id
                        ? "border-cyan bg-cyan/10"
                        : "border-white/5 bg-secondary/30 hover:border-white/10"
                    }`}
                  >
                    {pack.popular && (
                      <span className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-cyan to-cyan/80 text-background text-[10px] font-bold uppercase tracking-wider rounded-full">
                        Most Popular
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold text-foreground">{pack.name}</h3>
                      <Zap className={`w-5 h-5 ${selectedPack?.id === pack.id ? "text-cyan" : "text-vapor"}`} />
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-3xl font-black text-cyan font-mono">{pack.credits.toLocaleString()}</span>
                      <span className="text-sm text-vapor mb-1">credits</span>
                    </div>
                    {pack.bonus > 0 && (
                      <p className="text-xs text-green font-bold mb-3">+{pack.bonus} BONUS</p>
                    )}
                    <p className="text-xl font-bold text-foreground">${pack.price}</p>
                  </button>
                ))}
              </div>

              {selectedPack && (
                <div className="bg-secondary/50 border border-white/5 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-vapor mb-1">Selected Pack</p>
                      <p className="text-lg font-bold text-foreground">{selectedPack.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-vapor mb-1">Total</p>
                      <p className="text-2xl font-bold text-cyan font-mono">${selectedPack.price}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleCreditPurchase}
                disabled={!selectedPack || loading}
                className="w-full py-4 bg-gradient-to-r from-cyan to-cyan/80 text-background font-bold text-sm rounded-lg hover:from-cyan/90 hover:to-cyan/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                {loading ? "Processing..." : `Purchase ${selectedPack?.credits.toLocaleString() || "0"} Credits`}
              </button>

              {/* Payment Methods */}
              <div className="mt-6 pt-6 border-t border-white/5">
                <p className="text-xs text-vapor text-center mb-3">Accepted Payment Methods</p>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
                    <CreditCard className="w-5 h-5 text-vapor" />
                    <span className="text-xs text-vapor">Credit Card</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
                    <DollarSign className="w-5 h-5 text-vapor" />
                    <span className="text-xs text-vapor">PayPal</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
