/**
 * Express Application
 * 
 * Main Express app configuration with all routes and middleware.
 */

import express, { Application } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { errorHandler, notFoundHandler } from './middleware/index.js';
import {
  campaignRoutes,
  channelRoutes,
  processRoutes,
  exportRoutes,
  importRoutes,
} from './routes/index.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // ==========================================================================
  // Middleware
  // ==========================================================================
  
  // Increased limit for large folder uploads (HTML files)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ==========================================================================
  // API Routes
  // ==========================================================================
  
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/process', processRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/import', importRoutes);

  // ==========================================================================
  // Health Check
  // ==========================================================================
  
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================================================
  // Static Files (Public folder)
  // ==========================================================================
  
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // Serve index.html for root
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Serve collections page
  app.get('/collections', (_req, res) => {
    res.sendFile(path.join(publicDir, 'collections.html'));
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================
  
  // 404 for unknown API routes
  app.use('/api/*', notFoundHandler);
  
  // Global error handler
  app.use(errorHandler);

  return app;
}
