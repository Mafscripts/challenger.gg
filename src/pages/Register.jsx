import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";
import { useAuth } from "@/lib/AuthContext";

const usernamePattern = /^[a-z0-9_]{3,20}$/;

export default function Register() {
  const navigate = useNavigate();
  const { checkUserAuth, completeAuth } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const normalizedUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();
    if (!usernamePattern.test(normalizedUsername)) {
      setError("Username must be 3-20 characters and use only letters, numbers, or underscore");
      return;
    }
    if (!cleanDisplayName) {
      setError("Display name is required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      let result = await base44.auth.register({
        username: normalizedUsername,
        display_name: cleanDisplayName,
        email: normalizedEmail,
        password,
      });
      if (!result?.access_token) {
        result = await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      }
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
        const currentUser = await bootstrapCurrentUser({
          email: normalizedEmail,
          user: result?.user,
          username: normalizedUsername,
          display_name: cleanDisplayName,
        }).catch(() => result?.user || null);
        if (currentUser?.id) {
          completeAuth(currentUser);
        } else {
          await checkUserAuth();
        }
        navigate("/dashboard", { replace: true });
        return;
      }
      setError("Account created, but login did not start. Please log in.");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      compact
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Log in
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
          <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wide text-vapor">Username</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="displayName" className="text-xs font-bold uppercase tracking-wide text-vapor">Display name</Label>
          <div className="relative">
            <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="displayName"
              type="text"
              autoComplete="name"
              placeholder="Enter display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              maxLength={60}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wide text-vapor">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wide text-vapor">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-xs font-bold uppercase tracking-wide text-vapor">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(20,216,255,0.10)]"
              required
            />
          </div>
        </div>
        <Button
          type="submit"
          className="w-full h-11 font-black uppercase tracking-wide bg-gradient-to-r from-cyan to-[#0EA5C7] text-background shadow-[0_10px_28px_rgba(20,216,255,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(20,216,255,0.22)] hover:from-[#38E0FF] hover:to-cyan"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
