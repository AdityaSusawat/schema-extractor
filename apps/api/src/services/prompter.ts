/**
 * ============================================================================
 * @schema-extractor/api - System Prompt Compiler & Resilient JSON Sanitizer
 * ============================================================================
 * Translates dynamic FieldDefinition[] schemas into unambiguous instructions
 * for the LLM. Synchronized rule-for-rule with `schemaBuilder.ts` so the AI
 * knows every validation constraint upfront on Attempt #1, saving tokens.
 */

import { FieldDefinition, ValidationRules } from '@schema-extractor/shared';

// ----------------------------------------------------------------------------
// 1. VALIDATION RULE FORMATTER
// ----------------------------------------------------------------------------

/**
 * Compiles all 11 possible ValidationRules into concise, explicit constraints
 * that match the exact checks performed by `schemaBuilder.ts`.
 */
function formatRuleConstraints(field: FieldDefinition): string {
    const rules: ValidationRules | undefined = field.rules;
    const constraints: string[] = [];

    // Nullability & Required Rules (Prevents hallucination or illegal nulls)
    if (field.allowNullIfMissing) {
        constraints.push('If missing in source text, output null (DO NOT guess)');
    } else if (field.required) {
        constraints.push('REQUIRED & NON-NULL (cannot be null or empty string "")');
    }

    if (!rules) {
        return constraints.length > 0 ? ` [${constraints.join(' | ')}]` : '';
    }

    // Date Constraints
    if (field.type === 'date' || rules.dateFormat) {
        const fmt = rules.dateFormat || 'DD-MM-YYYY';
        constraints.push(`Strict Date Format: ${fmt} (must be a real calendar date)`);
    }

    // Number Constraints
    if (field.type === 'number') {
        constraints.push('Output raw number only (strip currency symbols like ₹, Rs, $, or commas)');
        if (rules.isInteger) {
            constraints.push('Must be a whole integer (no decimals)');
        }
        if (rules.min !== undefined) {
            constraints.push(`Min value: ${rules.min}`);
        }
        if (rules.max !== undefined) {
            constraints.push(`Max value: ${rules.max}`);
        }
        if (rules.currencyCode) {
            constraints.push(`Expected Currency: ${rules.currencyCode}`);
        }
    }

    // String Constraints
    if (field.type === 'string') {
        if (rules.allowedValues && rules.allowedValues.length > 0) {
            constraints.push(`Allowed Enum Values ONLY: [${rules.allowedValues.map((v) => `"${v}"`).join(', ')}]`);
        }
        if (rules.minLength !== undefined) {
            constraints.push(`Min length: ${rules.minLength} chars`);
        }
        if (rules.maxLength !== undefined) {
            constraints.push(`Max length: ${rules.maxLength} chars`);
        }
        if (rules.regexPattern) {
            const hint = rules.regexErrorMessage ? ` (${rules.regexErrorMessage})` : '';
            constraints.push(`Must match Regex: ${rules.regexPattern}${hint}`);
        }
    }

    // Array Constraints
    if (field.type === 'array') {
        if (rules.minItems !== undefined) {
            constraints.push(`Min items: ${rules.minItems}`);
        }
        if (rules.maxItems !== undefined) {
            constraints.push(`Max items: ${rules.maxItems}`);
        }
    }

    return constraints.length > 0 ? ` [${constraints.join(' | ')}]` : '';
}

// ----------------------------------------------------------------------------
// 2. RECURSIVE FIELD INSTRUCTION & SKELETON BUILDERS
// ----------------------------------------------------------------------------

/**
 * Formats the human-readable type label (e.g., "array of strings" or "array of objects").
 */
function describeFieldType(field: FieldDefinition): string {
    if (field.type === 'array') {
        if (field.children && field.children.length > 0) {
            return 'array of objects (table rows)';
        }
        return `array of ${field.arrayItemType || 'string'}s`;
    }
    return field.type;
}

/**
 * Converts a list of FieldDefinitions into detailed, hierarchical schema instructions.
 */
export function buildSchemaInstructions(fields: FieldDefinition[], indentLevel = 1): string {
    const indent = '  '.repeat(indentLevel);

    return fields
        .map((field) => {
            const typeLabel = describeFieldType(field);
            const reqLabel = field.required ? 'required' : 'optional';
            let line = `${indent}- "${field.name}" (${typeLabel}, ${reqLabel}): ${field.description}`;

            // Attach all validation constraints
            line += formatRuleConstraints(field);

            // Attach all provided examples (not just the first one)
            if (field.examples && field.examples.length > 0) {
                const formattedExamples = field.examples.map((ex) => JSON.stringify(ex)).join(', ');
                line += ` [Examples: ${formattedExamples}]`;
            }

            // Recursively document child fields for nested objects or tabular arrays
            if (field.children && field.children.length > 0) {
                line += `\n${indent}  Nested properties for "${field.name}":\n${buildSchemaInstructions(
                    field.children,
                    indentLevel + 2
                )}`;
            }

            return line;
        })
        .join('\n');
}

/**
 * Builds a compact JSON structural skeleton so the LLM visually sees whether a field
 * expects a primitive, a nested object `{ ... }`, or an array of objects `[ { ... } ]`.
 */
export function buildJsonSkeleton(fields: FieldDefinition[]): Record<string, unknown> {
    const skeleton: Record<string, unknown> = {};

    for (const field of fields) {
        if (field.type === 'object' && field.children && field.children.length > 0) {
            skeleton[field.name] = buildJsonSkeleton(field.children);
        } else if (field.type === 'array') {
            if (field.children && field.children.length > 0) {
                skeleton[field.name] = [buildJsonSkeleton(field.children)];
            } else {
                skeleton[field.name] = [`<${field.arrayItemType || 'string'}>`];
            }
        } else if (field.type === 'date') {
            skeleton[field.name] = `<${field.rules?.dateFormat || 'DD-MM-YYYY'}${field.allowNullIfMissing ? ' | null' : ''}>`;
        } else {
            skeleton[field.name] = `<${field.type}${field.allowNullIfMissing ? ' | null' : ''}>`;
        }
    }

    return skeleton;
}

// ----------------------------------------------------------------------------
// 3. SYSTEM PROMPT COMPILER
// ----------------------------------------------------------------------------

/**
 * Builds the complete initial system prompt for Attempt #1.
 */
export function buildSystemPrompt(schema: FieldDefinition[]): string {
    const schemaInstructions = buildSchemaInstructions(schema);
    const jsonSkeleton = JSON.stringify(buildJsonSkeleton(schema), null, 2);

    return `You are a deterministic, high-precision data extraction engine.
Your sole responsibility is to extract structured data from unstructured source text and return a single valid JSON object.

CRITICAL OPERATING RULES:
1. RAW JSON ONLY: Output ONLY a valid JSON object. Do not include markdown fences (\`\`\`json), introductions, or trailing commentary.
2. EXACT KEYS: Use the exact property names specified in the Target Schema.
3. NUMERIC PURITY: For "number" fields, output pure JSON numbers (e.g., 1250.50, not "Rs. 1,250.50" or "1250.50").
4. ANTI-HALLUCINATION:
   - If a field is marked "If missing in source text, output null", return literal null when the data is absent.
   - Never invent fake dates, IDs, or numbers that are not supported by the source text.
5. STRICT VALIDATION: Every field will be checked by an automated validator. Obey all date formats, regex patterns, enum lists, and min/max rules.

TARGET FIELD SPECIFICATIONS:
${schemaInstructions}

EXPECTED JSON STRUCTURE SHAPE:
${jsonSkeleton}`;
}

// ----------------------------------------------------------------------------
// 4. RESILIENT JSON SANITIZER
// ----------------------------------------------------------------------------

/**
 * Extracts and cleans the raw JSON object string from an LLM response,
 * even if the model wrapped it in markdown fences or added conversational preamble.
 */
export function sanitizeJsonResponse(rawText: string): string {
    if (!rawText || typeof rawText !== 'string') {
        return '';
    }

    let cleaned = rawText.trim();

    // Step 1: Strip markdown code block fences if present anywhere in the string
    const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned);
    if (codeBlockMatch && codeBlockMatch[1]) {
        cleaned = codeBlockMatch[1].trim();
    }

    // Step 2: Isolate substring from the very first '{' to the very last '}'
    // This protects JSON.parse() if the model wrote preamble like "Here is the JSON:"
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    return cleaned.trim();
}