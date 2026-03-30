/**
 * PUNK CITY — Système de Déplacement au Clic
 * Stack: React + PixiJS + TypeScript
 *
 * Ce fichier contient :
 * 1. findPath          → Pathfinding A* simple sur grille iso
 * 2. useMovement       → Hook déplacement joueur (clic sur tile)
 * 3. useCameraSystem   → Caméra qui suit le joueur
 * 4. GameCanvas        → Composant React principal
 */

import { useEffect, useRef, useCallback } from 'react'
import { Application, Container, Graphics, Sprite, Ticker } from 'pixi.js'

// ─────────────────────────────────────────
// CONSTANTES ISO
// ─────────────────────────────────────────

const TILE_W = 64
const TILE_H = 32
const TILE_DEPTH = 8        // hauteur des faces latérales
const WALK_SPEED = 2.5      // pixels par frame
const GRID_COLS = 24
const GRID_ROWS = 24

// Marge en pixels avant que la caméra commence à suivre le joueur
// Si le joueur est dans cette zone centrale, la caméra ne bouge pas
const FOLLOW_MARGIN = 150

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface GridPos  { x: number; y: number }
interface PixelPos { x: number; y: number }

interface PlayerState {
  gridX:  number    // position grille actuelle
  gridY:  number
  pixiX:  number    // position pixel actuelle (interpolée)
  pixiY:  number
  path:   GridPos[] // chemin restant à parcourir
  moving: boolean
}

// ─────────────────────────────────────────
// UTILITAIRES ISO
// ─────────────────────────────────────────

export function isoToScreen(gridX: number, gridY: number): PixelPos {
  return {
    x: (gridX - gridY) * (TILE_W / 2),
    y: (gridX + gridY) * (TILE_H / 2),
  }
}

export function screenToIso(screenX: number, screenY: number): GridPos {
  // Ajuste pour le centre de la tile isométrique
  const adjustedY = screenY - TILE_H / 2
  return {
    x: Math.round((screenX / (TILE_W / 2) + adjustedY / (TILE_H / 2)) / 2),
    y: Math.round((adjustedY / (TILE_H / 2) - screenX / (TILE_W / 2)) / 2),
  }
}

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS
}

// Point pied du personnage : bas du losange de la tile (y + TILE_H)
// anchor(0.5, 1) → le bas du sprite se pose exactement sur le sol iso
function tileCenterPixel(gridX: number, gridY: number): PixelPos {
  const { x, y } = isoToScreen(gridX, gridY)
  return { x, y: y + TILE_H }
}

// ─────────────────────────────────────────
// PATHFINDING A*
// ─────────────────────────────────────────

interface ANode extends GridPos {
  g: number   // coût depuis le départ
  h: number   // heuristique vers la cible
  f: number   // g + h
  parent: ANode | null
}

function heuristic(a: GridPos, b: GridPos): number {
  // Distance de Manhattan (adapté iso)
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/**
 * findPath — A* sur grille isométrique
 * Retourne un tableau de GridPos du départ jusqu'à la cible
 * (départ exclu, cible incluse)
 */
export function findPath(
  start: GridPos,
  end: GridPos,
  blocked: Set<string> = new Set()
): GridPos[] {
  // Cas trivial
  if (start.x === end.x && start.y === end.y) return []

  const key = (p: GridPos) => `${p.x},${p.y}`
  const open:   Map<string, ANode> = new Map()
  const closed: Set<string>        = new Set()

  const startNode: ANode = {
    x: start.x, y: start.y,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  }
  open.set(key(startNode), startNode)

  // 4 directions (ou 8 avec les diagonales)
  const neighbors = [
    { x: 0,  y: -1 },
    { x: 0,  y:  1 },
    { x: -1, y:  0 },
    { x:  1, y:  0 },
    // Diagonales (optionnel — décommenter pour mouvement en 8 directions)
    // { x: -1, y: -1 }, { x: 1, y: -1 },
    // { x: -1, y:  1 }, { x: 1, y:  1 },
  ]

  let iterations = 0
  const MAX_ITER = 400   // sécurité anti-boucle infinie

  while (open.size > 0 && iterations < MAX_ITER) {
    iterations++

    // Trouve le nœud avec le plus petit f
    let current: ANode | null = null
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node
    }
    if (!current) break

    // Arrivé à destination
    if (current.x === end.x && current.y === end.y) {
      const path: GridPos[] = []
      let n: ANode | null = current
      while (n) {
        path.unshift({ x: n.x, y: n.y })
        n = n.parent
      }
      return path.slice(1) // retire le point de départ
    }

    open.delete(key(current))
    closed.add(key(current))

    for (const dir of neighbors) {
      const nx = current.x + dir.x
      const ny = current.y + dir.y
      const nk = `${nx},${ny}`

      if (!isInBounds(nx, ny)) continue
      if (closed.has(nk))      continue
      if (blocked.has(nk))     continue

      const g = current.g + 1
      const h = heuristic({ x: nx, y: ny }, end)
      const f = g + h

      const existing = open.get(nk)
      if (existing && existing.g <= g) continue

      open.set(nk, { x: nx, y: ny, g, h, f, parent: current })
    }
  }

  return [] // aucun chemin trouvé
}

// ─────────────────────────────────────────
// HOOK — DÉPLACEMENT AU CLIC
// ─────────────────────────────────────────

/**
 * useMovement
 * Gère le clic sur une tile → calcul du chemin A* → déplacement fluide pixel par pixel
 */
export function useMovement(
  app: Application | null,
  world: Container | null,
  playerSprite: Graphics | Sprite,
  blocked: Set<string> = new Set()
) {
  const player = useRef<PlayerState>({
    gridX: 5, gridY: 5,
    pixiX: 0, pixiY: 0,
    path: [],
    moving: false,
  })

  // Indicateur visuel de destination (le petit losange qui clignote)
  const destinationMarker = useRef<Graphics | null>(null)

  // Highlight de la tile survolée
  const hoverMarker = useRef<Graphics | null>(null)

  // Coordonnées de la tile survolée (exposées au parent)
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null)

  // ── Init position de départ ──────────────
  useEffect(() => {
    const { x, y } = tileCenterPixel(player.current.gridX, player.current.gridY)
    player.current.pixiX = x
    player.current.pixiY = y
    if (playerSprite) {
      playerSprite.x = x
      playerSprite.y = y
    }
  }, [playerSprite])

  // ── Clic sur le monde → déplacement ─────
  useEffect(() => {
    if (!app || !world) return

    // Durée du clic pour distinguer clic simple vs drag
    let pointerDownTime = 0
    let lastHoverX = -1
    let lastHoverY = -1

    const onPointerMove = (e: any) => {
      const localPos = world.toLocal({ x: e.globalX, y: e.globalY })
      const gridPos  = screenToIso(localPos.x, localPos.y)

      if (!isInBounds(gridPos.x, gridPos.y)) {
        if (hoverMarker.current) hoverMarker.current.visible = false
        lastHoverX = -1; lastHoverY = -1
        return
      }

      if (gridPos.x === lastHoverX && gridPos.y === lastHoverY) return
      lastHoverX = gridPos.x; lastHoverY = gridPos.y

      if (!hoverMarker.current) {
        hoverMarker.current = new Graphics()
        hoverMarker.current.zIndex = 9000
        world.addChild(hoverMarker.current)
      }

      const h = hoverMarker.current
      h.clear()
      const { x, y } = isoToScreen(gridPos.x, gridPos.y)
      h.poly([
        x,              y,
        x + TILE_W / 2, y + TILE_H / 2,
        x,              y + TILE_H,
        x - TILE_W / 2, y + TILE_H / 2,
      ])
      h.fill({ color: 0xB421F3, alpha: 0.08 })
      h.stroke({ color: 0xB421F3, width: 1.5, alpha: 0.55 })
      h.visible = true
    }

    const onPointerDown = () => {
      pointerDownTime = Date.now()
    }

    const onClick = (e: any) => {
      // Si le clic a duré plus de 200ms c'est un drag → pas de déplacement
      if (Date.now() - pointerDownTime > 200) return

      // Convertit la position du clic en coordonnées grille
      // screenToIso gère déjà le centrage vertical (-TILE_H/2) en interne
      const localPos = world.toLocal({ x: e.globalX, y: e.globalY })
      const gridPos = screenToIso(localPos.x, localPos.y)

      if (!isInBounds(gridPos.x, gridPos.y)) return

      const p = player.current

      // Calcule le chemin A*
      const path = findPath(
        { x: p.gridX, y: p.gridY },
        { x: gridPos.x, y: gridPos.y },
        blocked
      )

      if (path.length === 0) return

      p.path   = path
      p.moving = true

      // Affiche le marqueur de destination
      showDestinationMarker(world, gridPos)
    }

    app.stage.on('pointermove', onPointerMove)
    app.stage.on('pointerdown', onPointerDown)
    app.stage.on('pointerup', onClick)
    app.stage.eventMode = 'static'

    return () => {
      app.stage.off('pointermove', onPointerMove)
      app.stage.off('pointerdown', onPointerDown)
      app.stage.off('pointerup', onClick)
    }
  }, [app, world, blocked])

  // ── Ticker — déplacement fluide ──────────
  useEffect(() => {
    if (!app || !playerSprite) return

    const tick = () => {
      const p = player.current
      if (!p.moving || p.path.length === 0) return

      // Prochaine case cible
      const nextGrid  = p.path[0]
      const targetPx  = tileCenterPixel(nextGrid.x, nextGrid.y)

      // Calcule la direction
      const dx = targetPx.x - p.pixiX
      const dy = targetPx.y - p.pixiY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= WALK_SPEED) {
        // Arrive sur la case
        p.pixiX  = targetPx.x
        p.pixiY  = targetPx.y
        p.gridX  = nextGrid.x
        p.gridY  = nextGrid.y
        p.path.shift()     // retire cette étape du chemin

        if (p.path.length === 0) {
          p.moving = false
          hideDestinationMarker()
        }
      } else {
        // Avance vers la cible
        p.pixiX += (dx / dist) * WALK_SPEED
        p.pixiY += (dy / dist) * WALK_SPEED
      }

      // Applique au sprite
      playerSprite.x = p.pixiX
      playerSprite.y = p.pixiY

      // Depth sorting — clé row * 32 + col (row-dominant)
      const isoCol = Math.round((p.pixiX / 32 + p.pixiY / 16) / 2)
      const isoRow = Math.round((p.pixiY / 16 - p.pixiX / 32) / 2)
      playerSprite.zIndex = isoRow * 32 + isoCol
    }

    app.ticker.add(tick)
    return () => { app.ticker.remove(tick) }
  }, [app, playerSprite])

  // ── Marqueur de destination ──────────────
  function showDestinationMarker(world: Container, pos: GridPos) {
    if (destinationMarker.current) {
      world.removeChild(destinationMarker.current)
    }
    const g = new Graphics()
    const { x, y } = isoToScreen(pos.x, pos.y)

    // Losange néon violet clignotant
    g.poly([
      x,              y,
      x + TILE_W / 2, y + TILE_H / 2,
      x,              y + TILE_H,
      x - TILE_W / 2, y + TILE_H / 2,
    ])
    g.fill({ color: 0xB421F3, alpha: 0.6 })
    g.stroke({ color: 0xB421F3, width: 1 })

    world.addChild(g)
    destinationMarker.current = g

    // Animation de clignotement
    let alpha = 0.6
    let dir   = -1
    const blink = () => {
      alpha += dir * 0.05
      if (alpha <= 0.1 || alpha >= 0.7) dir *= -1
      g.alpha = alpha
    }
    const ticker = new Ticker()
    ticker.add(blink)
    ticker.start()

    // Auto-destroy après 2 secondes
    setTimeout(() => {
      ticker.destroy()
      if (destinationMarker.current === g) hideDestinationMarker()
    }, 2000)
  }

  function hideDestinationMarker() {
    if (destinationMarker.current) {
      destinationMarker.current.destroy()
      destinationMarker.current = null
    }
  }

  return { player }
}

// ─────────────────────────────────────────
// HOOK — CAMÉRA INTELLIGENTE
// - Suit le joueur seulement quand il sort de la zone centrale
// - Clic maintenu + drag pour déplacer la caméra manuellement
// ─────────────────────────────────────────

export function useCameraFollow(
  app: Application | null,
  world: Container | null,
  player: React.MutableRefObject<PlayerState>,
  lerpSpeed = 0.08
) {
  // État du drag
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startWorldX: 0,
    startWorldY: 0,
    moved: false,  // true si le pointeur a vraiment bougé (pour distinguer clic vs drag)
  })

  useEffect(() => {
    if (!app || !world) return

    // ── Zoom molette ──────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.4, Math.min(2.5, world.scale.x * factor))
      world.scale.set(newZoom)
    }
    app.canvas.addEventListener('wheel', onWheel, { passive: false })

    // ── Drag — début ──────────────────────
    const onPointerDown = (e: any) => {
      drag.current.active     = true
      drag.current.moved      = false
      drag.current.startX     = e.globalX
      drag.current.startY     = e.globalY
      drag.current.startWorldX = world.x
      drag.current.startWorldY = world.y
    }

    // ── Drag — mouvement ─────────────────
    const onPointerMove = (e: any) => {
      if (!drag.current.active) return
      const dx = e.globalX - drag.current.startX
      const dy = e.globalY - drag.current.startY

      // Considère comme drag si déplacement > 5px
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        drag.current.moved = true
        world.x = drag.current.startWorldX + dx
        world.y = drag.current.startWorldY + dy
      }
    }

    // ── Drag — fin ───────────────────────
    const onPointerUp = () => {
      drag.current.active = false
    }

    app.stage.on('pointerdown', onPointerDown)
    app.stage.on('pointermove', onPointerMove)
    app.stage.on('pointerup',   onPointerUp)
    app.stage.on('pointerupoutside', onPointerUp)

    // ── Ticker — scroll uniquement quand le joueur sort de la zone visible ──
    const EDGE_MARGIN = 120 // px écran — quand le joueur passe sous cette marge, la caméra bouge
    const tick = () => {
      if (drag.current.active) return

      const p = player.current
      const sx = world.x + p.pixiX * world.scale.x
      const sy = world.y + p.pixiY * world.scale.y
      const W  = app.screen.width
      const H  = app.screen.height

      let tx = world.x
      let ty = world.y
      if (sx < EDGE_MARGIN)        tx = world.x + (EDGE_MARGIN - sx)
      else if (sx > W - EDGE_MARGIN) tx = world.x + (W - EDGE_MARGIN - sx)
      if (sy < EDGE_MARGIN)        ty = world.y + (EDGE_MARGIN - sy)
      else if (sy > H - EDGE_MARGIN) ty = world.y + (H - EDGE_MARGIN - sy)

      world.x += (tx - world.x) * 0.1
      world.y += (ty - world.y) * 0.1
    }
    app.ticker.add(tick)

    return () => {
      app.canvas.removeEventListener('wheel', onWheel)
      app.stage.off('pointerdown', onPointerDown)
      app.stage.off('pointermove', onPointerMove)
      app.stage.off('pointerup',   onPointerUp)
      app.stage.off('pointerupoutside', onPointerUp)
      app.ticker.remove(tick)
    }
  }, [app, world])
}