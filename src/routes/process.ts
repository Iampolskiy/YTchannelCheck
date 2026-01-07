/**
 * Process Routes
 * 
 * Job management for prefilter and AI filter pipelines.
 * Per Lastenheft: Sequential processing, immediate persistence.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { validateBody } from '../middleware/index.js';
import { PrefilterOptionsSchema, AIFilterOptionsSchema, ExtractorOptionsSchema } from '../schemas/index.js';
import { runPrefilterPipeline, type PrefilterStats, type PrefilterPipelineOptions } from '../lib/prefilter/index.js';
import { runExtractorPipeline, type ExtractorStats, type ExtractorOptions } from '../lib/extractor/index.js';

const router = Router();

// ============================================================================
// Job Storage (in-memory for now)
// ============================================================================

type JobProgress = PrefilterStats | ExtractorStats | null;

interface Job {
  id: string;
  type: 'prefilter' | 'ai-filter' | 'extract';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  progress: JobProgress;
  error?: string;
  listeners: Set<Response>;
}

const jobs = new Map<string, Job>();

// ============================================================================
// SSE Helper
// ============================================================================

function emitToListeners(job: Job, event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of job.listeners) {
    res.write(message);
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/process/prefilter
 * Start the prefilter pipeline for all unchecked channels
 */
router.post(
  '/prefilter',
  validateBody(PrefilterOptionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const options = req.body;
      
      // Create job
      const jobId = randomUUID();
      const job: Job = {
        id: jobId,
        type: 'prefilter',
        status: 'pending',
        startedAt: new Date(),
        progress: null,
        listeners: new Set(),
      };
      jobs.set(jobId, job);

      // Start pipeline in background
      setImmediate(async () => {
        job.status = 'running';
        
        try {
          const pipelineOptions: PrefilterPipelineOptions = {
            requireDachLocation: options.locationFilter?.enabled ?? true,
            maxNonGermanCharsPerField: options.alphabetFilter?.maxBadCharsDistinct ?? 5,
            minGermanWordsDistinct: options.languageFilter?.minGermanWords ?? 5,
            batchSize: 100,
            
            onProgress: (stats: PrefilterStats) => {
              job.progress = stats;
              emitToListeners(job, 'progress', {
                jobId,
                status: 'running',
                progress: stats,
              });
            },
            
            onLog: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => {
              emitToListeners(job, 'log', { level, message, data });
            },
          };

          const result = await runPrefilterPipeline(pipelineOptions);
          
          job.status = 'completed';
          job.completedAt = new Date();
          job.progress = result;
          
          emitToListeners(job, 'complete', {
            jobId,
            status: 'completed',
            progress: result,
          });
        } catch (error) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
          job.completedAt = new Date();
          
          emitToListeners(job, 'error', {
            jobId,
            status: 'failed',
            error: job.error,
          });
        }
      });

      res.json({
        ok: true,
        message: 'Prefilter job started',
        jobId,
        options,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/process/ai-filter
 * Start the AI filter pipeline for all prefiltered channels
 */
router.post(
  '/ai-filter',
  validateBody(AIFilterOptionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const options = req.body;

      // TODO: Implement job creation and execution with Ollama
      // This will be completed in Step 8: AI Filter Pipeline
      
      res.json({
        ok: true,
        message: 'AI filter job started (not yet implemented)',
        jobId: randomUUID(),
        options,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/process/extract
 * Start the YouTube data extraction pipeline
 */
router.post(
  '/extract',
  validateBody(ExtractorOptionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const options = req.body as ExtractorOptions;

      // Create job
      const jobId = randomUUID();
      const job: Job = {
        id: jobId,
        type: 'extract',
        status: 'pending',
        startedAt: new Date(),
        progress: null,
        listeners: new Set(),
      };
      jobs.set(jobId, job);

      // Start pipeline in background
      setImmediate(async () => {
        job.status = 'running';

        try {
          const result = await runExtractorPipeline({
            ...options,
            onProgress: (stats: ExtractorStats) => {
              job.progress = stats;
              emitToListeners(job, 'progress', {
                jobId,
                status: 'running',
                progress: stats,
              });
            },
            onLog: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => {
              emitToListeners(job, 'log', { level, message, data });
            },
          });

          job.status = result.captchaDetected ? 'failed' : 'completed';
          job.completedAt = new Date();
          job.progress = result;
          
          if (result.captchaDetected) {
            job.error = 'Captcha detected - extraction stopped';
          }

          emitToListeners(job, result.captchaDetected ? 'error' : 'complete', {
            jobId,
            status: job.status,
            progress: result,
            error: job.error,
          });
        } catch (error) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
          job.completedAt = new Date();

          emitToListeners(job, 'error', {
            jobId,
            status: 'failed',
            error: job.error,
          });
        }
      });

      res.json({
        ok: true,
        message: 'YouTube extraction job started',
        jobId,
        options,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/process/jobs/:jobId
 * Get job status
 */
router.get(
  '/jobs/:jobId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = req.params;
      const job = jobs.get(jobId);

      if (!job) {
        res.status(404).json({
          ok: false,
          error: 'Job not found',
        });
        return;
      }

      res.json({
        ok: true,
        jobId: job.id,
        type: job.type,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        progress: job.progress,
        error: job.error,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/process/jobs/:jobId/stream
 * SSE stream for job progress
 */
router.get(
  '/jobs/:jobId/stream',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    if (!job) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
      res.end();
      return;
    }

    // Add listener
    job.listeners.add(res);

    // Send initial snapshot
    res.write(`event: snapshot\n`);
    res.write(`data: ${JSON.stringify({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
    })}\n\n`);

    // If job is already complete, send that and close
    if (job.status === 'completed' || job.status === 'failed') {
      res.write(`event: ${job.status === 'completed' ? 'complete' : 'error'}\n`);
      res.write(`data: ${JSON.stringify({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        error: job.error,
      })}\n\n`);
    }

    // Keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`event: ping\n`);
      res.write(`data: ${JSON.stringify({ t: Date.now() })}\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      job.listeners.delete(res);
    });
  }
);

/**
 * GET /api/process/jobs
 * List all jobs
 */
router.get(
  '/jobs',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobList = Array.from(jobs.values()).map(job => ({
        id: job.id,
        type: job.type,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      }));

      res.json({
        ok: true,
        jobs: jobList,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
