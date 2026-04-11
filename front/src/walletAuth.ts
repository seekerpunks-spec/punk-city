/**
 * Doit rester aligné avec `back/walletAuth.ts` pour les textes de message.
 */
import { PublicKey } from '@solana/web3.js'

export type WalletChain = 'ethereum' | 'solana'

export function buildLoginMessageEthereum(address: string, nonce: string): string {
  return `Punk City — connexion wallet\nAdresse: ${address.trim().toLowerCase()}\nNonce: ${nonce}`
}

export function buildLoginMessageSolana(address: string, nonce: string): string {
  return `Punk City — connexion wallet\nAdresse: ${new PublicKey(address.trim()).toBase58()}\nNonce: ${nonce}`
}

function bytesToBase64(u8: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!)
  return btoa(bin)
}

type EthereumProvider = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>
}

type SolflareProvider = {
  isSolflare?: boolean
  connect: () => Promise<void>
  publicKey?: PublicKey | { toString(): string; toBytes(): Uint8Array } | null
  signMessage: (message: Uint8Array, display?: string) => Promise<Uint8Array | { signature: Uint8Array }>
}

export async function connectWalletAndVerifySession(
  apiBase: string,
  opts: { chain?: WalletChain } = {},
): Promise<{
  sessionId: string
  registered: boolean
  username?: string
}> {
  const chain = opts.chain ?? 'ethereum'
  if (chain === 'solana') {
    return connectSolflareAndVerifySession(apiBase)
  }
  return connectEthereumAndVerifySession(apiBase)
}

async function connectEthereumAndVerifySession(apiBase: string): Promise<{
  sessionId: string
  registered: boolean
  username?: string
}> {
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum
  if (!eth) {
    throw new Error('Installe MetaMask (ou un wallet compatible Ethereum)')
  }
  const { BrowserProvider } = await import('ethers')
  const provider = new BrowserProvider(eth)
  const signer = await provider.getSigner()
  const address = await signer.getAddress()

  const nonceRes = await fetch(`${apiBase}/api/auth/nonce?address=${encodeURIComponent(address)}&chain=ethereum`)
  if (!nonceRes.ok) {
    const err = await nonceRes.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Nonce impossible')
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string }
  const message = buildLoginMessageEthereum(address, nonce)
  const signature = await signer.signMessage(message)

  const verifyRes = await fetch(`${apiBase}/api/auth/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chain: 'ethereum', address, message, signature }),
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

function getSolanaInjectedProvider(): SolflareProvider | null {
  const w = window as unknown as { solflare?: SolflareProvider; solana?: SolflareProvider }
  if (w.solflare?.signMessage) return w.solflare
  if (w.solana?.signMessage) return w.solana
  return null
}

/** Solana — Solflare (`window.solflare`), sinon Phantom / wallet standard (`window.solana`) */
async function connectSolflareAndVerifySession(apiBase: string): Promise<{
  sessionId: string
  registered: boolean
  username?: string
}> {
  const sol = getSolanaInjectedProvider()
  if (!sol) {
    throw new Error('Installe Solflare ou un wallet Solana (ex. Phantom)')
  }
  await sol.connect()
  const pk = sol.publicKey
  if (!pk) {
    throw new Error('Wallet Solana non connecté')
  }
  const address = pk instanceof PublicKey ? pk.toBase58() : new PublicKey(pk.toBytes()).toBase58()

  const nonceRes = await fetch(`${apiBase}/api/auth/nonce?address=${encodeURIComponent(address)}&chain=solana`)
  if (!nonceRes.ok) {
    const err = await nonceRes.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Nonce impossible')
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string }
  const message = buildLoginMessageSolana(address, nonce)
  const encoded = new TextEncoder().encode(message)
  const signResult = await sol.signMessage(encoded, 'utf8')
  const raw = signResult instanceof Uint8Array ? signResult : signResult.signature
  const signature = bytesToBase64(raw)

  const verifyRes = await fetch(`${apiBase}/api/auth/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chain: 'solana', address, message, signature }),
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
