export type PaymentProofMime = 'image/png' | 'image/jpeg' | 'application/pdf'

export async function validatePaymentProof(file: File): Promise<PaymentProofMime> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran bukti pembayaran maksimal 5 MB.')
  }

  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPdf = bytes.length >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d

  if (isPng) return 'image/png'
  if (isJpeg) return 'image/jpeg'
  if (isPdf) return 'application/pdf'
  throw new Error('Format bukti tidak valid. Unggah file PNG, JPG, atau PDF.')
}
