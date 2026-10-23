/**
 * ============================================================================
 * @schema-extractor/api - Core Orchestration & Self-Healing State Machine
 * ============================================================================
 * Coordinates the end-to-end extraction lifecycle:
 * 1. Pre-flight request validation via `extractionRequestSchema` (fieldSchema.ts)
 * 2. Dynamic runtime Zod schema compilation via `buildDynamicZodSchema` (schemaBuilder.ts)
 * 3. Initial & self-correcting inference loops with transient 429/5xx backoff
 * 4. Root JSON object guards, sanitization, and Zod validation
 * 5. Best-effort partial candidate tracking (prevents late-attempt regressions
 *    from wiping out mostly-valid earlier attempts)
 * 6. Complete diagnostic timeline logging (`repairPromptSent`, token quotas, etc.)
 */

import {
    ExtractionRequest,
    ExtractionResponse,
    RepairAttemptLog,
    FailureReasonType,
    ValidationErrorDetail,
    TokenUsage,
    extractionRequestSchema
} from '@schema-extractor/shared';
import { groqClient, DEFAULT_MODEL } from './llm';
import { buildSystemPrompt, sanitizeJsonResponse } from './prompter';
import { buildRepairPrompt } from './repairPrompter';
import { buildDynamicZodSchema, formatZodErrors } from './schemaBuilder';

// ----------------------------------------------------------------------------
// 1. INTERNAL HELPERS & DEFENSIVE GUARDS
// ----------------------------------------------------------------------------

/**
 * Tracks the highest-quality partial JSON across retries so that if Attempt #2
 * has 1 validation error and Attempt #3 breaks JSON syntax completely, we still
 * return Attempt #2's 90%-valid JSON as `isPartialSuccess: true`.
 */
interface BestCandidateSnapshot {
    data: Record<string, unknown>;
    errorCount: number;
    attemptNumber: number;
}

/**
 * Verifies that a parsed JSON value is a non-null plain object `{ ... }`
 * and not a primitive (`null`, `123`, `"str"`) or top-level array `[...]`.
 */
function isPlainJsonObject(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Extracts a clean error message from unknown caught exceptions.
 */
function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) {
        return err.message;
    }
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message: unknown }).message);
    }
    return fallback;
}

/**
 * Checks whether a Groq SDK error is a transient rate-limit (429) or
 * temporary server hiccup (500, 502, 503, 504) that can be retried after a brief pause.
 */
function isTransientProviderError(err: unknown): boolean {
    if (typeof err === 'object' && err !== null && 'status' in err) {
        const status = Number((err as { status: unknown }).status);
        return status === 429 || (status >= 500 && status < 600);
    }
    return false;
}

/**
 * Simple async delay helper for rate-limit backoff.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------------
// 2. CORE EXTRACTION STATE MACHINE
// ----------------------------------------------------------------------------

/**
 * Runs the self-healing extraction pipeline with automated validation and repair.
 */
export async function runExtraction(rawRequest: ExtractionRequest): Promise<ExtractionResponse> {
    const startTimeTotal = Date.now();
    const repairLogs: RepairAttemptLog[] = [];
    let totalTokensUsed = 0;

    // --------------------------------------------------------------------------
    // STEP 1: PRE-FLIGHT GATEKEEPER CHECK (`fieldSchema.ts`)
    // Protects the engine even if `runExtraction` is called directly from scripts/tests
    // --------------------------------------------------------------------------
    const requestCheck = extractionRequestSchema.safeParse(rawRequest);
    if (!requestCheck.success) {
        const issues = requestCheck.error.errors
            .map((e) => `${e.path.join('.') || 'request'}: ${e.message}`)
            .join('; ');

        return {
            success: false,
            isPartialSuccess: false,
            data: null,
            totalAttempts: 0,
            totalDurationMs: Date.now() - startTimeTotal,
            totalTokensUsed: 0,
            repairLogs: [],
            fatalError: `Invalid extraction request or schema configuration: ${issues}`
        };
    }

    const request = requestCheck.data;
    const maxRetries = Math.min(Math.max(request.maxRetries ?? 3, 0), 5);
    const maxTotalAttempts = maxRetries + 1; // 1 initial attempt + up to N repair retries

    // --------------------------------------------------------------------------
    // STEP 2: COMPILE DYNAMIC ZOD VALIDATOR & SYSTEM PROMPT ONCE UPFRONT
    // --------------------------------------------------------------------------
    let zodSchema;
    let baseSystemPrompt: string;

    try {
        zodSchema = buildDynamicZodSchema(request.schema);
        baseSystemPrompt = buildSystemPrompt(request.schema);
    } catch (err: unknown) {
        return {
            success: false,
            isPartialSuccess: false,
            data: null,
            totalAttempts: 0,
            totalDurationMs: Date.now() - startTimeTotal,
            totalTokensUsed: 0,
            repairLogs: [],
            fatalError: `Failed to compile dynamic Zod schema: ${getErrorMessage(err, 'Unknown compilation error')}`
        };
    }

    // --------------------------------------------------------------------------
    // STEP 3: STATE MACHINE TRACKING VARIABLES
    // --------------------------------------------------------------------------
    let currentAttempt = 0;
    let bestCandidate: BestCandidateSnapshot | null = null;

    // Context anchored to the best/latest attempt for constructing repair prompts
    let anchorOutputForRepair = '';
    let anchorFailureType: FailureReasonType = 'NONE';
    let anchorSyntaxError: string | undefined = undefined;
    let anchorValidationErrors: ValidationErrorDetail[] = [];

    // --------------------------------------------------------------------------
    // STEP 4: SELF-HEALING EXECUTION LOOP
    // --------------------------------------------------------------------------
    while (currentAttempt < maxTotalAttempts) {
        currentAttempt++;
        const attemptStartTime = Date.now();

        let systemPrompt: string;
        let userPrompt: string;

        if (currentAttempt === 1) {
            systemPrompt = baseSystemPrompt;
            userPrompt = `Extract structured data from the following source text and return ONLY a valid JSON object:\n\n${request.rawText}`;
        } else {
            // Keep the strict system rules + JSON keyword active so Groq's json_object mode never drifts
            systemPrompt = `${baseSystemPrompt}\n\nSELF-CORRECTION MODE ACTIVE: Your previous extraction attempt had errors. Follow the repair directives in the user message to return a corrected JSON object.`;

            userPrompt = buildRepairPrompt({
                rawText: request.rawText,
                schema: request.schema,
                previousOutput: anchorOutputForRepair,
                failureType: anchorFailureType,
                validationErrors: anchorValidationErrors,
                syntaxError: anchorSyntaxError,
                attemptNumber: currentAttempt
            });

            // Backfill `repairPromptSent` onto the previous attempt's log entry
            // so the frontend "Self-Healing Timeline" can display the exact prompt used!
            const previousLog = repairLogs[repairLogs.length - 1];
            if (previousLog) {
                previousLog.repairPromptSent = userPrompt;
            }
        }

        let attemptTokenUsage: TokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
        };

        // ------------------------------------------------------------------------
        // STEP 4A: CALL GROQ INFERENCE API (WITH TRANSIENT 429/5XX RETRY)
        // ------------------------------------------------------------------------
        let rawLlmOutput = '';

        try {
            const completion = await groqClient.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: currentAttempt === 1 ? 0.1 : 0.0, // Zero temperature on repairs for maximum determinism
                response_format: { type: 'json_object' }
            });

            if (completion.usage) {
                attemptTokenUsage = {
                    promptTokens: completion.usage.prompt_tokens ?? 0,
                    completionTokens: completion.usage.completion_tokens ?? 0,
                    totalTokens: completion.usage.total_tokens ?? 0
                };
                totalTokensUsed += attemptTokenUsage.totalTokens;
            }

            rawLlmOutput = completion.choices[0]?.message?.content ?? '';
        } catch (llmErr: unknown) {
            const durationMs = Date.now() - attemptStartTime;
            const errMsg = getErrorMessage(llmErr, 'Unknown LLM provider error');

            repairLogs.push({
                attemptNumber: currentAttempt,
                success: false,
                failureType: 'LLM_PROVIDER_ERROR',
                rawLlmOutput: '',
                parsedJson: null,
                jsonSyntaxError: errMsg,
                validationErrors: [],
                durationMs,
                tokenUsage: attemptTokenUsage
            });

            // If this was a temporary rate limit (429) or 5xx spike and we have attempts left, back off & retry
            if (isTransientProviderError(llmErr) && currentAttempt < maxTotalAttempts) {
                await sleep(1200 * currentAttempt);
                // IfAttempt #1 failed due to network/rate-limit, keep anchorFailureType as 'NONE'
                // or fallback so the next turn still acts properly
                if (!anchorOutputForRepair) {
                    anchorFailureType = 'INVALID_JSON_SYNTAX';
                    anchorSyntaxError = 'Previous attempt failed due to transient API error; please output valid JSON.';
                }
                continue;
            }

            // Non-recoverable provider error (e.g. invalid API key, model decommissioned)
            return {
                success: false,
                isPartialSuccess: bestCandidate !== null,
                data: bestCandidate ? bestCandidate.data : null,
                totalAttempts: currentAttempt,
                totalDurationMs: Date.now() - startTimeTotal,
                totalTokensUsed,
                repairLogs,
                fatalError: `LLM Provider Error: ${errMsg}`
            };
        }

        // ------------------------------------------------------------------------
        // STEP 4B: SANITIZE & PARSE JSON (WITH ROOT PLAIN-OBJECT GUARD)
        // ------------------------------------------------------------------------
        const cleanedJsonString = sanitizeJsonResponse(rawLlmOutput);
        let parsedJson: Record<string, unknown> | null = null;

        try {
            if (!cleanedJsonString) {
                throw new SyntaxError('Model returned an empty response body.');
            }

            const rawParsed: unknown = JSON.parse(cleanedJsonString);

            // Guard against valid JSON that is NOT a key-value object (e.g., `null`, `[]`, `123`, `"text"`)
            if (!isPlainJsonObject(rawParsed)) {
                const receivedType = Array.isArray(rawParsed)
                    ? 'JSON Array [...]'
                    : rawParsed === null
                        ? 'literal null'
                        : typeof rawParsed;
                throw new SyntaxError(
                    `Expected root JSON structure to be a key-value Object {...}, but received ${receivedType}.`
                );
            }

            parsedJson = rawParsed;
        } catch (parseErr: unknown) {
            const syntaxErrorMsg = getErrorMessage(parseErr, 'Invalid JSON syntax');
            const durationMs = Date.now() - attemptStartTime;

            repairLogs.push({
                attemptNumber: currentAttempt,
                success: false,
                failureType: 'INVALID_JSON_SYNTAX',
                rawLlmOutput,
                parsedJson: null,
                jsonSyntaxError: syntaxErrorMsg,
                validationErrors: [],
                durationMs,
                tokenUsage: attemptTokenUsage
            });

            // Only overwrite the repair anchor with broken syntax if we don't already have
            // a valid parsed JSON candidate from an earlier attempt to repair from
            if (!bestCandidate) {
                anchorOutputForRepair = cleanedJsonString || rawLlmOutput;
                anchorFailureType = 'INVALID_JSON_SYNTAX';
                anchorSyntaxError = syntaxErrorMsg;
                anchorValidationErrors = [];
            }

            continue;
        }

        // ------------------------------------------------------------------------
        // STEP 4C: VALIDATE PARSED JSON AGAINST DYNAMIC ZOD SCHEMA
        // ------------------------------------------------------------------------
        const validationResult = zodSchema.safeParse(parsedJson);
        const durationMs = Date.now() - attemptStartTime;

        if (validationResult.success) {
            // COMPLETE SUCCESS!
            // Use `validationResult.data` because Zod's `.preprocess()` and `.trim()`
            // have already coerced clean numeric strings ("850" -> 850) and trimmed whitespace!
            const validatedCleanData = validationResult.data as Record<string, unknown>;

            repairLogs.push({
                attemptNumber: currentAttempt,
                success: true,
                failureType: 'NONE',
                rawLlmOutput,
                parsedJson: validatedCleanData,
                validationErrors: [],
                durationMs,
                tokenUsage: attemptTokenUsage
            });

            return {
                success: true,
                isPartialSuccess: false,
                data: validatedCleanData,
                totalAttempts: currentAttempt,
                totalDurationMs: Date.now() - startTimeTotal,
                totalTokensUsed,
                repairLogs
            };
        }

        // ------------------------------------------------------------------------
        // STEP 4D: HANDLE ZOD VALIDATION FAILURES & RANK BEST PARTIAL CANDIDATE
        // ------------------------------------------------------------------------
        const formattedErrors = formatZodErrors(
            validationResult.error,
            parsedJson,
            request.schema
        );

        repairLogs.push({
            attemptNumber: currentAttempt,
            success: false,
            failureType: 'SCHEMA_VALIDATION_ERROR',
            rawLlmOutput,
            parsedJson,
            validationErrors: formattedErrors,
            durationMs,
            tokenUsage: attemptTokenUsage
        });

        // Update `bestCandidate` if this attempt had fewer validation errors than prior attempts
        // (or equal errors on a fresher attempt)
        if (!bestCandidate || formattedErrors.length <= bestCandidate.errorCount) {
            bestCandidate = {
                data: parsedJson,
                errorCount: formattedErrors.length,
                attemptNumber: currentAttempt
            };

            // Anchor the next repair prompt to this clean, pretty-printed JSON object
            // (NOT `rawLlmOutput`, which might contain markdown fences we don't want repeated)
            anchorOutputForRepair = JSON.stringify(parsedJson, null, 2);
            anchorFailureType = 'SCHEMA_VALIDATION_ERROR';
            anchorValidationErrors = formattedErrors;
            anchorSyntaxError = undefined;
        }
    }

    // --------------------------------------------------------------------------
    // STEP 5: RETRY BUDGET EXHAUSTED — RETURN BEST-EFFORT PARTIAL DATA IF AVAILABLE
    // --------------------------------------------------------------------------
    return {
        success: false,
        isPartialSuccess: bestCandidate !== null,
        data: bestCandidate ? bestCandidate.data : null,
        totalAttempts: currentAttempt,
        totalDurationMs: Date.now() - startTimeTotal,
        totalTokensUsed,
        repairLogs
    };
}