/**
 * ============================================================================
 * @schema-extractor/api - HTTP Extraction Route Controller
 * ============================================================================
 * Exposes POST /api/extract. Validates incoming HTTP payloads against the
 * shared extractionRequestSchema and delegates execution to runExtraction().
 */

import { Router, Request, Response } from 'express';
import {
    extractionRequestSchema,
    ExtractionResponse
} from '@schema-extractor/shared';
import { runExtraction } from '../services/extractor';

export const extractRouter = Router();

extractRouter.post('/', async (req: Request, res: Response) => {
    // 1. Validate incoming HTTP request body against our schema gatekeeper
    const validationResult = extractionRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
        const formattedErrors = validationResult.error.errors.map((err) => ({
            path: err.path.join('.') || 'body',
            message: err.message
        }));

        return res.status(400).json({
            success: false,
            isPartialSuccess: false,
            data: null,
            totalAttempts: 0,
            totalDurationMs: 0,
            totalTokensUsed: 0,
            repairLogs: [],
            fatalError: 'Request validation failed: ' + formattedErrors.map((e) => `[${e.path}]: ${e.message}`).join(', ')
        } satisfies ExtractionResponse);
    }

    try {
        // 2. Delegate to the self-healing extraction state machine
        const result = await runExtraction(validationResult.data);

        // If an unrecoverable fatal provider error occurred with no partial data
        if (result.fatalError && !result.success && !result.isPartialSuccess) {
            return res.status(502).json(result);
        }

        // 3. Return full extraction response (includes data, token stats, and repairLogs timeline)
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Unhandled server exception in /api/extract:', error);

        return res.status(500).json({
            success: false,
            isPartialSuccess: false,
            data: null,
            totalAttempts: 0,
            totalDurationMs: 0,
            totalTokensUsed: 0,
            repairLogs: [],
            fatalError: error?.message || 'An unexpected internal server error occurred.'
        } satisfies ExtractionResponse);
    }
});