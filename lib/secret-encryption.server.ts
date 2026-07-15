import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { optionalServerEnv } from "@/lib/env.server"
import { formatMessage } from "@/lib/i18n/messages"

const ENCRYPTED_SECRET_PREFIX = "enc1:"
const ENCRYPTED_SECRET_VERSION = "enc1"
const SECRET_ENCRYPTION_ALGORITHM = "aes-256-gcm"
const SECRET_ENCRYPTION_KEY_BYTES = 32
const SECRET_ENCRYPTION_IV_BYTES = 12
const SECRET_ENCRYPTION_TAG_BYTES = 16
const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function encryptionKeyError() {
  return new Error(formatMessage("errors.webhookEncryptionKeyInvalid"))
}

function encryptedSecretFormatError() {
  return new Error(formatMessage("errors.webhookSecretMalformed"))
}

function decodeBase64(value: string, error: Error, options: { allowEmpty?: boolean } = {}) {
  if (!options.allowEmpty && value.length === 0) throw error
  if (!STANDARD_BASE64_PATTERN.test(value)) throw error
  return Buffer.from(value, "base64")
}

function readEncryptionKey() {
  const encoded = optionalServerEnv("TICKWARD_ENCRYPTION_KEY")
  if (!encoded) return undefined

  const key = decodeBase64(encoded, encryptionKeyError())
  if (key.length !== SECRET_ENCRYPTION_KEY_BYTES) throw encryptionKeyError()
  return key
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENCRYPTED_SECRET_PREFIX)
}

export function encryptSecret(plaintext: string): string {
  const key = readEncryptionKey()
  if (!key) return plaintext

  const iv = randomBytes(SECRET_ENCRYPTION_IV_BYTES)
  const cipher = createCipheriv(SECRET_ENCRYPTION_ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [ENCRYPTED_SECRET_VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  )
}

export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value

  const key = readEncryptionKey()
  if (!key) {
    throw new Error(formatMessage("errors.webhookEncryptionKeyRequired"))
  }

  const parts = value.split(":")
  if (parts.length !== 4 || parts[0] !== ENCRYPTED_SECRET_VERSION) throw encryptedSecretFormatError()

  const [, ivValue, tagValue, ciphertextValue] = parts
  const formatError = encryptedSecretFormatError()
  const iv = decodeBase64(ivValue, formatError)
  const tag = decodeBase64(tagValue, formatError)
  const ciphertext = decodeBase64(ciphertextValue, formatError, { allowEmpty: true })
  if (iv.length !== SECRET_ENCRYPTION_IV_BYTES || tag.length !== SECRET_ENCRYPTION_TAG_BYTES) {
    throw encryptedSecretFormatError()
  }

  try {
    const decipher = createDecipheriv(SECRET_ENCRYPTION_ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  } catch {
    throw new Error(formatMessage("errors.webhookSecretUndecryptable"))
  }
}
