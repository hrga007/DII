import { initializeApp, type FirebaseApp, deleteApp, getApps } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

const CONFIG_KEY = 'dii_firebase_config'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

export function saveConfig(config: FirebaseConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function loadConfig(): FirebaseConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as FirebaseConfig
  } catch {
    return null
  }
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
}

export async function initFirebase(config: FirebaseConfig): Promise<void> {
  const existing = getApps().find((a) => a.name === '[DEFAULT]')
  if (existing) await deleteApp(existing)

  app = initializeApp(config)
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)
}

export function isInitialized(): boolean {
  return app !== null
}

export function getFirebaseAuth(): Auth {
  if (!auth) throw new Error('Firebase nije inicijaliziran')
  return auth
}

export function getFirebaseDb(): Firestore {
  if (!db) throw new Error('Firebase nije inicijaliziran')
  return db
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) throw new Error('Firebase nije inicijaliziran')
  return storage
}
