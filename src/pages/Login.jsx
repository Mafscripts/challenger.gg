import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { checkUserAuth, completeAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      const currentUser = await bootstrapCurrentUser({ email: normalizedEmail, user: result?.user }).catch(() => result?.user || null);
      if (currentUser?.id) {
        completeAuth(currentUser);
      } else {
        await checkUserAuth();
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      compact
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wide text-vapor">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-11 bg-[#252C36] border-[#2A313B] transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wide text-vapor">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-11 bg-[#252C36] border-[#2A313B] transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              required
            />
          </div>
        </div>
        <Button
          type="submit"
          className="w-full h-11 font-black uppercase tracking-wide bg-gradient-to-r from-cyan to-[#0EA5C7] text-[#111418] shadow-[0_10px_28px_rgba(20,216,255,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(20,216,255,0.22)] hover:from-[#38E0FF] hover:to-cyan"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
