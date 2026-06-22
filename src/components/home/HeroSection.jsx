import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, Zap, ArrowRight, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function HeroSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/902c6e4df_generated_5b6cee19.png"
          alt="Tactical operator in dark environment with cyan rim lighting"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
        {/* Animated grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(hsl(185 100% 50% / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(185 100% 50% / 0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }} />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 lg:px-6 w-full py-20">
        <div className="max-w-3xl">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan/10 border border-cyan/20 mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
            <span className="text-cyan text-xs font-mono font-semibold tracking-wider uppercase">Season 1 - Live Now</span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.9] mb-6 tracking-tight"
          >
            THE ARENA
            <br />
            <span className="text-cyan text-glow-cyan">AWAITS</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-vapor max-w-xl mb-10 leading-relaxed"
          >
            The premier competitive Call of Duty platform. Play 8s, climb ranked ladders,
            wager on your skills, dominate tournaments, and earn your place among champions.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap gap-4"
          >
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="group relative inline-flex items-center gap-2 px-8 py-4 bg-cyan text-background font-bold text-sm rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all duration-300 uppercase tracking-wider"
                >
                  <Zap className="w-4 h-4" />
                  Join The Front
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/ranked"
                  className="inline-flex items-center gap-2 px-8 py-4 border border-white/10 text-foreground font-bold text-sm rounded-lg hover:bg-white/5 hover:border-white/20 transition-all duration-300 uppercase tracking-wider"
                >
                  <Play className="w-4 h-4" />
                  Watch Live
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="group relative inline-flex items-center gap-2 px-8 py-4 bg-cyan text-background font-bold text-sm rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all duration-300 uppercase tracking-wider"
                >
                  <UserPlus className="w-4 h-4" />
                  Register
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-8 py-4 border border-white/10 text-foreground font-bold text-sm rounded-lg hover:bg-white/5 hover:border-white/20 transition-all duration-300 uppercase tracking-wider"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </Link>
              </>
            )}
          </motion.div>

        </div>
      </div>
    </section>
  );
}
