/**
 * PUNK CITY — Backend Chat Temps Réel
 * Stack: Node.js + TypeScript + Socket.io
 */

import express          from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors             from 'cors'

interface Player {
  id:        string
  username:  string
  avatar:    string
  roomId:    string
  gridX:     number
  gridY:     number
  direction: string
}

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

const players = new Map<string, Player>()

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

const app    = express()
const server = createServer(app)

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

app.use(cors())
app.use(express.json())
app.get('/health', (_, res) => res.json({ status: 'ok', players: players.size }))

io.on('connection', (socket: Socket) => {
  console.log(`[+] Connection: ${socket.id}`)

  socket.on('player:join', (data: {
    username: string; avatar: string; roomId: string
    gridX: number; gridY: number; direction: string
  }) => {
    const roomId = data.roomId || 'genesis-plaza'
    const room   = rooms.get(roomId)
    if (!room) return socket.emit('error', { message: 'Room not found' })

    const player: Player = {
      id:        socket.id,
      username:  data.username  || `Punk_${generateId()}`,
      avatar:    data.avatar    || 'default',
      roomId,
      gridX:     data.gridX    ?? 5,
      gridY:     data.gridY    ?? 5,
      direction: data.direction || 'sw',
    }

    players.set(socket.id, player)
    room.players.set(socket.id, player)
    socket.join(roomId)

    socket.emit('player:joined', {
      player,
      players: getPlayersInRoom(roomId),
      history: room.history,
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
    const newRoom = rooms.get(data.roomId)
    if (!newRoom) return socket.emit('error', { message: 'Room not found' })

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

    const joinMsg: ChatMessage = {
      id: generateId(), playerId: 'system', username: 'Punk City', avatar: 'system',
      text: `${player.username} arrived from ${oldRoom?.name ?? '???'}`,
      roomId: data.roomId, timestamp: Date.now(), type: 'system',
    }
    addToHistory(newRoom, joinMsg)
    io.to(data.roomId).emit('chat:message', joinMsg)
  })

  socket.on('disconnect', () => {
    const player = players.get(socket.id)
    if (!player) return
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
    players.delete(socket.id)
    console.log(`[-] Disconnected: ${player.username}`)
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`🏙️  Punk City server running on port ${PORT}`)
  console.log(`📡  Active rooms : ${[...rooms.keys()].join(', ')}`)
})

export { io, rooms, players }
export type { Player, ChatMessage, Room }