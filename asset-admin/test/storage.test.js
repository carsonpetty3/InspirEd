const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { usesBlob, persistFile, readStoredFile, storedExtname, UPLOAD_DIR } = require('../lib/storage')

beforeEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN
})

test('uses local disk unless a Blob token is set', () => {
  assert.equal(usesBlob(), false)
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test'
  assert.equal(usesBlob(), true)
})

test('a locally saved upload is stored as /uploads/<name>', async () => {
  assert.equal(await persistFile({ filename: '123-lesson.pdf' }), '/uploads/123-lesson.pdf')
})

test('no file means no stored path', async () => {
  assert.equal(await persistFile(undefined), null)
  assert.equal(await readStoredFile(null), null)
})

test('reads a file that exists in uploads', async () => {
  const name = fs.readdirSync(UPLOAD_DIR).find((f) => f.endsWith('.pdf'))
  const buf = await readStoredFile(`/uploads/${name}`)
  assert.ok(Buffer.isBuffer(buf))
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
})

test('a missing upload returns null instead of throwing', async () => {
  assert.equal(await readStoredFile('/uploads/does-not-exist.pdf'), null)
})

test('stored paths cannot escape the uploads folder', async () => {
  // Only the file name is used, so "../" tricks resolve inside uploads/ (and don't exist).
  assert.equal(await readStoredFile('/uploads/../../package.json'), null)
  assert.equal(await readStoredFile(path.join('..', 'server.js')), null)
})

test('file extensions are read from local paths and Blob URLs', () => {
  assert.equal(storedExtname('/uploads/123-Lesson.PDF'), '.pdf')
  assert.equal(storedExtname('https://abc.public.blob.vercel-storage.com/assets/1-x.mp4?download=1'), '.mp4')
  assert.equal(storedExtname('/uploads/notes'), '')
})
