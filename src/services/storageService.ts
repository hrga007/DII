import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getFirebaseStorage } from '../config/firebase'

export async function uploadExcelFile(
  file: File,
  userId: string,
  fileHash: string
): Promise<string> {
  const storage = getFirebaseStorage()
  const ext = file.name.split('.').pop()
  const path = `uploads/${userId}/${fileHash}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return path
}

export async function getFileUrl(path: string): Promise<string> {
  const storage = getFirebaseStorage()
  return getDownloadURL(ref(storage, path))
}
