/**
 * PUNK CITY — GameCanvas (stable)
 * Séparation claire : PixiJS init → puis hooks gameplay
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container, Graphics, Sprite, Ticker, Assets } from 'pixi.js'
import { AnimatedGIF } from '@pixi/gif'
import { useMovement, isoToScreen, useCameraFollow } from './systems/PunkCity_Movement'
import { useChat, ChatPanel }                         from './systems/PunkCity_Chat'
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

function PlayerPopup({
  player,
  onClose,
}: {
  player: { id: string; username: string }
  onClose: () => void
}) {
  return (
    <div style={{
      position:     'fixed',
      bottom:       24,
      right:        24,
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
          { icon: '👤', label: 'View Profile',    color: '#a0a0c0' },
          { icon: '💬', label: 'Private Message',  color: '#2986DF' },
          { icon: '👥', label: 'Add Friend',       color: '#00ff88' },
          { icon: '🔄', label: 'Trade',            color: '#B421F3' },
        ].map(action => (
          <button
            key={action.label}
            onClick={() => console.log(action.label, player.username)}
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
  const {
    messages, players, connected, myPlayer,
    sendMessage, sendEmote, reportMove, changeRoom,
  } = useChat({
    serverUrl: config.serverUrl,
    username:  config.username,
    avatar:    config.avatar,
    roomId:    config.roomId,
  })

  const onRoomChange = useCallback((roomId: string, spawnX: number, spawnY: number) => {
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
        container._idleSw.x   = newX; container._idleSw.y   = newY
        container._spriteSe.x = newX; container._spriteSe.y = newY
        container._spriteNw.x = newX; container._spriteNw.y = newY
        container._spriteNe.x = newX; container._spriteNe.y = newY

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

  // ── Autres joueurs ───────────────────────
  const otherSprites = useRef<Map<string, any>>(new Map())

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

          // Ajoute le clic sur chaque sprite pour ouvrir le popup
          const playerId   = p.id
          const playerName = p.username
          const onClick = () => onPlayerClickRef.current(playerId, playerName)
          ;[walkGif, idleSw, spriteSe, spriteNw, spriteNe].forEach(s => {
            s.eventMode = 'static'
            s.cursor    = 'pointer'
            s.on('pointerdown', onClick)
          })

          // Stocke tout dans un objet conteneur
          const container = {
            x: 0, y: 0,
            _walkGif: walkGif,
            _idleSw: idleSw,
            _spriteSe: spriteSe,
            _spriteNw: spriteNw,
            _spriteNe: spriteNe,
            _currentDir: 'sw',
            _targetX: 0,
            _targetY: 0,
          }
          otherSprites.current.set(p.id, container)
        })
        return
      }

      const container = otherSprites.current.get(p.id)
      if (!container || !container._walkGif) return

      const tx = (p as any).pixiX ?? isoToScreen(p.gridX, p.gridY).x
      const ty = (p as any).pixiY ?? isoToScreen(p.gridX, p.gridY).y
      container._targetX = tx
      container._targetY = ty

      const dir = (p as any).direction || 'sw'
      // Marque le joueur comme en mouvement — le ticker s'occupe de stopper l'anim après inactivité
      container._lastMoveTime = Date.now()
      container._currentDir   = dir

      // Met à jour direction immédiatement
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

  // ── Popup joueur au clic ─────────────────
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; username: string } | null>(null)
  // Ref pour accéder à setSelectedPlayer depuis les callbacks PixiJS
  const onPlayerClickRef = useRef<(id: string, username: string) => void>(() => {})
  useEffect(() => {
    onPlayerClickRef.current = (id: string, username: string) => setSelectedPlayer({ id, username })
  }, [])

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
      <Minimap activeRoomId={activeRoomId} onRoomClick={loadRoom} />
      <RoomInfo room={activeRoom} />
      <ChatPanel
        messages={messages}
        players={players}
        myPlayerId={myPlayer?.id ?? ''}
        connected={connected}
        onSend={sendMessage}
        onEmote={sendEmote}
        onChangeRoom={loadRoom}
      />

      {/* Messages flottants pour chaque joueur */}
      {players.map(p => {
        const isMe    = p.id === myPlayer?.id
        const px      = isMe ? myPixiPos.x : ((p as any).pixiX ?? isoToScreen(p.gridX, p.gridY).x)
        const py      = isMe ? myPixiPos.y : ((p as any).pixiY ?? isoToScreen(p.gridX, p.gridY).y)
        const msgs    = floatingMsgs.get(p.id) ?? []

        return (
          <FloatingMessages
            key={p.id}
            messages={msgs}
            pixiX={px}
            pixiY={py}   // ← position pied du perso, offset géré dans FloatingMessages
            world={world}
          />
        )
      })}

      {/* Popup joueur en bas-droite au clic */}
      {selectedPlayer && (
        <PlayerPopup
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <RoomTransitionOverlay transitioning={transitioning} />
      <HUD connected={connected} roomName={activeRoom?.name ?? ''} playerCount={players.length} username={config.username} />
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
// HUD
// ─────────────────────────────────────────

function HUD({ connected, roomName, playerCount, username }: {
  connected: boolean; roomName: string; playerCount: number; username: string
}) {
  return (
    <div style={{
      position: 'fixed', top: 16, left: 16,
      display: 'flex', flexDirection: 'column', gap: 6,
      zIndex: 500, fontFamily: 'monospace',
    }}>
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
      </div>
      <div style={{
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
// PLAYER SPRITE
// idle  → sprite de la dernière direction
// marche sw → walk_sw.gif animé
// marche autres directions → sprite statique
// ─────────────────────────────────────────

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
    idleSw.x    = g.x; idleSw.y    = g.y
    spritesSe.x = g.x; spritesSe.y = g.y
    spritesNw.x = g.x; spritesNw.y = g.y
    spritesNe.x = g.x; spritesNe.y = g.y

    lastX = g.x
    lastY = g.y
  })
  return g
}