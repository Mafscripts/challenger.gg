import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, UserPlus, Mail, Lock, Loader2, Gift } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import TurnstileCheck from "@/components/TurnstileCheck";
import { displayNameHint, displayNamePattern, usernameHint, usernamePattern } from "@/lib/accountNames";
import { isNativeApp, openAppBrowser } from "@/lib/nativeApp";
import { websiteOrigin } from "@/lib/appEnvironment";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [securityConfig, setSecurityConfig] = useState(null);
  const [securityConfigError, setSecurityConfigError] = useState("");
  const [securityConfigRetry, setSecurityConfigRetry] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const referralCode = String(searchParams.get("ref") || "").trim().toUpperCase();

  useEffect(() => {
    if (isNativeApp) return;
    let active = true;
    setSecurityConfigError("");
    base44.auth.getRegistrationConfig().then((config) => {
      if (!config || typeof config.turnstile_required !== "boolean"
        || (config.turnstile_required && !config.turnstile_site_key)) {
        throw new Error("Registration is temporarily unavailable. Please try again.");
      }
      if (active) setSecurityConfig(config);
    }).catch((err) => {
      if (active) setSecurityConfigError(err.message || "Registration is temporarily unavailable. Please try again.");
    });
    return () => { active = false; };
  }, [securityConfigRetry]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!securityConfig || (securityConfig.turnstile_required && !turnstileToken)) {
      setError("Please wait for the security check to finish before creating your account.");
      return;
    }
    const normalizedUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();
    if (!usernamePattern.test(normalizedUsername)) {
      setError(usernameHint);
      return;
    }
    if (!displayNamePattern.test(cleanDisplayName)) {
      setError(displayNameHint);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await base44.auth.register({
        username: normalizedUsername,
        display_name: cleanDisplayName,
        email: normalizedEmail,
        password,
        referral_code: referralCode || undefined,
        ...(securityConfig.turnstile_required ? { turnstile_token: turnstileToken } : {}),
      });
      if (result?.email_verification_required) {
        const verificationEmail = result.email || normalizedEmail;
        if (typeof window !== "undefined" && result.development_verification_code) {
          window.sessionStorage.setItem(`verification-code:${verificationEmail}`, result.development_verification_code);
        }
        navigate(`/verify-email?email=${encodeURIComponent(verificationEmail)}&fresh=1`, { replace: true });
        return;
      }
      setError("Account created, but email verification did not start. Please log in and try again.");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      // Tokens can only be submitted once, including failed registrations.
      setTurnstileToken("");
      setTurnstileReset((value) => value + 1);
      setLoading(false);
    }
  };

  if (isNativeApp) return <AuthLayout icon={UserPlus} title="Join TopFragg" subtitle="Create your player account" compact>
    <p className="mb-5 text-sm leading-6 text-vapor">Create and verify your account in the secure browser. Then return to the app and sign in.</p>
    <Button className="w-full" onClick={() => { void openAppBrowser(`${websiteOrigin}/register${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ""}`).catch(() => setError("The browser could not be opened. Please try again.")); }}>Create account</Button>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <Link to="/login" className="mt-5 block text-center text-sm font-bold text-cyan">Already registered? Sign in</Link>
  </AuthLayout>;

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
        {referralCode && (
          <div className="flex items-center gap-3 rounded-lg border border-green/20 bg-green/[0.07] p-3 text-sm text-green">
            <Gift className="h-4 w-4 shrink-0" />
            <span>Invite applied — verify your email to claim the current referral reward.</span>
          </div>
        )}
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
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
              minLength={3}
              maxLength={20}
              pattern={"[a-z0-9_\\-]{3,20}"}
              aria-describedby="username-help"
              required
            />
          </div>
          <p id="username-help" className="text-[10px] leading-4 text-vapor">Unique, 3–20 characters. Letters, numbers, _ and - only.</p>
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
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
              maxLength={60}
              pattern={"[A-Za-z0-9_\\-]{1,60}"}
              aria-describedby="display-name-help"
              required
            />
          </div>
          <p id="display-name-help" className="text-[10px] leading-4 text-vapor">Your public name must also be unique. Letters, numbers, _ and - only; no spaces or symbols.</p>
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
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
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
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
              minLength={8}
              maxLength={72}
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
              className="pl-10 h-11 bg-input/90 border-white/10 transition-all duration-200 placeholder:text-vapor/70 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/25 focus-visible:shadow-[0_0_0_3px_rgba(210,214,220,0.10)]"
              minLength={8}
              maxLength={72}
              required
            />
          </div>
        </div>
        {securityConfigError ? (
          <div role="status" className="space-y-2 rounded-xl border border-cyan/20 bg-cyan/5 p-3 text-sm text-vapor">
            <p>{securityConfigError}</p>
            <button type="button" onClick={() => setSecurityConfigRetry((value) => value + 1)} className="text-xs font-bold text-cyan hover:underline">Retry</button>
          </div>
        ) : !securityConfig ? (
          <p role="status" className="text-xs text-vapor">Preparing registration...</p>
        ) : securityConfig.turnstile_required ? (
          <TurnstileCheck siteKey={securityConfig.turnstile_site_key} onTokenChange={setTurnstileToken} resetKey={turnstileReset} />
        ) : null}
        <Button
          type="submit"
          className="create-cta h-11 w-full font-black uppercase tracking-wide shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          disabled={loading || !securityConfig || Boolean(securityConfigError) || (securityConfig.turnstile_required && !turnstileToken)}
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
