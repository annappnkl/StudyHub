import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/studyhub'
const DB_NAME = 'studyhub'

let client = null
let db = null

export async function connectDB() {
  if (db) return db

  try {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    db = client.db(DB_NAME)
    console.log('✅ Connected to MongoDB')
    return db
  } catch (err) {
    console.error('❌ MongoDB connection error:', err)
    throw err
  }
}

export async function getDB() {
  if (!db) {
    await connectDB()
  }
  return db
}

export async function closeDB() {
  if (client) {
    await client.close()
    client = null
    db = null
    console.log('MongoDB connection closed')
  }
}

