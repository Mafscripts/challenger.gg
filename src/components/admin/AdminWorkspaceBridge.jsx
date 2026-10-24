import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { adminTargetUrl, isAdminWorkspaceQuery } from "@/lib/adminWorkspace";
import { canAccessAdminPanel, effectiveRoleForUser } from "@/lib/roles";

const AdminPlayerDossier = lazy(() => import("./AdminPlayerDossier"));

export default function AdminWorkspaceBridge({ user }) {
  const location = useLocation(), navigate = useNavigate(), queryClient = useQueryClient();
  const [requestedPlayer, setRequestedPlayer] = useState(null);
  const previousUrlPlayer = useRef(null);
  const allowed = Boolean(user?.id) && canAccessAdminPanel(effectiveRoleForUser(user));
  useEffect(() => { setRequestedPlayer(null); }, [user?.id]);
  useEffect(() => {
    if (!allowed) return;
    const params = new URLSearchParams(location.search);
    // Rank-review notifications use player to select the submission itself.
    const player = location.pathname === "/admin" && params.get("tab") !== "verifyRank" ? params.get("player") : null;
    if (player) setRequestedPlayer(player);
    else if (previousUrlPlayer.current) setRequestedPlayer(null);
    previousUrlPlayer.current = player;
  }, [allowed, location.pathname, location.search]);
  useEffect(() => {
    if (!allowed) return;
    const openPlayer = event => { if (event.detail?.userId) setRequestedPlayer(event.detail.userId); };
    const navigateTo = event => navigate(adminTargetUrl(event.detail || {}));
    let scheduled = null, pendingScope = null;
    const changed = event => {
      const detail = event.detail || {};
      pendingScope = pendingScope ? {
        skipAdminConsole: pendingScope.skipAdminConsole && detail.skipAdminConsole,
        skipSupport: pendingScope.skipSupport && detail.skipSupport,
      } : detail;
      if (scheduled) return;
      // One action may update multiple records; refresh the visible work once.
      scheduled = window.setTimeout(() => {
        scheduled = null;
        const scope = pendingScope;
        pendingScope = null;
        void queryClient.invalidateQueries({ predicate: query => isAdminWorkspaceQuery(query.queryKey)
          && !(scope.skipAdminConsole && query.queryKey[0] === "admin-console")
          && !(scope.skipSupport && (query.queryKey[3] === "ticketQueue" || query.queryKey[0] === "support-inbox-counts")),
        }, { cancelRefetch: false });
      }, 40);
    };
    window.addEventListener("topfragg:admin-player-open", openPlayer);
    window.addEventListener("topfragg:admin-navigate", navigateTo);
    window.addEventListener("topfragg:admin-changed", changed);
    return () => {
      window.removeEventListener("topfragg:admin-player-open", openPlayer);
      window.removeEventListener("topfragg:admin-navigate", navigateTo);
      window.removeEventListener("topfragg:admin-changed", changed);
      window.clearTimeout(scheduled);
    };
  }, [allowed, user?.id, navigate, queryClient]);
  return allowed && requestedPlayer ? <Suspense fallback={null}><AdminPlayerDossier key={user.id} user={user} initialUserId={requestedPlayer} /></Suspense> : null;
}
