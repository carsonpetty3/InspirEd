// Runs the real Express app as it's configured on Vercel, without a database or AI key,
// to check that it rejects bad input and protects admin routes. Makes no outside calls.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')

// Empty values also stop dotenv from loading a developer's real asset-admin/.env.
Object.assign(process.env, {
  VERCEL: '1',
  ADMIN_PASSWORD: 'test-password',
  MONGO_URI: '',
  GEMINI_API_KEY: '',
  BLOB_READ_WRITE_TOKEN: '',
  ALLOWED_ORIGINS: '',
  GOOGLE_SERVICE_ACCOUNT_JSON: '',
})
const app = require('../app')

let server, base
before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`
    resolve()
  })
}))
after(() => server.close())

const login = { Authorization: 'Basic ' + Buffer.from('admin:test-password').toString('base64') }
const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('changing content requires the admin login', async () => {
  assert.equal((await fetch(`${base}/assets/abc`, { method: 'DELETE' })).status, 401)
  assert.equal((await fetch(`${base}/upload`, { method: 'POST' })).status, 401)
})

test('with the login, admin requests get past the password check', async () => {
  const res = await fetch(`${base}/assets/abc`, { method: 'DELETE', headers: login })
  assert.equal(res.status, 503) // reaches the database step, which isn't configured here
})

test('the admin page loads after logging in', async () => {
  const res = await fetch(`${base}/admin/`, { headers: login })
  assert.equal(res.status, 200)
  assert.match(await res.text(), /<html/i)
})

test('without a database, content routes answer 503 instead of crashing', async () => {
  const res = await fetch(`${base}/assets/recommended`)
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: 'Database unavailable' })
})

test('transcription requires audio', async () => {
  const res = await post('/api/ai/transcribe', {})
  assert.equal(res.status, 500)
  assert.match((await res.json()).error, /audioBase64 or blobUrl/)
})

test('transcription only downloads audio from Vercel Blob', async () => {
  for (const blobUrl of ['http://169.254.169.254/latest', 'https://evil.example/a.webm', 'http://x.blob.vercel-storage.com/a']) {
    const res = await post('/api/ai/transcribe', { blobUrl })
    assert.match((await res.json()).error, /must be a Vercel Blob URL/, blobUrl)
  }
})

test('AI routes return a JSON error when no AI key is set', async () => {
  const res = await post('/api/ai/educational', { question: 'What is surfactant?' })
  assert.equal(res.status, 500)
  assert.ok((await res.json()).error)
})

test('video stream ids are validated', async () => {
  assert.equal((await fetch(`${base}/api/videos/..%2Fsecret/stream-url`)).status, 400)
})

test('without Drive configured, the video list is empty so the app shows demo videos', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/videos`)).json(), { videos: null })
})

test('other websites are not allowed to call the API', async () => {
  const res = await fetch(`${base}/api/videos`, { headers: { Origin: 'https://evil.example' } })
  assert.equal(res.headers.get('access-control-allow-origin'), null)
})
