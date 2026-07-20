import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { normalizeTeamRosterSize, TEAM_ROSTER_FORMATS } from "@/lib/teamFormats";

const teamBannerMaxBytes = 1.5 * 1024 * 1024;
const emptyTeamForm = (teamType, rosterSize) => ({
  name: "",
  tag: "",
  region: "na",
  team_type: teamType || "8s",
  roster_size: normalizeTeamRosterSize(rosterSize),
  banner_url: "",
});

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve("");
  if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file."));
  if (file.size > teamBannerMaxBytes) return reject(new Error("Image must be 1.5MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read image file."));
  reader.readAsDataURL(file);
});

export default function CreateTeamModal({
  isOpen,
  onClose,
  onCreated,
  user,
  defaultTeamType = "8s",
  defaultRosterSize = 4,
  lockTeamType = false,
  title = "Create Team",
  description = "Start a roster with yourself as captain.",
}) {
  const [teamForm, setTeamForm] = useState(() => emptyTeamForm(defaultTeamType, defaultRosterSize));
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTeamForm(emptyTeamForm(defaultTeamType, defaultRosterSize));
  }, [defaultRosterSize, defaultTeamType, isOpen]);

  const handleBannerFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await fileToDataUrl(file);
      setTeamForm((current) => ({ ...current, banner_url: imageUrl }));
    } catch (error) {
      toast({ title: "Image failed", description: error.message || "Could not read image.", variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user?.id) {
      toast({ title: "Login required", description: "Please log in to create a team.", variant: "destructive" });
      return;
    }

    const name = teamForm.name.trim();
    const tag = teamForm.tag.trim().toUpperCase();
    if (!name || !tag) {
      toast({ title: "Missing team info", description: "Team name and tag are required.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const response = await base44.functions.invoke("manageTeam", {
        action: "create",
        name,
        tag: tag.slice(0, 6),
        region: teamForm.region,
        team_type: teamForm.team_type,
        roster_size: normalizeTeamRosterSize(teamForm.roster_size),
        banner_url: teamForm.banner_url.trim(),
      });
      if (!response.data?.success) {
        toast({ title: "Team creation failed", description: response.data?.error || "Could not create team.", variant: "destructive" });
        return;
      }

      const team = response.data.team;
      toast({ title: "Team created", description: `${team.name} is ready. Invite your roster from My Teams.` });
      onCreated?.(team);
      onClose();
    } catch (error) {
      toast({ title: "Team creation failed", description: error.message || "Could not create team.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(20,216,255,0.045),rgba(0,0,0,0.88)_48%)] p-4"
          onClick={onClose}
        >
          <motion.form
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: "transform, opacity" }}
            onSubmit={handleSubmit}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[calc(100vh-2rem)] w-full max-w-lg transform-gpu overflow-y-auto rounded-2xl border border-white/10 bg-card shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
          >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-card px-6 py-4">
          <div>
            <h2 className="text-xl font-black">{title}</h2>
            <p className="mt-0.5 text-xs text-vapor">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-white/5" aria-label="Close create team">
            <X className="h-5 w-5 text-vapor" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Team Name</span>
            <input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} maxLength={40} required className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none" placeholder="Team name" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Team Tag</span>
            <input value={teamForm.tag} onChange={(event) => setTeamForm((current) => ({ ...current, tag: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) }))} maxLength={6} required className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 font-mono text-sm uppercase focus:border-cyan/30 focus:outline-none" placeholder="TAG" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Team Banner URL</span>
            <input value={teamForm.banner_url} onChange={(event) => setTeamForm((current) => ({ ...current, banner_url: event.target.value }))} className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none" placeholder="https://i.imgur.com/team-banner.png" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Upload Team Banner</span>
            <input type="file" accept="image/*" onChange={handleBannerFile} className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Region</span>
            <select value={teamForm.region} onChange={(event) => setTeamForm((current) => ({ ...current, region: event.target.value }))} className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none">
              <option value="na">NA</option><option value="eu">EU</option><option value="asia">Asia</option><option value="oce">OCE</option><option value="sa">SA</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Team Type</span>
              <select value={teamForm.team_type} disabled={lockTeamType} onChange={(event) => setTeamForm((current) => ({ ...current, team_type: event.target.value }))} className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70">
                <option value="8s">8s</option><option value="wager">Wager</option><option value="tournament">Tournament</option><option value="general">General</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-wider text-vapor">Roster Size</span>
              <select value={teamForm.roster_size} onChange={(event) => setTeamForm((current) => ({ ...current, roster_size: Number(event.target.value) }))} className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none">
                {TEAM_ROSTER_FORMATS.map((format) => <option key={format.value} value={format.value}>{format.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-white/5 bg-card px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-secondary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-vapor transition-colors hover:bg-white/10">Cancel</button>
          <button type="submit" disabled={creating} className="rounded-lg bg-cyan px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-background transition-colors hover:bg-cyan/90 disabled:opacity-50">{creating ? "Creating..." : "Create Team"}</button>
        </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
