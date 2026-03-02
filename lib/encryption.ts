import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

type EncryptedValue = {
  ciphertext: string
  iv: string
  tag: string
}

const HEX_32_BYTE_RE = /^[0-9a-fA-F]{64}$/

const readEncryptionKey = () => {
  const raw = process.env.DASHBOARD_ENCRYPTION_KEY?.trim() || ''

  if (!raw) {
    throw new Error('Missing DASHBOARD_ENCRYPTION_KEY')
  }

  if (HEX_32_BYTE_RE.test(raw)) {
    return Buffer.from(raw, 'hex')
  }

  const maybeBase64 = Buffer.from(raw, 'base64')
  if (maybeBase64.length === 32) {
    return maybeBase64
  }

  throw new Error('DASHBOARD_ENCRYPTION_KEY must be 64 hex chars or base64 encoding of 32 bytes')
}

export const encryptSecret = (plaintext: string): EncryptedValue => {
  const key = readEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  }
}

export const decryptSecret = (payload: Partial<EncryptedValue>) => {
  if (!payload.ciphertext || !payload.iv || !payload.tag) {
    return null
  }

  const key = readEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ])

  return plaintext.toString('utf8')
}
