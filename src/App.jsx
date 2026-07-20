import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';

// Layout
import PageLayout from '@/components/layout/PageLayout';

// Pages are split by route so visitors only download the screen they open.
const Home = lazy(() => import('@/pages/Home'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Eights = lazy(() => import('@/pages/Eights'));
const Ranked = lazy(() => import('@/pages/Ranked'));
const Wagers = lazy(() => import('@/pages/Wagers'));
const Tournaments = lazy(() => import('@/pages/Tournaments'));
const StreamerTournaments = lazy(() => import('@/pages/StreamerTournaments'));
const StreamerTournamentLobby = lazy(() => import('@/pages/StreamerTournamentLobby'));
const TournamentMatchRoom = lazy(() => import('@/pages/TournamentMatchRoom'));
const XP = lazy(() => import('@/pages/XP'));
const MatchRoom = lazy(() => import('@/pages/MatchRoom'));
const RankedMatchRoom = lazy(() => import('@/pages/RankedMatchRoom'));
const XPMatchRoom = lazy(() => import('@/pages/XPMatchRoom'));
const EightsMatchRoom = lazy(() => import('@/pages/EightsMatchRoom'));
const WagersMatchRoom = lazy(() => import('@/pages/WagersMatchRoom'));
const Leaderboards = lazy(() => import('@/pages/Leaderboards'));
const Profile = lazy(() => import('@/pages/Profile'));
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
const Terms = lazy(() => import('@/pages/Terms'));
const Settings = lazy(() => import('@/pages/Settings'));
const ThankYou = lazy(() => import('@/pages/ThankYou'));
const Admin = lazy(() => import('@/pages/Admin'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Messages = lazy(() => import('@/pages/Messages'));
const Wallet = lazy(() => import('@/pages/Wallet'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
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

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan to-cyan/60">
        <span className="font-mono text-lg font-bold text-background">TF</span>
      </div>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan/15 border-t-cyan" />
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <PageLoader />;
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
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route element={<PageLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/8s" element={<Eights />} />
          <Route path="/ranked" element={<Ranked />} />
          <Route path="/wagers" element={<Wagers />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/streamer-tournaments" element={<StreamerTournaments />} />
          <Route path="/streamer-tournament/:id" element={<StreamerTournamentLobby />} />
          <Route path="/tournament-match/:id" element={<TournamentMatchRoom />} />
          <Route path="/xp" element={<XP />} />
          <Route path="/match-room/:id" element={<MatchRoom />} />
          <Route path="/ranked-match/:id" element={<RankedMatchRoom />} />
          <Route path="/xp-match/:id" element={<XPMatchRoom />} />
          <Route path="/8s-match/:id" element={<EightsMatchRoom />} />
          <Route path="/wagers-match/:id" element={<WagersMatchRoom />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/cdl" element={<CDL />} />
          <Route path="/news" element={<News />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/support" element={<Support />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/wallet" element={<Wallet />} />
        </Route>
        </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <AuthenticatedApp />
      </Router>
      <DeferredToaster />
    </AuthProvider>
  )
}

export default App
