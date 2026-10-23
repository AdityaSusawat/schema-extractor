/**
 * ============================================================================
 * @schema-extractor/shared - Incoming Request & Schema Configuration Gatekeeper
 * ============================================================================
 * Validates the user's schema configuration and extraction request payload
 * BEFORE any LLM inference call is triggered. Catches impossible min/max ranges,
 * invalid custom regular expressions, duplicate field names, and incomplete
 * nested structures at the API boundary so zero free-tier tokens are wasted.
 */

import { z } from 'zod';
import {
    FieldDefinition,
    ValidationRules,
    ExtractionRequest
} from '../types/extraction';

// ----------------------------------------------------------------------------
// 1. PRIMITIVE & ENUM SCHEMAS
// ----------------------------------------------------------------------------

export const primitiveFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date']);
export const compositeFieldTypeSchema = z.enum(['array', 'object']);
export const fieldTypeSchema = z.union([primitiveFieldTypeSchema, compositeFieldTypeSchema]);

export const dateFormatOptionSchema = z.enum([
    'DD-MM-YYYY',
    'YYYY-MM-DD',
    'MM/DD/YYYY',
    'DD-MMM-YYYY'
]);

// ----------------------------------------------------------------------------
// 2. VALIDATION RULES SCHEMA (WITH CROSS-FIELD REFINEMENTS)
// ----------------------------------------------------------------------------

export const validationRulesSchema: z.ZodType<ValidationRules | undefined> = z
    .object({
        // Number constraints
        min: z.number().optional(),
        max: z.number().optional(),
        isInteger: z.boolean().optional(),
        currencyCode: z.string().trim().min(1).max(10).optional(),

        // String constraints
        minLength: z.number().int().min(0, 'minLength cannot be negative').optional(),
        maxLength: z.number().int().min(1, 'maxLength must be at least 1').optional(),
        regexPattern: z
            .string()
            .optional()
            .refine(
                (pattern) => {
                    if (!pattern) return true;
                    try {
                        new RegExp(pattern);
                        return true;
                    } catch {
                        return false;
                    }
                },
                { message: 'Invalid regular expression syntax in regexPattern' }
            ),
        regexErrorMessage: z.string().trim().optional(),
        allowedValues: z
            .array(z.string().trim().min(1, 'Enum values cannot be empty strings'))
            .optional(),

        // Date constraints
        dateFormat: dateFormatOptionSchema.optional(),

        // Array constraints
        minItems: z.number().int().min(0, 'minItems cannot be negative').optional(),
        maxItems: z.number().int().min(1, 'maxItems must be at least 1').optional()
    })
    .superRefine((rules, ctx) => {
        // 1. Prevent impossible numeric bounds (min > max)
        if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['min'],
                message: `Numeric min (${rules.min}) cannot be greater than max (${rules.max})`
            });
        }

        // 2. Prevent impossible string length bounds (minLength > maxLength)
        if (
            rules.minLength !== undefined &&
            rules.maxLength !== undefined &&
            rules.minLength > rules.maxLength
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['minLength'],
                message: `minLength (${rules.minLength}) cannot be greater than maxLength (${rules.maxLength})`
            });
        }

        // 3. Prevent impossible array item bounds (minItems > maxItems)
        if (
            rules.minItems !== undefined &&
            rules.maxItems !== undefined &&
            rules.minItems > rules.maxItems
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['minItems'],
                message: `minItems (${rules.minItems}) cannot be greater than maxItems (${rules.maxItems})`
            });
        }
    })
    .optional();

// ----------------------------------------------------------------------------
// 3. RECURSIVE FIELD DEFINITION SCHEMA (WITH STRUCTURAL INTEGRITY CHECKS)
// ----------------------------------------------------------------------------

/**
 * Helper to detect duplicate sibling field names at any level of the schema tree.
 */
function findDuplicateFieldNames(fields: FieldDefinition[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const field of fields) {
        if (seen.has(field.name)) {
            duplicates.add(field.name);
        }
        seen.add(field.name);
    }

    return Array.from(duplicates);
}

export const fieldDefinitionSchema: z.ZodType<FieldDefinition, z.ZodTypeDef, unknown> = z.lazy(() =>
    z
        .object({
            id: z.string().trim().min(1, 'Field ID is required'),
            name: z
                .string()
                .trim()
                .min(1, 'Field name is required')
                .regex(
                    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
                    'Field name must start with a letter or underscore and contain only alphanumeric characters or underscores'
                ),
            label: z.string().trim().min(1, 'Field label is required'),
            type: fieldTypeSchema,
            description: z.string().trim().min(1, 'Field description is required'),
            required: z.boolean().default(true),
            allowNullIfMissing: z.boolean().default(false),
            examples: z.array(z.string().trim().min(1)).optional(),
            rules: validationRulesSchema,
            arrayItemType: z.union([primitiveFieldTypeSchema, z.literal('object')]).optional(),
            children: z.array(fieldDefinitionSchema).optional()
        })
        .superRefine((field, ctx) => {
            // 1. Object fields MUST define at least one child property
            if (field.type === 'object' && (!field.children || field.children.length === 0)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['children'],
                    message: `Object field "${field.name}" must define at least one child field in "children"`
                });
            }

            // 2. Array of objects MUST define at least one child column
            if (
                field.type === 'array' &&
                field.arrayItemType === 'object' &&
                (!field.children || field.children.length === 0)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['children'],
                    message: `Tabular array field "${field.name}" (arrayItemType: "object") must define at least one child field`
                });
            }

            // 3. Array without children MUST specify a primitive arrayItemType
            if (
                field.type === 'array' &&
                (!field.children || field.children.length === 0) &&
                !field.arrayItemType
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['arrayItemType'],
                    message: `Array field "${field.name}" must specify either "arrayItemType" (for primitive lists) or "children" (for object tables)`
                });
            }

            // 4. Prevent duplicate sibling field names inside nested children
            if (field.children && field.children.length > 0) {
                const dupes = findDuplicateFieldNames(field.children);
                if (dupes.length > 0) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['children'],
                        message: `Duplicate child field name(s) inside "${field.name}": ${dupes.join(', ')}`
                    });
                }
            }
        })
);

// ----------------------------------------------------------------------------
// 4. EXTRACTION REQUEST PAYLOAD SCHEMA
// ----------------------------------------------------------------------------

export const extractionRequestSchema: z.ZodType<ExtractionRequest, z.ZodTypeDef, unknown> = z
    .object({
        rawText: z
            .string()
            .trim()
            .min(1, 'Input text cannot be empty or whitespace only')
            .max(50000, 'Input text exceeds maximum length of 50,000 characters'),
        schema: z
            .array(fieldDefinitionSchema)
            .min(1, 'At least one field definition is required')
            .superRefine((fields, ctx) => {
                const dupes = findDuplicateFieldNames(fields);
                if (dupes.length > 0) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Duplicate top-level field name(s) found: ${dupes.join(', ')}. Each field name at the same level must be unique.`
                    });
                }
            }),
        maxRetries: z.number().int().min(0).max(5).default(3)
    });