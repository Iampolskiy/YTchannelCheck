import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { createApp } from './src/app.js'; // Import existing Express app
import { connectDb } from './src/lib/db.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js
const nextApp = next({ dev, hostname, port });
const handle = nextApp.getRequestHandler();

async function main() {
  try {
    // 1. Connect to DB
    await connectDb();

    // 2. Prepare Next.js
    await nextApp.prepare();

    // 3. Get Express App
    const expressApp = createApp();

    // 4. Handle Next.js requests for non-API routes
    // We mount Next.js handler *after* API routes but *before* 404 handler
    // Ideally, we modify createApp to let us inject this, but for now we can wrap it.
    
    // Actually, it's easier to create a new server that uses expressApp for /api
    // and Next.js for everything else.
    
    const server = createServer(async (req, res) => {
      const parsedUrl = parse(req.url!, true);
      const { pathname } = parsedUrl;

      // Let Express handle /api requests
      if (pathname?.startsWith('/api')) {
        expressApp(req, res);
      } else {
        // Let Next.js handle everything else
        await handle(req, res, parsedUrl);
      }
    });

    server.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log('> Backend API at /api/*');
      console.log('> Frontend UI at /*');
    });

  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

main();

