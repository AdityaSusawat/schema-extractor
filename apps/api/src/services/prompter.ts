import { FieldDefinition } from '@schema-extractor/shared';

/**
 * Converts a list of FieldDefinitions into readable schema instructions for the AI.
 */
export function buildSchemaInstructions(fields: FieldDefinition[], indentLevel = 1): string {
    const indent = '  '.repeat(indentLevel);

    return fields
        .map((field) => {
            let desc = `${indent}- "${field.name}" (${field.type}${field.required ? ', required' : ', optional'}): ${field.description}`;

            if (field.allowNullIfMissing) {
                desc += ` [Return null if not found in text]`;
            }

            if (field.rules?.dateFormat) {
                desc += ` [Must match format: ${field.rules.dateFormat}]`;
            }

            if (field.rules?.allowedValues && field.rules.allowedValues.length > 0) {
                desc += ` [Allowed values: ${field.rules.allowedValues.join(', ')}]`;
            }

            if (field.rules?.currencyCode) {
                desc += ` [Currency: ${field.rules.currencyCode}]`;
            }

            if (field.examples && field.examples.length > 0) {
                desc += ` [Example: ${JSON.stringify(field.examples[0])}]`;
            }

            // Handle nested array items or objects
            if (field.children && field.children.length > 0) {
                desc += `\n${indent}  Child fields:\n${buildSchemaInstructions(field.children, indentLevel + 2)}`;
            }

            return desc;
        })
        .join('\n');
}

/**
 * Builds the initial system prompt for first-attempt extraction.
 */
export function buildSystemPrompt(schema: FieldDefinition[]): string {
    const schemaInstructions = buildSchemaInstructions(schema);

    return `You are a high-precision data extraction engine.
Your task is to extract structured information from the provided unstructured text.

STRICT INSTRUCTIONS:
1. Output ONLY a valid JSON object. No explanation, no conversational filler, no markdown wrappers.
2. The JSON keys MUST exactly match the names defined below.
3. Obey all format rules (e.g. date formats, allowed values).
4. If a field cannot be determined and allows null, return null. Do NOT invent or hallucinate data.

TARGET SCHEMA:
${schemaInstructions}
`;
}

/**
 * Strips markdown code blocks like ```json ... ``` that models sometimes include.
 */
export function sanitizeJsonResponse(rawText: string): string {
    let cleaned = rawText.trim();
    // Remove markdown code fences if present
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return cleaned.trim();
}