import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider, useI18n } from './lib/i18n';
import { AuthProvider, useAuth } from './lib/auth';
import { AlertProvider } from './lib/alert';
import { Layout } from './components/Layout';
import { Notice, Spinner } from './components/ui';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import FakeCall from './pages/FakeCall';
import SafetyMap from './pages/SafetyMap';
import SosPage from './pages/SosPage';
import WalkTogether from './pages/WalkTogether';
import NoTouch from './pages/NoTouch';
import Settings from './pages/Settings';
import ComingNext from './pages/ComingNext';
import More from './pages/More';
import ProfileSetup from './pages/ProfileSetup';
import Shakti from './pages/Shakti';
import Evidence from './pages/Evidence';
import JudgeDemo from './pages/JudgeDemo';
import Admin from './pages/Admin';
import { OnlineProvider } from './lib/online';
import { DemoModeProvider } from './lib/demoMode';

function Gate() {
  const { session, loading, me, meError } = useAuth(); const { t, err } = useI18n();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/welcome" replace />;
  if (meError) return <div className="mx-auto max-w-md p-6"><Notice tone="error">{meError === 'SUPABASE_NOT_CONFIGURED' ? t('err.SUPABASE_NOT_CONFIGURED') : err({ code: meError, message: meError })}</Notice></div>;
  if (!me) return <Spinner />;
  return <Layout />;
}

export default function App() {
  return (
    <I18nProvider><OnlineProvider><DemoModeProvider><AuthProvider><AlertProvider><BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route element={<Gate />}>
          <Route index element={<Dashboard />} /><Route path="call" element={<FakeCall />} /><Route path="map" element={<SafetyMap />} />
          <Route path="sos" element={<SosPage />} /><Route path="walk" element={<WalkTogether />} /><Route path="no-touch" element={<NoTouch />} />
          <Route path="settings" element={<Settings />} /><Route path="next" element={<ComingNext />} /><Route path="more" element={<More />} /><Route path="profile-setup" element={<ProfileSetup />} />
          <Route path="shakti" element={<Shakti />} /><Route path="vault" element={<Evidence />} /><Route path="demo" element={<JudgeDemo />} /><Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter></AlertProvider></AuthProvider></DemoModeProvider></OnlineProvider></I18nProvider>
  );
}
