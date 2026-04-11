/**
 * PUNK CITY — App.tsx
 * Auth wallet Ethereum ou Solana (Solflare / Phantom) + pseudo figé à la première connexion
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import GameCanvas from './GameCanvas'
import { getSocketServerUrl } from './serverUrl'
import { connectWalletAndVerifySession, type WalletChain } from './walletAuth'

type AuthState =
  | { step: 'login' }
  | { step: 'choose_name'; sessionId: string }
  | { step: 'play'; sessionId: string; username: string; registerUsername?: string }

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
  const api = getSocketServerUrl()

  useEffect(() => {
    if (!resumeChooseName) return
    setAuth({ step: 'choose_name', sessionId: resumeChooseName.sessionId })
    setErr(resumeChooseName.message)
  }, [resumeChooseName])

  const handleConnect = async (chain: WalletChain) => {
    setErr(null)
    setLoading(true)
    try {
      const r = await connectWalletAndVerifySession(api, { chain })
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
              cursor: 'pointer', fontFamily: 'monospace',
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
          disabled={loading}
          onClick={() => void handleConnect('ethereum')}
          style={{
            width: '100%', background: 'rgba(180,33,243,0.2)', border: '1px solid #B421F3',
            borderRadius: 8, color: '#B421F3', padding: '12px', fontSize: 13,
            cursor: loading ? 'wait' : 'pointer', fontFamily: 'monospace',
            opacity: loading ? 0.7 : 1,
            marginBottom: 10,
          }}
        >
          {loading ? 'Connexion…' : 'Ethereum (MetaMask, Rabby…)' }
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleConnect('solana')}
          style={{
            width: '100%', background: 'rgba(20,241,149,0.12)', border: '1px solid #14f195',
            borderRadius: 8, color: '#14f195', padding: '12px', fontSize: 13,
            cursor: loading ? 'wait' : 'pointer', fontFamily: 'monospace',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Connexion…' : 'Solana (Solflare)'}
        </button>
        {err && <div style={{ color: '#f66', fontSize: 11, marginTop: 16 }}>{err}</div>}
        <div style={{ color: '#333', fontSize: 10, marginTop: 20 }}>
          Ton pseudo est lié une seule fois au wallet choisi (chaîne distincte).
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
    setResumeReg({ sessionId: p.sessionId, message })
    setRetryKey(k => k + 1)
    setPlayAuth(null)
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
      }}
    />
  )
}
