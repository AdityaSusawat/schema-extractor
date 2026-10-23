/**
 * ============================================================================
 * @schema-extractor/api - Targeted Self-Correction Prompt Generator
 * ============================================================================
 * Constructs surgical repair prompts when an LLM extraction attempt fails.
 * Fully synchronized with `schemaBuilder.ts` and `prompter.ts` to handle:
 * - Trailing & nested array indices (both primitive lists and object tables)
 * - Explicit '[MISSING_KEY]' vs literal `null` distinctions
 * - Structural JSON skeleton previews
 * - Output length capping to protect free-tier token quotas
 */

import {
    ValidationErrorDetail,
    FailureReasonType,
    FieldDefinition
} from '@schema-extractor/shared';
import { buildSchemaInstructions, buildJsonSkeleton } from './prompter';

export interface BuildRepairPromptParams {
    rawText: string;
    schema: FieldDefinition[];
    previousOutput: string;
    failureType: FailureReasonType;
    validationErrors?: ValidationErrorDetail[];
    syntaxError?: string;
    attemptNumber: number;
}

/**
 * Maximum characters of a broken LLM output to echo back into the repair prompt.
 * Prevents runaway generation on Attempt #1 from exhausting free-tier token limits.
 */
const MAX_PREVIOUS_OUTPUT_CHARS = 3500;

/**
 * Truncates abnormally long previous outputs safely.
 */
function truncateOutput(text: string): string {
    const cleaned = text.trim();
    if (cleaned.length <= MAX_PREVIOUS_OUTPUT_CHARS) {
        return cleaned;
    }
    return `${cleaned.slice(0, MAX_PREVIOUS_OUTPUT_CHARS)}\n...[TRUNCATED DUE TO LENGTH]...`;
}

/**
 * Converts dot-notation error paths (including both mid-path table indices like
 * "lineItems.1.price" AND trailing primitive array indices like "tags.2")
 * into unambiguous human + zero-indexed coordinates.
 */
function formatReadableErrorPath(rawPath: string): string {
    if (!rawPath || rawPath === 'root') {
        return 'Root JSON Object';
    }

    return rawPath
        .split('.')
        .map((segment) => {
            if (/^\d+$/.test(segment)) {
                const idx = Number(segment);
                return `Item #${idx + 1} (array index ${idx})`;
            }
            return `"${segment}"`;
        })
        .join(' -> ');
}

/**
 * Formats the value returned by the AI so it clearly distinguishes between
 * a completely omitted JSON key ('[MISSING_KEY]') and an explicit `null` or bad value.
 */
function formatReceivedValue(val: unknown): string {
    if (val === '[MISSING_KEY]') {
        return 'KEY WAS COMPLETELY OMITTED FROM JSON (Missing Property)';
    }
    if (val === null) {
        return 'null (literal null)';
    }
    return JSON.stringify(val);
}

/**
 * Formats a single ValidationErrorDetail into an actionable diagnostic block.
 */
function formatValidationError(err: ValidationErrorDetail, index: number): string {
    const readablePath = formatReadableErrorPath(err.path);
    const formattedValue = formatReceivedValue(err.receivedValue);

    let block = `${index + 1}. VIOLATION AT [ ${readablePath} ]:\n`;
    block += `   - Exact Rule Broken: ${err.message}\n`;
    block += `   - What You Returned: ${formattedValue}`;

    if (err.expectedFormat) {
        block += `\n   - Required Format / Type: ${err.expectedFormat}`;
    }

    return block;
}

/**
 * Builds the complete self-correction prompt tailored to the exact failure reason.
 */
export function buildRepairPrompt({
    rawText,
    schema,
    previousOutput,
    failureType,
    validationErrors = [],
    syntaxError,
    attemptNumber
}: BuildRepairPromptParams): string {
    const schemaInstructions = buildSchemaInstructions(schema);
    const jsonSkeleton = JSON.stringify(buildJsonSkeleton(schema), null, 2);
    const safePreviousOutput = truncateOutput(previousOutput);

    // --------------------------------------------------------------------------
    // CASE 1: INVALID JSON SYNTAX (Failed JSON.parse)
    // --------------------------------------------------------------------------
    if (failureType === 'INVALID_JSON_SYNTAX') {
        return `CRITICAL FAILURE: YOUR PREVIOUS OUTPUT WAS NOT VALID JSON.
Repair Attempt: #${attemptNumber}

JSON PARSER ERROR:
${syntaxError || 'SyntaxError: Unexpected token or unclosed JSON structure.'}

YOUR MALFORMED OUTPUT (DO NOT REPEAT THIS SYNTAX):
${safePreviousOutput}

ORIGINAL SOURCE TEXT:
${rawText}

TARGET SCHEMA SPECIFICATIONS:
${schemaInstructions}

EXPECTED JSON STRUCTURE SHAPE:
${jsonSkeleton}

REPAIR DIRECTIVES:
1. Fix all JSON syntax errors so that standard JSON.parse() succeeds immediately.
2. Ensure all keys are double-quoted, strings are properly escaped, and all brackets/braces are closed.
3. Do NOT wrap the response in markdown code blocks (\`\`\`json) and do NOT add any conversational text.
4. Output ONLY the raw, valid JSON object.`;
    }

    // --------------------------------------------------------------------------
    // CASE 2: SCHEMA VALIDATION ERROR (Valid JSON, but failed Zod rules)
    // --------------------------------------------------------------------------
    const errorReport =
        validationErrors.length > 0
            ? validationErrors.map((err, i) => formatValidationError(err, i)).join('\n\n')
            : '1. Output JSON did not match the required root object schema.';

    return `CORRECTION REQUIRED: YOUR PREVIOUS JSON FAILED AUTOMATED VALIDATION CHECKS.
Repair Attempt: #${attemptNumber}

SPECIFIC VALIDATION FAILURES TO FIX:
${errorReport}

YOUR PREVIOUS JSON ATTEMPT:
${safePreviousOutput}

ORIGINAL SOURCE TEXT (GROUND TRUTH):
${rawText}

TARGET SCHEMA SPECIFICATIONS:
${schemaInstructions}

EXPECTED JSON STRUCTURE SHAPE:
${jsonSkeleton}

STRICT SELF-HEALING DIRECTIVES:
1. SURGICAL CORRECTION: Fix EVERY violation listed above by re-checking the Original Source Text.
2. PRESERVE VALID FIELDS (NO REGRESSION): All other fields in your previous JSON attempt that were NOT listed in the violations above are already valid. Keep their exact values intact.
3. MISSING KEY vs NULL RULE:
   - If a violation says "KEY WAS COMPLETELY OMITTED", you MUST include that key in the JSON.
   - If a field is genuinely absent from the source text and its rule allows null, set its value to literal null. Never invent fake data[cite: 2].
4. NUMERIC & DATE PRECISION: Strip currency symbols/commas from numbers, and strictly match required calendar date formats (e.g., DD-MM-YYYY).
5. RAW JSON OUTPUT: Output ONLY the complete, corrected JSON object with zero markdown wrappers or commentary.`;
}