/**
 * URL du serveur Socket.io — en prod (Heroku), même origine que la page.
 */
export function getSocketServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://localhost:3001'
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
