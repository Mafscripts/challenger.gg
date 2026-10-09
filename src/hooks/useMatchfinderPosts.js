import { useEffect, useState } from "react";
import { isMatchfinderPostVisible, matchfinderPostExpiresAt } from "../lib/matchfinderPosts.js";

// Expire listings even when the page stays open without another API response.
export function useMatchfinderPosts(posts) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const current = Date.now();
    const nextExpiry = Math.min(...posts.map(matchfinderPostExpiresAt).filter((expiry) => expiry > current));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(nextExpiry - current, 2147483647));
    return () => window.clearTimeout(timer);
  }, [posts, now]);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return posts.filter((post) => isMatchfinderPostVisible(post, Date.now()));
}
