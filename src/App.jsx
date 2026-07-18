import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';

// Layout
import PageLayout from '@/components/layout/PageLayout';

// Pages
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import Eights from '@/pages/Eights';
import Ranked from '@/pages/Ranked';
import Wagers from '@/pages/Wagers';
import Tournaments from '@/pages/Tournaments';
import StreamerTournaments from '@/pages/StreamerTournaments';
import StreamerTournamentLobby from '@/pages/StreamerTournamentLobby';
import TournamentMatchRoom from '@/pages/TournamentMatchRoom';
import XP from '@/pages/XP';
import MatchRoom from '@/pages/MatchRoom';
import RankedMatchRoom from '@/pages/RankedMatchRoom';
import XPMatchRoom from '@/pages/XPMatchRoom';
import EightsMatchRoom from '@/pages/EightsMatchRoom';
import WagersMatchRoom from '@/pages/WagersMatchRoom';
import Leaderboards from '@/pages/Leaderboards';
import Profile from '@/pages/Profile';
import Teams from '@/pages/Teams';
import Marketplace from '@/pages/Marketplace';
import ItemDetail from '@/pages/ItemDetail';
import Inventory from '@/pages/Inventory';
import Trading from '@/pages/Trading';
import Premium from '@/pages/Premium';
import CDL from '@/pages/CDL';
import News from '@/pages/News';
import Rules from '@/pages/Rules';
import Support from '@/pages/Support';
import Terms from '@/pages/Terms';
import Settings from '@/pages/Settings';
import ThankYou from '@/pages/ThankYou';
import Admin from '@/pages/Admin';
import Notifications from '@/pages/Notifications';
import Messages from '@/pages/Messages';
import Wallet from '@/pages/Wallet';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Logout from '@/pages/Logout';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ChangePassword from '@/pages/ChangePassword';
import ProtectedRoute from '@/components/ProtectedRoute';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded bg-gradient-to-br from-cyan to-cyan/60 flex items-center justify-center">
            <span className="text-background font-bold text-lg font-mono">C</span>
          </div>
          <div className="w-8 h-8 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin"></div>
        </div>
      </div>
    );
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
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
