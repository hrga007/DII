import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth } from '../config/firebase'

export async function login(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth()
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function logout(): Promise<void> {
  const auth = getFirebaseAuth()
  await signOut(auth)
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth()
  return onAuthStateChanged(auth, cb)
}

export function currentUser(): User | null {
  return getFirebaseAuth().currentUser
}
