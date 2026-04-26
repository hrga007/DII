import { useState, useEffect } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange } from '../services/authService'
import { isInitialized } from '../config/firebase'

export interface AuthState {
  user: User | null
  loading: boolean
  firebaseReady: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const firebaseReady = isInitialized()

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false)
      return
    }
    const unsub = onAuthChange((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [firebaseReady])

  return { user, loading, firebaseReady }
}
