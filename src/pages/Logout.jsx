import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function Logout() {
  useEffect(() => {
    base44.auth.logout(`${window.location.origin}/login`);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-vapor">Signing out...</p>
    </div>
  );
}
