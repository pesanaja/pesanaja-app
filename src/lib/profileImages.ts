import { supabase } from './supabase'

const bucket = 'profile-images'
const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
const maxSize = 5 * 1024 * 1024

export function validateProfileImage(file: File): string | null {
  if (!allowedTypes.includes(file.type)) return 'Format foto harus PNG, JPG, atau WEBP.'
  if (file.size > maxSize) return 'Ukuran foto maksimal 5 MB.'
  return null
}

export async function uploadProfileImage(userId: string, file: File) {
  if (!supabase) throw new Error('Koneksi Supabase belum tersedia.')
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    if (error.message.toLowerCase().includes('bucket not found')) {
      throw new Error('Penyimpanan foto profil belum tersedia. Terapkan migration 20261116170000_profile_images.sql di Supabase, lalu coba lagi.')
    }
    throw new Error(`Foto profil gagal diunggah: ${error.message}`)
  }
  return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl }
}

export function getOwnedProfileImagePath(url: string | null, userId: string): string | null {
  if (!url || !supabase) return null
  const publicUrl = supabase.storage.from(bucket).getPublicUrl('').data.publicUrl
  if (!url.startsWith(publicUrl)) return null
  const path = decodeURIComponent(url.slice(publicUrl.length))
  return path.startsWith(`${userId}/`) ? path : null
}

export async function removeProfileImage(path: string) {
  if (!supabase) throw new Error('Koneksi Supabase belum tersedia.')
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw new Error(`Foto profil lama gagal dihapus: ${error.message}`)
}
