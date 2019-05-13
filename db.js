const firebase = require('firebase')

const isDev = process.env.NODE_ENV === 'development'

const CONFIG = {
  apiKey: process.env.GRIDSOME_API_KEY,
  databaseURL: process.env.GRIDSOME_DATABASE_URL,
  projectId: process.env.GRIDSOME_PROJECT_ID
}

if (!CONFIG.apiKey || !CONFIG.databaseURL || !CONFIG.projectId) throw new Error('Require GRIDSOME_API_KEY, GRIDSOME_DATABASE_URL & GRIDSOME_PROJECT_ID')

firebase.initializeApp(CONFIG)
const db = firebase.firestore()

// Enable persistance to subscribe while developing
if (isDev) db.enablePersistence()

module.exports db