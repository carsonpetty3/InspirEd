/**
 * Google Drive video library (moved from utils/googleDrive.ts so the service-account
 * private key stays on the server).
 */
const crypto = require('crypto')

let accessToken = null
let tokenExpiry = 0

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error('[drive] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
    return null
  }
}

function isDriveConfigured() {
  return !!(getCredentials() && process.env.GOOGLE_DRIVE_VIDEO_FOLDER_ID)
}

const b64url = (buf) => Buffer.from(buf).toString('base64url')

async function getAccessToken() {
  const creds = getCredentials()
  if (!creds) return null

  const now = Date.now()
  if (accessToken && tokenExpiry > now + 60000) return accessToken

  const iat = Math.floor(now / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: iat + 3600,
      iat
    })
  )
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(creds.private_key)
  const jwt = `${header}.${claim}.${b64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })
  if (!res.ok) throw new Error(`Drive token request failed: ${res.status}`)
  const data = await res.json()
  accessToken = data.access_token
  tokenExpiry = now + data.expires_in * 1000
  return accessToken
}

function formatDuration(milliseconds) {
  if (!milliseconds) return 'Unknown'
  const ms = parseInt(milliseconds, 10)
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function extractCategoryFromName(name) {
  const match = name.match(/^\[([^\]]+)\]/)
  if (match) return match[1]
  const lower = name.toLowerCase()
  if (lower.includes('surfactant')) return 'Surfactant Basics'
  if (lower.includes('breathing') || lower.includes('respiratory')) return 'Breathing & Lungs'
  if (lower.includes('treatment') || lower.includes('therapy')) return 'Treatments'
  if (lower.includes('daily') || lower.includes('care')) return 'Daily Care'
  return 'General'
}

function cleanVideoTitle(name) {
  return name
    .replace(/^\[([^\]]+)\]\s*/, '')
    .replace(/\.(mp4|mov|avi|mkv|webm)$/i, '')
    .trim()
}

/** @returns {Promise<object[] | null>} null when Drive isn't configured (app shows demo videos). */
async function listEducationalVideos() {
  if (!isDriveConfigured()) return null
  const token = await getAccessToken()
  const folderId = process.env.GOOGLE_DRIVE_VIDEO_FOLDER_ID

  const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`
  const fields = 'files(id,name,description,thumbnailLink,webContentLink,videoMediaMetadata,createdTime,properties)'
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=name`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`)
  const data = await res.json()

  return data.files.map((file, index) => ({
    id: file.id,
    title: cleanVideoTitle(file.name),
    description: file.description || 'Educational video about pediatric pulmonary health.',
    thumbnailUrl: file.thumbnailLink || '',
    videoUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
    duration: formatDuration(file.videoMediaMetadata?.durationMillis),
    category: file.properties?.category || extractCategoryFromName(file.name),
    order: parseInt(file.properties?.order || String(index), 10),
    createdAt: file.createdTime || new Date().toISOString()
  }))
}

/**
 * Stream URL for one video. It embeds a short-lived (≤1h), read-only token for the
 * service account, which can only see the shared video folder.
 */
async function getVideoStreamUrl(videoId) {
  if (!isDriveConfigured()) return null
  const token = await getAccessToken()
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(videoId)}?alt=media&access_token=${token}`
}

module.exports = { listEducationalVideos, getVideoStreamUrl }
