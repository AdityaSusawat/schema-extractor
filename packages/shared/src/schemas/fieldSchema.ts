import { z } from 'zod';

export const primitiveFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date']);
export const compositeFieldTypeSchema = z.enum(['array', 'object']);
export const fieldTypeSchema = z.union([primitiveFieldTypeSchema, compositeFieldTypeSchema]);

export const dateFormatOptionSchema = z.enum([
    'DD-MM-YYYY',
    'YYYY-MM-DD',
    'MM/DD/YYYY',
    'DD-MMM-YYYY'
]);

export const validationRulesSchema = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    isInteger: z.boolean().optional(),
    currencyCode: z.string().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    regexPattern: z.string().optional(),
    regexErrorMessage: z.string().optional(),
    allowedValues: z.array(z.string()).optional(),
    dateFormat: dateFormatOptionSchema.optional(),
    minItems: z.number().optional(),
    maxItems: z.number().optional()
}).optional();

// Using z.lazy() allows the schema to be recursive for nested children (tables/objects)
export const fieldDefinitionSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        id: z.string().min(1, 'Field ID is required'),
        name: z
            .string()
            .min(1, 'Field name is required')
            .regex(/^[a-zA-Z0-9_]+$/, 'Field name must be alphanumeric with no spaces'),
        label: z.string().min(1, 'Field label is required'),
        type: fieldTypeSchema,
        description: z.string().min(1, 'Description is required'),
        required: z.boolean().default(true),
        allowNullIfMissing: z.boolean().default(false),
        examples: z.array(z.string()).optional(),
        rules: validationRulesSchema,
        arrayItemType: z.union([primitiveFieldTypeSchema, z.literal('object')]).optional(),
        children: z.array(fieldDefinitionSchema).optional()
    })
);

export const extractionRequestSchema = z.object({
    rawText: z.string().min(1, 'Input text cannot be empty'),
    schema: z.array(fieldDefinitionSchema).min(1, 'At least one field definition is required'),
    maxRetries: z.number().min(0).max(5).default(3)
});