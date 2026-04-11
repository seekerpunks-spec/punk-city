/**
 * Vérification des signatures wallet — Ethereum (EIP-191) et Solana (ed25519, ex. Solflare)
 */
import { verifyMessage } from 'ethers'
import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/

export function isEvmAddress(s: string): boolean {
  return ADDR_RE.test(s.trim())
}

export function normalizeWallet(s: string): string {
  return s.trim().toLowerCase()
}

/** Clé stockée en base — préfixée pour éviter collision ETH/SOL et pour l’index unique exact */
export function ethereumStorageKey(address: string): string {
  return `eth:${normalizeWallet(address)}`
}

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

export function buildLoginMessageEthereum(address: string, nonce: string): string {
  return `Punk City — connexion wallet\nAdresse: ${normalizeWallet(address)}\nNonce: ${nonce}`
}

export function buildLoginMessageSolana(address: string, nonce: string): string {
  return `Punk City — connexion wallet\nAdresse: ${normalizeSolanaAddress(address)}\nNonce: ${nonce}`
}

export function verifyWalletSignature(address: string, message: string, signature: string): boolean {
  if (!signature.startsWith('0x') || signature.length < 130) return false
  try {
    const recovered = verifyMessage(message, signature)
    return recovered.toLowerCase() === normalizeWallet(address)
  } catch {
    return false
  }
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
