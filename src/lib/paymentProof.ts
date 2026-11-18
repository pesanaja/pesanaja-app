export type PaymentProofMime = 'image/png' | 'image/jpeg' | 'image/webp'

export async function validatePaymentProof(file: File): Promise<PaymentProofMime> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran bukti pembayaran maksimal 5 MB.')
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isWebp = bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50

  if (isPng) return 'image/png'
  if (isJpeg) return 'image/jpeg'
  if (isWebp) return 'image/webp'
  throw new Error('Format bukti tidak valid. Unggah foto PNG, JPG, atau WebP.')
}
