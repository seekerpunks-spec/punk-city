/**
 * Bulle pseudo au survol — suit le sprite Pixi (autres joueurs).
 */
import { useEffect, useState, type RefObject } from 'react'
import type { Container } from 'pixi.js'

export interface PlayerNameTooltipProps {
  /** Joueur survolé (autres joueurs uniquement) ; null = masqué */
  playerId:   string | null
  username:   string
  world:      Container
  spritesRef: RefObject<Map<string, any>>
}

export function PlayerNameTooltip({ playerId, username, world, spritesRef }: PlayerNameTooltipProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!playerId) {
      setReady(false)
      return
    }
    let raf = 0
    const tick = () => {
      const container = spritesRef.current?.get(playerId)
      const gif = container?._walkGif
      if (gif) {
        const zoom = world.scale.x
        setPos({
          x: world.x + gif.x * zoom,
          y: world.y + gif.y * zoom - 92 * zoom,
        })
        setReady(true)
      } else {
        setReady(false)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      setReady(false)
    }
  }, [playerId, world, spritesRef])

  if (!playerId || !username || !ready) return null

  return (
    <div
      style={{
        position:       'absolute',
        left:           pos.x,
        top:            pos.y,
        transform:      'translate(-50%, -100%)',
        pointerEvents:  'none',
        zIndex:         1002,
      }}
    >
      <div
        style={{
          background:    'rgba(13, 13, 26, 0.92)',
          border:        '1px solid #B421F3',
          borderRadius:  10,
          padding:       '5px 12px',
          fontSize:      12,
          fontWeight:    'bold',
          color:         '#e8d4ff',
          fontFamily:    'monospace',
          textAlign:     'center',
          whiteSpace:    'nowrap',
          maxWidth:      220,
          overflow:      'hidden',
          textOverflow:  'ellipsis',
          boxShadow:     '0 0 14px rgba(180, 33, 243, 0.35)',
          textShadow:    '0 0 8px rgba(180, 33, 243, 0.5)',
        }}
      >
        {username}
      </div>
      <div
        style={{
          width:        0,
          height:       0,
          marginLeft:   '50%',
          transform:    'translateX(-50%)',
          borderLeft:   '7px solid transparent',
          borderRight:  '7px solid transparent',
          borderTop:    '7px solid #B421F3',
        }}
      />
    </div>
  )
}
