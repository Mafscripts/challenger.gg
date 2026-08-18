import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BadgeCheck, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";

const RESEND_SECONDS = 60;

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { completeAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const email = String(searchParams.get("email") || "").trim().toLowerCase();
  const freshlySent = searchParams.get("fresh") === "1";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(freshlySent ? RESEND_SECONDS : 0);
  const [developmentCode, setDevelopmentCode] = useState(() => {
    if (typeof window === "undefined" || !email) return "";
    return window.sessionStorage.getItem(`verification-code:${email}`) || "";
  });

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const verify = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!email) {
      setError("Your email address is missing. Please register again.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, code });
      if (typeof window !== "undefined") window.sessionStorage.removeItem(`verification-code:${email}`);
      if (result?.user?.id) completeAuth(result.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email || resendIn > 0 || resending) return;
    setError("");
    setNotice("");
    setResending(true);
    try {
      const result = await base44.auth.resendOtp(email);
      const devCode = result?.development_verification_code || "";
      setDevelopmentCode(devCode);
      if (typeof window !== "undefined") {
        if (devCode) window.sessionStorage.setItem(`verification-code:${email}`, devCode);
        else window.sessionStorage.removeItem(`verification-code:${email}`);
      }
      setResendIn(RESEND_SECONDS);
      setNotice("A new verification code has been sent.");
    } catch (err) {
      const retryAfter = Number(err?.data?.retry_after || 0);
      if (retryAfter > 0) setResendIn(retryAfter);
      setError(err.message || "Could not resend the verification code");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      icon={MailCheck}
      title="Verify your email"
      subtitle="Enter the code we sent to finish creating your account"
      compact
      footer={<><span>Wrong account?</span>{" "}<Link to="/register" className="font-medium text-primary hover:underline">Register again</Link></>}
    >
      <div className="mb-4 rounded-xl border border-cyan/15 bg-cyan/[0.05] p-3 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan">Verification sent to</p>
        <p className="mt-1 break-all text-sm font-bold text-foreground">{email || "No email address provided"}</p>
      </div>

      {developmentCode && (
        <div className="mb-3 rounded-lg border border-yellow-400/20 bg-yellow-400/[0.07] p-3 text-xs text-yellow-200">
          Local development code: <span className="font-mono font-black tracking-[0.2em]">{developmentCode}</span>
        </div>
      )}
      {error && <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="mb-3 rounded-lg border border-green/20 bg-green/10 p-3 text-sm text-green">{notice}</div>}

      <form onSubmit={verify} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="verification-code" className="text-xs font-bold uppercase tracking-wide text-vapor">6-digit code</Label>
          <div className="relative">
            <BadgeCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="verification-code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-12 bg-input/90 pl-10 text-center font-mono text-xl font-black tracking-[0.35em]"
              required
            />
          </div>
        </div>

        <Button type="submit" disabled={loading || code.length !== 6 || !email} className="h-11 w-full bg-gradient-to-r from-cyan to-[#A9AFB8] font-black uppercase tracking-wide text-background">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Verify and continue"}
        </Button>
        <button type="button" onClick={resend} disabled={resendIn > 0 || resending || !email} className="flex w-full items-center justify-center gap-2 text-xs font-bold text-vapor transition-colors hover:text-cyan disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend verification code"}
        </button>
      </form>
    </AuthLayout>
  );
}
