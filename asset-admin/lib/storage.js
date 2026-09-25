/**
 * Where uploaded content files live.
 *
 * - BLOB_READ_WRITE_TOKEN set (Vercel, or local admin pointed at the shared store):
 *   files go to Vercel Blob and `file_path` is the absolute Blob URL.
 * - Otherwise: local disk under asset-admin/uploads, `file_path` is `/uploads/<name>`.
 *
 * Swap the Blob branch for Google Cloud Storage when moving to GCP.
 */
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const ALLOWED_EXT = /^(mp4|mov|png|jpg|jpeg|pdf|txt|html|vtt|srt)$/

function usesBlob() {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function uniqueName(originalname) {
  return Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(originalname).toLowerCase()
}

function createUploadMiddleware() {
  let storage
  if (usesBlob()) {
    storage = multer.memoryStorage()
  } else {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    } catch (err) {
      console.warn('[storage] uploads dir not writable:', err.message)
    }
    storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => cb(null, uniqueName(file.originalname))
    })
  }

  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(1)
      ALLOWED_EXT.test(ext) ? cb(null, true) : cb(new Error('File type not allowed'))
    }
  })
}

/**
 * Persist one multer file and return the path to store on the Asset.
 * @param {Express.Multer.File | undefined} file
 */
async function persistFile(file) {
  if (!file) return null
  if (!usesBlob()) return `/uploads/${file.filename}`

  const { put } = require('@vercel/blob')
  const blob = await put(`assets/${uniqueName(file.originalname)}`, file.buffer, {
    access: 'public',
    contentType: file.mimetype
  })
  return blob.url
}

/**
 * Read a stored file back (for RAG ingest). Returns null when it no longer exists.
 * @param {string} storedPath `/uploads/<name>` or an absolute URL
 */
async function readStoredFile(storedPath) {
  if (!storedPath) return null
  if (/^https?:\/\//i.test(storedPath)) {
    const res = await fetch(storedPath)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Could not download ${storedPath}: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  const abs = path.join(UPLOAD_DIR, path.basename(storedPath))
  return fs.existsSync(abs) ? fs.readFileSync(abs) : null
}

/** Lower-case extension for a stored path or URL, e.g. `.pdf`. */
function storedExtname(storedPath) {
  const p = /^https?:\/\//i.test(storedPath) ? new URL(storedPath).pathname : storedPath
  return path.extname(p).toLowerCase()
}

module.exports = {
  UPLOAD_DIR,
  usesBlob,
  createUploadMiddleware,
  persistFile,
  readStoredFile,
  storedExtname
}
