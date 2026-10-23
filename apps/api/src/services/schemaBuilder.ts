/**
 * ============================================================================
 * @schema-extractor/api - Dynamic Runtime Zod Schema Compiler
 * ============================================================================
 * Converts user-defined FieldDefinition[] configurations into strict, runtime
 * Zod schemas. Includes calendar-accurate date validation, safe regex
 * compilation, primitive array enforcement, and zero-cost type coercion.
 */

import { z, ZodTypeAny } from 'zod';
import {
    FieldDefinition,
    ValidationErrorDetail,
    DateFormatOption,
    PrimitiveFieldType
} from '@schema-extractor/shared';

// ----------------------------------------------------------------------------
// 1. CALENDAR-ACCURATE DATE VALIDATION HELPERS
// ----------------------------------------------------------------------------

const MONTH_MAP: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/**
 * Checks that a (day, month, year) tuple represents a real calendar date
 * (e.g., rejects 31-02-2026 or 29-02-2025).
 */
function isValidCalendarDate(day: number, month: number, year: number): boolean {
    if (year < 1900 || year > 2100) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // Adjust for leap years
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (isLeapYear) {
        daysInMonths[1] = 29;
    }

    return day <= daysInMonths[month - 1];
}

/**
 * Validates both the structural pattern AND calendar validity of a date string.
 */
function validateDateByFormat(value: string, format: DateFormatOption): boolean {
    const trimmed = value.trim();

    switch (format) {
        case 'DD-MM-YYYY': {
            const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
            if (!match) return false;
            return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
        }
        case 'YYYY-MM-DD': {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
            if (!match) return false;
            return isValidCalendarDate(Number(match[3]), Number(match[2]), Number(match[1]));
        }
        case 'MM/DD/YYYY': {
            const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
            if (!match) return false;
            return isValidCalendarDate(Number(match[2]), Number(match[1]), Number(match[3]));
        }
        case 'DD-MMM-YYYY': {
            const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
            if (!match) return false;
            const month = MONTH_MAP[match[2].toLowerCase()];
            if (!month) return false;
            return isValidCalendarDate(Number(match[1]), month, Number(match[3]));
        }
        default:
            return false;
    }
}

// ----------------------------------------------------------------------------
// 2. SAFE TYPE COERCION HELPERS (SAVES FREE-TIER TOKENS)
// ----------------------------------------------------------------------------

/**
 * Safely coerces clean numeric strings (e.g., "850" -> 850) without accepting
 * dirty strings like "Rs. 850" or empty strings "".
 */
function preprocessNumber(val: unknown): unknown {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        // Only coerce if the entire string is a valid number format
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return Number(trimmed);
        }
    }
    return val;
}

/**
 * Safely coerces string booleans ("true" / "false") to actual booleans.
 */
function preprocessBoolean(val: unknown): unknown {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
    }
    return val;
}

// ----------------------------------------------------------------------------
// 3. PRIMITIVE ARRAY ITEM BUILDER
// ----------------------------------------------------------------------------

/**
 * Builds the inner validator when an array holds primitive items (e.g., string[] or number[]).
 */
function buildPrimitiveArrayItemSchema(
    itemType: PrimitiveFieldType,
    parentFieldName: string
): ZodTypeAny {
    switch (itemType) {
        case 'string':
            return z.string({
                invalid_type_error: `Items in "${parentFieldName}" must be strings`
            }).trim().min(1, `Items in "${parentFieldName}" cannot be empty strings`);
        case 'number':
            return z.preprocess(
                preprocessNumber,
                z.number({
                    invalid_type_error: `Items in "${parentFieldName}" must be numbers`
                })
            );
        case 'boolean':
            return z.preprocess(
                preprocessBoolean,
                z.boolean({
                    invalid_type_error: `Items in "${parentFieldName}" must be booleans`
                })
            );
        case 'date':
            return z.string({
                invalid_type_error: `Items in "${parentFieldName}" must be date strings`
            });
        default:
            return z.unknown();
    }
}

// ----------------------------------------------------------------------------
// 4. CORE FIELD & OBJECT SCHEMA COMPILER
// ----------------------------------------------------------------------------

/**
 * Builds a complete Zod validator for a single FieldDefinition.
 */
export function buildFieldZodSchema(field: FieldDefinition): ZodTypeAny {
    let schema: ZodTypeAny;

    switch (field.type) {
        case 'string': {
            // Check enum constraint first
            if (field.rules?.allowedValues && field.rules.allowedValues.length > 0) {
                schema = z.enum(field.rules.allowedValues as [string, ...string[]], {
                    errorMap: () => ({
                        message: `Field "${field.name}" must be one of: [${field.rules?.allowedValues?.join(', ')}]`
                    })
                });
                break;
            }

            let strSchema = z.string({
                required_error: `Field "${field.name}" is required`,
                invalid_type_error: `Field "${field.name}" must be a string`
            }).trim();

            // Prevent the AI from cheating required fields with an empty "" string
            if (field.required && !field.allowNullIfMissing) {
                const minLen = field.rules?.minLength !== undefined ? Math.max(1, field.rules.minLength) : 1;
                strSchema = strSchema.min(
                    minLen,
                    `Field "${field.name}" cannot be empty (minimum ${minLen} character(s))`
                );
            } else if (field.rules?.minLength !== undefined) {
                strSchema = strSchema.min(
                    field.rules.minLength,
                    `Field "${field.name}" must be at least ${field.rules.minLength} characters`
                );
            }

            if (field.rules?.maxLength !== undefined) {
                strSchema = strSchema.max(
                    field.rules.maxLength,
                    `Field "${field.name}" cannot exceed ${field.rules.maxLength} characters`
                );
            }

            // Safe regex compilation (guards against invalid user-typed regex crashing the server)
            if (field.rules?.regexPattern) {
                try {
                    const regex = new RegExp(field.rules.regexPattern);
                    strSchema = strSchema.regex(
                        regex,
                        field.rules.regexErrorMessage ||
                        `Field "${field.name}" must match pattern: ${field.rules.regexPattern}`
                    );
                } catch {
                    // If the user typed an invalid regex in the UI, fail gracefully with a clear message
                    strSchema = strSchema.refine(() => false, {
                        message: `Invalid regex pattern configured for field "${field.name}": ${field.rules.regexPattern}`
                    }) as unknown as z.ZodString;
                }
            }

            schema = strSchema;
            break;
        }

        case 'number': {
            let numSchema = z.number({
                required_error: `Field "${field.name}" is required`,
                invalid_type_error: `Field "${field.name}" must be a clean numeric value (strip currency symbols or text)`
            });

            if (field.rules?.isInteger) {
                numSchema = numSchema.int(`Field "${field.name}" must be a whole integer (no decimals)`);
            }
            if (field.rules?.min !== undefined) {
                numSchema = numSchema.min(
                    field.rules.min,
                    `Field "${field.name}" must be >= ${field.rules.min}`
                );
            }
            if (field.rules?.max !== undefined) {
                numSchema = numSchema.max(
                    field.rules.max,
                    `Field "${field.name}" must be <= ${field.rules.max}`
                );
            }

            schema = z.preprocess(preprocessNumber, numSchema);
            break;
        }

        case 'boolean': {
            const boolSchema = z.boolean({
                required_error: `Field "${field.name}" is required`,
                invalid_type_error: `Field "${field.name}" must be a boolean (true or false)`
            });
            schema = z.preprocess(preprocessBoolean, boolSchema);
            break;
        }

        case 'date': {
            const format: DateFormatOption = field.rules?.dateFormat || 'DD-MM-YYYY';

            const dateSchema = z
                .string({
                    required_error: `Field "${field.name}" is required`,
                    invalid_type_error: `Field "${field.name}" must be a date string in format ${format}`
                })
                .trim()
                .refine((val) => validateDateByFormat(val, format), {
                    message: `Field "${field.name}" must be a valid calendar date strictly matching format ${format}`
                });

            schema = dateSchema;
            break;
        }

        case 'array': {
            let itemSchema: ZodTypeAny;

            if (
                (field.arrayItemType === 'object' || !field.arrayItemType) &&
                field.children &&
                field.children.length > 0
            ) {
                itemSchema = buildDynamicZodSchema(field.children);
            } else if (field.arrayItemType && field.arrayItemType !== 'object') {
                itemSchema = buildPrimitiveArrayItemSchema(field.arrayItemType, field.name);
            } else {
                itemSchema = z.unknown();
            }

            let arrSchema = z.array(itemSchema, {
                required_error: `Field "${field.name}" is required`,
                invalid_type_error: `Field "${field.name}" must be a JSON array`
            });

            if (field.rules?.minItems !== undefined) {
                arrSchema = arrSchema.min(
                    field.rules.minItems,
                    `Array "${field.name}" must contain at least ${field.rules.minItems} item(s)`
                );
            }
            if (field.rules?.maxItems !== undefined) {
                arrSchema = arrSchema.max(
                    field.rules.maxItems,
                    `Array "${field.name}" must contain at most ${field.rules.maxItems} item(s)`
                );
            }

            schema = arrSchema;
            break;
        }

        case 'object': {
            if (field.children && field.children.length > 0) {
                schema = buildDynamicZodSchema(field.children);
            } else {
                schema = z.record(z.unknown());
            }
            break;
        }

        default:
            schema = z.unknown();
    }

    // Apply nullability and optionality wrappers in the correct order
    if (field.allowNullIfMissing) {
        schema = schema.nullable();
    }
    if (!field.required) {
        schema = schema.optional();
    }

    return schema;
}

/**
 * Compiles an array of FieldDefinitions into a complete Zod Object Schema.
 */
export function buildDynamicZodSchema(fields: FieldDefinition[]): z.ZodObject<any> {
    const shape: Record<string, ZodTypeAny> = {};

    for (const field of fields) {
        shape[field.name] = buildFieldZodSchema(field);
    }

    return z.object(shape);
}

// ----------------------------------------------------------------------------
// 5. DIAGNOSTIC ERROR FORMATTER (POWERS REPAIR PROMPTS & UI TIMELINE)
// ----------------------------------------------------------------------------

/**
 * Recursively looks up a FieldDefinition using a Zod error path (ignoring numeric array indices)
 * so we can attach `expectedFormat` hints to the error log.
 */
function findFieldByErrorPath(
    fields: FieldDefinition[],
    pathSegments: (string | number)[]
): FieldDefinition | undefined {
    const fieldNamesOnly = pathSegments.filter((seg): seg is string => typeof seg === 'string');
    let currentFields: FieldDefinition[] | undefined = fields;
    let matchedField: FieldDefinition | undefined;

    for (const name of fieldNamesOnly) {
        if (!currentFields) return undefined;
        matchedField = currentFields.find((f) => f.name === name);
        if (!matchedField) return undefined;
        currentFields = matchedField.children;
    }

    return matchedField;
}

/**
 * Summarizes the expected format of a field for the self-healing repair prompt.
 */
function describeExpectedFormat(field?: FieldDefinition): string | undefined {
    if (!field) return undefined;

    const parts: string[] = [field.type];

    if (field.type === 'date') {
        parts.push(`format: ${field.rules?.dateFormat || 'DD-MM-YYYY'}`);
    }
    if (field.rules?.allowedValues?.length) {
        parts.push(`allowed: [${field.rules.allowedValues.join(', ')}]`);
    }
    if (field.rules?.regexPattern) {
        parts.push(`pattern: ${field.rules.regexPattern}`);
    }
    if (field.rules?.isInteger) {
        parts.push('integer only');
    }
    if (field.allowNullIfMissing) {
        parts.push('or null if missing');
    }

    return parts.join(' | ');
}

/**
 * Formats raw Zod validation errors into rich ValidationErrorDetail[] objects.
 */
export function formatZodErrors(
    error: z.ZodError,
    receivedData: Record<string, unknown>,
    schemaFields?: FieldDefinition[]
): ValidationErrorDetail[] {
    return error.errors.map((err) => {
        const path = err.path.join('.');

        // Traverse the received JSON safely to extract the exact offending value
        let receivedValue: unknown = receivedData;
        for (const segment of err.path) {
            if (receivedValue !== null && receivedValue !== undefined && typeof receivedValue === 'object') {
                receivedValue = (receivedValue as Record<string | number, unknown>)[segment];
            } else {
                receivedValue = undefined;
                break;
            }
        }

        const matchedField = schemaFields ? findFieldByErrorPath(schemaFields, err.path) : undefined;

        return {
            path: path || 'root',
            message: err.message,
            // Distinguish clearly between actual `null` and missing (`undefined`) keys
            receivedValue: receivedValue === undefined ? '[MISSING_KEY]' : receivedValue,
            expectedFormat: describeExpectedFormat(matchedField)
        };
    });
}