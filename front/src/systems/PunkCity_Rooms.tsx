/**
 * PUNK CITY — Système de Rooms / Districts
 * Stack: React + PixiJS + TypeScript
 *
 * Ce fichier contient :
 * 1. ROOMS_CONFIG       → Configuration de chaque district
 * 2. useRoomSystem      → Hook gestion des rooms (chargement, transition)
 * 3. RoomRenderer       → Rendu PixiJS de la room active
 * 4. RoomTransition     → Animation de transition entre districts
 * 5. RoomUI             → Interface minimap + bouton changement district
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container, Graphics, Sprite, Text, TextStyle, Assets, Texture } from 'pixi.js'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface TileData {
  x:        number
  y:        number
  type:     'floor' | 'wall' | 'door' | 'decoration' | 'blocked'
  variant?: number   // variante visuelle
}

interface DoorData {
  x:         number
  y:         number
  targetRoom: string
  targetX:   number
  targetY:   number
  label:     string
}

interface RoomConfig {
  id:          string
  name:        string
  description: string
  cols:        number
  rows:        number
  theme:       RoomTheme
  doors:       DoorData[]
  tiles:       TileData[]   // tiles spéciales (murs, décos) — le reste est floor
  bgMusic?:    string
  ambientColor:  number
  floorTexture?: string   // chemin vers une texture PNG pour les tiles floor
}

interface RoomTheme {
  floorA:     number   // couleur tile paire
  floorB:     number   // couleur tile impaire
  wallLeft:   number
  wallRight:  number
  accent:     number   // néon
  depth:      number   // hauteur face latérale
}

// ─────────────────────────────────────────
// CONFIG DES DISTRICTS
// ─────────────────────────────────────────

const TILE_W = 64
const TILE_H = 32

export const ROOMS_CONFIG: Record<string, RoomConfig> = {

  'genesis-plaza': {
    id:          'genesis-plaza',
    name:        'Genesis Plaza',
    description: 'The central plaza of Punk City. Everything starts here.',
    cols:        24,
    rows:        24,
    ambientColor:  0x0d0d1a,
    floorTexture:  '/tiles_genesis.png',
    theme: {
      floorA:    0x1a1a2e,
      floorB:    0x16213e,
      wallLeft:  0x0f3460,
      wallRight: 0x0a2647,
      accent:    0xB421F3,
      depth:     10,
    },
    doors: [
      { x: 23, y: 12, targetRoom: 'neon-market',      targetX: 1,  targetY: 12, label: '→ Neon Market'      },
      { x: 12, y: 0,  targetRoom: 'seeker-club',       targetX: 12, targetY: 22, label: '↑ Seeker Club'      },
      { x: 0,  y: 12, targetRoom: 'gallery-district',  targetX: 22, targetY: 12, label: '← Gallery District' },
    ],
    tiles: [
      // Gallery District — footprint col 13-15, row 1-3
      { x: 13, y: 1, type: 'blocked' as const }, { x: 14, y: 1, type: 'blocked' as const }, { x: 15, y: 1, type: 'blocked' as const },
      { x: 13, y: 2, type: 'blocked' as const }, { x: 14, y: 2, type: 'blocked' as const }, { x: 15, y: 2, type: 'blocked' as const },
      { x: 13, y: 3, type: 'blocked' as const }, { x: 14, y: 3, type: 'blocked' as const }, { x: 15, y: 3, type: 'blocked' as const },
      // Fontaine centrale
      { x: 11, y: 11, type: 'decoration', variant: 1 },
      { x: 12, y: 11, type: 'decoration', variant: 1 },
      { x: 11, y: 12, type: 'decoration', variant: 1 },
      { x: 12, y: 12, type: 'decoration', variant: 1 },
      // Murs périphériques
      ...Array.from({ length: 24 }, (_, i) => ({ x: i, y: 0,  type: 'wall' as const })),
      ...Array.from({ length: 24 }, (_, i) => ({ x: i, y: 23, type: 'wall' as const })),
      ...Array.from({ length: 24 }, (_, i) => ({ x: 0,  y: i, type: 'wall' as const })),
      ...Array.from({ length: 24 }, (_, i) => ({ x: 23, y: i, type: 'wall' as const })),
    ],
  },

  'neon-market': {
    id:          'neon-market',
    name:        'Neon Market',
    description: 'The electric market of Punk City. Items, trades, deals.',
    cols:        20,
    rows:        16,
    ambientColor: 0x0a0a14,
    theme: {
      floorA:    0x0d1117,
      floorB:    0x111927,
      wallLeft:  0x1a0a2e,
      wallRight: 0x120820,
      accent:    0x2986DF,
      depth:     12,
    },
    doors: [
      { x: 0,  y: 8, targetRoom: 'genesis-plaza', targetX: 22, targetY: 12, label: '← Genesis Plaza' },
      { x: 19, y: 8, targetRoom: 'seeker-club',    targetX: 1,  targetY: 8,  label: '→ Seeker Club'   },
    ],
    tiles: [
      // Stands de marché
      { x: 4,  y: 4,  type: 'decoration', variant: 2 },
      { x: 8,  y: 4,  type: 'decoration', variant: 2 },
      { x: 12, y: 4,  type: 'decoration', variant: 2 },
      { x: 4,  y: 10, type: 'decoration', variant: 2 },
      { x: 8,  y: 10, type: 'decoration', variant: 2 },
      { x: 12, y: 10, type: 'decoration', variant: 2 },
      // Murs
      ...Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0,  type: 'wall' as const })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: i, y: 15, type: 'wall' as const })),
      ...Array.from({ length: 16 }, (_, i) => ({ x: 0,  y: i, type: 'wall' as const })),
      ...Array.from({ length: 16 }, (_, i) => ({ x: 19, y: i, type: 'wall' as const })),
    ],
  },

  'seeker-club': {
    id:          'seeker-club',
    name:        'Seeker Club',
    description: 'The underground club of Punk City. Music, vibes, community.',
    cols:        18,
    rows:        18,
    ambientColor: 0x080010,
    theme: {
      floorA:    0x0d0520,
      floorB:    0x110828,
      wallLeft:  0x200a40,
      wallRight: 0x180830,
      accent:    0xFF00FF,
      depth:     14,
    },
    doors: [
      { x: 9, y: 17, targetRoom: 'genesis-plaza', targetX: 12, targetY: 1,  label: '↓ Genesis Plaza' },
      { x: 0, y: 9,  targetRoom: 'neon-market',   targetX: 18, targetY: 8,  label: '← Neon Market'   },
    ],
    tiles: [
      // Piste de danse centrale
      { x: 7,  y: 7,  type: 'decoration', variant: 3 },
      { x: 8,  y: 7,  type: 'decoration', variant: 3 },
      { x: 9,  y: 7,  type: 'decoration', variant: 3 },
      { x: 10, y: 7,  type: 'decoration', variant: 3 },
      { x: 7,  y: 8,  type: 'decoration', variant: 3 },
      { x: 8,  y: 8,  type: 'decoration', variant: 3 },
      { x: 9,  y: 8,  type: 'decoration', variant: 3 },
      { x: 10, y: 8,  type: 'decoration', variant: 3 },
      // DJ booth
      { x: 8,  y: 3,  type: 'decoration', variant: 4 },
      { x: 9,  y: 3,  type: 'decoration', variant: 4 },
      // Murs
      ...Array.from({ length: 18 }, (_, i) => ({ x: i, y: 0,  type: 'wall' as const })),
      ...Array.from({ length: 18 }, (_, i) => ({ x: i, y: 17, type: 'wall' as const })),
      ...Array.from({ length: 18 }, (_, i) => ({ x: 0,  y: i, type: 'wall' as const })),
      ...Array.from({ length: 18 }, (_, i) => ({ x: 17, y: i, type: 'wall' as const })),
    ],
  },

  'gallery-district': {
    id:          'gallery-district',
    name:        'Gallery District',
    description: 'SeekerPunks NFTs on display. Art, culture, history.',
    cols:        22,
    rows:        20,
    ambientColor: 0x0a0f0a,
    theme: {
      floorA:    0x0a120a,
      floorB:    0x0d160d,
      wallLeft:  0x0a2010,
      wallRight: 0x081808,
      accent:    0x00FF88,
      depth:     10,
    },
    doors: [
      { x: 21, y: 10, targetRoom: 'genesis-plaza', targetX: 1, targetY: 12, label: '→ Genesis Plaza' },
    ],
    tiles: [
      // Cadres NFT sur les murs
      { x: 3,  y: 2,  type: 'decoration', variant: 5 },
      { x: 7,  y: 2,  type: 'decoration', variant: 5 },
      { x: 11, y: 2,  type: 'decoration', variant: 5 },
      { x: 15, y: 2,  type: 'decoration', variant: 5 },
      { x: 3,  y: 17, type: 'decoration', variant: 5 },
      { x: 7,  y: 17, type: 'decoration', variant: 5 },
      { x: 11, y: 17, type: 'decoration', variant: 5 },
      { x: 15, y: 17, type: 'decoration', variant: 5 },
      // Murs
      ...Array.from({ length: 22 }, (_, i) => ({ x: i, y: 0,  type: 'wall' as const })),
      ...Array.from({ length: 22 }, (_, i) => ({ x: i, y: 19, type: 'wall' as const })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 0,  y: i, type: 'wall' as const })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 21, y: i, type: 'wall' as const })),
    ],
  },
}

// ─────────────────────────────────────────
// CONFIG APPARTEMENTS (générée dynamiquement)
// ─────────────────────────────────────────

function getApartmentConfig(roomId: string): RoomConfig | undefined {
  if (!roomId.startsWith('apartment_')) return undefined
  const username = roomId.slice('apartment_'.length)
  return {
    id:          roomId,
    name:        `${username}'s Apartment`,
    description: 'A private apartment. Home sweet home.',
    cols:        16,
    rows:        16,
    ambientColor: 0x0a0a18,
    theme: {
      floorA:    0x1a1a2e,
      floorB:    0x16213e,
      wallLeft:  0x0f3460,
      wallRight: 0x0a2647,
      accent:    0xB421F3,
      depth:     10,
    },
    doors: [
      { x: 0, y: 8, targetRoom: 'genesis-plaza', targetX: 1, targetY: 12, label: '← Leave' },
    ],
    tiles: [
      ...Array.from({ length: 16 }, (_, i) => ({ x: i, y: 0,  type: 'wall' as const })),
      ...Array.from({ length: 16 }, (_, i) => ({ x: i, y: 15, type: 'wall' as const })),
      ...Array.from({ length: 16 }, (_, i) => ({ x: 0,  y: i, type: 'wall' as const })),
      ...Array.from({ length: 16 }, (_, i) => ({ x: 15, y: i, type: 'wall' as const })),
    ],
  }
}

// ─────────────────────────────────────────
// UTILITAIRES ISO
// ─────────────────────────────────────────

function isoToScreen(gx: number, gy: number) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  }
}

function getTileKey(x: number, y: number) { return `${x},${y}` }

function buildTileMap(tiles: TileData[]): Map<string, TileData> {
  const map = new Map<string, TileData>()
  tiles.forEach(t => map.set(getTileKey(t.x, t.y), t))
  return map
}

function buildBlockedSet(tiles: TileData[]): Set<string> {
  const blocked = new Set<string>()
  tiles.forEach(t => {
    if (t.type === 'wall' || t.type === 'blocked') {
      blocked.add(getTileKey(t.x, t.y))
    }
  })
  return blocked
}

// ─────────────────────────────────────────
// HOOK — SYSTÈME DE ROOMS
// ─────────────────────────────────────────

export function useRoomSystem(
  app: Application | null,
  world: Container | null,
  onRoomChange?: (roomId: string, spawnX: number, spawnY: number) => void
) {
  const [activeRoomId,  setActiveRoomId]  = useState('genesis-plaza')
  const [transitioning, setTransitioning] = useState(false)
  const [blockedTiles,  setBlockedTiles]  = useState<Set<string>>(new Set())
  const roomContainerRef = useRef<Container | null>(null)

  // ── Charge une room ──────────────────────
  const loadRoom = useCallback(async (roomId: string, spawnX?: number, spawnY?: number) => {
    if (!app || !world || transitioning) return

    const config = ROOMS_CONFIG[roomId] ?? getApartmentConfig(roomId)
    if (!config) { console.error(`[Room] Room inconnue : ${roomId}`); return }

    setTransitioning(true)

    // Animation fade out
    await fadeWorld(world, 'out')

    // Détruit l'ancienne room
    if (roomContainerRef.current) {
      world.removeChild(roomContainerRef.current)
      roomContainerRef.current.destroy({ children: true })
    }

    // Crée la nouvelle room
    const roomContainer = new Container()
    roomContainer.sortableChildren = true
    world.addChild(roomContainer)
    roomContainerRef.current = roomContainer

    // Charge la texture de sol si définie
    let floorTexture: Texture | null = null
    if (config.floorTexture) {
      floorTexture = await Assets.load(config.floorTexture)
      floorTexture.source.scaleMode = 'nearest'
    }

    // Render tiles
    renderRoom(roomContainer, config, floorTexture)

    // Mise à jour des tiles bloquées pour le pathfinding
    setBlockedTiles(buildBlockedSet(config.tiles))

    // Couleur de fond
    app.renderer.background.color = config.ambientColor

    // Animation fade in
    await fadeWorld(world, 'in')

    setActiveRoomId(roomId)
    setTransitioning(false)

    // Callback position spawn
    const sx = spawnX ?? Math.floor(config.cols / 2)
    const sy = spawnY ?? Math.floor(config.rows / 2)
    onRoomChange?.(roomId, sx, sy)

    console.log(`[Room] ${config.name} chargée — spawn (${sx}, ${sy})`)
  }, [app, world, transitioning, onRoomChange])

  // ── Check portes (appelé à chaque déplacement) ──
  const checkDoors = useCallback((gridX: number, gridY: number) => {
    const config = ROOMS_CONFIG[activeRoomId] ?? getApartmentConfig(activeRoomId)
    if (!config) return

    const door = config.doors.find(d => d.x === gridX && d.y === gridY)
    if (door) {
      loadRoom(door.targetRoom, door.targetX, door.targetY)
    }
  }, [activeRoomId, loadRoom])

  // ── Charge la room initiale ──────────────
  useEffect(() => {
    if (app && world) loadRoom('genesis-plaza')
  }, [app, world])

  return {
    activeRoomId,
    activeRoom:   ROOMS_CONFIG[activeRoomId] ?? getApartmentConfig(activeRoomId),
    transitioning,
    blockedTiles,
    loadRoom,
    checkDoors,
  }
}

// ─────────────────────────────────────────
// RENDU D'UNE ROOM
// ─────────────────────────────────────────

function renderRoom(container: Container, config: RoomConfig, floorTexture: Texture | null = null) {
  const tileMap = buildTileMap(config.tiles)
  const theme   = config.theme

  for (let gy = 0; gy < config.rows; gy++) {
    for (let gx = 0; gx < config.cols; gx++) {
      const key      = getTileKey(gx, gy)
      const tileData = tileMap.get(key)
      const type     = tileData?.type ?? 'floor'

      let tile: Container

      switch (type) {
        case 'wall':
          tile = drawWallTile(gx, gy, theme)
          break
        case 'door':
          tile = drawDoorTile(gx, gy, theme)
          break
        case 'decoration':
          tile = drawDecoTile(gx, gy, theme, tileData?.variant ?? 0)
          break
        default:
          tile = floorTexture
            ? drawFloorSprite(gx, gy, theme, floorTexture)
            : drawFloorTile(gx, gy, theme, (gx + gy) % 2 === 0)
      }

      // Depth sort : les tiles du bas passent devant
      tile.zIndex = gy * config.cols + gx
      container.addChild(tile)
    }
  }

  // Affiche les labels des portes
  config.doors.forEach(door => {
    const label = drawDoorLabel(door, theme)
    label.zIndex = door.y * config.cols + door.x + 1
    container.addChild(label)
  })
}

// ─────────────────────────────────────────
// DRAWERS — TILES
// ─────────────────────────────────────────

function drawFloorSprite(gx: number, gy: number, theme: RoomTheme, texture: Texture): Container {
  const c = new Container()
  const { x, y } = isoToScreen(gx, gy)
  const d = theme.depth

  // Face top — sprite forcé à TILE_W×TILE_H pour couvrir exactement le diamant
  const sprite = new Sprite(texture)
  sprite.width  = TILE_W
  sprite.height = TILE_H
  sprite.x = x - TILE_W / 2
  sprite.y = y
  c.addChild(sprite)

  // Faces latérales (cube depth)
  const sides = new Graphics()
  sides.poly([x - TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x, y + TILE_H + d, x - TILE_W / 2, y + TILE_H / 2 + d])
  sides.fill(theme.wallLeft)
  sides.poly([x + TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x, y + TILE_H + d, x + TILE_W / 2, y + TILE_H / 2 + d])
  sides.fill(theme.wallRight)
  c.addChild(sides)

  return c
}

function drawFloorTile(gx: number, gy: number, theme: RoomTheme, dark: boolean): Graphics {
  const g = new Graphics()
  const { x, y } = isoToScreen(gx, gy)
  const d = theme.depth

  // Face top
  g.poly([
    x,              y,
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x - TILE_W / 2, y + TILE_H / 2,
  ])
  g.fill(dark ? theme.floorA : theme.floorB)
  g.stroke({ color: theme.accent, width: 0.4, alpha: 0.2 })

  // Face gauche
  g.poly([
    x - TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x,              y + TILE_H + d,
    x - TILE_W / 2, y + TILE_H / 2 + d,
  ])
  g.fill(theme.wallLeft)

  // Face droite
  g.poly([
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x,              y + TILE_H + d,
    x + TILE_W / 2, y + TILE_H / 2 + d,
  ])
  g.fill(theme.wallRight)

  return g
}

function drawWallTile(gx: number, gy: number, theme: RoomTheme): Graphics {
  const g = new Graphics()
  const { x, y } = isoToScreen(gx, gy)
  const wallHeight = 32
  const d = theme.depth

  // Base floor
  g.poly([
    x,              y,
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x - TILE_W / 2, y + TILE_H / 2,
  ])
  g.fill(theme.floorA)

  // Mur gauche (haut)
  g.poly([
    x - TILE_W / 2, y + TILE_H / 2 - wallHeight,
    x,              y - wallHeight,
    x,              y,
    x - TILE_W / 2, y + TILE_H / 2,
  ])
  g.fill(theme.wallLeft)
  g.stroke({ color: theme.accent, width: 0.5, alpha: 0.3 })

  // Mur droit (haut)
  g.poly([
    x + TILE_W / 2, y + TILE_H / 2 - wallHeight,
    x,              y - wallHeight,
    x,              y,
    x + TILE_W / 2, y + TILE_H / 2,
  ])
  g.fill(theme.wallRight)
  g.stroke({ color: theme.accent, width: 0.5, alpha: 0.3 })

  // Crête du mur
  g.poly([
    x,              y - wallHeight,
    x + TILE_W / 2, y + TILE_H / 2 - wallHeight,
    x,              y + TILE_H - wallHeight,
    x - TILE_W / 2, y + TILE_H / 2 - wallHeight,
  ])
  g.fill(theme.floorB)
  g.stroke({ color: theme.accent, width: 1, alpha: 0.6 })

  return g
}

function drawDoorTile(gx: number, gy: number, theme: RoomTheme): Graphics {
  const g = drawFloorTile(gx, gy, theme, true)
  const { x, y } = isoToScreen(gx, gy)

  // Surbrillance porte
  g.poly([
    x,              y,
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x - TILE_W / 2, y + TILE_H / 2,
  ])
  g.fill({ color: theme.accent, alpha: 0.15 })
  g.stroke({ color: theme.accent, width: 1.5, alpha: 0.8 })

  return g
}

function drawDecoTile(gx: number, gy: number, theme: RoomTheme, variant: number): Graphics {
  const g = drawFloorTile(gx, gy, theme, false)
  const { x, y } = isoToScreen(gx, gy)

  switch (variant) {
    case 1: // Fontaine (Genesis Plaza)
      g.circle(x, y + TILE_H / 2, 12)
      g.fill({ color: 0x2986DF, alpha: 0.6 })
      g.stroke({ color: 0x2986DF, width: 1 })
      break
    case 2: // Stand de marché (Neon Market)
      g.rect(x - 12, y, 24, 12)
      g.fill({ color: theme.accent, alpha: 0.3 })
      g.stroke({ color: theme.accent, width: 1 })
      break
    case 3: // Piste de danse (Seeker Club) — couleurs aléatoires
      const danceColors = [0xFF00FF, 0x00FFFF, 0xFFFF00, 0xFF6600]
      const c = danceColors[Math.floor(Math.random() * danceColors.length)]
      g.poly([
        x,              y,
        x + TILE_W / 2, y + TILE_H / 2,
        x,              y + TILE_H,
        x - TILE_W / 2, y + TILE_H / 2,
      ])
      g.fill({ color: c, alpha: 0.2 })
      g.stroke({ color: c, width: 1, alpha: 0.8 })
      break
    case 4: // DJ Booth (Seeker Club)
      g.rect(x - 16, y - 8, 32, 16)
      g.fill({ color: 0x1a0a2e, alpha: 0.9 })
      g.stroke({ color: 0xFF00FF, width: 2 })
      break
    case 5: // Cadre NFT (Gallery District)
      g.rect(x - 10, y - 20, 20, 24)
      g.fill({ color: 0x0a120a, alpha: 0.9 })
      g.stroke({ color: theme.accent, width: 2 })
      // Pseudo pixel art dans le cadre
      g.rect(x - 6, y - 16, 12, 16)
      g.fill({ color: theme.accent, alpha: 0.3 })
      break
  }

  return g
}

function drawDoorLabel(door: DoorData, theme: RoomTheme): Graphics {
  const g  = new Graphics()
  const { x, y } = isoToScreen(door.x, door.y)

  // Flèche néon
  g.circle(x, y, 6)
  g.fill({ color: theme.accent, alpha: 0.8 })
  g.stroke({ color: theme.accent, width: 1 })

  // Pulse animation
  let pulse = 0
  const ticker = setInterval(() => {
    pulse += 0.1
    g.alpha = 0.6 + Math.sin(pulse) * 0.4
  }, 50)

  // Cleanup après 30s (la room sera détruite avant)
  setTimeout(() => clearInterval(ticker), 30000)

  return g
}

// ─────────────────────────────────────────
// ANIMATION FADE
// ─────────────────────────────────────────

function fadeWorld(world: Container, direction: 'in' | 'out'): Promise<void> {
  return new Promise(resolve => {
    const duration = 300    // ms
    const start    = Date.now()
    const fromAlpha = direction === 'out' ? 1 : 0
    const toAlpha   = direction === 'out' ? 0 : 1

    const tick = () => {
      const elapsed  = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      world.alpha    = fromAlpha + (toAlpha - fromAlpha) * progress

      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        world.alpha = toAlpha
        resolve()
      }
    }
    requestAnimationFrame(tick)
  })
}

// ─────────────────────────────────────────
// COMPOSANT — MINIMAP
// ─────────────────────────────────────────

interface MinimapProps {
  activeRoomId: string
  onRoomClick:  (roomId: string) => void
}

export function Minimap({ activeRoomId, onRoomClick }: MinimapProps) {
  // Layout de la minimap (position relative des districts)
  const MAP_LAYOUT = [
    { id: 'seeker-club',      col: 1, row: 0, label: 'Club'     },
    { id: 'gallery-district', col: 0, row: 1, label: 'Gallery'  },
    { id: 'genesis-plaza',    col: 1, row: 1, label: 'Plaza'    },
    { id: 'neon-market',      col: 2, row: 1, label: 'Market'   },
  ]

  return (
    <div style={{
      position:     'fixed',
      top:          16,
      right:        16,
      background:   'rgba(10,10,20,0.9)',
      border:       '1px solid rgba(97,0,151,0.5)',
      borderRadius: 12,
      padding:      12,
      zIndex:       500,
      backdropFilter: 'blur(8px)',
      boxShadow:    '0 0 20px rgba(97,0,151,0.3)',
    }}>
      {/* Titre */}
      <div style={{
        color:      '#B421F3',
        fontSize:   10,
        fontFamily: 'monospace',
        marginBottom: 8,
        textAlign:  'center',
        letterSpacing: 2,
        textShadow: '0 0 8px #B421F3',
      }}>
        PUNK CITY
      </div>

      {/* Grille de la map */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(3, 52px)',
        gridTemplateRows:    'repeat(2, 52px)',
        gap:                 4,
      }}>
        {MAP_LAYOUT.map(room => {
          const isActive = room.id === activeRoomId
          const config   = ROOMS_CONFIG[room.id]

          return (
            <div
              key={room.id}
              onClick={() => onRoomClick(room.id)}
              style={{
                gridColumn:   room.col + 1,
                gridRow:      room.row + 1,
                background:   isActive
                  ? `rgba(180,33,243,0.25)`
                  : 'rgba(255,255,255,0.04)',
                border:       `1px solid ${isActive ? '#B421F3' : 'rgba(97,0,151,0.3)'}`,
                borderRadius: 6,
                cursor:       'pointer',
                display:      'flex',
                flexDirection:'column',
                alignItems:   'center',
                justifyContent: 'center',
                gap:          2,
                transition:   'all 0.2s',
                boxShadow:    isActive ? '0 0 12px rgba(180,33,243,0.4)' : 'none',
              }}
            >
              {/* Icône district */}
              <div style={{ fontSize: 16 }}>
                {room.id === 'genesis-plaza'    ? '🏛️' :
                 room.id === 'neon-market'      ? '🛒' :
                 room.id === 'seeker-club'      ? '🎵' : '🎨'}
              </div>
              <div style={{
                fontSize:   8,
                fontFamily: 'monospace',
                color:      isActive ? '#B421F3' : '#666',
                textAlign:  'center',
                lineHeight: 1.2,
              }}>
                {room.label}
              </div>
              {/* Indicateur joueurs (placeholder) */}
              {isActive && (
                <div style={{
                  width:        6,
                  height:       6,
                  borderRadius: '50%',
                  background:   '#B421F3',
                  boxShadow:    '0 0 4px #B421F3',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Nom de la room active */}
      <div style={{
        marginTop:  8,
        textAlign:  'center',
        fontSize:   9,
        fontFamily: 'monospace',
        color:      '#666',
      }}>
        {ROOMS_CONFIG[activeRoomId]?.name}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — TRANSITION OVERLAY
// ─────────────────────────────────────────

export function RoomTransitionOverlay({ transitioning }: { transitioning: boolean }) {
  if (!transitioning) return null
  return (
    <div style={{
      position:   'fixed',
      inset:      0,
      background: 'rgba(13,13,26,0.7)',
      zIndex:     999,
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)',
      animation:  'fadeIn 0.2s ease',
    }}>
      <div style={{
        color:      '#B421F3',
        fontSize:   14,
        fontFamily: 'monospace',
        letterSpacing: 4,
        textShadow: '0 0 20px #B421F3',
        animation:  'pulse 1s infinite',
      }}>
        ENTERING PUNK CITY...
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// COMPOSANT — ROOM INFO (haut centre)
// ─────────────────────────────────────────

export function RoomInfo({ room }: { room: RoomConfig | undefined }) {
  if (!room) return null
  return (
    <div style={{
      position:   'fixed',
      top:        16,
      left:       '50%',
      transform:  'translateX(-50%)',
      background: 'rgba(10,10,20,0.85)',
      border:     '1px solid rgba(97,0,151,0.4)',
      borderRadius: 8,
      padding:    '6px 16px',
      zIndex:     500,
      fontFamily: 'monospace',
      textAlign:  'center',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ color: '#B421F3', fontSize: 13, fontWeight: 'bold', textShadow: '0 0 8px #B421F3' }}>
        {room.name}
      </div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
        {room.description}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// EXPORT GLOBAL — INTÉGRATION DANS GAME
// ─────────────────────────────────────────

/**
 * Exemple d'utilisation dans ton GameCanvas :
 *
 * const { activeRoom, blockedTiles, loadRoom, checkDoors } = useRoomSystem(
 *   appRef.current,
 *   worldRef.current,
 *   (roomId, spawnX, spawnY) => {
 *     // Met à jour la position du joueur au spawn
 *     player.current.gridX = spawnX
 *     player.current.gridY = spawnY
 *   }
 * )
 *
 * // Dans ton hook useMovement, quand le joueur arrive sur une tile :
 * checkDoors(player.current.gridX, player.current.gridY)
 *
 * // Rendu UI :
 * <Minimap activeRoomId={activeRoom?.id} onRoomClick={loadRoom} />
 * <RoomInfo room={activeRoom} />
 * <RoomTransitionOverlay transitioning={transitioning} />
 */