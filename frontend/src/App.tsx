import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { useAuth } from './lib/auth'
import Activity from './pages/Activity'
import Boardroom, { BoardroomSession } from './pages/Boardroom'
import Competitors from './pages/Competitors'
import Dashboard from './pages/Dashboard'
import Experiments, { ExperimentDetail } from './pages/Experiments'
import Knowledge from './pages/Knowledge'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Research, { ReportPage } from './pages/Research'
import Settings from './pages/Settings'
import VentureDetail from './pages/VentureDetail'
import Ventures from './pages/Ventures'

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, demo } = useAuth()
  if (!ready) return null
  return demo || session ? children : <Navigate to="/login" replace />
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
        <Route path="competitors" element={<Competitors />} />
        <Route path="experiments" element={<Experiments />} />
        <Route path="experiments/:id" element={<ExperimentDetail />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
