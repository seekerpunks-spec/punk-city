/**
 * PUNK CITY — App.tsx
 * Connexion uniquement via wallets Solana (liste complète dans la modal) + pseudo figé à la première visite
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import GameCanvas from './GameCanvas'
import { getSocketServerUrl } from './serverUrl'
import { verifySolanaSession } from './walletAuth'

type AuthState =
  | { step: 'login' }
  | { step: 'choose_name'; sessionId: string }
  | {
      step:             'play'
      sessionId:        string
      username:         string
      registerUsername?: string
      /** Session invité sans wallet */
      isGuest?:         boolean
      /** Invité restreint (chat + déplacement seulement) */
      guestLimited?:    boolean
    }

function LoginFlow({
  onReady,
  resumeChooseName,
}: {
  onReady: (s: Extract<AuthState, { step: 'play' }>) => void
  resumeChooseName: { sessionId: string; message: string } | null
}) {
  const [auth, setAuth] = useState<AuthState>(() =>
    resumeChooseName
      ? { step: 'choose_name', sessionId: resumeChooseName.sessionId }
      : { step: 'login' },
  )
  const [pseudo, setPseudo] = useState('')
  const [err, setErr] = useState<string | null>(() => resumeChooseName?.message ?? null)
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const api = getSocketServerUrl()

  const { publicKey, signMessage, connected, connecting, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  useEffect(() => {
    if (!resumeChooseName) return
    setAuth({ step: 'choose_name', sessionId: resumeChooseName.sessionId })
    setErr(resumeChooseName.message)
  }, [resumeChooseName])

  const runVerify = async () => {
    if (!publicKey || !signMessage) {
      throw new Error('Connecte un wallet Solana qui autorise la signature de messages.')
    }
    return verifySolanaSession(api, signMessage, publicKey)
  }

  /** Étape 1 : ouvrir la modal pour choisir Phantom, Solflare, Seeker Phone, etc. */
  const openWalletModal = () => {
    setErr(null)
    setVisible(true)
  }

  /** Étape 2 : une fois le wallet connecté, signer et obtenir la session */
  const handleSignAndContinue = async () => {
    setErr(null)
    setLoading(true)
    try {
      const r = await runVerify()
      if (r.registered && r.username) {
        onReady({ step: 'play', sessionId: r.sessionId, username: r.username })
        return
      }
      setAuth({ step: 'choose_name', sessionId: r.sessionId })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur connexion')
    } finally {
      setLoading(false)
    }
  }

  const handlePlayAsGuest = async () => {
    setErr(null)
    setGuestLoading(true)
    try {
      const res = await fetch(`${api}/api/guest/session`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `Erreur ${res.status}`)
      }
      const j = await res.json() as { sessionId: string; username: string; guestFeatureAccess: boolean }
      onReady({
        step:          'play',
        sessionId:     j.sessionId,
        username:      j.username,
        isGuest:       true,
        guestLimited:  !j.guestFeatureAccess,
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Impossible de créer une session invité')
    } finally {
      setGuestLoading(false)
    }
  }

  const handlePseudo = () => {
    const p = pseudo.trim()
    if (p.length < 5 || p.length > 20) {
      setErr('Pseudo : 5 à 20 caractères')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(p)) {
      setErr('Lettres, chiffres, _ et - uniquement')
      return
    }
    setErr(null)
    if (auth.step !== 'choose_name') return
    onReady({
      step:             'play',
      sessionId:        auth.sessionId,
      username:         p,
      registerUsername: p,
    })
  }

  if (auth.step === 'choose_name') {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#0d0d1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{
          background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(180,33,243,0.5)',
          borderRadius: 16, padding: 48, textAlign: 'center', minWidth: 320,
          boxShadow: '0 0 60px rgba(180,33,243,0.2)',
        }}>
          <div style={{ fontSize: 14, color: '#B421F3', marginBottom: 8 }}>Première visite</div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 20 }}>
            Choisis ton pseudo <b>une seule fois</b> — il sera lié à ton wallet.
          </div>
          <input
            value={pseudo}
            onChange={e => setPseudo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePseudo()}
            placeholder="Ton pseudo..."
            maxLength={20}
            autoFocus
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(180,33,243,0.4)', borderRadius: 8,
              color: '#fff', padding: '10px 14px', fontSize: 13, marginBottom: 12,
              textAlign: 'center', fontFamily: 'monospace',
            }}
          />
          {err && (
            <div style={{
              color:      '#f66',
              fontSize:   11,
              marginBottom: 12,
              lineHeight: 1.4,
              padding:    '8px 10px',
              background: 'rgba(255,80,80,0.08)',
              borderRadius: 8,
              border:     '1px solid rgba(255,100,100,0.35)',
            }}
            >
              {err}
            </div>
          )}
          <button
            type="button"
            onClick={handlePseudo}
            style={{
              width: '100%', background: 'rgba(180,33,243,0.2)', border: '1px solid #B421F3',
              borderRadius: 8, color: '#B421F3', padding: '10px', fontSize: 13,
              cursor: 'var(--punk-cursor-pointer)', fontFamily: 'monospace',
            }}
          >
            Entrer dans la ville →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', background: '#0d0d1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
    }}>
      <div style={{
        background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(180,33,243,0.5)',
        borderRadius: 16, padding: 48, textAlign: 'center', minWidth: 320,
        boxShadow: '0 0 60px rgba(180,33,243,0.2)',
      }}>
        <div style={{
          fontSize: 32, fontWeight: 'bold', color: '#B421F3',
          textShadow: '0 0 30px #B421F3', letterSpacing: 4, marginBottom: 8,
        }}>
          PUNK CITY
        </div>
        <div style={{ color: '#666', fontSize: 11, marginBottom: 32, letterSpacing: 2 }}>
          BY SEEKERPUNKS
        </div>

        <button
          type="button"
          disabled={guestLoading || loading}
          onClick={() => void handlePlayAsGuest()}
          style={{
            width: '100%', background: 'rgba(180,33,243,0.08)', border: '1px solid rgba(180,33,243,0.45)',
            borderRadius: 8, color: '#c77dff', padding: '10px', fontSize: 12,
            cursor: guestLoading ? 'wait' : 'var(--punk-cursor-pointer)', fontFamily: 'monospace',
            opacity: guestLoading ? 0.7 : 1,
            marginBottom: 14,
          }}
        >
          {guestLoading ? 'Connexion invité…' : 'Jouer en invité (sans wallet)'}
        </button>
        <div style={{ color: '#444', fontSize: 9, marginBottom: 16, lineHeight: 1.4 }}>
          Pseudo auto <code style={{ color: '#666' }}>guest_1</code>, … — sans compte. Les droits dépendent du serveur (<code style={{ color: '#666' }}>guest_feature_access</code>).
        </div>

        {!connected ? (
          <button
            type="button"
            disabled={connecting}
            onClick={openWalletModal}
            style={{
              width: '100%', background: 'rgba(20,241,149,0.12)', border: '1px solid #14f195',
              borderRadius: 8, color: '#14f195', padding: '12px', fontSize: 13,
              cursor: connecting ? 'wait' : 'var(--punk-cursor-pointer)', fontFamily: 'monospace',
              opacity: connecting ? 0.7 : 1,
              marginBottom: 12,
            }}
          >
            {connecting ? 'Connexion au wallet…' : 'Choisir un wallet Solana'}
          </button>
        ) : (
          <>
            <div style={{ color: '#888', fontSize: 10, marginBottom: 10, wordBreak: 'break-all' }}>
              {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
            </div>
            <button
              type="button"
              disabled={loading || !signMessage}
              onClick={() => void handleSignAndContinue()}
              style={{
                width: '100%', background: 'rgba(20,241,149,0.12)', border: '1px solid #14f195',
                borderRadius: 8, color: '#14f195', padding: '12px', fontSize: 13,
                cursor: loading ? 'wait' : 'var(--punk-cursor-pointer)', fontFamily: 'monospace',
                opacity: loading || !signMessage ? 0.7 : 1,
                marginBottom: 8,
              }}
            >
              {loading ? 'Signature…' : 'Signer et entrer dans la ville'}
            </button>
            {!signMessage && (
              <div style={{ color: '#f66', fontSize: 10, marginBottom: 8 }}>
                Ce wallet n’expose pas la signature de message — essaie Phantom ou Solflare.
              </div>
            )}
            <button
              type="button"
              onClick={() => void disconnect()}
              style={{
                width: '100%', background: 'transparent', border: '1px solid #444',
                borderRadius: 8, color: '#666', padding: '8px', fontSize: 11,
                cursor: 'var(--punk-cursor-pointer)', fontFamily: 'monospace',
              }}
            >
              Changer de wallet
            </button>
          </>
        )}

        {err && <div style={{ color: '#f66', fontSize: 11, marginTop: 16 }}>{err}</div>}
        <div style={{ color: '#333', fontSize: 10, marginTop: 20, lineHeight: 1.5 }}>
          Phantom, Solflare, Seeker Phone, Ledger, etc. — ton pseudo est lié une seule fois à ton adresse Solana.
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [playAuth, setPlayAuth] = useState<Extract<AuthState, { step: 'play' }> | null>(null)
  const [resumeReg, setResumeReg] = useState<{ sessionId: string; message: string } | null>(null)
  const [retryKey, setRetryKey]   = useState(0)

  const playAuthRef = useRef(playAuth)
  useEffect(() => { playAuthRef.current = playAuth }, [playAuth])

  const onJoinFailed = useCallback((message: string) => {
    const p = playAuthRef.current
    if (!p?.registerUsername) return
    const sessionId = p.sessionId
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setResumeReg({ sessionId, message })
        setRetryKey(k => k + 1)
        setPlayAuth(null)
      })
    })
  }, [])

  if (!playAuth) {
    return (
      <LoginFlow
        key={resumeReg ? `retry-${retryKey}` : 'login'}
        onReady={s => {
          setResumeReg(null)
          setPlayAuth(s)
        }}
        resumeChooseName={resumeReg}
      />
    )
  }

  return (
    <GameCanvas
      config={{
        serverUrl:        getSocketServerUrl(),
        sessionId:        playAuth.sessionId,
        username:         playAuth.username,
        registerUsername: playAuth.registerUsername,
        avatar:           'default',
        roomId:           'genesis-plaza',
        onJoinFailed:     playAuth.registerUsername ? onJoinFailed : undefined,
        guestLimited:     playAuth.guestLimited === true,
      }}
    />
  )
}
