// Encryption code based on https://bradyjoslin.com/blog/encryption-webcrypto/

export async function getPasswordKey(password: string, salt: BufferSource) {
  const enc = new TextEncoder()
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 250000,
      hash: 'SHA-256',
    },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptData(data: ArrayBufferLike, password: string) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await getPasswordKey(password, salt)

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array(data),
  )

  const arr = new Uint8Array(encrypted)
  const buff = new Uint8Array(salt.byteLength + iv.byteLength + arr.byteLength)
  buff.set(salt, 0)
  buff.set(iv, salt.byteLength)
  buff.set(arr, salt.byteLength + iv.byteLength)

  return buff
}

export async function decryptData(encryptedBuff: Uint8Array, password: string) {
  const salt = encryptedBuff.slice(0, 16)
  const iv = encryptedBuff.slice(16, 16 + 12)
  const data = encryptedBuff.slice(16 + 12)
  const key = await getPasswordKey(password, salt)
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array(data),
  )

  return new Uint8Array(decrypted)
}

export async function encryptAsBase64(data: ArrayBufferLike, password: string) {
  const encrypted = await encryptData(data, password)
  const encryptedLength = encrypted.byteLength
  const buffer = []

  for (let i = 0; i < encryptedLength; i++) {
    buffer.push(String.fromCharCode(encrypted[i]))
  }

  return btoa(buffer.join(''))
}

export function decryptFromBase64(base64: string, password: string) {
  const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

  return decryptData(buffer, password)
}
