/**
 * Server Entry Point
 * 
 * Starts the Express server and connects to MongoDB.
 */

import { createApp } from './app.js';
import { connectDb } from './lib/db.js';

const PORT = process.env.PORT || 3000;

async function main(): Promise<void> {
  try {
    // Connect to MongoDB
    await connectDb();

    // Create and start Express app
    const app = createApp();

    app.listen(PORT, () => {
      console.log('');
      console.log('🚀 YouTube Channel Filter');
      console.log('─'.repeat(40));
      console.log(`   Server:      http://localhost:${PORT}`);
      console.log(`   Collections: http://localhost:${PORT}/collections`);
      console.log(`   API Health:  http://localhost:${PORT}/api/health`);
      console.log('─'.repeat(40));
      console.log('');
      console.log('API Endpoints:');
      console.log('   GET  /api/campaigns          - List campaigns');
      console.log('   POST /api/campaigns          - Create campaign');
      console.log('   GET  /api/channels           - List channels');
      console.log('   GET  /api/channels/stats     - Channel statistics');
      console.log('   POST /api/import/channels/*  - Import channels');
      console.log('   POST /api/process/extract    - Extract YouTube data');
      console.log('   POST /api/process/prefilter  - Start prefilter');
      console.log('   POST /api/process/ai-filter  - Start AI filter');
      console.log('   POST /api/export             - Export channels');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
