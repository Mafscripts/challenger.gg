import React, { useState } from "react";
import { motion } from "framer-motion";
import { Gamepad2, Save } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

export default function GamingIdsSection({ user, onUserUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    activision_id: user?.activision_id || "",
    playstation_id: user?.playstation_id || "",
    xbox_id: user?.xbox_id || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({
        activision_id: formData.activision_id,
        playstation_id: formData.playstation_id,
        xbox_id: formData.xbox_id,
      });
      toast({
        title: "Gaming IDs saved",
        description: "Your gaming IDs have been updated",
      });
      setIsEditing(false);
      onUserUpdate();
    } catch (error) {
      console.error("Failed to save gaming IDs:", error);
      toast({
        title: "Error",
        description: "Failed to save gaming IDs",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-white/5 overflow-hidden mb-6"
    >
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-cyan" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Gaming IDs</h3>
            <p className="text-xs text-vapor">Connect your gaming accounts</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-all uppercase tracking-wider"
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="text-xs text-vapor mb-2 block">Activision ID</label>
          <input
            type="text"
            value={formData.activision_id}
            onChange={(e) => setFormData({ ...formData, activision_id: e.target.value })}
            disabled={!isEditing}
            placeholder="Your Activision ID"
            className="w-full bg-secondary border border-white/5 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan/30 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-xs text-vapor mb-2 block">PlayStation ID</label>
          <input
            type="text"
            value={formData.playstation_id}
            onChange={(e) => setFormData({ ...formData, playstation_id: e.target.value })}
            disabled={!isEditing}
            placeholder="Your PlayStation Network ID"
            className="w-full bg-secondary border border-white/5 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan/30 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-xs text-vapor mb-2 block">Xbox Gamertag</label>
          <input
            type="text"
            value={formData.xbox_id}
            onChange={(e) => setFormData({ ...formData, xbox_id: e.target.value })}
            disabled={!isEditing}
            placeholder="Your Xbox Gamertag"
            className="w-full bg-secondary border border-white/5 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan/30 disabled:opacity-50"
          />
        </div>

        {isEditing && (
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-green/10 text-green font-bold text-xs rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setFormData({
                  activision_id: user?.activision_id || "",
                  playstation_id: user?.playstation_id || "",
                  xbox_id: user?.xbox_id || "",
                });
              }}
              className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}