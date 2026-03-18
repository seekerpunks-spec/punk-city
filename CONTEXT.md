# PUNK CITY — Contexte Projet Complet

## Vue d'ensemble
Jeu social isométrique browser style **Habbo Hotel**, lié à la collection NFT **SeekerPunks** (1111 OG sur Solana).
- Les avatars NFT = personnages jouables in-game
- 4 districts : Genesis Plaza, Neon Market, Seeker Club, Gallery District
- Multijoueur temps réel via Socket.io

---

## Stack Technique

### Frontend (`front/`)
- React + TypeScript + PixiJS (rendu isométrique)
- `@pixi/gif` pour les animations GIF
- Socket.io-client pour le multijoueur
- Vite comme bundler

### Backend (`back/`)
- Node.js + TypeScript + Socket.io
- Express pour le health check
- Port : 3001

---

## Structure du projet

```
punk-city/
├── front/
│   ├── public/
│   │   ├── sprite_sw.png     ← sprite idle/marche sud-ouest
│   │   ├── sprite_se.png     ← sprite idle sud-est
│   │   ├── sprite_nw.png     ← sprite idle nord-ouest
│   │   ├── sprite_ne.png     ← sprite idle nord-est
│   │   └── walk_sw.gif       ← animation de marche direction sw (8 frames)
│   └── src/
│       ├── App.tsx            ← login screen + point d'entrée
│       ├── GameCanvas.tsx     ← composant principal PixiJS
│       ├── main.tsx           ← StrictMode DÉSACTIVÉ (important!)
│       └── systems/
│           ├── PunkCity_Camera.tsx    ← caméra iso (non utilisé directement)
│           ├── PunkCity_Chat.tsx      ← hook Socket.io + ChatPanel + ChatBubble
│           ├── PunkCity_Movement.tsx  ← pathfinding A* + useMovement + useCameraFollow
│           └── PunkCity_Rooms.tsx     ← 4 districts + minimap + transitions
└── back/
    └── src/
        └── PunkCity_Server.ts  ← serveur Socket.io
```

---

## Commandes pour lancer

```bash
# Frontend
cd ~/Desktop/punk-city/front
npm run dev

# Backend
cd ~/Desktop/punk-city/back
npx ts-node src/PunkCity_Server.ts
```

---

## État actuel du jeu ✅

### Ce qui fonctionne
- Map isométrique cyberpunk (Genesis Plaza visible au départ)
- Personnage joueur avec sprite SeekerPunk PNG (hoodie violet, lunettes, boots)
- Animation de marche : `walk_sw.gif` pour direction SW, sprites statiques pour SE/NW/NE
- Idle : affiche le sprite statique de la dernière direction (le perso garde sa direction à l'arrêt)
- Pathfinding A* au clic
- Caméra intelligente : suit le joueur seulement quand il sort de la zone centrale (35% marge)
- Drag caméra : clic maintenu + glisser pour déplacer la map
- Zoom molette
- Marqueur de destination (losange violet clignotant)
- 4 districts avec transitions fade
- Minimap interactive
- Chat temps réel (Socket.io)
- Multijoueur — plusieurs joueurs visibles et synchronisés
- Autres joueurs : même sprite + walk_sw.gif quand ils bougent
- Direction des autres joueurs synchronisée (4 directions)
- Messages flottants au-dessus des personnages (style MMO)
- Popup joueur en bas-droite au clic sur un autre joueur
- Backend Node.js stable
- Jeu entièrement en anglais

---

## Architecture GameCanvas.tsx

### Composants React
```
GameCanvas (init PixiJS)
  └── InnerGame (hooks gameplay)
        ├── FloatingMessages (messages flottants par joueur)
        └── PlayerPopup (popup clic sur joueur)
```

### Système de sprites joueur principal
```
buildPlayerSprite(world, app) → Graphics (invisible, pour pathfinding)
  ├── walkGif (AnimatedGIF) → visible quand dir=sw ET moving
  ├── idleSw (Sprite)       → visible quand idle ET dir=sw
  ├── spritesSe (Sprite)    → visible quand dir=se
  ├── spritesNw (Sprite)    → visible quand dir=nw
  └── spritesNe (Sprite)    → visible quand dir=ne
```

### Système de sprites autres joueurs
Chaque autre joueur est un "container" JS avec :
```js
{
  _walkGif,      // AnimatedGIF walk_sw.gif
  _idleSw,       // Sprite idle sw
  _spriteSe,     // Sprite se
  _spriteNw,     // Sprite nw
  _spriteNe,     // Sprite ne
  _currentDir,   // direction actuelle
  _targetX/Y,    // position cible (interpolée)
  _lastMoveTime  // timestamp dernier mouvement (pour idle detection)
}
```
- Idle détecté dans le ticker : si pas de mouvement depuis 400ms → stop GIF + show idleSw
- Clic sur sprite → `PlayerPopup` en bas-droite

### Messages flottants (FloatingMessages)
- Position : à droite de la bouche du perso
- Offset calculé dans useEffect : `y: world.y + pixiY * zoom - 80 * zoom`
- Max 4 messages empilés par joueur, disparaissent après 8s
- Format : `username: texte` sur une ligne

### Mouvement fluide multijoueur
- `reportMove` envoyé à chaque frame quand `p.moving === true`
- Pas seulement au changement de grille → POV2 reçoit positions pixel continues
- Interpolation côté récepteur : `sprite.x += (targetX - sprite.x) * 0.2`

---

## PunkCity_Movement.tsx — Points importants

```typescript
const TILE_W = 64
const TILE_H = 32
const WALK_SPEED = 1.75   // pixels par frame (ajuster si trop lent/rapide)
const GRID_COLS = 20
const GRID_ROWS = 20
const FOLLOW_MARGIN = 150  // marge caméra intelligente
```

### useCameraFollow
- Caméra bouge SEULEMENT quand le joueur sort d'une zone de 35% de l'écran
- Drag : clic maintenu >5px → déplace la caméra manuellement
- Clic court (<200ms) → déplace le joueur (pathfinding)

---

## PunkCity_Chat.tsx — Points importants

### Interface Player
```typescript
interface Player {
  id, username, avatar, roomId,
  gridX, gridY,
  pixiX, pixiY,     // position pixel pour mouvement fluide
  direction         // 'sw' | 'se' | 'nw' | 'ne'
}
```

### reportMove signature
```typescript
reportMove(gridX, gridY, pixiX, pixiY, direction)
```

### ChatPanel
- Largeur 320px, bas-gauche
- Messages : `username:` toujours à gauche, texte revient à la ligne
- `wordBreak: 'break-word'`, `overflowWrap: 'anywhere'`, `textAlign: 'left'`
- Container messages : `alignItems: 'stretch'`

---

## PunkCity_Server.ts — Points importants

### Events Socket.io
- `player:join` → rejoint une room
- `player:joined` → reçoit joueurs + historique
- `player:entered` / `player:left` → autres joueurs
- `player:move` → envoie `{ gridX, gridY, pixiX, pixiY, direction }`
- `player:moved` → reçoit `{ id, gridX, gridY, pixiX, pixiY, direction }`
- `chat:send` / `chat:emote` / `chat:message`
- `player:changeRoom`

### Player interface serveur
```typescript
interface Player {
  id, username, avatar, roomId,
  gridX, gridY,
  direction: string
}
```

---

## Graphisme

### Sprites actuels
- **sprite_sw.png** : SeekerPunk face sud-ouest (hoodie gris, lunettes noires, néon violet/jaune, boots marron)
- **sprite_se.png, sprite_nw.png, sprite_ne.png** : 3 autres directions générées avec Pixellab
- **walk_sw.gif** : Animation de marche 8 frames direction sud-ouest

### Palette couleurs
```
Violet principal : #B421F3
Violet foncé    : #610097
Bleu            : #2986DF
Fond            : #0d0d1a
```

### Style pixel art
- Vue "Low top-down" (proche isométrique)
- Style Habbo Hotel
- Généré avec Pixellab.ai

---

## NFT SeekerPunks
- 1111 NFTs sur Solana
- ~54 mintés au moment de ce contexte
- Mint OG = early access pass au jeu
- Twitter : @SeekerPunks
- Les NFTs sont générés par couches (corps + vêtements + accessoires séparés)
- Connexion Solana NON encore implémentée

---

## Prochaines étapes prévues

1. **Déploiement en ligne** (Railway/Render pour le back, Vercel pour le front)
2. **Connexion Solana** : wallet → vérification NFT → avatar personnalisé
3. **Système de calques** : sprite body animé + traits NFT superposés
4. **Décors/tileset** : map actuellement vide (juste les tiles bleues)
5. **Features sociales** : Private Message, Add Friend, Trade (boutons dans PlayerPopup déjà UI)
6. **Appartements privés**

---

## Bugs connus / Points de vigilance

- `StrictMode` est DÉSACTIVÉ dans `main.tsx` (sinon PixiJS double-init)
- Le `new Ticker()` dans `buildPlayerSprite` a été remplacé par `app.ticker` pour éviter les conflits
- La bulle de chat (FloatingMessages) utilise `- 80 * zoom` comme offset vertical
- `pixiY={py}` dans le JSX (pas de soustraction) — l'offset est entièrement dans FloatingMessages
- Ne jamais modifier le système de sprites en touchant autre chose en même temps

---

## Ce que Claude Code doit savoir

1. **Toujours lire le fichier avant de le modifier** — ne jamais générer de toutes pièces
2. **Modifications chirurgicales** — changer seulement ce qui est demandé
3. **Ne pas toucher aux commentaires** — ils sont importants pour le développement
4. **Tester mentalement** avant de proposer — penser aux effets de bord
5. Le jeu est **entièrement en anglais** (plus de français dans l'UI)
