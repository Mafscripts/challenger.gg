import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";

const formatDate = (value) => value ? new Date(value).toLocaleString() : "N/A";

export default function NewsFeed() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    base44.entities.SystemLog.filter({}, "-created_date", 4)
      .then((rows) => setLogs(rows || []))
      .catch(() => setLogs([]));
  }, []);

  return (
    <section className="py-24">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <span className="text-green text-xs font-mono font-semibold tracking-widest uppercase">Latest Updates</span>
            <h2 className="text-4xl lg:text-5xl font-black mt-3 tracking-tight">News</h2>
          </div>
          <Link to="/news" className="inline-flex items-center gap-2 text-cyan font-semibold text-sm hover:gap-3 transition-all">
            All News <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {logs.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-8 text-center text-vapor">No platform updates have been posted yet.</div>
        ) : (
          <div className="space-y-4">
            {logs.map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                whileHover={{ x: 4 }}
                className="glass rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all flex items-center gap-4"
              >
                <span className="px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-green bg-green/10 shrink-0">
                  {log.entity_type || "Update"}
                </span>
                <h3 className="font-semibold text-sm flex-1">{log.action || log.description || "Platform update"}</h3>
                <span className="text-xs text-vapor flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> {formatDate(log.created_date)}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
