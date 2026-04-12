/**
 * Message de login aligné avec `back/walletAuth.ts` → buildLoginMessageSolana
 */
import { PublicKey } from '@solana/web3.js'

export function buildLoginMessageSolana(address: string, nonce: string): string {
  return `Punk City — connexion wallet\nAdresse: ${new PublicKey(address.trim()).toBase58()}\nNonce: ${nonce}`
}

function bytesToBase64(u8: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!)
  return btoa(bin)
}

/**
 * @param signMessage — fourni par le wallet (Wallet Adapter)
 */
export async function verifySolanaSession(
  apiBase: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  publicKey: PublicKey,
): Promise<{
  sessionId: string
  registered: boolean
  username?: string
}> {
  const address = publicKey.toBase58()

  const nonceRes = await fetch(`${apiBase}/api/auth/nonce?address=${encodeURIComponent(address)}`)
  if (!nonceRes.ok) {
    const err = await nonceRes.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Nonce impossible')
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string }
  const message = buildLoginMessageSolana(address, nonce)
  const encoded = new TextEncoder().encode(message)
  const sig = await signMessage(encoded)
  const raw = sig instanceof Uint8Array ? sig : new Uint8Array(sig)
  const signature = bytesToBase64(raw)

  const verifyRes = await fetch(`${apiBase}/api/auth/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ address, message, signature }),
  })
  const body = (await verifyRes.json()) as { error?: string; sessionId?: string; registered?: boolean; username?: string }
  if (!verifyRes.ok) {
    throw new Error(body.error ?? 'Vérification refusée')
  }
  if (!body.sessionId) throw new Error('Réponse serveur invalide')
  return {
    sessionId:  body.sessionId,
    registered: !!body.registered,
    username:   body.username,
  }
}
