# Punk City

A real-time multiplayer isometric social game that runs in the browser, in the spirit of Habbo Hotel. Players pick a name, walk around a cyberpunk city split into four districts, chat, add friends, invite them to a private apartment, buy items and trade with each other.

## Features

- **Isometric world rendered with PixiJS.** A 20×20 tile grid with click-to-move, A* pathfinding, smooth per-pixel movement, 4-direction sprites and an animated walk cycle.
- **Camera.** Follows the player once they leave a central zone. Drag to pan, mouse wheel to zoom.
- **Four districts.** Genesis Plaza, Neon Market, Seeker Club and Gallery District, with fade transitions and an interactive minimap.
- **Real-time multiplayer over Socket.io.** Other players' positions and directions are synced and interpolated on the client.
- **Chat.** Room chat with the last 50 messages kept per room, emotes, private messages, and MMO-style floating chat bubbles above characters.
- **Social.** Click a player to open their card. Send, accept or decline friend requests and see which friends are online and where.
- **Apartments.** Each player has a private apartment and can invite one friend or all online friends.
- **Economy.** "Neon Credits" currency, an item shop, and player-to-player trades (items plus credits) where both sides must confirm and the server validates the trade.
- **Persistence.** Users, credits, inventory and friendships are stored in PostgreSQL. The schema is created automatically on startup.

## Tech stack

| Layer | Tech |
|---|---|
| Front end | React 19, TypeScript, PixiJS 8 (+ `@pixi/gif`), Vite |
| Back end | Node.js, TypeScript (run with `tsx`), Express 5, Socket.io 4 |
| Database | PostgreSQL (`pg`) |
| Tooling | ESLint, `concurrently` |

## Project structure

```
punk-city/
├── package.json          # root scripts: runs front + back together
├── front/                # React + PixiJS client (Vite)
│   ├── public/           # sprites, tiles, district backgrounds
│   └── src/
│       ├── App.tsx       # login screen, entry point
│       ├── GameCanvas.tsx
│       └── systems/      # movement/pathfinding, rooms, chat, camera, tooltip
└── back/                 # Socket.io game server
    ├── PunkCity_Server.ts
    ├── db.ts             # PostgreSQL connection + schema
    └── .env.exemple
```

## Run locally

Prerequisites: Node.js (a recent LTS version) and a local PostgreSQL server.

```bash
# 1. Install dependencies (the root postinstall also installs front/ and back/)
npm install

# 2. Create the database and configure the server
createdb punkcity
cp back/.env.exemple back/.env
# then edit back/.env and set DATABASE_URL, e.g.
# DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/punkcity
# PORT defaults to 3001

# 3. Start the client and the server together
npm start
```

`npm start` runs both apps with `concurrently`:

- the **server** (`cd back && npm run dev`, which runs `tsx ./PunkCity_Server.ts`) listens on `http://localhost:3001`, with a health check at `/health`;
- the **client** (`cd front && npm run dev`) is served by Vite (by default at `http://localhost:5173`) and connects to the server at `http://localhost:3001`.

Open the client in two browser windows with different names to see multiplayer in action.

Other front-end scripts (run them from `front/`): `npm run build`, `npm run lint`, `npm run preview`.
