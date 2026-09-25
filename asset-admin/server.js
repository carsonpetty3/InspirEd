/**
 * Local asset-admin server (content admin UI + API for the Expo app).
 * On Vercel the same app runs as a function from ../api/index.js instead.
 */
const app = require('./app')
const { connectDb } = require('./lib/db')

const port = process.env.PORT || 3000

connectDb()
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) =>
    console.error('MongoDB connection error (AI routes still work via medical-knowledge.json):', err.message)
  )

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[prototype] ADMIN_PASSWORD is not set — admin routes are open. Use only on trusted networks.')
  }
})
