/**
 * Persistance PostgreSQL — profils joueurs, ₦ Neon Credits, inventaire, amitiés.
 */
import pg from 'pg'

const DEFAULT_CREDITS = 500

import dotenv from 'dotenv'

dotenv.config()

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export interface UserProfile {
  username:       string
  displayName:    string
  avatar:         string
  bio:            string
  neonCredits:    number
  inventory:      string[]
  createdAt:      number
  updatedAt:      number
}

let pool: pg.Pool | null = null

function getPool(): pg.Pool {
  if (!pool) throw new Error('[db] Base non initialisée — appeler initDatabase() au démarrage')
  return pool
}

export async function initDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString?.trim()) {
    throw new Error(
      '[db] DATABASE_URL est requis (ex. postgresql://user:motdepasse@localhost:5432/punkcity)',
    )
  }
  if (pool) return
  pool = new pg.Pool({
    connectionString,
    max:             20,
    idleTimeoutMillis: 30_000,
  })
  pool.on('error', err => {
    console.error('[db] Erreur pool PostgreSQL', err)
  })
  await migrate(pool)
  console.log('[db] PostgreSQL — schéma prêt')
}

async function migrate(p: pg.Pool) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT 'default',
      bio TEXT NOT NULL DEFAULT '',
      neon_credits INTEGER NOT NULL DEFAULT ${DEFAULT_CREDITS},
      inventory_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friendships (
      user_low TEXT NOT NULL,
      user_high TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_low, user_high)
    );
  `)
}

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function rowToProfile(row: {
  username: string
  display_name: string
  avatar: string
  bio: string
  neon_credits: number
  inventory_json: unknown
  created_at: string | number
  updated_at: string | number
}): UserProfile {
  let inventory: string[] = []
  const inv = row.inventory_json
  if (Array.isArray(inv)) {
    inventory = inv.filter((x): x is string => typeof x === 'string')
  } else if (typeof inv === 'string') {
    try {
      const p = JSON.parse(inv)
      if (Array.isArray(p)) inventory = p.filter((x): x is string => typeof x === 'string')
    } catch {
      inventory = []
    }
  }
  return {
    username:    row.username,
    displayName: row.display_name,
    avatar:      row.avatar,
    bio:         row.bio ?? '',
    neonCredits: Number(row.neon_credits),
    inventory,
    createdAt:   Number(row.created_at),
    updatedAt:   Number(row.updated_at),
  }
}

export async function upsertUserOnJoin(
  normalizedUsername: string,
  displayName: string,
  avatar: string,
): Promise<UserProfile> {
  const p = getPool()
  const now = Date.now()
  await p.query(
    `
    INSERT INTO users (username, display_name, avatar, bio, neon_credits, inventory_json, created_at, updated_at)
    VALUES ($1, $2, $3, '', $4, '[]'::jsonb, $5, $6)
    ON CONFLICT (username) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar = EXCLUDED.avatar,
      updated_at = EXCLUDED.updated_at
    `,
    [normalizedUsername, displayName.slice(0, 64), avatar.slice(0, 64), DEFAULT_CREDITS, now, now],
  )
  return getUserOrThrow(normalizedUsername)
}

export async function getUserOrThrow(normalizedUsername: string): Promise<UserProfile> {
  const p = getPool()
  const { rows } = await p.query(
    'SELECT * FROM users WHERE username = $1',
    [normalizedUsername],
  )
  const row = rows[0]
  if (!row) throw new Error(`User not found: ${normalizedUsername}`)
  return rowToProfile(row as Parameters<typeof rowToProfile>[0])
}

export async function saveUserProgress(
  normalizedUsername: string,
  neonCredits: number,
  inventory: string[],
): Promise<void> {
  const p = getPool()
  const now = Date.now()
  await p.query(
    `
    UPDATE users
    SET neon_credits = $1, inventory_json = $2::jsonb, updated_at = $3
    WHERE username = $4
    `,
    [
      Math.max(0, Math.floor(neonCredits)),
      JSON.stringify(inventory.slice(0, 200)),
      now,
      normalizedUsername,
    ],
  )
}

export async function updateProfileBio(normalizedUsername: string, bio: string): Promise<void> {
  const p = getPool()
  await p.query(
    'UPDATE users SET bio = $1, updated_at = $2 WHERE username = $3',
    [bio.slice(0, 500), Date.now(), normalizedUsername],
  )
}

export async function addFriendship(u1: string, u2: string): Promise<void> {
  const p = getPool()
  const a = normalizeUsername(u1)
  const b = normalizeUsername(u2)
  if (a === b) return
  const [low, high] = sortedPair(a, b)
  const now = Date.now()
  await p.query(
    `
    INSERT INTO friendships (user_low, user_high, created_at)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
    `,
    [low, high, now],
  )
}

export async function getFriendNormalizedUsernames(normalizedUsername: string): Promise<string[]> {
  const p = getPool()
  const { rows } = await p.query(
    `
    SELECT user_low, user_high FROM friendships
    WHERE user_low = $1 OR user_high = $1
    `,
    [normalizedUsername],
  ) as { rows: { user_low: string; user_high: string }[] }
  const out: string[] = []
  for (const r of rows) {
    out.push(r.user_low === normalizedUsername ? r.user_high : r.user_low)
  }
  return out
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
