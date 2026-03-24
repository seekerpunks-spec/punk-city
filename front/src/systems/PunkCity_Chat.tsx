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

export interface ShopItem {
  id:          string
  name:        string
  price:       number
  description: string
  icon:        string
}

// ─────────────────────────────────────────
// HOOK — CHAT SOCKET.IO
// ─────────────────────────────────────────

export function useChat(options: UseChatOptions) {
  const socketRef  = useRef<Socket | null>(null)
  const [messages,       setMessages]       = useState<ChatMessage[]>([])
  const [players,        setPlayers]        = useState<Player[]>([])
  const [connected,      setConnected]      = useState(false)
  const [myPlayer,       setMyPlayer]       = useState<Player | null>(null)
  const [friendRequests,   setFriendRequests]   = useState<{ fromId: string; fromUsername: string }[]>([])
  const [friends,          setFriends]          = useState<{ id: string; username: string; online: boolean; roomId: string }[]>([])
  const [pmConversations,  setPmConversations]  = useState<Map<string, { fromId: string; fromUsername: string; text: string; timestamp: number; mine: boolean }[]>>(new Map())
  const [unreadPMs,        setUnreadPMs]        = useState<Map<string, number>>(new Map())
  const [pmToasts,         setPmToasts]         = useState<{ id: string; fromId: string; fromUsername: string; text: string }[]>([])
  const [tradeRequests,    setTradeRequests]    = useState<{ tradeId: string; fromId: string; fromUsername: string }[]>([])
  const [apartmentInvites, setApartmentInvites] = useState<{ fromId: string; fromUsername: string; roomId: string }[]>([])
  const [neonCredits,      setNeonCredits]      = useState<number>(500)
  const [inventory,        setInventory]        = useState<string[]>([])
  const [shopCatalog,      setShopCatalog]      = useState<ShopItem[]>([])
  const [activeTrade,      setActiveTrade]      = useState<{
    tradeId:           string
    partnerId:         string
    partnerUsername:   string
    myOffer:           string[]
    partnerOffer:      string[]
    myCredits:         number
    partnerCredits:    number
    myConfirmed:       boolean
    partnerConfirmed:  boolean
  } | null>(null)

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
      player:      Player
      players:     Player[]
      history:     ChatMessage[]
      neonCredits: number
      inventory:   string[]
      shopCatalog: ShopItem[]
    }) => {
      setMyPlayer(data.player)
      setPlayers(data.players)
      setMessages(data.history)
      setNeonCredits(data.neonCredits ?? 500)
      setInventory(data.inventory ?? [])
      setShopCatalog(data.shopCatalog ?? [])
    })

    socket.on('shop:purchased', (data: { itemId: string; neonCredits: number; inventory: string[] }) => {
      setNeonCredits(data.neonCredits)
      setInventory(data.inventory)
    })

    socket.on('shop:error', (_data: { message: string }) => {})

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

    socket.on('friend:request_received', (data: { fromId: string; fromUsername: string }) => {
      setFriendRequests(prev => [...prev.filter(r => r.fromId !== data.fromId), data])
    })

    socket.on('friend:accepted', (data: { byId: string; byUsername: string; byRoomId: string }) => {
      setFriends(prev => [...prev.filter(f => f.id !== data.byId), { id: data.byId, username: data.byUsername, online: true, roomId: data.byRoomId }])
    })

    socket.on('friend:added', (data: { id: string; username: string; roomId: string }) => {
      setFriends(prev => [...prev.filter(f => f.id !== data.id), { id: data.id, username: data.username, online: true, roomId: data.roomId }])
    })

    socket.on('friend:offline', (data: { id: string }) => {
      setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: false } : f))
    })

    socket.on('friend:status', (data: { id: string; roomId: string }) => {
      setFriends(prev => prev.map(f => f.id === data.id ? { ...f, roomId: data.roomId } : f))
    })

    socket.on('friend:declined', (_data: { byId: string; byUsername: string }) => {})

    socket.on('pm:receive', (data: { fromId: string; fromUsername: string; text: string; timestamp: number }) => {
      setPmConversations(prev => {
        const next = new Map(prev)
        const existing = next.get(data.fromId) ?? []
        next.set(data.fromId, [...existing, { ...data, mine: false }])
        return next
      })
      setUnreadPMs(prev => {
        const next = new Map(prev)
        next.set(data.fromId, (next.get(data.fromId) ?? 0) + 1)
        return next
      })
      const toastId = Math.random().toString(36).substring(2, 10)
      setPmToasts(prev => [...prev, { id: toastId, fromId: data.fromId, fromUsername: data.fromUsername, text: data.text }])
      setTimeout(() => {
        setPmToasts(prev => prev.filter(t => t.id !== toastId))
      }, 5000)
    })

    socket.on('trade:request_received', (data: { tradeId: string; fromId: string; fromUsername: string }) => {
      setTradeRequests(prev => [...prev, data])
    })

    socket.on('trade:started', (data: { tradeId: string; partnerId: string; partnerUsername: string }) => {
      setTradeRequests(prev => prev.filter(r => r.fromId !== data.partnerId))
      setActiveTrade({ tradeId: data.tradeId, partnerId: data.partnerId, partnerUsername: data.partnerUsername, myOffer: [], partnerOffer: [], myCredits: 0, partnerCredits: 0, myConfirmed: false, partnerConfirmed: false })
    })

    socket.on('trade:offer_updated', (data: { tradeId: string; offer: string[]; credits: number }) => {
      setActiveTrade(prev => prev?.tradeId === data.tradeId ? { ...prev, partnerOffer: data.offer, partnerCredits: data.credits ?? 0, myConfirmed: false, partnerConfirmed: false } : prev)
    })

    socket.on('trade:partner_confirmed', (data: { tradeId: string }) => {
      setActiveTrade(prev => prev?.tradeId === data.tradeId ? { ...prev, partnerConfirmed: true } : prev)
    })

    socket.on('trade:completed', (data: { tradeId: string; inventory: string[]; neonCredits: number }) => {
      setInventory(data.inventory)
      setNeonCredits(data.neonCredits)
      setActiveTrade(null)
    })

    socket.on('trade:cancelled', (_data: { tradeId: string }) => {
      setActiveTrade(null)
    })

    socket.on('trade:declined', (_data: { tradeId: string; byUsername: string }) => {})

    socket.on('apartment:invited', (data: { fromId: string; fromUsername: string; roomId: string }) => {
      setApartmentInvites(prev => [...prev.filter(i => i.fromId !== data.fromId), data])
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
    // Vide immédiatement la liste pour éviter d'afficher les joueurs de l'ancienne room
    setPlayers([])
    socketRef.current?.emit('player:changeRoom', { roomId })
  }, [])

  // ── Appartement ─────────────────────────
  const sendApartmentInvite = useCallback(() => {
    socketRef.current?.emit('apartment:invite')
  }, [])

  const sendApartmentInviteToOne = useCallback((targetId: string) => {
    socketRef.current?.emit('apartment:invite-one', { targetId })
  }, [])

  const dismissApartmentInvite = useCallback((fromId: string) => {
    setApartmentInvites(prev => prev.filter(i => i.fromId !== fromId))
  }, [])

  // ── Shop ─────────────────────────────────
  const buyItem = useCallback((itemId: string) => {
    socketRef.current?.emit('shop:buy', { itemId })
  }, [])

  // ── Amis ───────────────────────────────
  const sendFriendRequest = useCallback((targetId: string) => {
    console.log('[friend] sending request to', targetId, '— socket:', socketRef.current?.id)
    socketRef.current?.emit('friend:request', { targetId })
  }, [])

  const acceptFriendRequest = useCallback((requesterId: string) => {
    socketRef.current?.emit('friend:accept', { requesterId })
    setFriendRequests(prev => prev.filter(r => r.fromId !== requesterId))
  }, [])

  const declineFriendRequest = useCallback((requesterId: string) => {
    socketRef.current?.emit('friend:decline', { requesterId })
    setFriendRequests(prev => prev.filter(r => r.fromId !== requesterId))
  }, [])

  const dismissPMToast = useCallback((id: string) => {
    setPmToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const markPMsRead = useCallback((targetId: string) => {
    setUnreadPMs(prev => {
      const next = new Map(prev)
      next.delete(targetId)
      return next
    })
  }, [])

  // ── Trade ──────────────────────────────
  const sendTradeRequest = useCallback((targetId: string) => {
    socketRef.current?.emit('trade:request', { targetId })
  }, [])

  const acceptTrade = useCallback((tradeId: string, requesterId: string) => {
    socketRef.current?.emit('trade:accept', { tradeId, requesterId })
    setTradeRequests(prev => prev.filter(r => r.tradeId !== tradeId))
  }, [])

  const declineTrade = useCallback((tradeId: string, requesterId: string) => {
    socketRef.current?.emit('trade:decline', { tradeId, requesterId })
    setTradeRequests(prev => prev.filter(r => r.tradeId !== tradeId))
  }, [])

  const updateTradeOffer = useCallback((tradeId: string, offer: string[], credits: number) => {
    socketRef.current?.emit('trade:update_offer', { tradeId, offer, credits })
    setActiveTrade(prev => prev?.tradeId === tradeId ? { ...prev, myOffer: offer, myCredits: credits, myConfirmed: false } : prev)
  }, [])

  const confirmTrade = useCallback((tradeId: string) => {
    socketRef.current?.emit('trade:confirm', { tradeId })
    setActiveTrade(prev => prev?.tradeId === tradeId ? { ...prev, myConfirmed: true } : prev)
  }, [])

  const cancelTrade = useCallback((tradeId: string) => {
    socketRef.current?.emit('trade:cancel', { tradeId })
    setActiveTrade(null)
  }, [])

  const sendPM = useCallback((targetId: string, text: string) => {
    if (!text.trim()) return
    socketRef.current?.emit('pm:send', { targetId, text: text.trim() })
    setPmConversations(prev => {
      const next = new Map(prev)
      const existing = next.get(targetId) ?? []
      next.set(targetId, [...existing, {
        fromId: socketRef.current?.id ?? '',
        fromUsername: '',
        text: text.trim(),
        timestamp: Date.now(),
        mine: true,
      }])
      return next
    })
  }, [])

  return {
    messages,
    players,
    connected,
    myPlayer,
    friendRequests,
    friends,
    pmConversations,
    unreadPMs,
    pmToasts,
    sendMessage,
    sendEmote,
    reportMove,
    changeRoom,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    sendPM,
    dismissPMToast,
    markPMsRead,
    tradeRequests,
    activeTrade,
    sendTradeRequest,
    acceptTrade,
    declineTrade,
    updateTradeOffer,
    confirmTrade,
    cancelTrade,
    apartmentInvites,
    sendApartmentInvite,
    sendApartmentInviteToOne,
    dismissApartmentInvite,
    neonCredits,
    inventory,
    shopCatalog,
    buyItem,
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
// Simplifié : messages + input uniquement
// ─────────────────────────────────────────

interface ChatPanelProps {
  messages:   ChatMessage[]
  myPlayerId: string
  connected:  boolean
  onSend:     (text: string) => void
  onEmote:    (text: string) => void
}

export function ChatPanel({ messages, myPlayerId, connected, onSend, onEmote }: ChatPanelProps) {
  const [input,   setInput]   = useState('')
  const [isEmote, setIsEmote] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  return (
    <div style={{
      position:       'fixed',
      bottom:         16,
      left:           16,
      width:          320,
      background:     'rgba(10,10,20,0.92)',
      border:         '1px solid rgba(97,0,151,0.6)',
      borderRadius:   12,
      fontFamily:     'monospace',
      fontSize:       12,
      color:          '#ffffff',
      zIndex:         500,
      backdropFilter: 'blur(8px)',
      boxShadow:      '0 0 24px rgba(97,0,151,0.3)',
      userSelect:     'none',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid rgba(97,0,151,0.4)',
      }}>
        <span style={{ color: '#B421F3', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 }}>
          💬 CHAT
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: connected ? '#00ff88' : '#ff4444' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#00ff88' : '#ff4444',
            boxShadow:  connected ? '0 0 6px #00ff88' : '0 0 6px #ff4444',
          }} />
          {connected ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        height: 200, overflowY: 'auto',
        padding: '8px 12px',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4,
        scrollbarWidth: 'thin', scrollbarColor: '#610097 transparent',
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ color: '#444', fontSize: 10, minWidth: 35, flexShrink: 0, paddingTop: 1 }}>
              {formatTime(msg.timestamp)}
            </span>
            <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere', textAlign: 'left' }}>
              {msg.type !== 'system' && (
                <span style={{
                  color: msg.playerId === myPlayerId ? '#B421F3' : '#2986DF',
                  fontWeight: 'bold', marginRight: 4, whiteSpace: 'nowrap',
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

      {/* Input */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px',
        borderTop: '1px solid rgba(97,0,151,0.4)',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isEmote ? ':emote...' : 'Message... (: for emote)'}
          maxLength={200}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${isEmote ? '#2986DF' : 'rgba(97,0,151,0.5)'}`,
            borderRadius: 6, color: '#ffffff', padding: '4px 8px',
            fontSize: 12, fontFamily: 'monospace', outline: 'none',
          }}
        />
        <button onClick={handleSend} style={{
          background: 'rgba(180,33,243,0.2)', border: '1px solid #B421F3',
          borderRadius: 6, color: '#B421F3', padding: '4px 12px',
          cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
        }}>↵</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — PANNEAU SOCIAL (coin bas droit)
// Onglets : Online · Friends · Messages(DMs)
// ─────────────────────────────────────────

type PMMsg = { fromId: string; fromUsername: string; text: string; timestamp: number; mine: boolean }

interface SocialPanelProps {
  players:              Player[]
  myPlayerId:           string
  friends:              { id: string; username: string; online: boolean; roomId: string }[]
  inMyApartment?:       boolean
  onInviteToApartment?: (friendId: string) => void
  onSelectPlayer?:      (player: { id: string; username: string }) => void
  pmConversations: Map<string, PMMsg[]>
  unreadPMs:       Map<string, number>
  onOpenPM:        (target: { id: string; username: string }) => void
  onMyApartment?:  () => void
}

export function SocialPanel({
  players, myPlayerId, friends, pmConversations, unreadPMs, onOpenPM, onMyApartment,
  onSelectPlayer, inMyApartment, onInviteToApartment,
}: SocialPanelProps) {
  const [tab, setTab] = useState<'online' | 'friends' | 'messages'>('online')

  const totalUnread  = Array.from(unreadPMs.values()).reduce((a, b) => a + b, 0)
  const otherPlayers = players.filter(p => p.id !== myPlayerId)

  const ROOMS = [
    { id: 'genesis-plaza',    name: 'Genesis Plaza'    },
    { id: 'neon-market',      name: 'Neon Market'      },
    { id: 'seeker-club',      name: 'Seeker Club'      },
    { id: 'gallery-district', name: 'Gallery District' },
  ]

  const getConvUsername = (peerId: string, msgs: PMMsg[]) => {
    const received = msgs.find(m => !m.mine)
    if (received) return received.fromUsername
    return friends.find(f => f.id === peerId)?.username ?? '???'
  }

  const tabs = [
    { id: 'online',   label: `Online`,   count: otherPlayers.length },
    { id: 'friends',  label: `Friends`,  count: friends.length },
    { id: 'messages', label: `DMs`,      count: null, badge: totalUnread },
  ] as const

  const btnBase = (active: boolean): React.CSSProperties => ({
    position:     'relative',
    flex:         1,
    background:   active ? 'rgba(180,33,243,0.18)' : 'transparent',
    border:       `1px solid ${active ? '#B421F3' : 'transparent'}`,
    borderRadius: 6,
    color:        active ? '#B421F3' : '#555',
    padding:      '4px 2px',
    cursor:       'pointer',
    fontSize:     10,
    fontFamily:   'monospace',
    lineHeight:   1.2,
  })

  return (
    <div style={{
      position:       'fixed',
      bottom:         16,
      right:          16,
      width:          260,
      background:     'rgba(10,10,20,0.92)',
      border:         '1px solid rgba(97,0,151,0.6)',
      borderRadius:   12,
      fontFamily:     'monospace',
      fontSize:       12,
      color:          '#ffffff',
      zIndex:         500,
      backdropFilter: 'blur(8px)',
      boxShadow:      '0 0 24px rgba(97,0,151,0.3)',
      userSelect:     'none',
    }}>

      {/* Tabs header */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 10px',
        borderBottom: '1px solid rgba(97,0,151,0.4)',
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={btnBase(tab === t.id)}>
            <div>{t.label}</div>
            <div style={{ fontSize: 9, color: tab === t.id ? 'rgba(180,33,243,0.7)' : '#444' }}>
              {'count' in t && t.count !== null ? t.count : ''}
            </div>
            {'badge' in t && t.badge > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -4,
                background: '#ff3333', color: '#fff', borderRadius: '50%',
                fontSize: 8, fontWeight: 'bold', minWidth: 14, height: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 2px', boxShadow: '0 0 6px rgba(255,51,51,0.6)',
              }}>
                {t.badge > 9 ? '9+' : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        height: 220, overflowY: 'auto',
        padding: '6px 10px',
        display: 'flex', flexDirection: 'column', gap: 4,
        scrollbarWidth: 'thin', scrollbarColor: '#610097 transparent',
      }}>

        {/* ── Online ── */}
        {tab === 'online' && (
          otherPlayers.length === 0
            ? <div style={{ color: '#444', textAlign: 'center', marginTop: 60, fontSize: 11 }}>Nobody else here...</div>
            : otherPlayers.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 7,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(180,33,243,0.25)', border: '1px solid #B421F3',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#B421F3', fontWeight: 'bold',
                }}>
                  {p.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.username}
                  </div>
                  <div style={{ color: '#444', fontSize: 9 }}>{p.gridX},{p.gridY}</div>
                </div>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#00ff88', boxShadow: '0 0 5px #00ff88', flexShrink: 0,
                }} />
              </div>
            ))
        )}

        {/* ── Friends ── */}
        {tab === 'friends' && (
          friends.length === 0
            ? <div style={{ color: '#444', textAlign: 'center', marginTop: 60, fontSize: 11 }}>No friends yet...</div>
            : friends.map(f => {
                const roomName = ROOMS.find(r => r.id === f.roomId)?.name ?? f.roomId
                return (
                  <div key={f.id}
                    onClick={() => onSelectPlayer?.({ id: f.id, username: f.username })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 7,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                    }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: f.online ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${f.online ? '#00ff88' : '#333'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11,
                      }}>
                        {f.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 7, height: 7, borderRadius: '50%',
                        background: f.online ? '#00ff88' : '#444',
                        boxShadow: f.online ? '0 0 4px #00ff88' : 'none',
                        border: '1px solid rgba(10,10,20,0.9)',
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: f.online ? '#fff' : '#555', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.username}
                      </div>
                      <div style={{ color: f.online ? '#444' : '#333', fontSize: 9 }}>
                        {f.online ? roomName : 'offline'}
                      </div>
                    </div>
                    {f.online && (
                      <button
                        onClick={() => onOpenPM({ id: f.id, username: f.username })}
                        title="Private Message"
                        style={{
                          background: 'rgba(41,134,223,0.15)', border: '1px solid rgba(41,134,223,0.4)',
                          borderRadius: 5, color: '#2986DF', fontSize: 9, padding: '3px 7px',
                          cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0,
                        }}
                      >PM</button>
                    )}
                    {f.online && inMyApartment && (
                      <button
                        onClick={e => { e.stopPropagation(); onInviteToApartment?.(f.id) }}
                        title="Invite to apartment"
                        style={{
                          background: 'rgba(180,33,243,0.15)', border: '1px solid rgba(180,33,243,0.4)',
                          borderRadius: 5, color: '#B421F3', fontSize: 9, padding: '3px 7px',
                          cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0,
                        }}
                      >🏠</button>
                    )}
                  </div>
                )
              })
        )}

        {/* ── Messages / DMs ── */}
        {tab === 'messages' && (
          pmConversations.size === 0
            ? <div style={{ color: '#444', textAlign: 'center', marginTop: 60, fontSize: 11 }}>No messages yet...</div>
            : Array.from(pmConversations.entries()).map(([peerId, msgs]) => {
                const username = getConvUsername(peerId, msgs)
                const lastMsg  = msgs[msgs.length - 1]
                const unread   = unreadPMs.get(peerId) ?? 0
                return (
                  <div
                    key={peerId}
                    onClick={() => onOpenPM({ id: peerId, username })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 8px', borderRadius: 7, cursor: 'pointer',
                      background: unread > 0 ? 'rgba(41,134,223,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${unread > 0 ? 'rgba(41,134,223,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background = unread > 0 ? 'rgba(41,134,223,0.08)' : 'rgba(255,255,255,0.03)')}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(41,134,223,0.2)', border: '1px solid rgba(41,134,223,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#2986DF', fontWeight: 'bold',
                    }}>
                      {username.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: unread > 0 ? '#fff' : '#a0a0c0', fontSize: 11, fontWeight: unread > 0 ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {username}
                      </div>
                      <div style={{ color: '#444', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lastMsg?.mine ? 'You: ' : ''}{lastMsg?.text ?? ''}
                      </div>
                    </div>
                    {unread > 0 && (
                      <span style={{
                        background: '#ff3333', color: '#fff', borderRadius: '50%',
                        fontSize: 8, fontWeight: 'bold', minWidth: 16, height: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 3px', boxShadow: '0 0 6px rgba(255,51,51,0.5)', flexShrink: 0,
                      }}>
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                )
              })
        )}
      </div>

      {/* Footer — My Apartment */}
      {onMyApartment && (
        <div style={{ padding: '6px 10px', borderTop: '1px solid rgba(97,0,151,0.3)' }}>
          <button
            onClick={onMyApartment}
            style={{
              width:        '100%',
              background:   'rgba(180,33,243,0.1)',
              border:       '1px solid rgba(180,33,243,0.35)',
              borderRadius: 7,
              color:        '#B421F3',
              fontSize:     11,
              fontFamily:   'monospace',
              padding:      '5px 0',
              cursor:       'pointer',
              letterSpacing: 1,
            }}
          >
            🏠 My Apartment
          </button>
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
    connected,
    myPlayer,
    sendMessage,
    sendEmote,
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
        myPlayerId={myPlayer?.id ?? ''}
        connected={connected}
        onSend={sendMessage}
        onEmote={sendEmote}
      />
    </>
  )
}