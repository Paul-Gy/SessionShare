// 600k iterations take ~1s: cache per (password, salt) so it runs once instead of per file
const derivedKeys = new Map<string, Promise<CryptoKey>>()

// One salt per page load instead of per file: every file in a session shares the same
// password anyway, so per-file salts bought nothing (IVs stay random per file)
const uploadSalt = crypto.getRandomValues(new Uint8Array(16))

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600_000,
      hash: 'SHA-256',
    },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function getPasswordKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const saltHex = Array.from(salt, (byte) => byte.toString(16).padStart(2, '0')).join('')
  const id = `${password}:${saltHex}` // Cache key contains the raw password, which already lives in the URL hash anyway
  let key = derivedKeys.get(id)

  if (!key) {
    key = deriveKey(password, salt)
    derivedKeys.set(id, key)
    key.catch(() => derivedKeys.delete(id))
  }

  return key
}

export async function encrypt(file: Blob, password: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await getPasswordKey(password, uploadSalt)
  const buffer = await file.arrayBuffer()

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer)

  return new Blob([uploadSalt, iv, ciphertext], { type: 'application/octet-stream' })
}

export async function decrypt(encryptedBuffer: ArrayBuffer, password: string) {
  const bytes = new Uint8Array(encryptedBuffer)
  const salt = bytes.subarray(0, 16)
  const iv = bytes.subarray(16, 28)
  const ciphertext = bytes.subarray(28)

  const key = await getPasswordKey(password, salt)

  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
}

export function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}
