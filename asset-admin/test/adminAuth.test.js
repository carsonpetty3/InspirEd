const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { adminAuth } = require('../lib/adminAuth')

/** Minimal stand-ins for Express's req/res, recording what the middleware does. */
function call({ headers = {}, secure = false } = {}) {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  let nextCalled = false
  adminAuth({ headers, secure }, res, () => { nextCalled = true })
  return { res, allowed: nextCalled }
}

const basic = (password) => 'Basic ' + Buffer.from(`anyone:${password}`).toString('base64')

beforeEach(() => {
  delete process.env.ADMIN_PASSWORD
  delete process.env.VERCEL
})

test('local server without a password stays open', () => {
  assert.equal(call().allowed, true)
})

test('deployed without a password, admin is disabled', () => {
  process.env.VERCEL = '1'
  const { res, allowed } = call()
  assert.equal(allowed, false)
  assert.equal(res.statusCode, 503)
})

test('no credentials asks the browser to log in', () => {
  process.env.ADMIN_PASSWORD = 'correct-horse'
  const { res, allowed } = call()
  assert.equal(allowed, false)
  assert.equal(res.statusCode, 401)
  assert.match(res.headers['www-authenticate'], /^Basic /)
})

test('wrong password is rejected', () => {
  process.env.ADMIN_PASSWORD = 'correct-horse'
  const { res, allowed } = call({ headers: { authorization: basic('wrong') } })
  assert.equal(allowed, false)
  assert.equal(res.statusCode, 401)
})

test('right password is let in and gets an HttpOnly session cookie', () => {
  process.env.ADMIN_PASSWORD = 'correct-horse'
  const { res, allowed } = call({ headers: { authorization: basic('correct-horse') }, secure: true })
  assert.equal(allowed, true)
  assert.match(res.headers['set-cookie'], /^inspired_admin=[0-9a-f]{64};/)
  assert.match(res.headers['set-cookie'], /HttpOnly/)
  assert.match(res.headers['set-cookie'], /Secure/)
})

test('the session cookie lets later requests in without a password', () => {
  process.env.ADMIN_PASSWORD = 'correct-horse'
  const cookie = call({ headers: { authorization: basic('correct-horse') } }).res.headers['set-cookie'].split(';')[0]
  assert.equal(call({ headers: { cookie } }).allowed, true)
})

test('a forged or stale cookie is rejected', () => {
  process.env.ADMIN_PASSWORD = 'correct-horse'
  assert.equal(call({ headers: { cookie: 'inspired_admin=' + 'a'.repeat(64) } }).allowed, false)
})

test('changing the password invalidates old cookies', () => {
  process.env.ADMIN_PASSWORD = 'correct-horse'
  const cookie = call({ headers: { authorization: basic('correct-horse') } }).res.headers['set-cookie'].split(';')[0]
  process.env.ADMIN_PASSWORD = 'new-password'
  assert.equal(call({ headers: { cookie } }).allowed, false)
})
