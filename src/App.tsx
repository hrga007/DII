import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { loadConfig, initFirebase, isInitialized } from './config/firebase'
import { onAuthChange } from './services/authService'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { UploadPage } from './pages/UploadPage'
import { ImportsPage } from './pages/ImportsPage'
import { ImportDetailPage } from './pages/ImportDetailPage'
import { DashboardPage } from './pages/DashboardPage'

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
    <BrowserRouter basename="/dii-webapp/">
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth user={user}>
              <Layout user={user!}><DashboardPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/upload"
          element={
            <RequireAuth user={user}>
              <Layout user={user!}><UploadPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/imports"
          element={
            <RequireAuth user={user}>
              <Layout user={user!}><ImportsPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/imports/:id"
          element={
            <RequireAuth user={user}>
              <Layout user={user!}><ImportDetailPage /></Layout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
