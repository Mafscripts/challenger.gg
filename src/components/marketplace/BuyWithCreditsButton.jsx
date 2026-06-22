import React, { useState } from "react";
import { Coins, Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function BuyWithCreditsButton({ item, size = "sm", disabled = false, onPurchased }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const creditCost = Math.ceil(item.price);

  const handleBuy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await base44.functions.invoke("buyWithCredits", {
        item_id: item.id,
        item_name: item.name,
        item_image: item.img,
        item_rarity: item.rarity,
        item_category: item.category,
        credit_cost: creditCost,
      });
      if (res?.data?.success) {
        setSuccess(true);
        onPurchased?.(res.data.inventory || item);
        toast({ title: "Purchase successful!", description: `${item.name} added to your inventory.` });
        setTimeout(() => setSuccess(false), 2000);
      } else {
        toast({ variant: "destructive", title: "Purchase failed", description: res?.data?.error || "Something went wrong." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Purchase failed", description: err?.message || "Not enough credits or something went wrong." });
    }
    setLoading(false);
  };

  const sizeClasses = size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs";

  return (
    <button
      onClick={handleBuy}
      disabled={disabled || loading || success}
      className={`flex items-center justify-center gap-1 w-full font-bold rounded bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50 ${sizeClasses}`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : success ? <Check className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
      {success ? "Owned!" : `${creditCost} Credits`}
    </button>
  );
}
