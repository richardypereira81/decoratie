import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebaseClient.js'
import { sanitizeFileName } from '../shared/formatters.js'

export async function uploadImage(file, baseFolder) {
  const safeName = sanitizeFileName(file.name || 'imagem')
  const filePath = `public/${baseFolder}/${Date.now()}-${safeName}`
  const fileRef = ref(storage, filePath)
  const snapshot = await uploadBytes(fileRef, file)
  const url = await getDownloadURL(snapshot.ref)

  return {
    path: filePath,
    url,
  }
}

export async function removeStoredFile(path) {
  if (!path) {
    return
  }

  try {
    await deleteObject(ref(storage, path))
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') {
      throw error
    }
  }
}
