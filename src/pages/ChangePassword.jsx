import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await base44.auth.changePassword({ currentPassword, newPassword });
      await checkUserAuth({ force: true });
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Password could not be changed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Create a new password"
      subtitle="An admin issued a temporary password. Choose your own password to continue."
    >
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          ["temporary-password", "Temporary password", currentPassword, setCurrentPassword, "current-password"],
          ["new-password", "New password", newPassword, setNewPassword, "new-password"],
          ["confirm-password", "Confirm new password", confirmPassword, setConfirmPassword, "new-password"],
        ].map(([id, label, value, setter, autoComplete]) => (
          <div key={id} className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={id}
                type="password"
                autoComplete={autoComplete}
                value={value}
                onChange={(event) => setter(event.target.value)}
                className="h-12 pl-10"
                required
              />
            </div>
          </div>
        ))}
        <Button type="submit" className="h-12 w-full font-medium" disabled={loading}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
