import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

export default function ScrollToTop() {
  const { pathname, hash, state } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);
  const preserveCompetitionScroll = state?.preserveCompetitionScroll === true;

  useLayoutEffect(() => {
    const from = previousPath.current;
    previousPath.current = pathname;
    if (navigationType === "POP") return;
    const competitionPaths = ["/ranked", "/xp", "/wagers", "/ranked/8s"];
    if (!hash && preserveCompetitionScroll && competitionPaths.includes(from) && competitionPaths.includes(pathname)) return;

    if (hash) {
      const id = getHashId(hash);
      const timer = window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return () => window.clearTimeout(timer);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType, preserveCompetitionScroll]);

  return null;
}
