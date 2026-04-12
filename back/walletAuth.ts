/**
 * Vérification des signatures wallet Solana (ed25519)
 */
import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'

export function isSolanaAddress(s: string): boolean {
  try {
    new PublicKey(s.trim())
    return true
  } catch {
    return false
  }
}

export function normalizeSolanaAddress(s: string): string {
  return new PublicKey(s.trim()).toBase58()
}

export function solanaStorageKey(address: string): string {
  return `sol:${normalizeSolanaAddress(address)}`
}

export function buildLoginMessageSolana(address: string, nonce: string): string {
  return `Punk City — connexion wallet\nAdresse: ${normalizeSolanaAddress(address)}\nNonce: ${nonce}`
}

/** signature : 64 octets en base64 */
export function verifySolanaSignature(pubkeyInput: string, message: string, signatureB64: string): boolean {
  let pk: PublicKey
  try {
    pk = new PublicKey(pubkeyInput.trim())
  } catch {
    return false
  }
  let sig: Uint8Array
  try {
    sig = Uint8Array.from(Buffer.from(String(signatureB64).trim(), 'base64'))
  } catch {
    return false
  }
  if (sig.length !== 64) return false
  const msgBytes = new TextEncoder().encode(message)
  return nacl.sign.detached.verify(msgBytes, sig, pk.toBytes())
}
