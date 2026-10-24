import React from "react";
import AdminMatches from "@/components/admin/AdminMatches";

export default function ChallengeTeamAdmin({ user }) {
  return <AdminMatches user={user} initialMode="challenge" />;
}
