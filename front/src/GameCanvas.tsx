/**
 * PUNK CITY — GameCanvas (stable)
 * Séparation claire : PixiJS init → puis hooks gameplay
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container, Graphics, Sprite, Ticker, Assets } from 'pixi.js'
import { AnimatedGIF } from '@pixi/gif'
import { useMovement, isoToScreen, useCameraFollow } from './systems/PunkCity_Movement'
import { useChat, ChatPanel, SocialPanel }             from './systems/PunkCity_Chat'
import type { ShopItem }                               from './systems/PunkCity_Chat'
import { useRoomSystem, Minimap, RoomInfo, RoomTransitionOverlay } from './systems/PunkCity_Rooms'

interface GameConfig {
  serverUrl: string
  username:  string
  avatar:    string
  roomId:    string
}

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface FloatingMessage {
  id:       string
  text:     string
  username: string
  isMe:     boolean
  ts:       number
}

// ─────────────────────────────────────────
// COMPOSANT — MESSAGES FLOTTANTS
// Ancrés à la bouche du perso, s'empilent vers le haut,
// le plus récent en bas, les anciens montent et s'effacent
// ─────────────────────────────────────────

function FloatingMessages({
  messages,
  pixiX,
  pixiY,
  world,
}: {
  messages: FloatingMessage[]
  pixiX:    number
  pixiY:    number
  world:    Container
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const update = () => {
      const zoom = world.scale.x
      setPos({
        x: world.x + pixiX * zoom,
        y: world.y + pixiY * zoom - 80 * zoom,  // ← offset fixe en coords monde, scale avec zoom
      })
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [pixiX, pixiY, world])

  if (messages.length === 0) return null

  return (
    // Conteneur ancré à la bouche du perso
    // Les messages sont positionnés en absolute en remontant vers le haut
    <div style={{
      position:      'absolute',
      left:          pos.x + 18,   // légèrement à droite du perso
      top:           pos.y,        // niveau bouche
      pointerEvents: 'none',
      zIndex:        1001,
    }}>
      {messages.map((msg, i) => {
        // i=0 = plus ancien (en haut), i=last = plus récent (en bas)
        const totalMessages = messages.length
        // Le message le plus récent (i = totalMessages-1) est à bottom=0
        // Les plus anciens montent progressivement
        const bottomOffset = (totalMessages - 1 - i) * 28

        // Opacité basée sur l'âge — disparaît après 8s
        const age = Math.min(1, (Date.now() - msg.ts) / 8000)
        const opacity = 1 - age

        return (
          <div
            key={msg.id}
            style={{
              position:    'absolute',
              bottom:      bottomOffset,
              left:        0,
              opacity,
              whiteSpace:  'nowrap',
              transition:  'opacity 0.3s ease',
            }}
          >
            <div style={{
              display:      'inline-flex',
              alignItems:   'center',
              background:   'rgba(13, 13, 26, 0.88)',
              border:       `1px solid ${msg.isMe ? '#B421F3' : '#2986DF'}`,
              borderRadius: '10px 10px 10px 2px',
              padding:      '4px 10px',
              fontSize:     11,
              fontFamily:   'monospace',
              boxShadow:    `0 0 8px ${msg.isMe ? 'rgba(180,33,243,0.25)' : 'rgba(41,134,223,0.2)'}`,
              gap:          4,
            }}>
              <span style={{
                color:      msg.isMe ? '#B421F3' : '#2986DF',
                fontWeight: 'bold',
                flexShrink: 0,
              }}>
                {msg.username}:
              </span>
              <span style={{ color: '#ffffff' }}>
                {msg.text}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — POPUP JOUEUR (clic sur un autre joueur)
// Apparaît en bas-droite avec actions sociales
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// COMPOSANT — FENÊTRE PRIVATE MESSAGE
// ─────────────────────────────────────────

function PrivateChatWindow({
  target,
  messages,
  onSend,
  onClose,
}: {
  target:   { id: string; username: string }
  messages: { fromId: string; fromUsername: string; text: string; timestamp: number; mine: boolean }[]
  onSend:   (text: string) => void
  onClose:  () => void
}) {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  }

  return (
    <div style={{
      position:     'fixed',
      bottom:       16,
      right:        292,
      width:        260,
      background:   'rgba(10,10,20,0.95)',
      border:       '1px solid rgba(41,134,223,0.5)',
      borderRadius: 12,
      fontFamily:   'monospace',
      fontSize:     12,
      color:        '#ffffff',
      zIndex:       2000,
      backdropFilter: 'blur(12px)',
      boxShadow:    '0 0 24px rgba(41,134,223,0.2)',
      display:      'flex',
      flexDirection:'column',
    }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '8px 12px',
        borderBottom:   '1px solid rgba(41,134,223,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'rgba(41,134,223,0.3)', border: '1px solid #2986DF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#2986DF', fontWeight: 'bold',
          }}>
            {target.username.charAt(0).toUpperCase()}
          </div>
          <span style={{ color: '#2986DF', fontWeight: 'bold', fontSize: 11 }}>
            {target.username}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#555',
          cursor: 'pointer', fontSize: 13, padding: '0 2px',
        }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{
        height:        180,
        overflowY:     'auto',
        padding:       '8px 10px',
        display:       'flex',
        flexDirection: 'column',
        gap:           4,
        scrollbarWidth: 'thin',
        scrollbarColor: '#2986DF transparent',
      }}>
        {messages.length === 0 && (
          <div style={{ color: '#444', textAlign: 'center', marginTop: 60, fontSize: 10 }}>
            Start a conversation...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    msg.mine ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              background:   msg.mine ? 'rgba(41,134,223,0.2)' : 'rgba(180,33,243,0.15)',
              border:       `1px solid ${msg.mine ? 'rgba(41,134,223,0.4)' : 'rgba(180,33,243,0.3)'}`,
              borderRadius: msg.mine ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              padding:      '4px 8px',
              maxWidth:     '80%',
              wordBreak:    'break-word',
              fontSize:     11,
            }}>
              {msg.text}
            </div>
            <span style={{ color: '#333', fontSize: 9, marginTop: 1 }}>
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{
        display:   'flex',
        gap:       6,
        padding:   '8px 10px',
        borderTop: '1px solid rgba(41,134,223,0.3)',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Private message..."
          maxLength={200}
          autoFocus
          style={{
            flex:       1,
            background: 'rgba(255,255,255,0.05)',
            border:     '1px solid rgba(41,134,223,0.4)',
            borderRadius: 6,
            color:      '#ffffff',
            padding:    '4px 8px',
            fontSize:   11,
            fontFamily: 'monospace',
            outline:    'none',
          }}
        />
        <button onClick={handleSend} style={{
          background:   'rgba(41,134,223,0.2)',
          border:       '1px solid #2986DF',
          borderRadius: 6,
          color:        '#2986DF',
          padding:      '4px 10px',
          cursor:       'pointer',
          fontSize:     11,
          fontFamily:   'monospace',
        }}>↵</button>
      </div>
    </div>
  )
}

function PlayerPopup({
  player,
  onClose,
  onAddFriend,
  onPrivateMessage,
  onTrade,
  onVisitApartment,
  isOwnerInApartment,
}: {
  player: { id: string; username: string }
  onClose: () => void
  onAddFriend: (id: string) => void
  onPrivateMessage: (player: { id: string; username: string }) => void
  onTrade: (id: string) => void
  onVisitApartment: (username: string) => void
  isOwnerInApartment: boolean
}) {
  const [showAptMsg, setShowAptMsg] = useState(false)
  return (
    <div style={{
      position:     'fixed',
      bottom:       16,
      right:        292,
      background:   'rgba(10,10,20,0.95)',
      border:       '1px solid rgba(180,33,243,0.5)',
      borderRadius: 12,
      padding:      '14px 18px',
      fontFamily:   'monospace',
      zIndex:       2000,
      backdropFilter: 'blur(12px)',
      boxShadow:    '0 0 24px rgba(180,33,243,0.2)',
      minWidth:     180,
      animation:    'fadeIn 0.2s ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(180,33,243,0.3)', border: '1px solid #B421F3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#B421F3', fontWeight: 'bold',
          }}>
            {player.username.charAt(0).toUpperCase()}
          </div>
          <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12 }}>
            {player.username}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#555',
          cursor: 'pointer', fontSize: 14, padding: '0 4px',
        }}>✕</button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { icon: '👤', label: 'View Profile',    color: '#a0a0c0', action: () => {} },
          { icon: '💬', label: 'Private Message',  color: '#2986DF', action: () => { onPrivateMessage(player); onClose() } },
          { icon: '👥', label: 'Add Friend',       color: '#00ff88', action: () => { onAddFriend(player.id); onClose() } },
          { icon: '🔄', label: 'Trade',            color: '#B421F3', action: () => { onTrade(player.id); onClose() } },
        ].map(action => (
          <button
            key={action.label}
            onClick={action.action}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              background:   'rgba(255,255,255,0.04)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 7,
              padding:      '6px 10px',
              color:        action.color,
              fontSize:     11,
              fontFamily:   'monospace',
              cursor:       'pointer',
              textAlign:    'left',
              transition:   'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          >
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}

        {/* Visit Apartment — désactivé si le propriétaire n'est pas chez lui */}
        <button
          onClick={() => {
            if (isOwnerInApartment) { onVisitApartment(player.username); onClose() }
            else setShowAptMsg(true)
          }}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            background:   'rgba(255,255,255,0.04)',
            border:       '1px solid rgba(255,255,255,0.08)',
            borderRadius: 7,
            padding:      '6px 10px',
            color:        isOwnerInApartment ? '#ffaa00' : '#555',
            fontSize:     11,
            fontFamily:   'monospace',
            cursor:       'pointer',
            textAlign:    'left',
            transition:   'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
        >
          <span>🏠</span>
          <span>Visit Apartment</span>
        </button>

        {showAptMsg && (
          <div style={{ color: '#ff6644', fontSize: 10, textAlign: 'center', marginTop: 2, fontFamily: 'monospace' }}>
            {player.username} n'est pas dans son appartement
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — FENÊTRE DE TRADE (centré)
// ─────────────────────────────────────────

function ItemCard({ item, selected, onClick, dim }: {
  item: ShopItem; selected: boolean; onClick?: () => void; dim?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background:   selected ? 'rgba(180,33,243,0.25)' : 'rgba(255,255,255,0.04)',
        border:       `1px solid ${selected ? '#B421F3' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8,
        padding:      '8px 10px',
        cursor:       onClick ? 'pointer' : 'default',
        opacity:      dim ? 0.45 : 1,
        display:      'flex', alignItems: 'center', gap: 8,
        userSelect:   'none',
      }}
    >
      <span style={{ fontSize: 18 }}>{item.emoji}</span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#fff' }}>{item.name}</div>
        <div style={{ fontSize: 9, color: '#FFD700' }}>₦ {item.price}</div>
      </div>
      {selected && <span style={{ marginLeft: 'auto', color: '#B421F3', fontSize: 12 }}>✓</span>}
    </div>
  )
}

function TradeWindow({
  trade,
  myInventory,
  myBalance,
  catalog,
  onUpdateOffer,
  onConfirm,
  onCancel,
}: {
  trade: {
    tradeId:          string
    partnerId:        string
    partnerUsername:  string
    myOffer:          string[]
    partnerOffer:     string[]
    myCredits:        number
    partnerCredits:   number
    myConfirmed:      boolean
    partnerConfirmed: boolean
  }
  myInventory:   string[]
  myBalance:     number
  catalog:       ShopItem[]
  onUpdateOffer: (offer: string[], credits: number) => void
  onConfirm:     () => void
  onCancel:      () => void
}) {
  const [creditsInput, setCreditsInput] = useState(0)
  const resolve = (id: string) => catalog.find(c => c.id === id)
  const bothConfirmed = trade.myConfirmed && trade.partnerConfirmed

  const toggle = (itemId: string) => {
    if (trade.myConfirmed) return
    const next = trade.myOffer.includes(itemId)
      ? trade.myOffer.filter(i => i !== itemId)
      : [...trade.myOffer, itemId]
    onUpdateOffer(next, creditsInput)
  }

  const handleCreditsChange = (val: number) => {
    if (trade.myConfirmed) return
    const clamped = Math.max(0, Math.min(val, myBalance))
    setCreditsInput(clamped)
    onUpdateOffer(trade.myOffer, clamped)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 4000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: 520, maxHeight: '85vh',
        background: 'rgba(10,10,20,0.98)',
        border: '1px solid rgba(180,33,243,0.6)',
        borderRadius: 16, fontFamily: 'monospace', color: '#fff',
        boxShadow: '0 0 48px rgba(180,33,243,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid rgba(180,33,243,0.3)',
          background: 'rgba(180,33,243,0.08)',
        }}>
          <span style={{ color: '#B421F3', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>
            🔄 TRADE — {trade.partnerUsername}
          </span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Two columns */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* My column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 14, gap: 8, overflow: 'hidden' }}>
            <div style={{ fontSize: 10, color: '#B421F3', fontWeight: 'bold', letterSpacing: 1 }}>
              YOUR OFFER {trade.myConfirmed && <span style={{ color: '#00ff88' }}>✓ LOCKED</span>}
            </div>
            {/* Credits offer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#FFD700', fontSize: 10 }}>₦ Credits to offer:</span>
              <input
                type="number" min={0} max={myBalance}
                value={creditsInput}
                disabled={trade.myConfirmed}
                onChange={e => handleCreditsChange(Number(e.target.value))}
                style={{
                  width: 80, background: 'rgba(255,215,0,0.08)',
                  border: `1px solid ${trade.myConfirmed ? 'rgba(0,255,136,0.4)' : 'rgba(255,215,0,0.4)'}`,
                  borderRadius: 6, color: '#FFD700', fontSize: 11,
                  fontFamily: 'monospace', padding: '3px 8px', outline: 'none',
                }}
              />
              <span style={{ color: '#555', fontSize: 9 }}>/ ₦{myBalance}</span>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myInventory.length === 0 && (
                <div style={{ color: '#444', fontSize: 10, padding: '8px 0' }}>Your inventory is empty.</div>
              )}
              {myInventory.map(id => {
                const item = resolve(id)
                if (!item) return null
                const selected = trade.myOffer.includes(id)
                return <ItemCard key={id} item={item} selected={selected} onClick={() => toggle(id)} dim={trade.myConfirmed && !selected} />
              })}
            </div>
          </div>

          <div style={{ width: 1, background: 'rgba(180,33,243,0.2)' }} />

          {/* Partner column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 14, gap: 8, overflow: 'hidden' }}>
            <div style={{ fontSize: 10, color: '#2986DF', fontWeight: 'bold', letterSpacing: 1 }}>
              {trade.partnerUsername.toUpperCase()} OFFERS {trade.partnerConfirmed && <span style={{ color: '#00ff88' }}>✓ LOCKED</span>}
            </div>
            {/* Partner credits — live */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)',
              borderRadius: 6, padding: '4px 8px',
            }}>
              <span style={{ color: '#FFD700', fontSize: 10 }}>₦ Credits offered:</span>
              <span style={{ color: '#FFD700', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' }}>
                {trade.partnerCredits}
              </span>
            </div>
            {/* Partner items — live */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trade.partnerOffer.length === 0 && (
                <div style={{ color: '#444', fontSize: 10, padding: '4px 0' }}>No items offered yet…</div>
              )}
              {trade.partnerOffer.map(id => {
                const item = resolve(id)
                if (!item) return null
                return <ItemCard key={id} item={item} selected={true} />
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(180,33,243,0.15)' }}>
          {!trade.myConfirmed && (
            <button
              onClick={onConfirm}
              style={{
                flex: 1, background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88',
                borderRadius: 8, color: '#00ff88', fontSize: 11, fontFamily: 'monospace',
                padding: '8px 0', cursor: 'pointer', fontWeight: 'bold',
              }}
            >✓ Lock Offer</button>
          )}
          {trade.myConfirmed && !bothConfirmed && (
            <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#00ff88', padding: '8px 0' }}>
              ✓ Waiting for {trade.partnerUsername}...
            </div>
          )}
          <button
            onClick={onCancel}
            style={{
              flex: trade.myConfirmed ? 1 : undefined, minWidth: 80,
              background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444',
              borderRadius: 8, color: '#ff4444', fontSize: 11, fontFamily: 'monospace',
              padding: '8px 0', cursor: 'pointer',
            }}
          >✕ Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — INVENTORY PANEL
// ─────────────────────────────────────────

function InventoryPanel({ inventory, catalog, onClose }: {
  inventory: string[]
  catalog:   ShopItem[]
  onClose:   () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 4000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: 440, maxHeight: '75vh',
        background: 'rgba(10,10,20,0.98)',
        border: '1px solid rgba(180,33,243,0.6)',
        borderRadius: 16, fontFamily: 'monospace', color: '#fff',
        boxShadow: '0 0 48px rgba(180,33,243,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid rgba(180,33,243,0.3)',
          background: 'rgba(180,33,243,0.08)',
        }}>
          <span style={{ color: '#B421F3', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>
            🎒 INVENTORY
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {inventory.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: '#555', fontSize: 11, textAlign: 'center', padding: '24px 0' }}>
              Your inventory is empty. Visit the Market to buy items.
            </div>
          )}
          {inventory.map(id => {
            const item = catalog.find(c => c.id === id)
            if (!item) return null
            return (
              <div key={id} style={{
                background: 'rgba(180,33,243,0.08)', border: '1px solid rgba(180,33,243,0.25)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{item.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 'bold' }}>{item.name}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — NEON MARKET SHOP
// ─────────────────────────────────────────

function NeonMarketShop({
  catalog,
  inventory,
  neonCredits,
  onBuy,
  onClose,
}: {
  catalog:      ShopItem[]
  inventory:    string[]
  neonCredits:  number
  onBuy:        (itemId: string) => void
  onClose:      () => void
}) {
  return (
    <div style={{
      position:      'fixed', inset: 0,
      background:    'rgba(0,0,0,0.7)',
      display:       'flex', alignItems: 'center', justifyContent: 'center',
      zIndex:        4000,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width:        520,
        maxHeight:    '80vh',
        background:   'rgba(10,10,20,0.98)',
        border:       '1px solid rgba(180,33,243,0.6)',
        borderRadius: 16,
        fontFamily:   'monospace',
        color:        '#ffffff',
        boxShadow:    '0 0 48px rgba(180,33,243,0.3)',
        display:      'flex', flexDirection: 'column',
        overflow:     'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid rgba(180,33,243,0.3)',
          background:   'rgba(180,33,243,0.08)',
        }}>
          <span style={{ color: '#B421F3', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>
            🛒 NEON MARKET
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#FFD700', fontSize: 12, fontWeight: 'bold' }}>
              ₦ {neonCredits}
            </span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#555',
              cursor: 'pointer', fontSize: 16, padding: '0 4px',
            }}>✕</button>
          </div>
        </div>

        {/* Grid */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap:                 12,
          padding:             16,
          overflowY:           'auto',
        }}>
          {catalog.map(item => {
            const owned      = inventory.includes(item.id)
            const canAfford  = neonCredits >= item.price
            return (
              <div key={item.id} style={{
                background:   owned ? 'rgba(0,255,136,0.05)' : 'rgba(255,255,255,0.03)',
                border:       `1px solid ${owned ? 'rgba(0,255,136,0.3)' : 'rgba(180,33,243,0.25)'}`,
                borderRadius: 10,
                padding:      '12px 14px',
                display:      'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontSize: 22 }}>{item.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#ffffff' }}>{item.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 'bold' }}>₦ {item.price}</span>
                  {owned ? (
                    <span style={{ fontSize: 10, color: '#00ff88' }}>✓ Owned</span>
                  ) : (
                    <button
                      onClick={() => onBuy(item.id)}
                      disabled={!canAfford}
                      style={{
                        background:   canAfford ? 'rgba(180,33,243,0.2)' : 'rgba(255,255,255,0.05)',
                        border:       `1px solid ${canAfford ? '#B421F3' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 6,
                        color:        canAfford ? '#B421F3' : '#444',
                        fontSize:     10, fontFamily: 'monospace',
                        padding:      '4px 10px',
                        cursor:       canAfford ? 'pointer' : 'not-allowed',
                      }}
                    >Buy</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// INNER GAME
// ─────────────────────────────────────────

function InnerGame({
  app,
  world,
  playerGfx,
  config,
}: {
  app:       Application
  world:     Container
  playerGfx: Graphics
  config:    GameConfig
}) {
  // Ref vers le callback de position — permet de l'appeler depuis useChat sans stale closure
  const onPlayerMovedCbRef = useRef<(data: any) => void>(() => {})

  const {
    messages, players, connected, myPlayer,
    friendRequests, friends, pmConversations, unreadPMs, pmToasts,
    tradeRequests, activeTrade,
    apartmentInvites, sendApartmentInviteToOne, dismissApartmentInvite,
    sendMessage, sendEmote, reportMove, changeRoom,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest,
    sendPM, dismissPMToast, markPMsRead,
    sendTradeRequest, acceptTrade, declineTrade,
    updateTradeOffer, confirmTrade, cancelTrade,
    neonCredits, inventory, shopCatalog, buyItem, openShop,
  } = useChat({
    serverUrl:     config.serverUrl,
    username:      config.username,
    avatar:        config.avatar,
    roomId:        config.roomId,
    // Bypass React state pour les updates de position à 60fps → plus de téléportation
    onPlayerMoved: useCallback((data: any) => { onPlayerMovedCbRef.current(data) }, []),
  })

  // ── Autres joueurs ───────────────────────
  // Déclaré ICI (avant onRoomChange) pour pouvoir nettoyer les sprites
  // de façon synchrone lors d'un changement de room.
  const otherSprites = useRef<Map<string, any>>(new Map())

  const onRoomChange = useCallback((roomId: string, spawnX: number, spawnY: number) => {
    // Nettoyage synchrone des sprites de l'ancienne room
    otherSprites.current.forEach((container) => {
      if (container && container._walkGif) {
        try {
          world.removeChild(container._walkGif)
          world.removeChild(container._idleSw)
          world.removeChild(container._spriteSe)
          world.removeChild(container._spriteNw)
          world.removeChild(container._spriteNe)
          container._walkGif.destroy()
          container._idleSw.destroy()
          container._spriteSe.destroy()
          container._spriteNw.destroy()
          container._spriteNe.destroy()
        } catch (_) {}
      }
    })
    otherSprites.current.clear()

    const { x, y } = isoToScreen(spawnX, spawnY)
    playerRef.current.gridX  = spawnX
    playerRef.current.gridY  = spawnY
    playerRef.current.pixiX  = x
    playerRef.current.pixiY  = y
    playerRef.current.path   = []
    playerRef.current.moving = false
    playerGfx.x = x
    playerGfx.y = y
    reportMove(spawnX, spawnY, x, y, 'sw')
    changeRoom(roomId)
  }, [reportMove, changeRoom])

  const { activeRoomId, activeRoom, transitioning, blockedTiles, loadRoom, checkDoors } =
    useRoomSystem(app, world, onRoomChange)

  const { player: playerRef } = useMovement(app, world, playerGfx, blockedTiles)

  useEffect(() => {
    let lastX = -1, lastY = -1
    const tick = () => {
      const p = playerRef.current
      // Vérifie les portes seulement quand la grille change
      if (p.gridX !== lastX || p.gridY !== lastY) {
        lastX = p.gridX; lastY = p.gridY
        checkDoors(p.gridX, p.gridY)
      }
      // Envoie position pixel à chaque frame si le joueur bouge → mouvement fluide côté POV2
      if (p.moving) {
        const dir = (playerGfx as any)._direction || 'sw'
        reportMove(p.gridX, p.gridY, p.pixiX, p.pixiY, dir)
      }
    }
    app.ticker.add(tick)
    return () => { app.ticker.remove(tick) }
  }, [checkDoors, reportMove])

  useCameraFollow(app, world, playerRef, 0.08)

  // ── Interpolation mouvement autres joueurs ──────────
  useEffect(() => {
    const tick = () => {
      otherSprites.current.forEach(container => {
        if (!container || !container._walkGif) return
        const tx = container._targetX ?? container._walkGif.x
        const ty = container._targetY ?? container._walkGif.y
        const newX = container._walkGif.x + (tx - container._walkGif.x) * 0.2
        const newY = container._walkGif.y + (ty - container._walkGif.y) * 0.2
        // Sync tous les sprites à la même position
        container._walkGif.x  = newX; container._walkGif.y  = newY
        container._idleSw.x   = newX; container._idleSw.y   = newY + IDLE_Y_OFFSET
        container._spriteSe.x = newX; container._spriteSe.y = newY
        container._spriteNw.x = newX; container._spriteNw.y = newY
        container._spriteNe.x = newX; container._spriteNe.y = newY

        // Tri isométrique — zIndex = Y des pieds, mis à jour chaque frame
        const z = Math.round(newY)
        container._walkGif.zIndex  = z
        container._idleSw.zIndex   = z
        container._spriteSe.zIndex = z
        container._spriteNw.zIndex = z
        container._spriteNe.zIndex = z

        // Si pas de mouvement reçu depuis 400ms → idle
        const idle = !container._lastMoveTime || (Date.now() - container._lastMoveTime) > 400
        if (idle && container._currentDir === 'sw' && container._walkGif.playing) {
          container._walkGif.stop()
          container._walkGif.visible = false
          container._idleSw.visible  = true
        }
      })
    }
    app.ticker.add(tick)
    return () => { app.ticker.remove(tick) }
  }, [])


  // ── Callback direct pour les positions (bypass React, 60fps) ──
  // Branché ici pour avoir accès à otherSprites
  useEffect(() => {
    onPlayerMovedCbRef.current = (data: any) => {
      const container = otherSprites.current.get(data.id)
      if (!container || !container._walkGif) return

      container._targetX      = data.pixiX
      container._targetY      = data.pixiY
      container._lastMoveTime = Date.now()
      container._currentDir   = data.direction || 'sw'

      const dir = data.direction || 'sw'
      container._walkGif.visible  = false
      container._idleSw.visible   = false
      container._spriteSe.visible = false
      container._spriteNw.visible = false
      container._spriteNe.visible = false

      if (dir === 'sw') {
        container._walkGif.visible = true
        if (!container._walkGif.playing) container._walkGif.play()
      } else if (dir === 'se') { container._spriteSe.visible = true }
      else if (dir === 'nw')   { container._spriteNw.visible = true }
      else if (dir === 'ne')   { container._spriteNe.visible = true }
    }
  }, [])

  useEffect(() => {
    if (!myPlayer) return

    players.forEach(p => {
      if (p.id === myPlayer.id) return

      if (!otherSprites.current.has(p.id)) {
        // Crée un container pour gérer le GIF + sprites statiques
        otherSprites.current.set(p.id, null)
        Promise.all([
          fetch('/walk_sw.gif').then(r => r.arrayBuffer()).then(b => AnimatedGIF.fromBuffer(b)),
          Assets.load('/sprite_sw.png'),
          Assets.load('/sprite_se.png'),
          Assets.load('/sprite_nw.png'),
          Assets.load('/sprite_ne.png'),
        ]).then(([walkGif, sw, se, nw, ne]) => {
          // Guard : si le joueur a été retiré pendant le chargement async (changement de room),
          // on détruit les assets et on abandonne — évite les fantômes inter-rooms
          if (!otherSprites.current.has(p.id)) {
            walkGif.destroy()
            return
          }
          // GIF de marche sw
          walkGif.anchor.set(0.5, 1)
          walkGif.scale.set(0.8)
          walkGif.zIndex = 9998
          walkGif.animationSpeed = 0.80
          walkGif.loop = true
          walkGif.visible = true
          walkGif.stop()

          // Sprites statiques pour les autres directions + idle sw
          const idleSw = new Sprite(sw)
          idleSw.anchor.set(0.5, 1); idleSw.scale.set(0.8); idleSw.zIndex = 9998; idleSw.visible = false
          const spriteSe = new Sprite(se)
          spriteSe.anchor.set(0.5, 1); spriteSe.scale.set(0.8); spriteSe.zIndex = 9998; spriteSe.visible = false
          const spriteNw = new Sprite(nw)
          spriteNw.anchor.set(0.5, 1); spriteNw.scale.set(0.8); spriteNw.zIndex = 9998; spriteNw.visible = false
          const spriteNe = new Sprite(ne)
          spriteNe.anchor.set(0.5, 1); spriteNe.scale.set(0.8); spriteNe.zIndex = 9998; spriteNe.visible = false

          world.addChild(walkGif)
          world.addChild(idleSw)
          world.addChild(spriteSe)
          world.addChild(spriteNw)
          world.addChild(spriteNe)

          // Curseur pointer au survol — le clic est géré par le listener de stage
          ;[walkGif, idleSw, spriteSe, spriteNw, spriteNe].forEach(s => {
            s.eventMode = 'static'
            s.cursor    = 'pointer'
          })

          // Position initiale depuis la dernière position connue du joueur
          const initX = (p as any).pixiX || isoToScreen(p.gridX, p.gridY).x
          const initY = (p as any).pixiY || isoToScreen(p.gridX, p.gridY).y
          walkGif.x  = initX; walkGif.y  = initY
          idleSw.x   = initX; idleSw.y   = initY + IDLE_Y_OFFSET
          spriteSe.x = initX; spriteSe.y = initY
          spriteNw.x = initX; spriteNw.y = initY
          spriteNe.x = initX; spriteNe.y = initY

          // Idle par défaut (idleSw visible, walkGif caché)
          walkGif.visible = false
          idleSw.visible  = true

          // Stocke tout dans un objet conteneur
          const container = {
            x: 0, y: 0,
            _walkGif: walkGif,
            _idleSw: idleSw,
            _spriteSe: spriteSe,
            _spriteNw: spriteNw,
            _spriteNe: spriteNe,
            _currentDir: 'sw',
            _targetX: initX,
            _targetY: initY,
            _playerId:  p.id,
            _username:  p.username,
          }
          otherSprites.current.set(p.id, container)
        })
        return
      }

      // Position et animation gérées par le callback onPlayerMoved (bypass React, 60fps)
      // Ce useEffect ne sert plus qu'au spawn/despawn des sprites
    })

    otherSprites.current.forEach((container, id) => {
      if (!players.find(p => p.id === id)) {
        if (container && container._walkGif) {
          world.removeChild(container._walkGif)
          world.removeChild(container._idleSw)
          world.removeChild(container._spriteSe)
          world.removeChild(container._spriteNw)
          world.removeChild(container._spriteNe)
          container._walkGif.destroy()
          container._idleSw.destroy()
          container._spriteSe.destroy()
          container._spriteNw.destroy()
          container._spriteNe.destroy()
        }
        otherSprites.current.delete(id)
      }
    })
  }, [players, myPlayer])

  // ── Clic sur un autre joueur via le stage (bypass hit-testing PixiJS) ───────
  // Les events sur les sprites individuels ne remontent pas toujours correctement.
  // On écoute directement le stage et on fait la détection de collision manuellement.
  useEffect(() => {
    const onStageDown = (e: any) => {
      // Convertit les coords écran → coords monde
      const localPos = world.toLocal({ x: e.globalX, y: e.globalY })

      otherSprites.current.forEach((container) => {
        if (!container || !container._walkGif) return
        // Le sprite est ancré en bas au centre (anchor 0.5, 1)
        const px = container._walkGif.x
        const py = container._walkGif.y
        const dx = Math.abs(localPos.x - px)
        const dy = py - localPos.y   // positif = clic au-dessus des pieds
        // Zone de clic : ±45px en X, de -10 à 110px en Y au-dessus des pieds
        if (dx < 45 && dy > -10 && dy < 110) {
          onPlayerClickRef.current(container._playerId, container._username)
        }
      })
    }

    app.stage.on('pointerdown', onStageDown)
    return () => { app.stage.off('pointerdown', onStageDown) }
  }, [])

  // Nettoyage au démontage — évite les sprites orphelins après HMR ou re-mount
  useEffect(() => {
    return () => {
      try {
        otherSprites.current.forEach((container) => {
          if (container && container._walkGif) {
            world.removeChild(container._walkGif)
            world.removeChild(container._idleSw)
            world.removeChild(container._spriteSe)
            world.removeChild(container._spriteNw)
            world.removeChild(container._spriteNe)
            container._walkGif.destroy()
            container._idleSw.destroy()
            container._spriteSe.destroy()
            container._spriteNw.destroy()
            container._spriteNe.destroy()
          }
        })
      } catch (_) {
        // world peut déjà être détruit si l'app entière se démonte
      } finally {
        otherSprites.current.clear()
      }
    }
  }, [])

  // ── Messages flottants — s'empilent vers le haut ────
  // Max 4 messages par joueur, disparaissent après 8s
  const [floatingMsgs, setFloatingMsgs] = useState<Map<string, FloatingMessage[]>>(new Map())

  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.type === 'system') return

    const newMsg: FloatingMessage = {
      id:       last.id,
      text:     last.text,
      username: last.username,
      isMe:     last.playerId === myPlayer?.id,
      ts:       Date.now(),
    }

    setFloatingMsgs(prev => {
      const next = new Map(prev)
      const existing = next.get(last.playerId) ?? []
      next.set(last.playerId, [...existing.slice(-3), newMsg])
      return next
    })

    // Supprime ce message après 8 secondes
    const timer = setTimeout(() => {
      setFloatingMsgs(prev => {
        const next = new Map(prev)
        const existing = next.get(last.playerId) ?? []
        const filtered = existing.filter(m => m.id !== newMsg.id)
        if (filtered.length === 0) next.delete(last.playerId)
        else next.set(last.playerId, filtered)
        return next
      })
    }, 8000)

    return () => clearTimeout(timer)
  }, [messages, myPlayer])

  // ── Shop / Inventory ─────────────────────
  const [showMarket,    setShowMarket]    = useState(false)
  const [showInventory, setShowInventory] = useState(false)

  // ── Mobile ───────────────────────────────
  const { isLandscapeMobile } = useMobileOrientation()
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'social' | null>(null)

  // ── Popup joueur au clic ─────────────────
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; username: string } | null>(null)
  const [pmTarget,       setPmTarget]       = useState<{ id: string; username: string } | null>(null)

  // Marque les PMs comme lus à l'ouverture de la fenêtre
  useEffect(() => {
    if (pmTarget) markPMsRead(pmTarget.id)
  }, [pmTarget])
  // Ref pour accéder à setSelectedPlayer depuis les callbacks PixiJS
  // Mis à jour à chaque render — toujours à jour, pas de stale closure possible
  const onPlayerClickRef = useRef<(id: string, username: string) => void>(() => {})
  onPlayerClickRef.current = (id: string, username: string) => setSelectedPlayer({ id, username })

  // ── Position temps réel du joueur local ──
  const [myPixiPos, setMyPixiPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const tick = () => {
      const p = playerRef.current
      setMyPixiPos({ x: p.pixiX, y: p.pixiY })
    }
    app.ticker.add(tick)
    return () => { app.ticker.remove(tick) }
  }, [])

  return (
    <>
      {/* Minimap desktop / Burger mobile */}
      {isLandscapeMobile
        ? <MobileBurgerMenu activeRoomId={activeRoomId} onRoomClick={loadRoom} />
        : <Minimap activeRoomId={activeRoomId} onRoomClick={loadRoom} />
      }
      <RoomInfo room={activeRoom} />

      {/* Chat + Social — desktop : fixed corners ; mobile : icônes flottantes en bas */}
      {isLandscapeMobile ? (
        <>
          {/* Backdrop overlay */}
          {mobilePanel && (
            <div onClick={() => setMobilePanel(null)} style={{
              position: 'fixed', inset: 0, zIndex: 1998, background: 'rgba(0,0,0,0.5)',
            }} />
          )}
          {/* Chat overlay */}
          {mobilePanel === 'chat' && (
            <ChatPanel
              messages={messages}
              myPlayerId={myPlayer?.id ?? ''}
              connected={connected}
              onSend={sendMessage}
              onEmote={sendEmote}
              compact
              style={{ bottom: 80, left: 8, right: 8, width: 'auto', zIndex: 1999 }}
            />
          )}
          {/* Social overlay */}
          {mobilePanel === 'social' && (
            <SocialPanel
              players={players}
              myPlayerId={myPlayer?.id ?? ''}
              friends={friends}
              pmConversations={pmConversations}
              unreadPMs={unreadPMs}
              onOpenPM={p => { setPmTarget(p); markPMsRead(p.id) }}
              onMyApartment={() => loadRoom(`apartment_${config.username}`)}
              onSelectPlayer={p => setSelectedPlayer(p)}
              inMyApartment={activeRoomId === `apartment_${config.username}` && myPlayer?.roomId === `apartment_${config.username}`}
              onInviteToApartment={sendApartmentInviteToOne}
              compact
              style={{ bottom: 80, left: 8, right: 8, width: 'auto', zIndex: 1999 }}
            />
          )}
          {/* Floating bottom icons */}
          <div style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 16, zIndex: 2000,
          }}>
            {(['chat', 'social'] as const).map((panel, i) => (
              <div key={panel} onClick={() => setMobilePanel(p => p === panel ? null : panel)} style={{
                width: 52, height: 52,
                background: mobilePanel === panel ? 'rgba(180,33,243,0.25)' : 'rgba(10,10,20,0.92)',
                border: `1px solid ${mobilePanel === panel ? '#B421F3' : 'rgba(97,0,151,0.6)'}`,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                boxShadow: mobilePanel === panel ? '0 0 20px rgba(180,33,243,0.5)' : '0 0 12px rgba(97,0,151,0.3)',
              }}>{i === 0 ? '💬' : '👥'}</div>
            ))}
          </div>
        </>
      ) : (
        <>
          <ChatPanel
            messages={messages}
            myPlayerId={myPlayer?.id ?? ''}
            connected={connected}
            onSend={sendMessage}
            onEmote={sendEmote}
          />
          <SocialPanel
            players={players}
            myPlayerId={myPlayer?.id ?? ''}
            friends={friends}
            pmConversations={pmConversations}
            unreadPMs={unreadPMs}
            onOpenPM={p => { setPmTarget(p); markPMsRead(p.id) }}
            onMyApartment={() => loadRoom(`apartment_${config.username}`)}
            onSelectPlayer={p => setSelectedPlayer(p)}
            inMyApartment={activeRoomId === `apartment_${config.username}` && myPlayer?.roomId === `apartment_${config.username}`}
            onInviteToApartment={sendApartmentInviteToOne}
          />
        </>
      )}

      {/* Messages flottants pour chaque joueur */}
      {players.map(p => {
        const isMe = p.id === myPlayer?.id
        const px   = isMe ? myPixiPos.x : ((p as any).pixiX ?? isoToScreen(p.gridX, p.gridY).x)
        const py   = isMe ? myPixiPos.y : ((p as any).pixiY ?? isoToScreen(p.gridX, p.gridY).y)
        return (
          <FloatingMessages key={p.id} messages={floatingMsgs.get(p.id) ?? []} pixiX={px} pixiY={py} world={world} />
        )
      })}

      {/* Boutons appartement — visibles uniquement dans un appartement */}
      {activeRoomId.startsWith('apartment_') && (
        <div style={{
          position:  'fixed',
          top:       72,
          left:      '50%',
          transform: 'translateX(-50%)',
          display:   'flex',
          gap:       8,
          zIndex:    500,
        }}>
          <button
            onClick={() => loadRoom('genesis-plaza', 1, 12)}
            style={{
              background:   'rgba(10,10,20,0.9)',
              border:       '1px solid rgba(180,33,243,0.5)',
              borderRadius: 8,
              color:        '#B421F3',
              fontSize:     11,
              fontFamily:   'monospace',
              padding:      '5px 14px',
              cursor:       'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >← Leave Apartment</button>

        </div>
      )}

      {/* Popup joueur — à gauche du panneau social */}
      {selectedPlayer && (
        <PlayerPopup
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          onAddFriend={sendFriendRequest}
          onPrivateMessage={p => { setPmTarget(p); setSelectedPlayer(null) }}
          onTrade={id => { sendTradeRequest(id); setSelectedPlayer(null) }}
          onVisitApartment={username => { loadRoom(`apartment_${username}`); setSelectedPlayer(null) }}
          isOwnerInApartment={
            // Cherche d'abord dans players (même room), puis dans friends (rooms différentes)
            (players.find(p => p.id === selectedPlayer.id)?.roomId ??
             friends.find(f => f.id === selectedPlayer.id)?.roomId) === `apartment_${selectedPlayer.username}`
          }
        />
      )}

      {/* Fenêtre PM — à gauche du panneau social */}
      {pmTarget && (
        <PrivateChatWindow
          target={pmTarget}
          messages={pmConversations.get(pmTarget.id) ?? []}
          onSend={text => sendPM(pmTarget.id, text)}
          onClose={() => setPmTarget(null)}
        />
      )}

      {/* Overlay centre-bas : demandes d'amis + toasts PM */}
      <div style={{
        position:  'fixed',
        bottom:    100,
        left:      '50%',
        transform: 'translateX(-50%)',
        display:   'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap:       8,
        zIndex:    3000,
        pointerEvents: 'none',
      }}>
        {/* Invitations appartement */}
        {apartmentInvites.map(inv => (
          <div key={inv.fromId} style={{
            background:    'rgba(10,10,20,0.95)',
            border:        '1px solid rgba(255,170,0,0.6)',
            borderRadius:  10,
            padding:       '10px 14px',
            fontFamily:    'monospace',
            boxShadow:     '0 0 16px rgba(255,170,0,0.2)',
            pointerEvents: 'all',
            animation:     'fadeIn 0.2s ease',
            minWidth:      220,
          }}>
            <div style={{ fontSize: 11, color: '#ffaa00', marginBottom: 6 }}>
              🏠 <b>{inv.fromUsername}</b> vous invite dans son appartement
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { loadRoom(inv.roomId); dismissApartmentInvite(inv.fromId) }}
                style={{
                  flex: 1, background: 'rgba(255,170,0,0.15)', border: '1px solid #ffaa00',
                  borderRadius: 6, color: '#ffaa00', fontSize: 10, fontFamily: 'monospace',
                  padding: '3px 0', cursor: 'pointer',
                }}
              >✓ Accepter</button>
              <button
                onClick={() => dismissApartmentInvite(inv.fromId)}
                style={{
                  flex: 1, background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444',
                  borderRadius: 6, color: '#ff4444', fontSize: 10, fontFamily: 'monospace',
                  padding: '3px 0', cursor: 'pointer',
                }}
              >✕ Refuser</button>
            </div>
          </div>
        ))}

        {/* Demandes de trade */}
        {tradeRequests.map(req => (
          <div key={req.tradeId} style={{
            background:    'rgba(10,10,20,0.95)',
            border:        '1px solid rgba(180,33,243,0.6)',
            borderRadius:  10,
            padding:       '10px 14px',
            fontFamily:    'monospace',
            boxShadow:     '0 0 16px rgba(180,33,243,0.25)',
            pointerEvents: 'all',
            animation:     'fadeIn 0.2s ease',
            minWidth:      220,
          }}>
            <div style={{ fontSize: 11, color: '#B421F3', marginBottom: 6 }}>
              🔄 <b>{req.fromUsername}</b> vous propose un trade
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => acceptTrade(req.tradeId, req.fromId)} style={{
                flex: 1, background: 'rgba(180,33,243,0.15)', border: '1px solid #B421F3',
                borderRadius: 6, color: '#B421F3', fontSize: 10, fontFamily: 'monospace',
                padding: '3px 0', cursor: 'pointer',
              }}>✓ Accepter</button>
              <button onClick={() => declineTrade(req.tradeId, req.fromId)} style={{
                flex: 1, background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444',
                borderRadius: 6, color: '#ff4444', fontSize: 10, fontFamily: 'monospace',
                padding: '3px 0', cursor: 'pointer',
              }}>✕ Refuser</button>
            </div>
          </div>
        ))}

        {/* Demandes d'amis */}
        {friendRequests.map(req => (
          <div key={req.fromId} style={{
            background:    'rgba(10,10,20,0.95)',
            border:        '1px solid #00ff88',
            borderRadius:  10,
            padding:       '10px 14px',
            fontFamily:    'monospace',
            boxShadow:     '0 0 16px rgba(0,255,136,0.2)',
            pointerEvents: 'all',
            animation:     'fadeIn 0.2s ease',
            minWidth:      220,
          }}>
            <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 6 }}>
              👥 <b>{req.fromUsername}</b> wants to be your friend
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => acceptFriendRequest(req.fromId)} style={{
                flex: 1, background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88',
                borderRadius: 6, color: '#00ff88', fontSize: 10, fontFamily: 'monospace',
                padding: '3px 0', cursor: 'pointer',
              }}>✓ Accept</button>
              <button onClick={() => declineFriendRequest(req.fromId)} style={{
                flex: 1, background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444',
                borderRadius: 6, color: '#ff4444', fontSize: 10, fontFamily: 'monospace',
                padding: '3px 0', cursor: 'pointer',
              }}>✕ Decline</button>
            </div>
          </div>
        ))}

        {/* Toasts PM */}
        {pmToasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => {
              setPmTarget({ id: toast.fromId, username: toast.fromUsername })
              dismissPMToast(toast.id)
            }}
            style={{
              background:    'rgba(10,10,20,0.96)',
              border:        '1px solid rgba(41,134,223,0.6)',
              borderRadius:  10,
              padding:       '10px 14px',
              fontFamily:    'monospace',
              boxShadow:     '0 0 16px rgba(41,134,223,0.25)',
              cursor:        'pointer',
              pointerEvents: 'all',
              animation:     'fadeIn 0.2s ease',
              minWidth:      220,
              maxWidth:      280,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(41,134,223,0.3)', border: '1px solid #2986DF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#2986DF', fontWeight: 'bold', flexShrink: 0,
              }}>
                {toast.fromUsername.charAt(0).toUpperCase()}
              </div>
              <span style={{ color: '#2986DF', fontWeight: 'bold', fontSize: 11 }}>
                {toast.fromUsername}
              </span>
              <span style={{ color: '#333', fontSize: 9, marginLeft: 'auto' }}>💬 PM</span>
            </div>
            <div style={{
              color: '#a0a0c0', fontSize: 11,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {toast.text}
            </div>
          </div>
        ))}
      </div>

      {/* Fenêtre de trade — centré plein écran */}
      {activeTrade && (
        <TradeWindow
          trade={activeTrade}
          myInventory={inventory}
          myBalance={neonCredits}
          catalog={shopCatalog}
          onUpdateOffer={(offer, credits) => updateTradeOffer(activeTrade.tradeId, offer, credits)}
          onConfirm={() => confirmTrade(activeTrade.tradeId)}
          onCancel={() => cancelTrade(activeTrade.tradeId)}
        />
      )}

      {/* Inventaire */}
      {showInventory && (
        <InventoryPanel
          inventory={inventory}
          catalog={shopCatalog}
          onClose={() => setShowInventory(false)}
        />
      )}

      <RoomTransitionOverlay transitioning={transitioning} />
      <HUD connected={connected} roomName={activeRoom?.name ?? ''} playerCount={players.length} username={config.username} neonCredits={neonCredits} onOpenMarket={() => { openShop(); setShowMarket(true) }} onOpenInventory={() => setShowInventory(true)} isMobile={isLandscapeMobile} />

      {/* Neon Market Shop */}
      {showMarket && (
        <NeonMarketShop
          catalog={shopCatalog}
          inventory={inventory}
          neonCredits={neonCredits}
          onBuy={itemId => buyItem(itemId)}
          onClose={() => setShowMarket(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────
// GAME CANVAS
// ─────────────────────────────────────────

export default function GameCanvas({ config }: { config: GameConfig }) {
  const mountRef = useRef<HTMLDivElement>(null)

  const [pixiReady, setPixiReady] = useState<{
    app:       Application
    world:     Container
    playerGfx: Graphics
  } | null>(null)

  useEffect(() => {
    if (!mountRef.current) return
    const app = new Application()

    ;(async () => {
      await app.init({
        width:           window.innerWidth,
        height:          window.innerHeight,
        backgroundColor: 0x0d0d1a,
        resolution:      window.devicePixelRatio || 1,
        autoDensity:     true,
        antialias:       false,
      })

      if (!mountRef.current) return
      mountRef.current.appendChild(app.canvas)

      const world = new Container()
      world.sortableChildren = true
      app.stage.addChild(world)

      const playerGfx = await buildPlayerSprite(world, app)

      const onResize = () => app.renderer.resize(window.innerWidth, window.innerHeight)
      window.addEventListener('resize', onResize)

      setPixiReady({ app, world, playerGfx })

      return () => {
        window.removeEventListener('resize', onResize)
        app.destroy(true)
      }
    })()
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div
        ref={mountRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          cursor: 'pointer', zIndex: 0,
        }}
      />
      {!pixiReady && (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#0d0d1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#B421F3', fontFamily: 'monospace', fontSize: 14,
          letterSpacing: 4, zIndex: 9999,
        }}>
          LOADING PUNK CITY...
        </div>
      )}
      {pixiReady && (
        <InnerGame
          app={pixiReady.app}
          world={pixiReady.world}
          playerGfx={pixiReady.playerGfx}
          config={config}
        />
      )}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #610097; border-radius: 2px; }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────
// HOOK — DÉTECTION MOBILE / ORIENTATION
// ─────────────────────────────────────────

function useMobileOrientation() {
  const get = () => ({
    isLandscapeMobile: window.innerHeight < 500 && window.innerWidth < 1024,
    isPortraitMobile:  window.innerWidth < window.innerHeight && window.innerWidth < 1024,
  })
  const [state, setState] = useState(get)
  useEffect(() => {
    const h = () => setState(get())
    window.addEventListener('resize', h)
    window.addEventListener('orientationchange', h)
    return () => { window.removeEventListener('resize', h); window.removeEventListener('orientationchange', h) }
  }, [])
  return state
}

// ─────────────────────────────────────────
// HUD
// ─────────────────────────────────────────

function HUD({ connected, roomName, playerCount, username, neonCredits, onOpenMarket, onOpenInventory, isMobile }: {
  connected: boolean; roomName: string; playerCount: number; username: string
  neonCredits: number; onOpenMarket: () => void; onOpenInventory: () => void
  isMobile?: boolean
}) {
  return (
    <div style={{
      position: 'fixed', top: 16, left: 16,
      display: 'flex', flexDirection: 'column', gap: 6,
      zIndex: 500, fontFamily: 'monospace',
    }}>
      {/* Row 1 : avatar + username + credits */}
      <div style={{
        background: 'rgba(10,10,20,0.88)', border: '1px solid rgba(180,33,243,0.4)',
        borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center',
        gap: 8, backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(180,33,243,0.3)', border: '1px solid #B421F3',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#B421F3', fontWeight: 'bold',
        }}>
          {username.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{username}</div>
          <div style={{ color: '#B421F3', fontSize: 9 }}>SeekerPunk OG</div>
        </div>
        <div style={{ marginLeft: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: 11 }}>₦ {neonCredits}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={onOpenMarket}
              style={{
                background: 'rgba(180,33,243,0.15)', border: '1px solid rgba(180,33,243,0.4)',
                borderRadius: 5, color: '#B421F3', fontFamily: 'monospace', cursor: 'pointer',
                minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined,
                fontSize: isMobile ? 20 : 9, padding: isMobile ? 0 : '2px 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{isMobile ? '🛒' : '🛒 Market'}</button>
            <button
              onClick={onOpenInventory}
              style={{
                background: 'rgba(180,33,243,0.15)', border: '1px solid rgba(180,33,243,0.4)',
                borderRadius: 5, color: '#B421F3', fontFamily: 'monospace', cursor: 'pointer',
                minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined,
                fontSize: isMobile ? 20 : 9, padding: isMobile ? 0 : '2px 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{isMobile ? '👜' : '🎒 Bag'}</button>
          </div>
        </div>
      </div>
      {/* Row 2 : room + player count — masqué en landscape mobile */}
      {!isMobile && <div style={{
        background: 'rgba(10,10,20,0.88)', border: '1px solid rgba(97,0,151,0.3)',
        borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center',
        gap: 8, backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: connected ? '#00ff88' : '#ff4444',
          boxShadow: connected ? '0 0 6px #00ff88' : '0 0 6px #ff4444',
        }} />
        <div>
          <div style={{ color: '#a0a0c0', fontSize: 10 }}>{roomName}</div>
          <div style={{ color: '#555', fontSize: 9 }}>{playerCount} player{playerCount > 1 ? 's' : ''} online</div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// BURGER MENU MOBILE
// ─────────────────────────────────────────

function MobileBurgerMenu({ activeRoomId, onRoomClick }: { activeRoomId: string; onRoomClick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ROOMS = [
    { id: 'genesis-plaza',    label: 'Genesis Plaza',    icon: '🏛️' },
    { id: 'neon-market',      label: 'Neon Market',      icon: '🛒' },
    { id: 'seeker-club',      label: 'Seeker Club',      icon: '🎵' },
    { id: 'gallery-district', label: 'Gallery District', icon: '🎨' },
  ]
  return (
    <>
      <div onClick={() => setOpen(o => !o)} style={{
        position: 'fixed', top: 16, right: 16, width: 44, height: 44,
        background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(97,0,151,0.5)',
        borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, cursor: 'pointer', zIndex: 500, backdropFilter: 'blur(8px)',
        boxShadow: '0 0 20px rgba(97,0,151,0.3)', color: '#B421F3',
      }}>☰</div>
      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,10,20,0.97)',
          zIndex: 3000, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: 'monospace',
        }}>
          <div style={{ color: '#B421F3', fontSize: 14, letterSpacing: 4, marginBottom: 24, textShadow: '0 0 12px #B421F3' }}>
            PUNK CITY
          </div>
          {ROOMS.map(room => (
            <div key={room.id} onClick={() => { onRoomClick(room.id); setOpen(false) }} style={{
              width: 240, height: 64, cursor: 'pointer',
              background: activeRoomId === room.id ? 'rgba(180,33,243,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${activeRoomId === room.id ? '#B421F3' : 'rgba(97,0,151,0.3)'}`,
              borderRadius: 12, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px',
              fontSize: 14, color: activeRoomId === room.id ? '#B421F3' : '#a0a0c0',
              boxShadow: activeRoomId === room.id ? '0 0 12px rgba(180,33,243,0.3)' : 'none',
            }}>
              <span style={{ fontSize: 24 }}>{room.icon}</span>
              {room.label}
            </div>
          ))}
          <div onClick={() => setOpen(false)} style={{
            marginTop: 24, width: 44, height: 44,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(97,0,151,0.4)',
            borderRadius: '50%', color: '#666', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────
// PLAYER SPRITE
// idle  → sprite de la dernière direction
// marche sw → walk_sw.gif animé
// marche autres directions → sprite statique
// ─────────────────────────────────────────

const IDLE_Y_OFFSET = -(128 - 112) * 0.8  // -12.8px — aligne les pieds idle (112px) avec le GIF walk (128px)

async function buildPlayerSprite(world: Container, app: Application): Promise<Graphics> {
  const [walkGif, textureSw, textureSe, textureNw, textureNe] = await Promise.all([
    fetch('/walk_sw.gif').then(r => r.arrayBuffer()).then(b => AnimatedGIF.fromBuffer(b)),
    Assets.load('/sprite_sw.png'),
    Assets.load('/sprite_se.png'),
    Assets.load('/sprite_nw.png'),
    Assets.load('/sprite_ne.png'),
  ])

  walkGif.anchor.set(0.5, 1)
  walkGif.scale.set(0.8)
  walkGif.zIndex = 9999
  walkGif.animationSpeed = 0.80
  walkGif.loop = true
  walkGif.visible = false
  walkGif.stop()
  world.addChild(walkGif)

  const idleSw = new Sprite(textureSw)
  idleSw.anchor.set(0.5, 1)
  idleSw.scale.set(0.8)
  idleSw.zIndex = 9999
  idleSw.visible = true
  world.addChild(idleSw)

  const spritesSe = new Sprite(textureSe)
  spritesSe.anchor.set(0.5, 1)
  spritesSe.scale.set(0.8)
  spritesSe.zIndex = 9999
  spritesSe.visible = false
  world.addChild(spritesSe)

  const spritesNw = new Sprite(textureNw)
  spritesNw.anchor.set(0.5, 1)
  spritesNw.scale.set(0.8)
  spritesNw.zIndex = 9999
  spritesNw.visible = false
  world.addChild(spritesNw)

  const spritesNe = new Sprite(textureNe)
  spritesNe.anchor.set(0.5, 1)
  spritesNe.scale.set(0.8)
  spritesNe.zIndex = 9999
  spritesNe.visible = false
  world.addChild(spritesNe)

  const g = new Graphics()
  g.zIndex = 9998
  world.addChild(g)

  let lastX = 0
  let lastY = 0
  let currentDir = 'sw'

  const hideAll = () => {
    walkGif.visible   = false
    idleSw.visible    = false
    spritesSe.visible = false
    spritesNw.visible = false
    spritesNe.visible = false
  }

  app.ticker.add(() => {
    const dx = g.x - lastX
    const dy = g.y - lastY
    const moving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5

    if (moving) {
      let dir = currentDir
      if (dx > 0 && dy > 0)      dir = 'se'
      else if (dx < 0 && dy < 0) dir = 'nw'
      else if (dx > 0 && dy < 0) dir = 'ne'
      else if (dx < 0 && dy > 0) dir = 'sw'
      else if (dx > 0)            dir = 'se'
      else if (dx < 0)            dir = 'nw'
      else if (dy > 0)            dir = 'sw'
      else if (dy < 0)            dir = 'ne'

      if (dir !== currentDir) {
        currentDir = dir
        ;(g as any)._direction = dir
      }

      hideAll()
      if (currentDir === 'sw') {
        walkGif.visible = true
        if (!walkGif.playing) walkGif.play()
      } else if (currentDir === 'se') {
        spritesSe.visible = true
      } else if (currentDir === 'nw') {
        spritesNw.visible = true
      } else if (currentDir === 'ne') {
        spritesNe.visible = true
      }

    } else {
      if (walkGif.playing) walkGif.stop()
      hideAll()
      if (currentDir === 'sw')      idleSw.visible    = true
      else if (currentDir === 'se') spritesSe.visible = true
      else if (currentDir === 'nw') spritesNw.visible = true
      else if (currentDir === 'ne') spritesNe.visible = true
    }

    walkGif.x   = g.x; walkGif.y   = g.y
    idleSw.x    = g.x; idleSw.y    = g.y + IDLE_Y_OFFSET
    spritesSe.x = g.x; spritesSe.y = g.y
    spritesNw.x = g.x; spritesNw.y = g.y
    spritesNe.x = g.x; spritesNe.y = g.y

    // Tri isométrique — zIndex = Y des pieds, mis à jour chaque frame
    const z = Math.round(g.y)
    walkGif.zIndex   = z
    idleSw.zIndex    = z
    spritesSe.zIndex = z
    spritesNw.zIndex = z
    spritesNe.zIndex = z

    lastX = g.x
    lastY = g.y
  })
  return g
}