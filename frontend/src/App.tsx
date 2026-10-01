import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from './components/AppShell'
import { useAuth } from './lib/auth'
import { useVentures } from './lib/queries'
import Activity from './pages/Activity'
import Boardroom, { BoardroomSession } from './pages/Boardroom'
import CompetitiveIntelligence from './pages/CompetitiveIntelligence'
import Dashboard from './pages/Dashboard'
import DesignIntelligence from './pages/DesignIntelligence'
import Experiments, { ExperimentDetail } from './pages/Experiments'
import Knowledge from './pages/Knowledge'
import Landing from './pages/Landing'
import Login from './pages/Login'
import MarketSignals from './pages/MarketSignals'
import Studio from './pages/Studio'
import StudioProject from './pages/StudioProject'
import Research, { ReportPage } from './pages/Research'
import Settings from './pages/Settings'
import VentureDetail from './pages/VentureDetail'
import VentureMemory from './pages/VentureMemory'
import Ventures from './pages/Ventures'

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, demo } = useAuth()
  if (!ready) return null
  return demo || session ? children : <Navigate to="/login" replace />
}

/** Old URL -> new URL, keeping the query string (notifications and bookmarks still point at /app/competitors). */
function Moved({ to }: { to: string }) {
  return <Navigate to={{ pathname: to, search: useLocation().search }} replace />
}

/** Sidebar shortcut to a venture workspace tab: opens the newest venture on that tab. */
function VentureTab({ tab }: { tab: string }) {
  const { data, isLoading } = useVentures()
  if (isLoading) return null
  return <Navigate to={data?.[0] ? `/app/ventures/${data[0].id}?tab=${tab}` : '/app/ventures'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="ventures" element={<Ventures />} />
        <Route path="ventures/:id" element={<VentureDetail />} />
        <Route path="research" element={<Research />} />
        <Route path="research/:id" element={<ReportPage />} />
        <Route path="boardroom" element={<Boardroom />} />
        <Route path="boardroom/:id" element={<BoardroomSession />} />
        <Route path="competitive-intelligence" element={<CompetitiveIntelligence />} />
        <Route path="competitors" element={<Moved to="/app/competitive-intelligence" />} />
        <Route path="market-signals" element={<MarketSignals />} />
        <Route path="memory" element={<VentureMemory />} />
        <Route path="mvp" element={<VentureTab tab="mvp" />} />
        <Route path="prototype" element={<VentureTab tab="prototype" />} />
        <Route path="go-to-market" element={<VentureTab tab="gtm" />} />
        <Route path="experiments" element={<Experiments />} />
        <Route path="experiments/:id" element={<ExperimentDetail />} />
        <Route path="studio" element={<Studio />} />
        <Route path="studio/:id" element={<StudioProject />} />
        <Route path="design" element={<DesignIntelligence />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
