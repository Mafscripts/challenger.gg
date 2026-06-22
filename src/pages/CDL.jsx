import React from "react";
import { ExternalLink, Radio, Trophy } from "lucide-react";

export default function CDL() {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight">CDL Live</h1>
          <p className="text-vapor text-sm mt-1">Official Call of Duty League coverage requires a live schedule feed.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass rounded-xl border border-white/5 p-10 text-center">
            <Radio className="w-12 h-12 text-vapor/40 mx-auto mb-4" />
            <h2 className="text-xl font-black mb-2">No CDL Feed Connected</h2>
            <p className="text-sm text-vapor max-w-xl mx-auto mb-6">
              Live matches, schedules, and standings are hidden until a real CDL data source is configured.
            </p>
            <a
              href="https://www.callofdutyleague.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-vapor border border-white/5 rounded-lg text-xs font-bold hover:bg-white/10 transition-all uppercase tracking-wider"
            >
              Open Official CDL <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="glass rounded-xl border border-white/5 p-6">
            <Trophy className="w-5 h-5 text-orange mb-3" />
            <h3 className="font-bold text-sm mb-2">Standings</h3>
            <p className="text-sm text-vapor">No local standings are available without a configured league feed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
