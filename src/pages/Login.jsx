import { loginDestination } from "@/lib/loginDestination";
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, UserRound, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import TurnstileCheck from "@/components/TurnstileCheck";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";
import { useAuth } from "@/lib/AuthContext";
import { isRestriction } from "@/lib/accountRestriction";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkUserAuth, completeAuth } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [securityConfig, setSecurityConfig] = useState(null);
  const [securityError, setSecurityError] = useState("");
  const [securityRetry, setSecurityRetry] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  useEffect(() => {
    let active = true;
    setSecurityError("");
    setSecurityConfig(null);
    base44.auth.getLoginConfig().then(config => {
      if (!config || typeof config.turnstile_required !== "boolean" || (config.turnstile_required && !config.turnstile_site_key)) throw new Error("Login security is temporarily unavailable. Please try again.");
      if (active) setSecurityConfig(config);
    }).catch(err => { if (active) setSecurityError(err.message || "Login security could not be loaded."); });
    return () => { active = false; };
  }, [securityRetry]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!securityConfig || securityError || (securityConfig.turnstile_required && !turnstileToken)) {
      setError("Please complete the security check before logging in.");
      return;
    }
    setLoading(true);
    try {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const result = await base44.auth.loginViaEmailPassword(normalizedIdentifier, password, securityConfig.turnstile_required ? turnstileToken : undefined);
      const currentUser = await bootstrapCurrentUser({ identifier: normalizedIdentifier, user: result?.user }).catch(() => result?.user || null);
      if (currentUser?.id) {
        completeAuth(currentUser);
      } else {
        await checkUserAuth();
      }
      const requested = location.state?.returnTo || new URLSearchParams(location.search).get("returnTo");
      const returnTo = loginDestination(requested, window.location.origin);
      navigate(result?.password_change_required ? "/change-password" : returnTo, { replace: true });
    } catch (err) {
      if (isRestriction(err.data)) return;
      if (err?.data?.code === "EMAIL_VERIFICATION_REQUIRED") {
        const verificationEmail = err.data.email || (identifier.includes("@") ? identifier.trim().toLowerCase() : "");
        if (!verificationEmail) {
          setError("Verify your email before logging in. Use the email address linked to this account to continue.");
          return;
        }
        navigate(`/verify-email?email=${encodeURIComponent(verificationEmail)}`);
        return;
      }
      setError(err.message || "Invalid email or password");
    } finally {
      setTurnstileToken("");
      setTurnstileReset(value => value + 1);
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
          <Link to="/register" className="text-orange font-medium hover:underline">
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
          <Label htmlFor="identifier" className="text-xs font-bold uppercase tracking-wide text-vapor">Email or username</Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="Enter email or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
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
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
              required
            />
          </div>
        </div>
        {securityError ? <div role="status" className="space-y-2 rounded-xl border border-cyan/20 p-3 text-sm text-vapor"><p>{securityError}</p><button type="button" onClick={() => setSecurityRetry(value => value + 1)} className="text-xs font-bold text-cyan">Retry security check</button></div>
          : !securityConfig ? <p role="status" className="text-xs text-vapor">Preparing login security…</p>
            : securityConfig.turnstile_required ? <TurnstileCheck siteKey={securityConfig.turnstile_site_key} action="login" onTokenChange={setTurnstileToken} resetKey={turnstileReset} /> : null}
        <Button
          type="submit"
          className="h-11 w-full bg-primary font-black uppercase tracking-wide text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md"
          disabled={loading || !securityConfig || Boolean(securityError) || (securityConfig.turnstile_required && !turnstileToken)}
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
