/**
 * Database Connection Module
 * 
 * Handles MongoDB connection via Mongoose.
 * Per .cursorrules: Handle connection errors gracefully at startup.
 */

import mongoose from 'mongoose';

// Connection state
let isConnected = false;

// Default connection string (local MongoDB)
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/youtubeChannelFilter';

/**
 * Connect to MongoDB
 * 
 * Uses singleton pattern to prevent multiple connections.
 * Throws on connection failure for graceful error handling.
 */
export async function connectDb(): Promise<void> {
  if (isConnected) {
    return;
  }

  const uri = process.env.MONGO_URI || DEFAULT_MONGO_URI;

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log('✅ MongoDB connected:', uri);
  } catch (err) {
    isConnected = false;
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ MongoDB connection failed:', message);
    throw err;
  }
}

/**
 * Disconnect from MongoDB
 * 
 * Useful for cleanup in tests or graceful shutdown.
 */
export async function disconnectDb(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('🔌 MongoDB disconnected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ MongoDB disconnect failed:', message);
    throw err;
  }
}

/**
 * Check if database is connected
 */
export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

// Re-export mongoose for direct access if needed
export { mongoose };

