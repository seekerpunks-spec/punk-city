/**
 * PUNK CITY — Backend Chat Temps Réel
 * Stack: Node.js + TypeScript + Socket.io
 */

import fs               from 'fs'
import path             from 'path'
import { fileURLToPath } from 'url'
import express          from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors             from 'cors'
import {
  initDatabase,
  normalizeUsername,
  upsertUserOnJoin,
  saveUserProgress,
  addFriendship,
  getFriendNormalizedUsernames,
  getUserOrThrow,
} from './db.js'

interface Player {
  id:        string
  username:  string
  avatar:    string
  roomId:    string
  gridX:     number
  gridY:     number
  direction: string
}

interface ShopItem {
  id:    string
  name:  string
  price: number
  emoji: string
}

const SHOP_CATALOG: ShopItem[] = [
  { id: 'item_1', name: 'Neon Lamp',      price: 100, emoji: '💡' },
  { id: 'item_2', name: 'Purple Chair',   price: 150, emoji: '🪑' },
  { id: 'item_3', name: 'Hologram Plant', price: 80,  emoji: '🌿' },
  { id: 'item_4', name: 'Cyber Desk',     price: 200, emoji: '🖥️' },
]

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

interface Room {
  id:      string
  name:    string
  players: Map<string, Player>
  history: ChatMessage[]
}

interface Trade {
  id:         string
  playerAId:  string  // requester
  playerBId:  string  // accepter
  offerA:     string[]  // item IDs
  offerB:     string[]
  creditsA:   number    // ₦ offered by A
  creditsB:   number
  confirmedA: boolean
  confirmedB: boolean
}

const players               = new Map<string, Player>()
const friendships           = new Map<string, Set<string>>()  // socketId → Set<friendId>
const pendingFriendRequests = new Map<string, Set<string>>()  // targetId → Set<requesterId>
const activeTrades          = new Map<string, Trade>()
const wallets               = new Map<string, number>()       // socketId → neonCredits
const inventories           = new Map<string, string[]>()     // socketId → itemIds
/** pseudo normalisé (lowercase) → socket.id — pour résoudre amis en ligne */
const usernameToSocketId    = new Map<string, string>()

const rooms = new Map<string, Room>([
  ['genesis-plaza',    { id: 'genesis-plaza',    name: 'Genesis Plaza',    players: new Map(), history: [] }],
  ['neon-market',      { id: 'neon-market',       name: 'Neon Market',      players: new Map(), history: [] }],
  ['seeker-club',      { id: 'seeker-club',       name: 'Seeker Club',      players: new Map(), history: [] }],
  ['gallery-district', { id: 'gallery-district',  name: 'Gallery District', players: new Map(), history: [] }],
])

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function addToHistory(room: Room, msg: ChatMessage) {
  room.history.push(msg)
  if (room.history.length > 50) room.history.shift()
}

function getPlayersInRoom(roomId: string): Player[] {
  const room = rooms.get(roomId)
  if (!room) return []
  return Array.from(room.players.values())
}

async function buildFriendsPayload(friendNorms: string[]): Promise<{ id: string; username: string; online: boolean; roomId: string }[]> {
  const out: { id: string; username: string; online: boolean; roomId: string }[] = []
  for (const fn of friendNorms) {
    const fsid = usernameToSocketId.get(fn)
    const p = fsid ? players.get(fsid) : undefined
    if (p) {
      out.push({ id: p.id, username: p.username, online: true, roomId: p.roomId })
    } else {
      let display = fn
      try {
        const u = await getUserOrThrow(fn)
        display = u.displayName
      } catch {
        /* ami en base sans ligne user — rare */
      }
      out.push({ id: `off:${fn}`, username: display, online: false, roomId: '' })
    }
  }
  return out
}

const app    = express()
const server = createServer(app)

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontDist = path.join(__dirname, '../front/dist')

app.set('trust proxy', 1)
app.use(cors())
app.use(express.json())
app.get('/health', (_, res) => res.json({ status: 'ok', players: players.size }))

if (fs.existsSync(path.join(frontDist, 'index.html'))) {
  app.use(express.static(frontDist))
  // Express 5 / path-to-regexp v8 : plus de app.get('*') — fallback SPA
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/socket.io')) return next()
    res.sendFile(path.join(frontDist, 'index.html'), err => {
      if (err) next(err)
    })
  })
  console.log(`[http] Front statique → ${frontDist}`)
}

io.on('connection', (socket: Socket) => {
  console.log(`[+] Connection: ${socket.id}`)

  socket.on('player:join', async (data: {
    username: string; avatar: string; roomId: string
    gridX: number; gridY: number; direction: string
  }) => {
    const roomId = data.roomId || 'genesis-plaza'
    const room   = rooms.get(roomId)
    if (!room) return socket.emit('error', { message: 'Room not found' })

    try {
      const displayUsername = (data.username?.trim() || `Punk_${generateId()}`).slice(0, 64)
      const norm            = normalizeUsername(displayUsername)
      const profile         = await upsertUserOnJoin(norm, displayUsername, data.avatar || 'default')

      const player: Player = {
        id:        socket.id,
        username:  displayUsername,
        avatar:    profile.avatar,
        roomId,
        gridX:     data.gridX    ?? 5,
        gridY:     data.gridY    ?? 5,
        direction: data.direction || 'sw',
      }

      players.set(socket.id, player)
      room.players.set(socket.id, player)
      socket.join(roomId)

      usernameToSocketId.set(norm, socket.id)

      wallets.set(socket.id, profile.neonCredits)
      inventories.set(socket.id, [...profile.inventory])

      const friendNorms = await getFriendNormalizedUsernames(norm)

      for (const fn of friendNorms) {
        const fsid = usernameToSocketId.get(fn)
        if (fsid) {
          if (!friendships.has(socket.id)) friendships.set(socket.id, new Set())
          friendships.get(socket.id)!.add(fsid)
          if (!friendships.has(fsid)) friendships.set(fsid, new Set())
          friendships.get(fsid)!.add(socket.id)
        }
      }

      for (const fn of friendNorms) {
        const fsid = usernameToSocketId.get(fn)
        if (fsid && fsid !== socket.id) {
          io.to(fsid).emit('friend:online', {
            username: player.username,
            id:       socket.id,
            roomId:   player.roomId,
          })
        }
      }

      const friendsPayload = await buildFriendsPayload(friendNorms)

      const aptRoomId = `apartment_${player.username}`
      if (!rooms.has(aptRoomId)) {
        rooms.set(aptRoomId, {
          id:      aptRoomId,
          name:    `${player.username}'s Apartment`,
          players: new Map(),
          history: [],
        })
      }

      socket.emit('player:joined', {
        player,
        players:      getPlayersInRoom(roomId),
        history:      room.history,
        neonCredits:  wallets.get(socket.id)!,
        inventory:    inventories.get(socket.id)!,
        shopCatalog:  SHOP_CATALOG,
        friends:        friendsPayload,
      })

      socket.to(roomId).emit('player:entered', player)

      const sysMsg: ChatMessage = {
        id: generateId(), playerId: 'system', username: 'Punk City', avatar: 'system',
        text: `${player.username} joined ${room.name}`,
        roomId, timestamp: Date.now(), type: 'system',
      }
      addToHistory(room, sysMsg)
      io.to(roomId).emit('chat:message', sysMsg)
      console.log(`[room:${roomId}] ${player.username} joined (${room.players.size} players)`)
    } catch (err) {
      console.error('[player:join]', err)
      socket.emit('error', { message: 'Erreur base de données' })
    }
  })

  socket.on('chat:send', (data: { text: string }) => {
    const player = players.get(socket.id)
    if (!player) return
    const text = data.text?.trim().slice(0, 200)
    if (!text) return
    const msg: ChatMessage = {
      id: generateId(), playerId: player.id, username: player.username,
      avatar: player.avatar, text, roomId: player.roomId,
      timestamp: Date.now(), type: 'message',
    }
    const room = rooms.get(player.roomId)
    if (!room) return
    addToHistory(room, msg)
    io.to(player.roomId).emit('chat:message', msg)
  })

  socket.on('pm:send', (data: { targetId: string; text: string }) => {
    const sender = players.get(socket.id)
    if (!sender) return
    const text = data.text?.trim().slice(0, 200)
    if (!text) return
    io.to(data.targetId).emit('pm:receive', {
      fromId:       socket.id,
      fromUsername: sender.username,
      text,
      timestamp:    Date.now(),
    })
  })

  socket.on('chat:emote', (data: { text: string }) => {
    const player = players.get(socket.id)
    if (!player) return
    const msg: ChatMessage = {
      id: generateId(), playerId: player.id, username: player.username,
      avatar: player.avatar, text: `*${data.text}*`, roomId: player.roomId,
      timestamp: Date.now(), type: 'emote',
    }
    const room = rooms.get(player.roomId)
    if (!room) return
    addToHistory(room, msg)
    io.to(player.roomId).emit('chat:message', msg)
  })

  // ── Déplacement avec position pixel + direction ──
  socket.on('player:move', (data: { gridX: number; gridY: number; pixiX: number; pixiY: number; direction: string }) => {
    const player = players.get(socket.id)
    if (!player) return
    player.gridX     = data.gridX
    player.gridY     = data.gridY
    player.direction = data.direction || 'sw'
    // Broadcast position pixel pour mouvement fluide chez les autres joueurs
    socket.to(player.roomId).emit('player:moved', {
      id:        player.id,
      gridX:     player.gridX,
      gridY:     player.gridY,
      pixiX:     data.pixiX,
      pixiY:     data.pixiY,
      direction: player.direction,
    })
  })

  socket.on('player:changeRoom', (data: { roomId: string }) => {
    const player  = players.get(socket.id)
    if (!player) return
    const oldRoom = rooms.get(player.roomId)
    let   newRoom = rooms.get(data.roomId)
    if (!newRoom) {
      // Crée la room d'appartement à la demande
      if (data.roomId.startsWith('apartment_')) {
        const ownerUsername = data.roomId.slice('apartment_'.length)
        rooms.set(data.roomId, {
          id:      data.roomId,
          name:    `${ownerUsername}'s Apartment`,
          players: new Map(),
          history: [],
        })
        newRoom = rooms.get(data.roomId)!
      } else {
        return socket.emit('error', { message: 'Room not found' })
      }
    }

    if (oldRoom) {
      oldRoom.players.delete(socket.id)
      socket.leave(player.roomId)
      socket.to(player.roomId).emit('player:left', { id: player.id })
      const leaveMsg: ChatMessage = {
        id: generateId(), playerId: 'system', username: 'Punk City', avatar: 'system',
        text: `${player.username} left for ${newRoom.name}`,
        roomId: player.roomId, timestamp: Date.now(), type: 'system',
      }
      addToHistory(oldRoom, leaveMsg)
      io.to(player.roomId).emit('chat:message', leaveMsg)
    }

    player.roomId = data.roomId
    newRoom.players.set(socket.id, player)
    socket.join(data.roomId)
    socket.emit('player:joined', { player, players: getPlayersInRoom(data.roomId), history: newRoom.history })
    socket.to(data.roomId).emit('player:entered', player)

    friendships.get(socket.id)?.forEach(friendId => {
      io.to(friendId).emit('friend:status', { id: socket.id, roomId: data.roomId })
    })

    const joinMsg: ChatMessage = {
      id: generateId(), playerId: 'system', username: 'Punk City', avatar: 'system',
      text: `${player.username} arrived from ${oldRoom?.name ?? '???'}`,
      roomId: data.roomId, timestamp: Date.now(), type: 'system',
    }
    addToHistory(newRoom, joinMsg)
    io.to(data.roomId).emit('chat:message', joinMsg)
  })

  socket.on('friend:request', (data: { targetId: string }) => {
    console.log(`[friend:request] from=${socket.id} to=${data.targetId} knownPlayers=${[...players.keys()].join(',')}`)
    const sender = players.get(socket.id)
    const target = players.get(data.targetId)
    if (!sender || !target) { console.log(`[friend:request] FAIL sender=${!!sender} target=${!!target}`); return }
    if (socket.id === data.targetId) return

    if (!pendingFriendRequests.has(data.targetId)) {
      pendingFriendRequests.set(data.targetId, new Set())
    }
    pendingFriendRequests.get(data.targetId)!.add(socket.id)

    io.to(data.targetId).emit('friend:request_received', {
      fromId:       socket.id,
      fromUsername: sender.username,
    })
    console.log(`[friend] ${sender.username} → ${target.username}`)
  })

  socket.on('friend:accept', async (data: { requesterId: string }) => {
    const accepter  = players.get(socket.id)
    const requester = players.get(data.requesterId)
    if (!accepter || !requester) return

    const pending = pendingFriendRequests.get(socket.id)
    if (!pending?.has(data.requesterId)) return
    pending.delete(data.requesterId)

    if (!friendships.has(socket.id))       friendships.set(socket.id, new Set())
    if (!friendships.has(data.requesterId)) friendships.set(data.requesterId, new Set())
    friendships.get(socket.id)!.add(data.requesterId)
    friendships.get(data.requesterId)!.add(socket.id)

    try {
      await addFriendship(requester.username, accepter.username)
    } catch (e) {
      console.error('[friend:accept]', e)
    }

    // Notifie le demandeur (B) que A a accepté
    io.to(data.requesterId).emit('friend:accepted', {
      byId:       socket.id,
      byUsername: accepter.username,
      byRoomId:   accepter.roomId,
    })
    // Notifie l'accepteur (A) — ajoute B à sa liste d'amis
    socket.emit('friend:added', {
      id:       data.requesterId,
      username: requester.username,
      roomId:   requester.roomId,
    })
    console.log(`[friend] ${accepter.username} accepted ${requester.username}`)
  })

  socket.on('friend:decline', (data: { requesterId: string }) => {
    const pending = pendingFriendRequests.get(socket.id)
    if (pending) pending.delete(data.requesterId)

    io.to(data.requesterId).emit('friend:declined', {
      byId:       socket.id,
      byUsername: players.get(socket.id)?.username ?? '???',
    })
  })

  // ── Trade ────────────────────────────────
  // ── Invitation Appartement ───────────────
  socket.on('apartment:invite', () => {
    const player = players.get(socket.id)
    if (!player) return
    if (player.roomId !== `apartment_${player.username}`) return

    friendships.get(socket.id)?.forEach(friendId => {
      if (!players.has(friendId)) return  // ami hors-ligne
      io.to(friendId).emit('apartment:invited', {
        fromId:       socket.id,
        fromUsername: player.username,
        roomId:       player.roomId,
      })
    })
    console.log(`[apt] ${player.username} invited friends to apartment`)
  })

  socket.on('apartment:invite-one', (data: { targetId: string }) => {
    const player = players.get(socket.id)
    if (!player) return
    if (player.roomId !== `apartment_${player.username}`) return
    const isFriend = friendships.get(socket.id)?.has(data.targetId)
    if (!isFriend || !players.has(data.targetId)) return
    io.to(data.targetId).emit('apartment:invited', {
      fromId:       socket.id,
      fromUsername: player.username,
      roomId:       player.roomId,
    })
    console.log(`[apt] ${player.username} invited ${players.get(data.targetId)?.username} to apartment`)
  })

  // ── Trade ────────────────────────────────
  socket.on('trade:request', (data: { targetId: string }) => {
    const sender = players.get(socket.id)
    const target = players.get(data.targetId)
    if (!sender || !target || socket.id === data.targetId) return
    const tradeId = generateId()
    io.to(data.targetId).emit('trade:request_received', {
      tradeId,
      fromId:       socket.id,
      fromUsername: sender.username,
    })
  })

  socket.on('trade:accept', (data: { tradeId: string; requesterId: string }) => {
    const accepter  = players.get(socket.id)
    const requester = players.get(data.requesterId)
    if (!accepter || !requester) return
    const trade: Trade = {
      id: data.tradeId, playerAId: data.requesterId, playerBId: socket.id,
      offerA: [], offerB: [], creditsA: 0, creditsB: 0, confirmedA: false, confirmedB: false,
    }
    activeTrades.set(data.tradeId, trade)
    const invAccepter  = inventories.get(socket.id)       ?? []
    const invRequester = inventories.get(data.requesterId) ?? []
    // Each player receives the partner's current inventory so they can see selections in real-time
    socket.emit('trade:started', { tradeId: data.tradeId, partnerId: data.requesterId, partnerUsername: requester.username, partnerInventory: invRequester, myInventory: invAccepter })
    io.to(data.requesterId).emit('trade:started', { tradeId: data.tradeId, partnerId: socket.id, partnerUsername: accepter.username, partnerInventory: invAccepter, myInventory: invRequester })
  })

  socket.on('trade:decline', (data: { tradeId: string; requesterId: string }) => {
    const decliner = players.get(socket.id)
    io.to(data.requesterId).emit('trade:declined', { tradeId: data.tradeId, byUsername: decliner?.username ?? '???' })
  })

  socket.on('trade:update_offer', (data: { tradeId: string; offer: string[]; credits: number }) => {
    const trade = activeTrades.get(data.tradeId)
    if (!trade) return
    const isA = trade.playerAId === socket.id
    if (!isA && trade.playerBId !== socket.id) return
    const offer   = data.offer.slice(0, 20)
    const credits = Math.max(0, Math.floor(data.credits ?? 0))
    const wallet  = wallets.get(socket.id) ?? 0
    if (credits > wallet) return socket.emit('shop:error', { message: 'Not enough Neon Credits to offer.' })
    if (isA) { trade.offerA = offer; trade.creditsA = credits; trade.confirmedA = false; trade.confirmedB = false }
    else      { trade.offerB = offer; trade.creditsB = credits; trade.confirmedA = false; trade.confirmedB = false }
    const partnerId = isA ? trade.playerBId : trade.playerAId
    io.to(partnerId).emit('trade:offer_updated', { tradeId: data.tradeId, offer, credits })
  })

  socket.on('trade:confirm', async (data: { tradeId: string }) => {
    const trade = activeTrades.get(data.tradeId)
    if (!trade) return
    const isA = trade.playerAId === socket.id
    if (!isA && trade.playerBId !== socket.id) return
    if (isA) trade.confirmedA = true; else trade.confirmedB = true
    const partnerId = isA ? trade.playerBId : trade.playerAId
    io.to(partnerId).emit('trade:partner_confirmed', { tradeId: data.tradeId })
    if (trade.confirmedA && trade.confirmedB) {

      // Validate both players still have enough credits
      const walA = wallets.get(trade.playerAId) ?? 0
      const walB = wallets.get(trade.playerBId) ?? 0
      if (trade.creditsA > walA || trade.creditsB > walB) {
        io.to(trade.playerAId).emit('trade:cancelled', { tradeId: data.tradeId })
        io.to(trade.playerBId).emit('trade:cancelled', { tradeId: data.tradeId })
        activeTrades.delete(data.tradeId)
        return
      }

      // Validate ownership — both players must own the items they offer
      const invA = inventories.get(trade.playerAId) ?? []
      const invB = inventories.get(trade.playerBId) ?? []
      const aOwnsAll = trade.offerA.every(id => invA.includes(id))
      const bOwnsAll = trade.offerB.every(id => invB.includes(id))
      if (!aOwnsAll || !bOwnsAll) {
        io.to(trade.playerAId).emit('trade:cancelled', { tradeId: data.tradeId })
        io.to(trade.playerBId).emit('trade:cancelled', { tradeId: data.tradeId })
        activeTrades.delete(data.tradeId)
        return
      }

      // Swap items
      const newInvA = [...invA.filter(id => !trade.offerA.includes(id)), ...trade.offerB]
      const newInvB = [...invB.filter(id => !trade.offerB.includes(id)), ...trade.offerA]
      inventories.set(trade.playerAId, newInvA)
      inventories.set(trade.playerBId, newInvB)

      // Transfer credits
      const newWalA = walA - trade.creditsA + trade.creditsB
      const newWalB = walB - trade.creditsB + trade.creditsA
      wallets.set(trade.playerAId, newWalA)
      wallets.set(trade.playerBId, newWalB)

      // Build receipt labels
      const itemName = (id: string) => SHOP_CATALOG.find(i => i.id === id)?.name ?? id
      const descA = [
        ...trade.offerB.map(itemName),
        ...(trade.creditsB > 0 ? [`₦${trade.creditsB}`] : []),
      ]
      const descB = [
        ...trade.offerA.map(itemName),
        ...(trade.creditsA > 0 ? [`₦${trade.creditsA}`] : []),
      ]

      const pa = players.get(trade.playerAId)
      const pb = players.get(trade.playerBId)
      try {
        if (pa) await saveUserProgress(normalizeUsername(pa.username), newWalA, newInvA)
        if (pb) await saveUserProgress(normalizeUsername(pb.username), newWalB, newInvB)
      } catch (e) {
        console.error('[trade:confirm] save', e)
      }

      io.to(trade.playerAId).emit('trade:completed', {
        tradeId: data.tradeId, inventory: newInvA, neonCredits: newWalA, catalog: SHOP_CATALOG,
        received: descA,
      })
      io.to(trade.playerBId).emit('trade:completed', {
        tradeId: data.tradeId, inventory: newInvB, neonCredits: newWalB, catalog: SHOP_CATALOG,
        received: descB,
      })

      // Personal receipt message to each player
      const sendReceipt = (targetId: string, desc: string[]) => {
        const msg = desc.length
          ? `Trade complete! You received: ${desc.join(', ')}`
          : 'Trade complete! (nothing received)'
        io.to(targetId).emit('trade:receipt', { text: msg })
      }
      sendReceipt(trade.playerAId, descA)
      sendReceipt(trade.playerBId, descB)

      activeTrades.delete(data.tradeId)
    }
  })

  socket.on('trade:cancel', (data: { tradeId: string }) => {
    const trade = activeTrades.get(data.tradeId)
    if (!trade) return
    if (trade.playerAId !== socket.id && trade.playerBId !== socket.id) return
    const partnerId = trade.playerAId === socket.id ? trade.playerBId : trade.playerAId
    io.to(partnerId).emit('trade:cancelled', { tradeId: data.tradeId })
    socket.emit('trade:cancelled', { tradeId: data.tradeId })
    activeTrades.delete(data.tradeId)
  })

  // ── Shop ─────────────────────────────────
  socket.on('get_shop', () => {
    socket.emit('shop_data', {
      items:       SHOP_CATALOG,
      neonCredits: wallets.get(socket.id) ?? 0,
      inventory:   inventories.get(socket.id) ?? [],
    })
  })

  socket.on('buy_item', async (data: { itemId: string }) => {
    const item = SHOP_CATALOG.find(i => i.id === data.itemId)
    if (!item) return
    const credits   = wallets.get(socket.id) ?? 0
    const inventory = inventories.get(socket.id) ?? []
    if (credits < item.price) return socket.emit('buy_item_error', { message: 'Not enough Neon Credits.' })
    if (inventory.includes(item.id)) return socket.emit('buy_item_error', { message: 'You already own this item.' })
    wallets.set(socket.id, credits - item.price)
    inventories.set(socket.id, [...inventory, item.id])
    const p = players.get(socket.id)
    if (p) {
      try {
        await saveUserProgress(
          normalizeUsername(p.username),
          wallets.get(socket.id)!,
          inventories.get(socket.id)!,
        )
      } catch (e) {
        console.error('[buy_item]', e)
      }
    }
    socket.emit('buy_item_success', {
      itemId:      item.id,
      neonCredits: wallets.get(socket.id)!,
      inventory:   inventories.get(socket.id)!,
    })
    console.log(`[shop] ${players.get(socket.id)?.username} bought ${item.name} for ${item.price}₦`)
  })

  socket.on('disconnect', async () => {
    const player = players.get(socket.id)
    if (!player) return

    try {
      await saveUserProgress(
        normalizeUsername(player.username),
        wallets.get(socket.id) ?? 0,
        inventories.get(socket.id) ?? [],
      )
    } catch (e) {
      console.error('[disconnect] save', e)
    }
    usernameToSocketId.delete(normalizeUsername(player.username))

    friendships.forEach(set => set.delete(socket.id))

    const room = rooms.get(player.roomId)
    if (room) {
      room.players.delete(socket.id)
      const leaveMsg: ChatMessage = {
        id: generateId(), playerId: 'system', username: 'Punk City', avatar: 'system',
        text: `${player.username} left the city`,
        roomId: player.roomId, timestamp: Date.now(), type: 'system',
      }
      addToHistory(room, leaveMsg)
      io.to(player.roomId).emit('chat:message', leaveMsg)
      socket.to(player.roomId).emit('player:left', { id: player.id })
    }
    friendships.get(socket.id)?.forEach(friendId => {
      io.to(friendId).emit('friend:offline', { id: socket.id })
    })
    pendingFriendRequests.delete(socket.id)
    pendingFriendRequests.forEach(set => set.delete(socket.id))
    friendships.delete(socket.id)
    // Cancel any active trade involving this player
    activeTrades.forEach((trade, tradeId) => {
      if (trade.playerAId === socket.id || trade.playerBId === socket.id) {
        const partnerId = trade.playerAId === socket.id ? trade.playerBId : trade.playerAId
        io.to(partnerId).emit('trade:cancelled', { tradeId })
        activeTrades.delete(tradeId)
      }
    })
    wallets.delete(socket.id)
    inventories.delete(socket.id)
    players.delete(socket.id)
    console.log(`[-] Disconnected: ${player.username}`)
  })
})

const PORT = process.env.PORT || 3001
initDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🏙️  Punk City server running on port ${PORT}`)
      console.log(`📡  Active rooms : ${[...rooms.keys()].join(', ')}`)
    })
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })

export { io, rooms, players }
export type { Player, ChatMessage, Room }