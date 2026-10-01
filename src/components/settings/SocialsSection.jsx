import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AtSign, Globe2, Link2, Loader2, Save, Twitch, Youtube } from "lucide-react";
import { base44 } from "@/api/base44Client";

const socialFields = [
  { key: "x", label: "X", icon: AtSign, placeholder: "@yourhandle or x.com/yourhandle" },
  { key: "twitch", label: "Twitch", icon: Twitch, placeholder: "yourchannel or twitch.tv/yourchannel" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "@yourchannel or youtube.com/@yourchannel" },
  { key: "website", label: "Website", icon: Globe2, placeholder: "yourwebsite.com" },
];

const valuesFor = (user) => Object.fromEntries(
  socialFields.map(({ key }) => [key, String(user?.[key] || "")])
);

export default function SocialsSection({ user, onUserUpdate }) {
  const [socials, setSocials] = useState(() => valuesFor(user));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const originalSocials = useMemo(() => valuesFor(user), [user]);
  const changed = socialFields.some(({ key }) => socials[key].trim() !== originalSocials[key].trim());

  useEffect(() => {
    setSocials(valuesFor(user));
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await base44.auth.updateMe(Object.fromEntries(
        socialFields.map(({ key }) => [key, socials[key].trim().slice(0, 200)])
      ));
      await onUserUpdate();
      setResult({ success: true, message: "Social links saved." });
    } catch (error) {
      setResult({ success: false, message: error.message || "Could not save social links." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mb-6 rounded-xl border border-white/5 p-6"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/20">
          <Link2 className="h-5 w-5 text-cyan" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Socials</h2>
          <p className="text-xs text-vapor">Add a handle or paste a full link to show its icon on your player card.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {socialFields.map(({ key, label, icon: Icon, placeholder }) => (
          <label key={key} className={key === "website" ? "sm:col-span-2" : ""}>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-vapor">{label}</span>
            <div className="relative">
              <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vapor" />
              <input
                type="text"
                value={socials[key]}
                onChange={(event) => setSocials((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={placeholder}
                maxLength={200}
                className="w-full rounded-lg border border-white/5 bg-secondary py-2.5 pl-10 pr-4 text-sm focus:border-cyan/30 focus:outline-none"
              />
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !changed}
          className="flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-2.5 text-sm font-bold text-cyan transition-all hover:bg-cyan/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Socials
        </button>
      </div>

      {result && (
        <div className={`mt-3 rounded-lg border p-3 text-xs ${result.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
          {result.message}
        </div>
      )}
    </motion.section>
  );
}
