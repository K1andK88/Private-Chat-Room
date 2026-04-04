/**
 * E2EE Crypto Module
 * 
 * Key derivation: PBKDF2(roomPassword + roomId, salt, 100k iterations) → 256-bit key
 * Encryption: AES-256-GCM (Web Crypto API, browser native)
 * 
 * Server NEVER sees plaintext. Only ciphertext is transmitted.
 */

const PBKDF2_ITERATIONS = 100_000

export type CryptoKeyInstance = CryptoKey

/** Derive a 256-bit AES key from room password + room ID using PBKDF2 */
export async function deriveKey(
  roomPassword: string,
  roomId: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(roomPassword),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  const salt = encoder.encode(roomId)

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface EncryptedPayload {
  ciphertext: string // base64
  iv: string         // base64
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Encrypt a plaintext message using AES-256-GCM */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = encoder.encode(plaintext)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data
  )

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  }
}

/** Decrypt a ciphertext message using AES-256-GCM */
export async function decryptMessage(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  const iv = base64ToUint8Array(payload.iv)
  const ciphertext = base64ToUint8Array(payload.ciphertext)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/** Encrypt a binary buffer using AES-256-GCM */
export async function encryptBuffer(
  data: Uint8Array,
  key: CryptoKey
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource
  )
  return {
    ciphertext: new Uint8Array(encrypted),
    iv,
  }
}

/** Decrypt a binary buffer using AES-256-GCM */
export async function decryptBuffer(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  )
  return new Uint8Array(decrypted)
}

/** Encrypt a JSON object to EncryptedPayload */
export async function encryptJSON(
  obj: unknown,
  key: CryptoKey
): Promise<EncryptedPayload> {
  return encryptMessage(JSON.stringify(obj), key)
}

/** Decrypt an EncryptedPayload to a JSON object */
export async function decryptJSON<T>(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<T> {
  const json = await decryptMessage(payload, key)
  return JSON.parse(json) as T
}
