/**
 * ============================================================================
 * @schema-extractor/shared - Core Extraction Contracts
 * ============================================================================
 * This file is the single source of truth for both the React Frontend (apps/web)
 * and the Express Backend (apps/api). Everything from UI form state to LLM
 * prompts and Zod validation is generated from these interfaces.
 */

// ----------------------------------------------------------------------------
// 1. FIELD DATA TYPES & VALIDATION RULES
// ----------------------------------------------------------------------------

/**
 * Basic single-value types supported by the extractor.
 * Note: 'date' is extracted as a formatted string in JSON, then validated by rules.
 */
export type PrimitiveFieldType = 'string' | 'number' | 'boolean' | 'date';

/**
 * Complex structures:
 * - 'object': A nested group of fields (e.g., "vendorDetails" -> { name, address, phone })
 * - 'array': Either a simple list of primitives (e.g., ["tag1", "tag2"]) OR
 *            a table of objects (e.g., invoice line items: [{ item, qty, price }])
 */
export type CompositeFieldType = 'array' | 'object';

export type FieldType = PrimitiveFieldType | CompositeFieldType;

/**
 * Supported standard date formats to prevent ambiguous dates (like 04/05/2026).
 */
export type DateFormatOption =
    | 'DD-MM-YYYY' // Standard Indian format (e.g., 22-10-2026)
    | 'YYYY-MM-DD' // ISO / Database standard (e.g., 2026-10-22)
    | 'MM/DD/YYYY' // US format
    | 'DD-MMM-YYYY'; // Readable format (e.g., 22-Oct-2026)

/**
 * Strict rules attached to a field.
 * These are used in TWO places:
 * 1. Injected into the system prompt so the AI knows the rules upfront.
 * 2. Compiled into a dynamic Zod schema on the backend to grade the AI's output.
 */
export interface ValidationRules {
    // --- Number Constraints ---
    min?: number;                  // Minimum value (e.g., 0 for prices/quantities)
    max?: number;                  // Maximum value (e.g., 100 for percentages)
    isInteger?: boolean;           // If true, decimals like 2.5 will fail validation
    currencyCode?: string;         // Informational/formatting hint, e.g., "INR", "USD"

    // --- String Constraints ---
    minLength?: number;            // Minimum character length
    maxLength?: number;            // Maximum character length
    regexPattern?: string;         // Custom regex (e.g., "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$" for GSTIN)
    regexErrorMessage?: string;    // Human-readable hint if regex fails (e.g., "Must be a valid 15-digit GSTIN")
    allowedValues?: string[];      // Strict dropdown/enum (e.g., ["PAID", "PENDING", "OVERDUE"])

    // --- Date Constraints ---
    dateFormat?: DateFormatOption; // Enforces exact date string pattern

    // --- Array Constraints ---
    minItems?: number;             // e.g., At least 1 line item required in an invoice
    maxItems?: number;             // Prevents runaway generation on huge lists
}

// ----------------------------------------------------------------------------
// 2. SCHEMA DEFINITION & TEMPLATES
// ----------------------------------------------------------------------------

/**
 * Defines a single piece of data the user wants to extract.
 * Can be recursive (via `children`) to support nested objects and tables.
 */
export interface FieldDefinition {
    /**
     * Internal unique ID (e.g., UUID) used ONLY by React for list rendering keys
     * so typing in the "name" input doesn't lose cursor focus.
     */
    id: string;

    /**
     * The exact JSON key that will appear in the output (e.g., "invoiceTotal", "startDate").
     * Must be alphanumeric/camelCase/snake_case without spaces.
     */
    name: string;

    /**
     * Friendly display name shown in the UI (e.g., "Invoice Total (₹)").
     */
    label: string;

    /**
     * The data type of this field.
     */
    type: FieldType;

    /**
     * Clear explanation for the AI about what this field means and where to find it.
     * Example: "Final payable amount after adding CGST/SGST and subtracting discounts."
     */
    description: string;

    /**
     * If true, the key MUST be present in the returned JSON.
     */
    required: boolean;

    /**
     * CRITICAL ANTI-HALLUCINATION FLAG:
     * If true, and the raw text genuinely does not contain this info, the AI is
     * allowed to output `null` instead of guessing or making up fake data.
     */
    allowNullIfMissing: boolean;

    /**
     * Concrete examples of valid values (e.g., ["INV-2026-01", "22-10-2026"]).
     * Passing 1-2 examples into the prompt drastically improves LLM accuracy on Try #1.
     */
    examples?: string[];

    /**
     * Optional strict validation rules for numbers, strings, dates, or arrays.
     */
    rules?: ValidationRules;

    /**
     * Used ONLY when `type === 'array'` AND it is a simple list (e.g., array of strings).
     * Tells the engine whether this is `string[]`, `number[]`, etc.
     */
    arrayItemType?: PrimitiveFieldType | 'object';

    /**
     * Used when:
     * 1. `type === 'object'` (defines the nested properties inside the object), OR
     * 2. `type === 'array'` and `arrayItemType === 'object'` (defines the columns of a table).
     */
    children?: FieldDefinition[];
}

/**
 * Represents a saved schema configuration (either built-in presets like "GST Invoice"
 * or custom schemas the user saves to their browser's localStorage).
 */
export interface SchemaTemplate {
    id: string;                    // Unique ID (e.g., "preset_gst_invoice" or "custom_172958")
    name: string;                  // e.g., "Indian GST Invoice", "Meeting Scribbles"
    description: string;           // Short explanation of what this template extracts
    category: 'system' | 'custom'; // 'system' = shipped with app; 'custom' = user-created
    sampleInputText?: string;      // Built-in messy dummy text so users can test with 1 click!
    fields: FieldDefinition[];     // The fields belonging to this template
    createdAt: string;             // ISO timestamp
    updatedAt: string;             // ISO timestamp
}

// ----------------------------------------------------------------------------
// 3. API REQUEST & SELF-HEALING DIAGNOSTICS
// ----------------------------------------------------------------------------

/**
 * The request body sent from React (`POST /api/extract`) to Express.
 */
export interface ExtractionRequest {
    rawText: string;               // The messy document text, notes, or invoice copy
    schema: FieldDefinition[];     // The active field definitions to extract against
    maxRetries?: number;           // Hard ceiling on self-correction loops (default: 3, max: 5)
}

/**
 * Categorizes WHY a specific extraction attempt failed so the self-healing engine
 * knows how to scold/correct the AI on the next turn.
 */
export type FailureReasonType =
    | 'NONE'                       // Passed everything!
    | 'INVALID_JSON_SYNTAX'        // AI returned broken JSON that failed JSON.parse()
    | 'SCHEMA_VALIDATION_ERROR'    // Valid JSON, but broke Zod rules (wrong date format, negative number, etc.)
    | 'LLM_PROVIDER_ERROR';        // Rate limit hit, timeout, or network error from Groq/Gemini

/**
 * Pinpoints a specific validation failure down to the exact field or table cell.
 */
export interface ValidationErrorDetail {
    /**
     * Dot-notation path to the broken field.
     * Example: "invoiceDate" or "lineItems[2].unitPrice"
     */
    path: string;

    /**
     * The specific rule that was violated.
     * Example: "Date must match DD-MM-YYYY" or "Expected number, received 'Rs. 500'"
     */
    message: string;

    /**
     * What the AI actually output for that field so we can show it in the error log
     * and quote it back to the AI in the repair prompt.
     */
    receivedValue: unknown;

    /**
     * What type or format was expected.
     */
    expectedFormat?: string;
}

/**
 * Tracks token consumption per attempt so free-tier users can monitor quota usage.
 */
export interface TokenUsage {
    promptTokens: number;          // Tokens sent to the AI (system prompt + text + error history)
    completionTokens: number;      // Tokens generated by the AI
    totalTokens: number;           // Sum of prompt + completion tokens
}

/**
 * A complete black-box snapshot of a single attempt inside the retry loop.
 * Powers the "Self-Healing Timeline" drawer on the frontend.
 */
export interface RepairAttemptLog {
    attemptNumber: number;         // 1 = Initial try, 2 = First repair, 3 = Second repair...
    success: boolean;              // Did this specific attempt pass all checks?
    failureType: FailureReasonType;
    rawLlmOutput: string;          // Exact text returned by the LLM before sanitization
    parsedJson: Record<string, unknown> | null; // Null if JSON.parse() failed
    jsonSyntaxError?: string;      // Present if failureType === 'INVALID_JSON_SYNTAX'
    validationErrors: ValidationErrorDetail[]; // Present if failureType === 'SCHEMA_VALIDATION_ERROR'
    repairPromptSent?: string;     // The exact correction instructions sent for the NEXT attempt
    durationMs: number;            // How many milliseconds this attempt took
    tokenUsage?: TokenUsage;       // How many tokens this attempt consumed
}

// ----------------------------------------------------------------------------
// 4. FINAL API RESPONSE
// ----------------------------------------------------------------------------

/**
 * Final payload returned from Express to the React frontend once the loop finishes
 * (either because it succeeded or because it exhausted all retries).
 */
export interface ExtractionResponse {
    success: boolean;              // True if valid data was obtained within the retry budget
    isPartialSuccess?: boolean;    // True if max retries failed, but we still return the best-effort JSON
    data: Record<string, unknown> | null; // The clean, validated JSON output
    totalAttempts: number;         // Total tries taken (1 means it passed on the very first shot!)
    totalDurationMs: number;       // Total end-to-end time across all attempts
    totalTokensUsed: number;       // Total tokens spent across the entire request
    repairLogs: RepairAttemptLog[]; // Step-by-step history of every attempt and self-fix
    fatalError?: string;           // Populated if the API key is invalid, rate limit exceeded, etc.
}