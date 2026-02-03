export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    let chunkStr = ""
    chunk.forEach(b => {
      chunkStr += String.fromCharCode(b)
    })
    binary += chunkStr
  }
  return btoa(binary)
}

export const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const deriveAesKeyFromPassword = async (options: {
  password: string
  saltB64: string
  iterations: number
}): Promise<CryptoKey> => {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(options.password),
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(options.saltB64),
      iterations: options.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export const aesGcmEncryptToBase64 = async (options: {
  key: CryptoKey
  ivB64: string
  plaintext: string
}): Promise<string> => {
  const encoder = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: base64ToBytes(options.ivB64) },
    options.key,
    encoder.encode(options.plaintext)
  )
  return bytesToBase64(new Uint8Array(ciphertext))
}

export const aesGcmDecryptFromBase64 = async (options: {
  key: CryptoKey
  ivB64: string
  ciphertextB64: string
}): Promise<string> => {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(options.ivB64) },
    options.key,
    base64ToBytes(options.ciphertextB64)
  )
  return new TextDecoder().decode(plaintext)
}

export const randomBase64 = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}
