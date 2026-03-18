/**
 * PUNK CITY — Système de Caméra Isométrique
 * Stack: React + PixiJS + TypeScript
 * 
 * Ce fichier contient :
 * 1. useCameraSystem     → Hook caméra (déplacement, zoom, suivi joueur)
 * 2. IsoWorld            → Container PixiJS du monde isométrique
 * 3. GameCanvas          → Composant React principal
 */

import { useEffect, useRef, useCallback } from 'react'
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Ticker,
  FederatedPointerEvent,
} from 'pixi.js'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface CameraState {
  x: number
  y: number
  zoom: number
  targetX: number
  targetY: number
  targetZoom: number
  isDragging: boolean
  dragStartX: number
  dragStartY: number
  dragStartCamX: number
  dragStartCamY: number
}

interface PlayerState {
  x: number        // position monde isométrique
  y: number
  pixiX: number    // position pixel à l'écran
  pixiY: number
}

interface CameraConfig {
  minZoom: number
  maxZoom: number
  zoomSpeed: number
  panSpeed: number       // vitesse avec clavier
  lerpSpeed: number      // fluidité du suivi (0.05 = lent, 0.2 = rapide)
  followPlayer: boolean
}

// ─────────────────────────────────────────
// UTILITAIRES ISO
// ─────────────────────────────────────────

const TILE_W = 64   // largeur d'une tile isométrique
const TILE_H = 32   // hauteur d'une tile isométrique

/**
 * Convertit des coordonnées grille → coordonnées pixel isométriques
 */
export function isoToScreen(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: (gridX - gridY) * (TILE_W / 2),
    y: (gridX + gridY) * (TILE_H / 2),
  }
}

/**
 * Convertit des coordonnées pixel → coordonnées grille isométriques
 */
export function screenToIso(screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: Math.floor((screenX / (TILE_W / 2) + screenY / (TILE_H / 2)) / 2),
    y: Math.floor((screenY / (TILE_H / 2) - screenX / (TILE_W / 2)) / 2),
  }
}

// ─────────────────────────────────────────
// HOOK — SYSTÈME CAMÉRA
// ─────────────────────────────────────────

/**
 * useCameraSystem
 * Gère le déplacement, le zoom et le suivi du joueur.
 * S'attache à un Container PixiJS (le "monde").
 */
export function useCameraSystem(
  app: Application | null,
  world: Container | null,
  player: React.MutableRefObject<PlayerState>,
  config: Partial<CameraConfig> = {}
) {
  const cfg: CameraConfig = {
    minZoom: 0.5,
    maxZoom: 3,
    zoomSpeed: 0.001,
    panSpeed: 6,
    lerpSpeed: 0.1,
    followPlayer: true,
    ...config,
  }

  const camera = useRef<CameraState>({
    x: 0,
    y: 0,
    zoom: 1,
    targetX: 0,
    targetY: 0,
    targetZoom: 1,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartCamX: 0,
    dragStartCamY: 0,
  })

  const keys = useRef<Record<string, boolean>>({})

  // ── Clavier ──────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true }
    const onKeyUp   = (e: KeyboardEvent) => { keys.current[e.key] = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [])

  // ── Molette zoom ─────────────────────────
  useEffect(() => {
    if (!app) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = camera.current
      const delta = -e.deltaY * cfg.zoomSpeed
      cam.targetZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, cam.targetZoom + delta * cam.targetZoom))
    }
    app.canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => app.canvas.removeEventListener('wheel', onWheel)
  }, [app])

  // ── Drag souris ──────────────────────────
  useEffect(() => {
    if (!app || !world) return

    const onPointerDown = (e: FederatedPointerEvent) => {
      // Seulement si pas de suivi joueur actif
      if (cfg.followPlayer) return
      const cam = camera.current
      cam.isDragging = true
      cam.dragStartX = e.globalX
      cam.dragStartY = e.globalY
      cam.dragStartCamX = cam.targetX
      cam.dragStartCamY = cam.targetY
    }

    const onPointerMove = (e: FederatedPointerEvent) => {
      const cam = camera.current
      if (!cam.isDragging) return
      cam.targetX = cam.dragStartCamX + (e.globalX - cam.dragStartX)
      cam.targetY = cam.dragStartCamY + (e.globalY - cam.dragStartY)
    }

    const onPointerUp = () => {
      camera.current.isDragging = false
    }

    app.stage.on('pointerdown', onPointerDown)
    app.stage.on('pointermove', onPointerMove)
    app.stage.on('pointerup',   onPointerUp)
    app.stage.on('pointerupoutside', onPointerUp)
    app.stage.eventMode = 'static'

    return () => {
      app.stage.off('pointerdown', onPointerDown)
      app.stage.off('pointermove', onPointerMove)
      app.stage.off('pointerup',   onPointerUp)
      app.stage.off('pointerupoutside', onPointerUp)
    }
  }, [app, world])

  // ── Ticker principal ─────────────────────
  useEffect(() => {
    if (!app || !world) return

    const tick = () => {
      const cam = camera.current
      const k   = keys.current
      const p   = player.current

      // -- Déplacement clavier (seulement si pas suivi joueur)
      if (!cfg.followPlayer) {
        if (k['ArrowLeft']  || k['q'] || k['Q']) cam.targetX += cfg.panSpeed
        if (k['ArrowRight'] || k['d'] || k['D']) cam.targetX -= cfg.panSpeed
        if (k['ArrowUp']    || k['z'] || k['Z']) cam.targetY += cfg.panSpeed
        if (k['ArrowDown']  || k['s'] || k['S']) cam.targetY -= cfg.panSpeed
      }

      // -- Suivi du joueur
      if (cfg.followPlayer) {
        const centerX = app.screen.width  / 2
        const centerY = app.screen.height / 2
        cam.targetX = centerX - p.pixiX * cam.targetZoom
        cam.targetY = centerY - p.pixiY * cam.targetZoom
      }

      // -- Lerp caméra (mouvement fluide)
      cam.x += (cam.targetX - cam.x) * cfg.lerpSpeed
      cam.y += (cam.targetY - cam.y) * cfg.lerpSpeed
      cam.zoom += (cam.targetZoom - cam.zoom) * cfg.lerpSpeed

      // -- Applique au monde PixiJS
      world.x = cam.x
      world.y = cam.y
      world.scale.set(cam.zoom)
    }

    app.ticker.add(tick)
    return () => { app.ticker.remove(tick) }
  }, [app, world])

  // ── API publique ─────────────────────────
  const centerOn = useCallback((gridX: number, gridY: number) => {
    if (!app) return
    const { x, y } = isoToScreen(gridX, gridY)
    camera.current.targetX = app.screen.width  / 2 - x
    camera.current.targetY = app.screen.height / 2 - y
  }, [app])

  const setZoom = useCallback((zoom: number) => {
    camera.current.targetZoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, zoom))
  }, [])

  const toggleFollowPlayer = useCallback((follow: boolean) => {
    cfg.followPlayer = follow
  }, [])

  return { camera, centerOn, setZoom, toggleFollowPlayer }
}

// ─────────────────────────────────────────
// COMPOSANT — GAME CANVAS
// ─────────────────────────────────────────

/**
 * GameCanvas
 * Composant React principal qui monte PixiJS,
 * construit la map iso et active le système caméra.
 */
export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef   = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)

  // État du joueur (position iso + pixel)
  const playerRef = useRef<PlayerState>({
    x: 5, y: 5,
    pixiX: 0, pixiY: 0,
  })

  // ── Init PixiJS ──────────────────────────
  useEffect(() => {
    if (!mountRef.current) return

    const app = new Application()

    ;(async () => {
      await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x0d0d1a,     // fond cyberpunk sombre
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: false,              // désactivé pour garder le style pixel
      })

      mountRef.current!.appendChild(app.canvas)
      appRef.current = app

      // ── Monde isométrique ──────────────
      const world = new Container()
      app.stage.addChild(world)
      worldRef.current = world

      // ── Grille de tiles ────────────────
      buildIsoGrid(world, 20, 20)

      // ── Joueur placeholder ─────────────
      const playerSprite = buildPlayerPlaceholder(world)

      // ── Position initiale du joueur ────
      const { x, y } = isoToScreen(playerRef.current.x, playerRef.current.y)
      playerSprite.x = x
      playerSprite.y = y
      playerRef.current.pixiX = x
      playerRef.current.pixiY = y

      // ── Resize handler ─────────────────
      const onResize = () => {
        app.renderer.resize(window.innerWidth, window.innerHeight)
      }
      window.addEventListener('resize', onResize)

      return () => {
        window.removeEventListener('resize', onResize)
        app.destroy(true)
      }
    })()
  }, [])

  // ── Caméra ───────────────────────────────
  useCameraSystem(appRef.current, worldRef.current, playerRef, {
    followPlayer: true,
    lerpSpeed: 0.08,
    minZoom: 0.4,
    maxZoom: 2.5,
  })

  return (
    <div
      ref={mountRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#0d0d1a',
        cursor: 'crosshair',
      }}
    />
  )
}

// ─────────────────────────────────────────
// HELPERS — CONSTRUCTION DE LA MAP
// ─────────────────────────────────────────

/**
 * Construit une grille isométrique de tiles cyberpunk
 */
function buildIsoGrid(world: Container, cols: number, rows: number) {
  const tileContainer = new Container()
  world.addChild(tileContainer)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = drawIsoTile(x, y)
      tileContainer.addChild(tile)
    }
  }
}

/**
 * Dessine une tile isométrique cyberpunk
 */
function drawIsoTile(gridX: number, gridY: number): Graphics {
  const g = new Graphics()
  const { x, y } = isoToScreen(gridX, gridY)

  // Variation de couleur selon position (effet cyberpunk)
  const isDark = (gridX + gridY) % 2 === 0
  const topColor    = isDark ? 0x1a1a2e : 0x16213e
  const leftColor   = isDark ? 0x0f3460 : 0x0a2647
  const rightColor  = isDark ? 0x0d2137 : 0x091929

  // Face du dessus
  g.poly([
    x,              y,
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x - TILE_W / 2, y + TILE_H / 2,
  ])
  g.fill(topColor)

  // Face gauche
  g.poly([
    x - TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x,              y + TILE_H + 8,
    x - TILE_W / 2, y + TILE_H / 2 + 8,
  ])
  g.fill(leftColor)

  // Face droite
  g.poly([
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x,              y + TILE_H + 8,
    x + TILE_W / 2, y + TILE_H / 2 + 8,
  ])
  g.fill(rightColor)

  // Contour néon violet (style Punk City)
  g.poly([
    x,              y,
    x + TILE_W / 2, y + TILE_H / 2,
    x,              y + TILE_H,
    x - TILE_W / 2, y + TILE_H / 2,
  ])
  g.stroke({ color: 0x610097, width: 0.5, alpha: 0.4 })

  return g
}

/**
 * Crée un placeholder violet pour le joueur
 * (à remplacer par ton SeekerPunk spritesheet)
 */
function buildPlayerPlaceholder(world: Container): Graphics {
  const g = new Graphics()

  // Corps
  g.rect(-8, -24, 16, 24)
  g.fill(0xB421F3)

  // Tête
  g.circle(0, -30, 8)
  g.fill(0x9E7B50)

  // Outline
  g.rect(-8, -24, 16, 24)
  g.stroke({ color: 0x000000, width: 1 })

  // Ombre au sol
  g.ellipse(0, 2, 10, 4)
  g.fill({ color: 0x000000, alpha: 0.3 })

  world.addChild(g)
  return g
}
