const crypto = require('crypto')

/**
 * Protects the content-admin UI and every route that changes content.
 *
 * - ADMIN_PASSWORD unset locally: open, same as before (trusted LAN dev).
 * - ADMIN_PASSWORD unset on Vercel: admin is disabled entirely.
 * - ADMIN_PASSWORD set: HTTP Basic login (any username). A successful login sets an
 *   HttpOnly cookie so the admin pages' own fetch() calls are authorized too.
 */

const COOKIE = 'inspired_admin'

function sessionToken(password) {
  return crypto.createHmac('sha256', password).update('inspired-admin-v1').digest('hex')
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

function readCookie(req, name) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function basicPassword(req) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Basic ')) return null
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8')
  const i = decoded.indexOf(':')
  return i === -1 ? null : decoded.slice(i + 1)
}

function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    if (process.env.VERCEL) {
      return res.status(503).json({ error: 'Admin is disabled: ADMIN_PASSWORD is not set' })
    }
    return next()
  }

  const token = sessionToken(password)
  const cookie = readCookie(req, COOKIE)
  if (cookie && safeEqual(cookie, token)) return next()

  const given = basicPassword(req)
  if (given != null && safeEqual(given, password)) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? '; Secure' : ''}`
    )
    return next()
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="InspirEd admin", charset="UTF-8"')
  res.status(401).json({ error: 'Admin login required' })
}

module.exports = { adminAuth }
