import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/ui/PageLoader";

export default function Logout() {
  useEffect(() => {
    base44.auth.logout(`${window.location.origin}/login`);
  }, []);

  return <PageLoader label="Signing out" />;
}
