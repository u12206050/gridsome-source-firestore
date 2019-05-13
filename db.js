const admin = require('firebase-admin')

const CONFIG = {
  apiKey: process.env.GRIDSOME_API_KEY,
  databaseURL: process.env.GRIDSOME_DATABASE_URL,
  projectId: process.env.GRIDSOME_PROJECT_ID
}

if (!CONFIG.apiKey || !CONFIG.databaseURL || !CONFIG.projectId) throw new Error('Require GRIDSOME_API_KEY, GRIDSOME_DATABASE_URL & GRIDSOME_PROJECT_ID')

admin.initializeApp(CONFIG)
const db = admin.firestore()

module.exports = db