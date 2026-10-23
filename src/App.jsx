import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PageLoader from '@/components/ui/PageLoader';
import { FreeEightsLoadingProvider } from '@/components/competition/FreeEightsLoading';
import ScrollToTop from './components/ScrollToTop';

// Layout
import PageLayout from '@/components/layout/PageLayout';

// Pages are split by route so visitors only download the screen they open.
const Ranked = lazy(() => import('@/pages/Ranked'));
const XP = lazy(() => import('@/pages/XP'));
const RankedEights = lazy(() => import('@/pages/RankedEights'));
const Wagers = lazy(() => import('@/pages/Wagers'));
const Tournaments = lazy(() => import('@/pages/Tournaments'));
const TournamentOverview = lazy(() => import('@/pages/TournamentOverview'));
const Home = lazy(() => import('@/pages/Home'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const StreamerTournaments = lazy(() => import('@/pages/StreamerTournaments'));
const StreamerTournamentLobby = lazy(() => import('@/pages/StreamerTournamentLobby'));
const TournamentMatchRoom = lazy(() => import('@/pages/TournamentMatchRoom'));
const MatchRoom = lazy(() => import('@/pages/MatchRoom'));
const RankedMatchRoom = lazy(() => import('@/pages/RankedMatchRoom'));
const XPMatchRoom = lazy(() => import('@/pages/XPMatchRoom'));
const WagersMatchRoom = lazy(() => import('@/pages/WagersMatchRoom'));
const EightsMatchRoom = lazy(() => import('@/pages/EightsMatchRoom'));
const Leaderboards = lazy(() => import('@/pages/Leaderboards'));
const Matchfinder = lazy(() => import('@/pages/Matchfinder'));
const Profile = lazy(() => import('@/pages/Profile'));
const MyMatches = lazy(() => import('@/pages/MyMatches'));
const ChallengeTeam = lazy(() => import('@/pages/ChallengeTeam'));
const CoedSwitcheroo = lazy(() => import('@/pages/CoedSwitcheroo'));
const League = lazy(() => import('@/pages/League'));
const LeagueMatchDemo = lazy(() => import('@/pages/LeagueMatchDemo'));
const Teams = lazy(() => import('@/pages/Teams'));
const Marketplace = lazy(() => import('@/pages/Marketplace'));
const ItemDetail = lazy(() => import('@/pages/ItemDetail'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const Trading = lazy(() => import('@/pages/Trading'));
const Premium = lazy(() => import('@/pages/Premium'));
const CDL = lazy(() => import('@/pages/CDL'));
const News = lazy(() => import('@/pages/News'));
const Rules = lazy(() => import('@/pages/Rules'));
const Support = lazy(() => import('@/pages/Support'));
const PublicSupport = lazy(() => import('@/pages/PublicSupport'));
const Terms = lazy(() => import('@/pages/Terms'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Settings = lazy(() => import('@/pages/Settings'));
const PlayerOverlay = lazy(() => import('@/pages/PlayerOverlay'));
const WebcamOverlay = lazy(() => import('@/pages/WebcamOverlay'));
const ThankYou = lazy(() => import('@/pages/ThankYou'));
const Admin = lazy(() => import('@/pages/Admin'));
const AccountRestricted = lazy(() => import('@/pages/AccountRestricted'));
const ConnectionRestricted = lazy(() => import('@/pages/ConnectionRestricted'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Messages = lazy(() => import('@/pages/Messages'));
const FindPlayersChat = lazy(() => import('@/pages/FindPlayersChat'));
const Wallet = lazy(() => import('@/pages/Wallet'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
const Logout = lazy(() => import('@/pages/Logout'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const PageNotFound = lazy(() => import('@/lib/PageNotFound'));
const Toaster = lazy(() => import('@/components/ui/toaster').then((module) => ({ default: module.Toaster })));
import ProtectedRoute from '@/components/ProtectedRoute';

function DeferredToaster() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const show = () => setReady(true);
    const handle = "requestIdleCallback" in window
      ? window.requestIdleCallback(show, { timeout: 1500 })
      : window.setTimeout(show, 600);
    return () => {
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return ready ? <Suspense fallback={null}><Toaster /></Suspense> : null;
}

function SupportEntry() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <PageLoader label="Loading support" />;
  return isAuthenticated ? <Support /> : <PublicSupport />;
}

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingPublicSettings, authError, navigateToLogin, restriction, networkRestriction } = useAuth();

  if (restriction) return <Suspense fallback={<PageLoader fullscreen />}><AccountRestricted /></Suspense>;
  if (networkRestriction) return <Suspense fallback={<PageLoader fullscreen />}><ConnectionRestricted /></Suspense>;

  if (isLoadingPublicSettings) {
    return <PageLoader fullscreen label="Loading Topfragg" />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<PageLoader fullscreen />}>
      <Routes>
      <Route element={<PageLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/support" element={<SupportEntry />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/premium" element={<Premium />} />
        <Route path="/league" element={<League />} />
        <Route path="/league/division/:divisionId" element={<League />} />
        <Route path="/league/division/:divisionId/demo-match/:matchId" element={<LeagueMatchDemo />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }} />} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/ranked" element={<Ranked />} />
          <Route path="/xp" element={<XP />} />
          <Route path="/ranked/8s" element={<RankedEights />} />
          <Route path="/wagers" element={<Wagers />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/:id" element={<TournamentOverview />} />
          <Route path="/streamer-tournaments" element={<StreamerTournaments />} />
          <Route path="/streamer-tournament/:id" element={<StreamerTournamentLobby />} />
          <Route path="/tournament-match/:id" element={<TournamentMatchRoom />} />
          <Route path="/match-room/:id" element={<MatchRoom />} />
          <Route path="/ranked-match/:id" element={<RankedMatchRoom />} />
          <Route path="/xp-match/:id" element={<XPMatchRoom />} />
          <Route path="/wagers-match/:id" element={<WagersMatchRoom />} />
          <Route path="/8s-match/:id" element={<EightsMatchRoom />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/matchfinder" element={<Matchfinder />} />
          <Route path="/my-matches" element={<MyMatches />} />
          <Route path="/challenge-a-team" element={<ChallengeTeam />} />
          <Route path="/challenge-a-team/:id" element={<ChallengeTeam />} />
          <Route path="/coed-switcheroo" element={<CoedSwitcheroo />} />
          <Route path="/coed-switcheroo/:id" element={<CoedSwitcheroo />} />
          <Route path="/coed-switcheroo/:id/match/:matchId" element={<CoedSwitcheroo />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/cdl" element={<CDL />} />
          <Route path="/news" element={<News />} />
          <Route path="/my-tickets" element={<Support ticketCenter />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/find-players" element={<FindPlayersChat />} />
          <Route path="/wallet" element={<Wallet />} />
        </Route>
        </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {
  useEffect(() => {
    const isProtectedImage = (target) => target instanceof Element && Boolean(target.closest('img'));
    const blockImageContextMenu = (event) => {
      if (isProtectedImage(event.target)) event.preventDefault();
    };
    const blockImageDrag = (event) => {
      if (isProtectedImage(event.target)) event.preventDefault();
    };

    document.addEventListener('contextmenu', blockImageContextMenu, true);
    document.addEventListener('dragstart', blockImageDrag, true);
    return () => {
      document.removeEventListener('contextmenu', blockImageContextMenu, true);
      document.removeEventListener('dragstart', blockImageDrag, true);
    };
  }, []);

  if (typeof window !== "undefined" && /^\/overlay\/(player|webcam)\/[^/]+\/?$/.test(window.location.pathname)) {
    return <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={null}><Routes><Route path="/overlay/player/:identifier" element={<PlayerOverlay />} /><Route path="/overlay/webcam/:identifier" element={<WebcamOverlay />} /></Routes></Suspense>
    </Router>;
  }

  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <FreeEightsLoadingProvider>
            <AuthenticatedApp />
          </FreeEightsLoadingProvider>
        </Router>
        <DeferredToaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App

