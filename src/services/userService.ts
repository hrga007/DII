import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { getFirebaseDb, getBuildConfig, loadConfig } from '../config/firebase'

export type Role = 'admin' | 'viewer'

export interface UserProfile {
  uid: string
  email: string
  role: Role
  createdAt?: Date
}

export async function listUsers(): Promise<UserProfile[]> {
  const db = getFirebaseDb()
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => {
    const data = d.data()
    return {
      uid: d.id,
      email: data.email ?? '',
      role: data.role ?? 'viewer',
      createdAt: data.createdAt?.toDate?.() ?? undefined,
    } as UserProfile
  })
}

export async function createUser(email: string, password: string, role: Role): Promise<void> {
  const config = getBuildConfig() ?? loadConfig()
  if (!config) throw new Error('Firebase nije konfiguriran')

  // Koristimo privremenu drugu Firebase App instancu da ne izgubimo admin sesiju
  const tempApp = initializeApp(config, `temp-create-${Date.now()}`)
  const tempAuth = getAuth(tempApp)

  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password)
    const db = getFirebaseDb()
    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      role,
      createdAt: serverTimestamp(),
    })
  } finally {
    await deleteApp(tempApp)
  }
}

export async function updateRole(uid: string, role: Role): Promise<void> {
  const db = getFirebaseDb()
  await updateDoc(doc(db, 'users', uid), { role })
}

export async function removeUser(uid: string): Promise<void> {
  const db = getFirebaseDb()
  await deleteDoc(doc(db, 'users', uid))
}

export async function sendUserPasswordReset(email: string): Promise<void> {
  const config = getBuildConfig() ?? loadConfig()
  if (!config) throw new Error('Firebase nije konfiguriran')

  const tempApp = initializeApp(config, `temp-reset-${Date.now()}`)
  const tempAuth = getAuth(tempApp)

  try {
    await sendPasswordResetEmail(tempAuth, email)
  } finally {
    await deleteApp(tempApp)
  }
}
