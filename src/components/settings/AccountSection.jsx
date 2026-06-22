import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Lock, Save, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const usernamePattern = /^[a-z0-9_]{3,20}$/;

export default function AccountSection({ user, onUserUpdate }) {
  const [username, setUsername] = useState(user?.username || "");
  const [displayName, setDisplayName] = useState(user?.display_name || user?.full_name || "");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityResult, setIdentityResult] = useState(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwResult, setPwResult] = useState(null);

  const originalUsername = user?.username || "";
  const originalName = user?.display_name || user?.full_name || "";
  const normalizedUsername = username.trim().toLowerCase();
  const cleanDisplayName = displayName.trim();
  const identityChanged = normalizedUsername !== originalUsername || cleanDisplayName !== originalName;

  useEffect(() => {
    setUsername(user?.username || "");
    setDisplayName(user?.display_name || user?.full_name || "");
  }, [user?.id, user?.username, user?.display_name, user?.full_name]);

  const handleIdentityChange = async () => {
    if (!usernamePattern.test(normalizedUsername)) {
      setIdentityResult({
        success: false,
        message: "Username must be 3-20 characters and use only letters, numbers, or underscore.",
      });
      return;
    }
    if (!cleanDisplayName) {
      setIdentityResult({ success: false, message: "Display name is required." });
      return;
    }

    setIdentitySaving(true);
    setIdentityResult(null);
    try {
      await base44.auth.updateMe({
        username: normalizedUsername,
        display_name: cleanDisplayName,
      });
      setIdentityResult({ success: true, message: "Account identity updated." });
      onUserUpdate();
    } catch (e) {
      setIdentityResult({ success: false, message: e.message || "Failed to update account identity." });
    } finally {
      setIdentitySaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setPwResult({ success: false, message: "New passwords don't match." });
      return;
    }
    if (newPassword.length < 6) {
      setPwResult({ success: false, message: "Password must be at least 6 characters." });
      return;
    }
    setPwSaving(true);
    setPwResult(null);
    try {
      await base44.auth.changePassword({
        userId: user.id,
        currentPassword,
        newPassword,
      });
      setPwResult({ success: true, message: "Password updated!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPwResult({ success: false, message: "Failed to change password - check your current password." });
    }
    setPwSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-white/5 p-6 mb-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-cyan/20 flex items-center justify-center">
          <User className="w-5 h-5 text-cyan" />
        </div>
        <div>
          <h2 className="font-bold text-lg">Account</h2>
          <p className="text-vapor text-xs">Update your username, display name and password</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-vapor uppercase tracking-wider mb-2 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={20}
              className="w-full px-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
            />
            <p className="text-[10px] text-vapor mt-1">3-20 characters: letters, numbers, underscore.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-vapor uppercase tracking-wider mb-2 block">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              className="w-full px-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end mt-3">
          <button
            onClick={handleIdentityChange}
            disabled={identitySaving || !identityChanged || !normalizedUsername || !cleanDisplayName}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan/10 text-cyan text-sm font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50"
          >
            {identitySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>

        {identityResult && (
          <div className={`mt-2 p-3 rounded-lg text-xs ${identityResult.success ? "bg-green/10 text-green border border-green/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            {identityResult.message}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 my-5" />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-vapor" />
          <h3 className="text-sm font-semibold">Change Password</h3>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="px-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="px-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan/10 text-cyan text-sm font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50"
          >
            {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Update Password
          </button>
          {pwResult && (
            <div className={`p-3 rounded-lg text-xs ${pwResult.success ? "bg-green/10 text-green border border-green/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
              {pwResult.message}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
