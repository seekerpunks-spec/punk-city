/**
 * PUNK CITY — Frontend Chat Temps Réel
 * Stack: React + TypeScript + Socket.io-client
 *
 * Ce fichier contient :
 * 1. useChat    → Hook Socket.io (connexion, envoi, réception)
 * 2. ChatBubble → Bulle de chat au-dessus du personnage
 * 3. ChatPanel  → Interface chat style Habbo (coin bas gauche)
 *
 * Installation :
 * npm install socket.io-client
 * npm install -D @types/socket.io-client
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import { io, Socket } from 'socket.io-client'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface ChatMessage {
  id:        string
  playerId:  string
  username:  string
  avatar:    string
  text:      string
  roomId:    string
  timestamp: number
  type:      'message' | 'emote' | 'system'
}

interface Player {
  id:        string
  username:  string
  avatar:    string
  roomId:    string
  gridX:     number
  gridY:     number
  pixiX:     number
  pixiY:     number
  direction: string
}

interface UseChatOptions {
  serverUrl: string
  username:  string
  avatar:    string
  roomId:    string
  gridX?:    number
  gridY?:    number
  // Callback direct (bypass React state) pour les updates de position à 60fps
  onPlayerMoved?: (data: { id: string; gridX: number; gridY: number; pixiX: number; pixiY: number; direction: string }) => void
}

// ─────────────────────────────────────────
// HOOK — CHAT SOCKET.IO
// ─────────────────────────────────────────

export function useChat(options: UseChatOptions) {
  const socketRef  = useRef<Socket | null>(null)
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [players,  setPlayers]    = useState<Player[]>([])
  const [connected, setConnected] = useState(false)
  const [myPlayer,  setMyPlayer]  = useState<Player | null>(null)

  // Ref stable vers le callback — se met à jour sans recréer la connexion socket
  const onPlayerMovedRef = useRef(options.onPlayerMoved)
  useEffect(() => { onPlayerMovedRef.current = options.onPlayerMoved }, [options.onPlayerMoved])

  // ── Connexion ──────────────────────────
  useEffect(() => {
    const socket = io(options.serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Rejoint la room avec son profil
      socket.emit('player:join', {
        username:  options.username,
        avatar:    options.avatar,
        roomId:    options.roomId,
        gridX:     options.gridX ?? 5,
        gridY:     options.gridY ?? 5,
        direction: 'sw',
      })
    })

    socket.on('disconnect', () => setConnected(false))

    // Données initiales à l'arrivée dans la room
    socket.on('player:joined', (data: {
      player:  Player
      players: Player[]
      history: ChatMessage[]
    }) => {
      setMyPlayer(data.player)
      setPlayers(data.players)
      setMessages(data.history)
    })

    // Nouveau message
    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages(prev => [...prev.slice(-49), msg])
    })

    // Joueurs entrent/sortent
    socket.on('player:entered', (player: Player) => {
      setPlayers(prev => [...prev.filter(p => p.id !== player.id), player])
    })

    socket.on('player:left', (data: { id: string }) => {
      setPlayers(prev => prev.filter(p => p.id !== data.id))
    })

    // ← reçoit position pixel + direction pour mouvement fluide
    socket.on('player:moved', (data: {
      id:        string
      gridX:     number
      gridY:     number
      pixiX:     number
      pixiY:     number
      direction: string
    }) => {
      // Callback direct vers le game loop PixiJS — bypass React pour éviter la téléportation
      onPlayerMovedRef.current?.(data)
      // Met quand même à jour le state React pour gridX/gridY/direction (ChatPanel, etc.)
      setPlayers(prev => prev.map(p =>
        p.id === data.id ? {
          ...p,
          gridX:     data.gridX,
          gridY:     data.gridY,
          pixiX:     data.pixiX,
          pixiY:     data.pixiY,
          direction: data.direction || 'sw',
        } : p
      ))
    })

    socket.on('error', (err: { message: string }) => {
      console.error('[Punk City]', err.message)
    })

    return () => { socket.disconnect() }
  }, [options.serverUrl, options.username, options.roomId])

  // ── Envoyer un message ─────────────────
  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || !text.trim()) return
    socketRef.current.emit('chat:send', { text: text.trim() })
  }, [])

  // ── Envoyer une emote ──────────────────
  const sendEmote = useCallback((text: string) => {
    if (!socketRef.current || !text.trim()) return
    socketRef.current.emit('chat:emote', { text: text.trim() })
  }, [])

  // ── Signaler déplacement (position pixel + direction) ──
  const reportMove = useCallback((gridX: number, gridY: number, pixiX: number, pixiY: number, direction: string = 'sw') => {
    socketRef.current?.emit('player:move', { gridX, gridY, pixiX, pixiY, direction })
  }, [])

  // ── Changer de room ────────────────────
  const changeRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('player:changeRoom', { roomId })
  }, [])

  return {
    messages,
    players,
    connected,
    myPlayer,
    sendMessage,
    sendEmote,
    reportMove,
    changeRoom,
  }
}

// ─────────────────────────────────────────
// COMPOSANT — BULLE DE CHAT AU-DESSUS DU PERSO
// ─────────────────────────────────────────

interface ChatBubbleProps {
  message:  string
  username: string
  x:        number
  y:        number
}

export function ChatBubble({ message, username, x, y }: ChatBubbleProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(t)
  }, [message])

  if (!visible) return null

  return (
    <div style={{
      position:    'absolute',
      left:        x,
      top:         y - 60,
      transform:   'translateX(-50%)',
      pointerEvents: 'none',
      zIndex:      1000,
      animation:   'fadeInUp 0.2s ease',
    }}>
      <div style={{
        textAlign:  'center',
        fontSize:   '10px',
        color:      '#B421F3',
        fontFamily: 'monospace',
        marginBottom: 2,
        textShadow: '0 0 6px #B421F3',
      }}>
        {username}
      </div>
      <div style={{
        background:   'rgba(13, 13, 26, 0.92)',
        border:       '1px solid #B421F3',
        borderRadius: 8,
        padding:      '4px 10px',
        fontSize:     '12px',
        color:        '#ffffff',
        fontFamily:   'monospace',
        maxWidth:     180,
        wordBreak:    'break-word',
        textAlign:    'center',
        boxShadow:    '0 0 12px rgba(180, 33, 243, 0.3)',
        whiteSpace:   'pre-wrap',
      }}>
        {message}
      </div>
      <div style={{
        width:       0,
        height:      0,
        borderLeft:  '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop:   '6px solid #B421F3',
        margin:      '0 auto',
      }} />
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — PANEL CHAT (coin bas gauche)
// ─────────────────────────────────────────

interface ChatPanelProps {
  messages:    ChatMessage[]
  players:     Player[]
  myPlayerId:  string
  connected:   boolean
  onSend:      (text: string) => void
  onEmote:     (text: string) => void
  onChangeRoom:(roomId: string) => void
}

export function ChatPanel({
  messages,
  players,
  myPlayerId,
  connected,
  onSend,
  onEmote,
  onChangeRoom,
}: ChatPanelProps) {
  const [input,   setInput]   = useState('')
  const [tab,     setTab]     = useState<'chat' | 'players'>('chat')
  const [isEmote, setIsEmote] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    if (isEmote) onEmote(input.trim())
    else onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend()
    // Raccourci : : au début = emote
    if (input.startsWith(':') && !isEmote) setIsEmote(true)
    if (!input.startsWith(':') && isEmote)  setIsEmote(false)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  }

  const msgColor = (type: ChatMessage['type'], isMe: boolean) => {
    if (type === 'system') return '#B421F3'
    if (type === 'emote')  return '#2986DF'
    if (isMe)              return '#ffffff'
    return '#a0a0c0'
  }

  // Rooms disponibles
  const ROOMS = [
    { id: 'genesis-plaza',    name: '🏛️ Genesis Plaza'    },
    { id: 'neon-market',      name: '🛒 Neon Market'       },
    { id: 'seeker-club',      name: '🎵 Seeker Club'       },
    { id: 'gallery-district', name: '🎨 Gallery District'  },
  ]

  return (
    <div style={{
      position:     'fixed',
      bottom:       16,
      left:         16,
      width:        320,
      background:   'rgba(10, 10, 20, 0.92)',
      border:       '1px solid rgba(97, 0, 151, 0.6)',
      borderRadius: 12,
      fontFamily:   'monospace',
      fontSize:     12,
      color:        '#ffffff',
      zIndex:       500,
      backdropFilter: 'blur(8px)',
      boxShadow:    '0 0 24px rgba(97, 0, 151, 0.3)',
      userSelect:   'none',
    }}>

      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '8px 12px',
        borderBottom:   '1px solid rgba(97,0,151,0.4)',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['chat', 'players'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background:   tab === t ? 'rgba(180,33,243,0.2)' : 'transparent',
              border:       `1px solid ${tab === t ? '#B421F3' : 'transparent'}`,
              borderRadius: 6,
              color:        tab === t ? '#B421F3' : '#666',
              padding:      '2px 10px',
              cursor:       'pointer',
              fontSize:     11,
              fontFamily:   'monospace',
            }}>
              {t === 'chat' ? '💬 Chat' : `👥 ${players.length}`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: connected ? '#00ff88' : '#ff4444' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#00ff88' : '#ff4444',
            boxShadow:  connected ? '0 0 6px #00ff88' : '0 0 6px #ff4444',
          }} />
          {connected ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      {/* Tab Chat */}
      {tab === 'chat' && (
        <>
          {/* Messages */}
          <div style={{
            height:        200,
            overflowY:     'auto',
            padding:       '8px 12px',
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'stretch',
            gap:           4,
            scrollbarWidth: 'thin',
            scrollbarColor: '#610097 transparent',
          }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                {/* Timestamp — largeur fixe pour aligner */}
                <span style={{ color: '#444', fontSize: 10, minWidth: 35, flexShrink: 0, paddingTop: 1 }}>
                  {formatTime(msg.timestamp)}
                </span>

                {/* Message — username toujours à gauche, texte revient à la ligne */}
                <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', textAlign: 'left' }}>
                  {msg.type !== 'system' && (
                    <span style={{
                      color:      msg.playerId === myPlayerId ? '#B421F3' : '#2986DF',
                      fontWeight: 'bold',
                      marginRight: 4,
                      whiteSpace: 'nowrap',  // ← pseudo ne se coupe jamais
                    }}>
                      {msg.username}:
                    </span>
                  )}
                  <span style={{ color: msgColor(msg.type, msg.playerId === myPlayerId) }}>
                    {msg.text}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Rooms rapides */}
          <div style={{
            padding:   '4px 12px',
            display:   'flex',
            gap:       4,
            flexWrap:  'wrap',
            borderTop: '1px solid rgba(97,0,151,0.2)',
          }}>
            {ROOMS.map(r => (
              <button key={r.id} onClick={() => onChangeRoom(r.id)} style={{
                background:   'rgba(97,0,151,0.15)',
                border:       '1px solid rgba(97,0,151,0.4)',
                borderRadius: 4,
                color:        '#a0a0c0',
                fontSize:     9,
                padding:      '2px 6px',
                cursor:       'pointer',
                fontFamily:   'monospace',
              }}>
                {r.name}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{
            display:   'flex',
            gap:       6,
            padding:   '8px 12px',
            borderTop: '1px solid rgba(97,0,151,0.4)',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isEmote ? ':emote...' : 'Message... (: for emote)'}
              maxLength={200}
              style={{
                flex:       1,
                background: 'rgba(255,255,255,0.05)',
                border:     `1px solid ${isEmote ? '#2986DF' : 'rgba(97,0,151,0.5)'}`,
                borderRadius: 6,
                color:      '#ffffff',
                padding:    '4px 8px',
                fontSize:   12,
                fontFamily: 'monospace',
                outline:    'none',
              }}
            />
            <button onClick={handleSend} style={{
              background:   'rgba(180,33,243,0.2)',
              border:       '1px solid #B421F3',
              borderRadius: 6,
              color:        '#B421F3',
              padding:      '4px 12px',
              cursor:       'pointer',
              fontSize:     11,
              fontFamily:   'monospace',
            }}>
              ↵
            </button>
          </div>
        </>
      )}

      {/* Tab Joueurs */}
      {tab === 'players' && (
        <div style={{
          height:        240,
          overflowY:     'auto',
          padding:       '8px 12px',
          display:       'flex',
          flexDirection: 'column',
          gap:           6,
        }}>
          {players.length === 0 && (
            <div style={{ color: '#444', textAlign: 'center', marginTop: 40 }}>
              Nobody here...
            </div>
          )}
          {players.map(p => (
            <div key={p.id} style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              padding:      '4px 8px',
              background:   p.id === myPlayerId ? 'rgba(180,33,243,0.1)' : 'transparent',
              borderRadius: 6,
              border:       p.id === myPlayerId ? '1px solid rgba(180,33,243,0.3)' : '1px solid transparent',
            }}>
              <div style={{
                width:          24,
                height:         24,
                borderRadius:   '50%',
                background:     'rgba(180,33,243,0.3)',
                border:         '1px solid #B421F3',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       10,
                flexShrink:     0,
              }}>
                {p.username.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: p.id === myPlayerId ? '#B421F3' : '#ffffff', fontSize: 11 }}>
                  {p.username}
                  {p.id === myPlayerId && (
                    <span style={{ color: '#B421F3', fontSize: 9, marginLeft: 4 }}>(you)</span>
                  )}
                </div>
                <div style={{ color: '#444', fontSize: 9 }}>
                  {p.gridX},{p.gridY}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — INTÉGRATION COMPLÈTE
// Exemple d'utilisation dans ton GameCanvas
// ─────────────────────────────────────────

export default function ChatIntegration() {
  const {
    messages,
    players,
    connected,
    myPlayer,
    sendMessage,
    sendEmote,
    changeRoom,
  } = useChat({
    serverUrl: 'http://localhost:3001',
    username:  'SeekerPunk_001',
    avatar:    'default',
    roomId:    'genesis-plaza',
  })

  const lastMessages = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.type !== 'system') {
      lastMessages.current.set(last.playerId, last.text)
    }
  }, [messages])

  return (
    <>
      <ChatPanel
        messages={messages}
        players={players}
        myPlayerId={myPlayer?.id ?? ''}
        connected={connected}
        onSend={sendMessage}
        onEmote={sendEmote}
        onChangeRoom={changeRoom}
      />
    </>
  )
}