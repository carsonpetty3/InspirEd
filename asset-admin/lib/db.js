const mongoose = require('mongoose')

/** Cached across warm serverless invocations so each request doesn't reconnect. */
let connecting = null

function connectDb() {
  if (!process.env.MONGO_URI) {
    return Promise.reject(new Error('MONGO_URI is not configured'))
  }
  if (!connecting) {
    connecting = mongoose.connect(process.env.MONGO_URI).catch((err) => {
      connecting = null
      throw err
    })
  }
  return connecting
}

module.exports = { connectDb }
