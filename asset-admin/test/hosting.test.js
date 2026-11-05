// Tests the Vercel hosting setup: api/index.js (the online server) and vercel.json.
// No database or AI key is used, and no outside calls are made.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const path = require('path')
const fs = require('fs')

// Empty values also stop dotenv from loading a developer's real asset-admin/.env.
Object.assign(process.env, { VERCEL: '1', MONGO_URI: '', GEMINI_API_KEY: '' })
const handler = require('../../api/index')
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'))

let server, base
before(() => new Promise((resolve) => {
  server = http.createServer(handler).listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`
    resolve()
  })
}))
after(() => server.close())

// ── The online server is read-only ──────────────────────────────────────
test('uploading content is blocked online', async () => {
  const res = await fetch(`${base}/upload`, { method: 'POST' })
  assert.equal(res.status, 403)
  assert.match((await res.json()).error, /local admin page/)
})

test('editing and deleting content are blocked online', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await fetch(`${base}/assets/abc123`, { method })).status, 403, method)
  }
  assert.equal((await fetch(`${base}/assets/abc123/generate-embeddings`, { method: 'POST' })).status, 403)
})

test('reading content gets past the guard (503 here only because no database is set)', async () => {
  const res = await fetch(`${base}/assets/recommended`)
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: 'Database unavailable' })
})

test('/api search routes may use POST, since they only read', async () => {
  const res = await fetch(`${base}/api/rag/search`, { method: 'POST' })
  assert.notEqual(res.status, 403)
})

test('loading server.js does not start its own server', () => {
  const app = require('../server')
  assert.equal(typeof app, 'function') // an Express app, exported for api/index.js
})

// ── vercel.json ─────────────────────────────────────────────────────────
test('the web build blanks the Gemini key so it can never be bundled into the site', () => {
  assert.match(vercel.buildCommand, /(^|\s)GEMINI_API_KEY= /)
  assert.match(vercel.buildCommand, /EXPO_PUBLIC_GEMINI_API_KEY= /)
})

test('the app calls its own server (empty EXPO_PUBLIC_API_URL means same-site URLs)', () => {
  assert.match(vercel.buildCommand, /EXPO_PUBLIC_API_URL= /)
})

test('the admin page and uploads are not routed to the online server', () => {
  const sources = vercel.rewrites.map((r) => r.source)
  assert.ok(!sources.some((s) => s.startsWith('/admin') || s === '/upload'), sources.join(', '))
})

test('security headers are set on every page', () => {
  const keys = vercel.headers.flatMap((h) => h.headers.map((x) => x.key))
  for (const key of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'X-Robots-Tag']) {
    assert.ok(keys.includes(key), key)
  }
})
