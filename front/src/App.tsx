/**
 * PUNK CITY — App.tsx
 * Point d'entrée de l'application
 *
 * Pour lancer :
 * npm install pixi.js socket.io-client
 * npm run dev
 */

import React, { useState } from 'react'
import GameCanvas from './GameCanvas'
import { getSocketServerUrl } from './serverUrl'

// ─────────────────────────────────────────
// ÉCRAN DE CONNEXION
// ─────────────────────────────────────────

function LoginScreen({ onEnter }: { onEnter: (username: string) => void }) {
  const [username, setUsername] = useState('')

  const handleEnter = () => {
    const name = username.trim() || `Punk_${Math.random().toString(36).slice(2, 6)}`
    onEnter(name)
  }

  return (
    <div style={{
      width:          '100vw',
      height:         '100vh',
      background:     '#0d0d1a',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     'monospace',
    }}>
      <div style={{
        background:   'rgba(10,10,20,0.95)',
        border:       '1px solid rgba(180,33,243,0.5)',
        borderRadius: 16,
        padding:      48,
        textAlign:    'center',
        boxShadow:    '0 0 60px rgba(180,33,243,0.2)',
        minWidth:     320,
      }}>
        {/* Logo */}
        <div style={{
          fontSize:     32,
          fontWeight:   'bold',
          color:        '#B421F3',
          textShadow:   '0 0 30px #B421F3',
          letterSpacing: 4,
          marginBottom: 8,
        }}>
          PUNK CITY
        </div>
        <div style={{ color: '#666', fontSize: 11, marginBottom: 32, letterSpacing: 2 }}>
          BY SEEKERPUNKS
        </div>

        {/* Input username */}
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleEnter()}
          placeholder="Your username..."
          maxLength={20}
          autoFocus
          style={{
            width:        '100%',
            background:   'rgba(255,255,255,0.05)',
            border:       '1px solid rgba(180,33,243,0.4)',
            borderRadius: 8,
            color:        '#ffffff',
            padding:      '10px 14px',
            fontSize:     13,
            fontFamily:   'monospace',
            outline:      'none',
            marginBottom: 16,
            textAlign:    'center',
          }}
        />

        {/* Bouton entrer */}
        <button
          onClick={handleEnter}
          style={{
            width:        '100%',
            background:   'rgba(180,33,243,0.2)',
            border:       '1px solid #B421F3',
            borderRadius: 8,
            color:        '#B421F3',
            padding:      '10px',
            fontSize:     13,
            fontFamily:   'monospace',
            cursor:       'pointer',
            letterSpacing: 2,
            transition:   'all 0.2s',
          }}
        >
          ENTER THE CITY →
        </button>

        <div style={{ color: '#333', fontSize: 10, marginTop: 20 }}>
          Alpha v0.1 — SeekerPunks OG only
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// APP
// ─────────────────────────────────────────

export default function App() {
  const [username, setUsername] = useState<string | null>(null)

  if (!username) {
    return <LoginScreen onEnter={setUsername} />
  }

  return (
    <GameCanvas
      config={{
        serverUrl: getSocketServerUrl(),
        username,
        avatar:    'default',       // à remplacer par NFT mint Solana
        roomId:    'genesis-plaza',
      }}
    />
  )
} 