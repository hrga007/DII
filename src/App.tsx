import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import type { User } from 'firebase/auth'
import { loadConfig, initFirebase, isInitialized } from './config/firebase'
import { onAuthChange } from './services/authService'
import { ThemeProvider } from './hooks/useTheme'
import { ToastProvider } from './hooks/useToast'
import { ToastContainer } from './components/ToastContainer'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginPage } from './pages/LoginPage'

const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const UploadPage = lazy(() => import('./pages/UploadPage').then(m => ({ default: m.UploadPage })))
const ImportDetailPage = lazy(() => import('./pages/ImportDetailPage').then(m => ({ default: m.ImportDetailPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const InstitutionsPage = lazy(() => import('./pages/InstitutionsPage').then(m => ({ default: m.InstitutionsPage })))
const InstitutionDetailPage = lazy(() => import('./pages/InstitutionDetailPage').then(m => ({ default: m.InstitutionDetailPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })))
const AuditPage = lazy(() => import('./pages/AuditPage').then(m => ({ default: m.AuditPage })))

const SuspenseFallback = (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
  </div>
)

function RequireAuth({ user, children }: { user: User | null; children: React.ReactNode }) {
  if (!isInitialized()) return <Navigate to="/settings" replace />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const config = loadConfig()
    if (config) {
      initFirebase(config)
        .then(() => {
          const unsub = onAuthChange((u) => {
            setUser(u)
            setAuthReady(true)
          })
          return unsub
        })
        .catch(() => setAuthReady(true))
    } else {
      setAuthReady(true)
    }
  }, [])

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <ThemeProvider>
    <ToastProvider>
      <BrowserRouter basename="/DII/">
        <Suspense fallback={SuspenseFallback}>
          <Routes>
            <Route path="/settings" element={
              user
                ? <Layout user={user}><ErrorBoundary><SettingsPage /></ErrorBoundary></Layout>
                : <SettingsPage />
            } />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><DashboardPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/upload" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><UploadPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/imports" element={<Navigate to="/upload?tab=batches" replace />} />
            <Route path="/imports/:id" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><ImportDetailPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/institutions" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><InstitutionsPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/institucije/:id" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><InstitutionDetailPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/izvjestaji" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><ReportsPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/audit" element={
              <RequireAuth user={user}>
                <Layout user={user!}><ErrorBoundary><AuditPage /></ErrorBoundary></Layout>
              </RequireAuth>
            } />
            <Route path="/import-batches" element={<Navigate to="/upload?tab=batches" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </BrowserRouter>
    </ToastProvider>
    </ThemeProvider>
  )
}
