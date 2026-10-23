/**
 * ============================================================================
 * @schema-extractor/api - Express Application Server Entry Point
 * ============================================================================
 */

import dotenv from 'dotenv';
// Load environment variables before importing services
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { extractRouter } from './routes/extract';

const app = express();
const PORT = process.env.PORT || 3001;

// ----------------------------------------------------------------------------
// 1. GLOBAL MIDDLEWARE
// ----------------------------------------------------------------------------

// Enable CORS for frontend communication (supports Vite dev server at 5173)
app.use(
    cors({
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    })
);

// Body parser with 2MB ceiling to safely accommodate long text inputs
app.use(express.json({ limit: '2mb' }));

// ----------------------------------------------------------------------------
// 2. HEALTH CHECK & DIAGNOSTICS
// ----------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: '@schema-extractor/api'
    });
});

// ----------------------------------------------------------------------------
// 3. API ROUTES
// ----------------------------------------------------------------------------

// Mounts extractRouter so POST / becomes POST /api/extract
app.use('/api/extract', extractRouter);

// ----------------------------------------------------------------------------
// 4. ERROR BOUNDARIES & 404 HANDLER
// ----------------------------------------------------------------------------

// Catch-all 404 for undefined endpoints
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Global Express error-handling middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ----------------------------------------------------------------------------
// 5. SERVER START
// ----------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`  Schema Extractor API running at http://localhost:${PORT}`);
    console.log(`  - Extraction Endpoint: POST http://localhost:${PORT}/api/extract`);
    console.log(`  - Health Check       : GET  http://localhost:${PORT}/health`);
    console.log(`===================================================`);
});

export default app;