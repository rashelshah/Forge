import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from './components/AppShell'
import { useAuth } from './lib/auth'
import { useVentures } from './lib/queries'
import { storedVenture } from './lib/venture'
// Every page is its own chunk: opening the app downloads only the page you land on, and the rest load on demand
// (and in the background once the app is idle, see `preloadPages`).
const pages = {
  Activity: () => import('./pages/Activity'),
  Boardroom: () => import('./pages/Boardroom'),
  CompetitiveIntelligence: () => import('./pages/CompetitiveIntelligence'),
  Dashboard: () => import('./pages/Dashboard'),
  DesignIntelligence: () => import('./pages/DesignIntelligence'),
  Experiments: () => import('./pages/Experiments'),
  Knowledge: () => import('./pages/Knowledge'),
  Landing: () => import('./pages/Landing'),
  Login: () => import('./pages/Login'),
  MarketSignals: () => import('./pages/MarketSignals'),
  Studio: () => import('./pages/Studio'),
  StudioProject: () => import('./pages/StudioProject'),
  Research: () => import('./pages/Research'),
  Settings: () => import('./pages/Settings'),
  VentureDetail: () => import('./pages/VentureDetail'),
  VentureMemory: () => import('./pages/VentureMemory'),
  Ventures: () => import('./pages/Ventures'),
}
const Activity = lazy(pages.Activity)
const Boardroom = lazy(pages.Boardroom)
const BoardroomSession = lazy(() => pages.Boardroom().then((m) => ({ default: m.BoardroomSession })))
const CompetitiveIntelligence = lazy(pages.CompetitiveIntelligence)
const Dashboard = lazy(pages.Dashboard)
const DesignIntelligence = lazy(pages.DesignIntelligence)
const Experiments = lazy(pages.Experiments)
const ExperimentDetail = lazy(() => pages.Experiments().then((m) => ({ default: m.ExperimentDetail })))
const Knowledge = lazy(pages.Knowledge)
const Landing = lazy(pages.Landing)
const Login = lazy(pages.Login)
const MarketSignals = lazy(pages.MarketSignals)
const Studio = lazy(pages.Studio)
const StudioProject = lazy(pages.StudioProject)
const Research = lazy(pages.Research)
const ReportPage = lazy(() => pages.Research().then((m) => ({ default: m.ReportPage })))
const Settings = lazy(pages.Settings)
const VentureDetail = lazy(pages.VentureDetail)
const VentureMemory = lazy(pages.VentureMemory)
const Ventures = lazy(pages.Ventures)

/** Fetch the other pages' code while the browser is idle, so moving around the app never waits on a download. */
function preloadPages() {
  const go = () => Object.values(pages).forEach((load) => load().catch(() => {}))
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 2000)
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, demo } = useAuth()
  const ok = demo || !!session
  useEffect(() => { if (ready && ok) preloadPages() }, [ready, ok])
  if (!ready) return null
  return ok ? children : <Navigate to="/login" replace />
}

/** Old URL -> new URL, keeping the query string (notifications and bookmarks still point at /app/competitors). */
function Moved({ to }: { to: string }) {
  return <Navigate to={{ pathname: to, search: useLocation().search }} replace />
}

/** Sidebar shortcut to a venture workspace tab: opens the current project (else the newest) on that tab. */
function VentureTab({ tab }: { tab: string }) {
  const { data, isLoading } = useVentures()
  if (isLoading) return null
  const v = data?.find((x) => x.id === storedVenture()) ?? data?.[0]
  return <Navigate to={v ? `/app/ventures/${v.id}?tab=${tab}` : '/app/ventures'} replace />
}

export default function App() {
  return (
    <Suspense fallback={null}>
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
    </Suspense>
  )
}
