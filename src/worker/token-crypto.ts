import { Effect } from "effect"
import { ConfigInvalid } from "./errors.ts"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

/** 32 random bytes, base64url: used for session cookies, OAuth state, and PKCE verifiers. */
export const randomToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))

export const sha256Hex = (text: string) =>
  Effect.promise(async () => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
  })

export const pkceChallenge = (verifier: string) =>
  Effect.promise(async () =>
    toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)))),
  )

export const importTokenKey = (base64Key: string) =>
  Effect.gen(function* () {
    const raw = yield* Effect.try({
      try: () => fromBase64(base64Key),
      catch: () => new ConfigInvalid({ message: "SESSION_ENCRYPTION_KEY is not valid base64" }),
    })
    if (raw.length !== 32) {
      return yield* new ConfigInvalid({ message: "SESSION_ENCRYPTION_KEY must decode to 32 bytes" })
    }
    return yield* Effect.promise(() =>
      crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]),
    )
  })

/**
 * AES-GCM with a random 96-bit IV stored in front of the ciphertext. `context` is bound as
 * additional data, so a ciphertext copied into another session row fails to decrypt.
 */
export const encryptToken = (key: CryptoKey, plaintext: string, context: string) =>
  Effect.promise(async () => {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
        key,
        encoder.encode(plaintext),
      ),
    )
    const sealed = new Uint8Array(iv.length + ciphertext.length)
    sealed.set(iv)
    sealed.set(ciphertext, iv.length)
    return toBase64(sealed)
  })

/** Fails when the ciphertext was tampered with, moved, or sealed under another key. */
export const decryptToken = (key: CryptoKey, sealed: string, context: string) =>
  Effect.tryPromise(async () => {
    const bytes = fromBase64(sealed)
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode(context) },
      key,
      bytes.slice(12),
    )
    return decoder.decode(plaintext)
  })
