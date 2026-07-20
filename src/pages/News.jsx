import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Tag } from "lucide-react";
import { base44 } from "@/api/base44Client";

const formatDate = (value) => value ? new Date(value).toLocaleString() : "N/A";

export default function News() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.SystemLog.filter({}, "-created_date", 50)
      .then((rows) => setUpdates(rows || []))
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <h1 className="text-3xl font-black tracking-tight mb-2">News</h1>
        <p className="text-vapor text-sm mb-8">Platform updates, patch notes, and announcements.</p>

        {loading ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">Loading updates...</div>
        ) : updates.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">No platform updates have been posted yet.</div>
        ) : (
          <div className="space-y-4">
            {updates.map((update, index) => (
              <motion.div
                key={update.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.04 }}
                whileHover={{ x: 4, transition: { duration: 0.1, ease: "easeOut" } }}
                className="glass rounded-xl border border-white/5 hover:border-white/10 p-6 transition-all"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-green bg-green/10 mb-3">
                      <Tag className="w-3 h-3" /> {update.entity_type || "Update"}
                    </span>
                    <h3 className="font-bold text-lg mb-2">{update.action || "Platform update"}</h3>
                    <p className="text-vapor text-sm leading-relaxed">{update.description || (update.details ? JSON.stringify(update.details) : "No details provided.")}</p>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                    <span className="text-xs text-vapor flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDate(update.created_date)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
