/**
 * ============================================================================
 * @schema-extractor/web - Central Extraction Controller & State Machine Hook
 * ============================================================================
 * Manages:
 * 1. Recursive immutable CRUD for `FieldDefinition[]` (root + nested children)
 * 2. Automatic state sanitization when switching field types
 * 3. Pre-flight client-side Zod validation mapped to specific `field.id`s
 * 4. Abortable HTTP transport to `POST /api/extract` with live elapsed timer
 * 5. Preset loading & raw JSON schema import/export
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    FieldDefinition,
    FieldType,
    PrimitiveFieldType,
    ValidationRules,
    ExtractionResponse,
    extractionRequestSchema,
    fieldDefinitionSchema
} from '@schema-extractor/shared';
import { PRESETS, PresetScenario } from '../data/presets';
import { z } from 'zod';

// ----------------------------------------------------------------------------
// 1. TYPES & PUBLIC INTERFACE
// ----------------------------------------------------------------------------

export type ViewportTab = 'json' | 'table' | 'timeline';

export interface ExtractionController {
    // Core Input State
    schema: FieldDefinition[];
    rawText: string;
    maxRetries: number;
    activePresetId: string | null;

    // Execution & Network State
    isExtracting: boolean;
    elapsedMs: number;
    clientFatalError: string | null;
    fieldErrors: Record<string, string[]>; // Keyed by field.id for instant UI highlighting

    // Output & Viewport State
    response: ExtractionResponse | null;
    activeTab: ViewportTab;
    selectedAttemptNumber: number | null;

    // Input Setters
    setRawText: (text: string) => void;
    setMaxRetries: (retries: number) => void;
    setActiveTab: (tab: ViewportTab) => void;
    setSelectedAttemptNumber: (attempt: number | null) => void;

    // Recursive Schema Tree Actions
    addField: (parentId?: string) => void;
    removeField: (fieldId: string) => void;
    updateField: (fieldId: string, patch: Partial<FieldDefinition>) => void;
    updateFieldRules: (fieldId: string, rulesPatch: Partial<ValidationRules>) => void;
    moveField: (fieldId: string, direction: 'up' | 'down') => void;
    importSchemaJson: (rawJson: string) => { ok: boolean; error?: string };

    // Preset & Execution Actions
    loadPreset: (presetId: string) => void;
    clearWorkspace: () => void;
    executeExtraction: () => Promise<void>;
    cancelExtraction: () => void;
}

// ----------------------------------------------------------------------------
// 2. PURE HELPER FUNCTIONS FOR RECURSIVE IMMUTABLE TREE UPDATES
// ----------------------------------------------------------------------------

/**
 * Generates a unique, deterministic-safe ID for new schema fields.
 */
function createFieldId(prefix = 'fld'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Deep-clones a `FieldDefinition[]` tree so preset mutations never pollute
 * the static `PRESETS` constant.
 */
function cloneSchemaTree(fields: FieldDefinition[]): FieldDefinition[] {
    return fields.map((field) => ({
        ...field,
        rules: field.rules ? { ...field.rules } : undefined,
        examples: field.examples ? [...field.examples] : undefined,
        children: field.children ? cloneSchemaTree(field.children) : undefined
    }));
}

/**
 * Sanitizes a field definition whenever its `type` or `arrayItemType` changes
 * so stale rules/children from a previous type do not violate `fieldSchema.ts`.
 */
function sanitizeFieldOnTypeChange(field: FieldDefinition): FieldDefinition {
    const next: FieldDefinition = { ...field };

    if (next.type === 'array') {
        const itemType = next.arrayItemType ?? 'string';
        next.arrayItemType = itemType;

        if (itemType === 'object') {
            // Ensure at least one child column exists so it doesn't fail the non-empty children check
            if (!next.children || next.children.length === 0) {
                next.children = [
                    {
                        id: createFieldId('col'),
                        name: 'itemName',
                        label: 'Item Name',
                        type: 'string',
                        description: 'Description or name of the row item',
                        required: true,
                        allowNullIfMissing: false
                    }
                ];
            }
        } else {
            delete next.children;
        }

        // Keep only array-relevant validation rules (minItems, maxItems)
        if (next.rules) {
            const { minItems, maxItems } = next.rules;
            next.rules = {
                ...(minItems !== undefined ? { minItems } : {}),
                ...(maxItems !== undefined ? { maxItems } : {})
            };
        }
    } else if (next.type === 'object') {
        delete next.arrayItemType;
        delete next.rules;
        if (!next.children || next.children.length === 0) {
            next.children = [
                {
                    id: createFieldId('sub'),
                    name: 'subField',
                    label: 'Sub Field',
                    type: 'string',
                    description: 'Nested property value',
                    required: true,
                    allowNullIfMissing: false
                }
            ];
        }
    } else {
        // Primitive types: 'string' | 'number' | 'boolean' | 'date'
        delete next.arrayItemType;
        delete next.children;

        if (next.type === 'date') {
            next.rules = {
                dateFormat: next.rules?.dateFormat ?? 'DD-MM-YYYY'
            };
        } else if (next.type === 'number') {
            const { min, max, isInteger, currencyCode } = next.rules ?? {};
            next.rules = {
                ...(min !== undefined ? { min } : {}),
                ...(max !== undefined ? { max } : {}),
                ...(isInteger !== undefined ? { isInteger } : {}),
                ...(currencyCode ? { currencyCode } : {})
            };
        } else if (next.type === 'string') {
            const { minLength, maxLength, regexPattern, regexErrorMessage, allowedValues } =
                next.rules ?? {};
            next.rules = {
                ...(minLength !== undefined ? { minLength } : {}),
                ...(maxLength !== undefined ? { maxLength } : {}),
                ...(regexPattern ? { regexPattern } : {}),
                ...(regexErrorMessage ? { regexErrorMessage } : {}),
                ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {})
            };
        } else if (next.type === 'boolean') {
            delete next.rules;
        }
    }

    // Clean up empty rules object if no keys remain
    if (next.rules && Object.keys(next.rules).length === 0) {
        delete next.rules;
    }

    return next;
}

/**
 * Recursively maps over the field tree and updates the matching `fieldId`.
 */
function updateFieldInTree(
    fields: FieldDefinition[],
    targetId: string,
    updater: (field: FieldDefinition) => FieldDefinition
): FieldDefinition[] {
    return fields.map((field) => {
        if (field.id === targetId) {
            return updater(field);
        }
        if (field.children && field.children.length > 0) {
            return {
                ...field,
                children: updateFieldInTree(field.children, targetId, updater)
            };
        }
        return field;
    });
}

/**
 * Recursively removes a field by ID from the tree.
 */
function removeFieldFromTree(fields: FieldDefinition[], targetId: string): FieldDefinition[] {
    return fields
        .filter((field) => field.id !== targetId)
        .map((field) => {
            if (field.children && field.children.length > 0) {
                return {
                    ...field,
                    children: removeFieldFromTree(field.children, targetId)
                };
            }
            return field;
        });
}

/**
 * Moves a field up or down within its sibling list (works at root and nested levels).
 */
function moveFieldInTree(
    fields: FieldDefinition[],
    targetId: string,
    direction: 'up' | 'down'
): FieldDefinition[] {
    const index = fields.findIndex((f) => f.id === targetId);
    if (index !== -1) {
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= fields.length) {
            return fields;
        }
        const copy = [...fields];
        const [removed] = copy.splice(index, 1);
        copy.splice(swapIndex, 0, removed);
        return copy;
    }

    return fields.map((field) => {
        if (field.children && field.children.length > 0) {
            return {
                ...field,
                children: moveFieldInTree(field.children, targetId, direction)
            };
        }
        return field;
    });
}

/**
 * Resolves a Zod issue path (e.g. `['schema', 2, 'children', 0, 'name']`) to the
 * specific `FieldDefinition.id` so the UI can highlight the exact offending card.
 */
function resolveFieldIdFromZodPath(
    schema: FieldDefinition[],
    path: (string | number)[]
): string | null {
    if (path[0] !== 'schema' || typeof path[1] !== 'number') {
        return null;
    }

    let currentField: FieldDefinition | undefined = schema[path[1]];
    if (!currentField) return null;

    let idx = 2;
    while (idx < path.length && currentField) {
        if (path[idx] === 'children' && typeof path[idx + 1] === 'number') {
            currentField = currentField.children?.[path[idx + 1] as number];
            idx += 2;
        } else {
            break;
        }
    }

    return currentField?.id ?? null;
}

// ----------------------------------------------------------------------------
// 3. MAIN HOOK IMPLEMENTATION
// ----------------------------------------------------------------------------

export function useExtractionController(): ExtractionController {
    const initialPreset: PresetScenario = PRESETS[0];

    // Input State
    const [schema, setSchema] = useState<FieldDefinition[]>(() =>
        cloneSchemaTree(initialPreset.schema)
    );
    const [rawText, setRawTextState] = useState<string>(initialPreset.rawText);
    const [maxRetries, setMaxRetriesState] = useState<number>(3);
    const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);

    // Execution & Validation State
    const [isExtracting, setIsExtracting] = useState<boolean>(false);
    const [elapsedMs, setElapsedMs] = useState<number>(0);
    const [clientFatalError, setClientFatalError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

    // Output & Viewport State
    const [response, setResponse] = useState<ExtractionResponse | null>(null);
    const [activeTab, setActiveTab] = useState<ViewportTab>('json');
    const [selectedAttemptNumber, setSelectedAttemptNumber] = useState<number | null>(null);

    // Refs for AbortController and Live Timer
    const abortControllerRef = useRef<AbortController | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopTimer = useCallback(() => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopTimer();
            abortControllerRef.current?.abort();
        };
    }, [stopTimer]);

    // --------------------------------------------------------------------------
    // BASIC SETTERS
    // --------------------------------------------------------------------------

    const setRawText = useCallback((text: string) => {
        setRawTextState(text);
        setClientFatalError(null);
    }, []);

    const setMaxRetries = useCallback((retries: number) => {
        const clamped = Math.min(Math.max(Math.round(retries), 0), 5);
        setMaxRetriesState(clamped);
    }, []);

    // --------------------------------------------------------------------------
    // RECURSIVE SCHEMA TREE ACTIONS
    // --------------------------------------------------------------------------

    const addField = useCallback((parentId?: string) => {
        setClientFatalError(null);

        setSchema((prev) => {
            const count = prev.length + 1;
            const newField: FieldDefinition = {
                id: createFieldId(parentId ? 'col' : 'fld'),
                name: parentId ? `column${Date.now().toString().slice(-3)}` : `field${count}`,
                label: parentId ? 'New Column' : `Field ${count}`,
                type: 'string',
                description: '',
                required: true,
                allowNullIfMissing: false
            };

            if (!parentId) {
                return [...prev, newField];
            }

            return updateFieldInTree(prev, parentId, (parent) => ({
                ...parent,
                children: [...(parent.children ?? []), newField]
            }));
        });
    }, []);

    const removeField = useCallback((fieldId: string) => {
        setClientFatalError(null);
        setFieldErrors((prev) => {
            if (!prev[fieldId]) return prev;
            const next = { ...prev };
            delete next[fieldId];
            return next;
        });

        setSchema((prev) => removeFieldFromTree(prev, fieldId));
    }, []);

    const updateField = useCallback((fieldId: string, patch: Partial<FieldDefinition>) => {
        setClientFatalError(null);
        setFieldErrors((prev) => {
            if (!prev[fieldId]) return prev;
            const next = { ...prev };
            delete next[fieldId];
            return next;
        });

        setSchema((prev) =>
            updateFieldInTree(prev, fieldId, (existing) => {
                const merged: FieldDefinition = { ...existing, ...patch };
                // If `type` or `arrayItemType` was modified, sanitize child/rule structures
                if (
                    (patch.type && patch.type !== existing.type) ||
                    (patch.arrayItemType && patch.arrayItemType !== existing.arrayItemType)
                ) {
                    return sanitizeFieldOnTypeChange(merged);
                }
                return merged;
            })
        );
    }, []);

    const updateFieldRules = useCallback(
        (fieldId: string, rulesPatch: Partial<ValidationRules>) => {
            setClientFatalError(null);
            setFieldErrors((prev) => {
                if (!prev[fieldId]) return prev;
                const next = { ...prev };
                delete next[fieldId];
                return next;
            });

            setSchema((prev) =>
                updateFieldInTree(prev, fieldId, (existing) => {
                    const mergedRules: ValidationRules = {
                        ...(existing.rules ?? {}),
                        ...rulesPatch
                    };

                    // Clean out `undefined` or empty strings so optional Zod rules don't trip
                    (Object.keys(mergedRules) as (keyof ValidationRules)[]).forEach((key) => {
                        const val = mergedRules[key];
                        if (val === undefined || val === '') {
                            delete mergedRules[key];
                        }
                    });

                    return {
                        ...existing,
                        rules: Object.keys(mergedRules).length > 0 ? mergedRules : undefined
                    };
                })
            );
        },
        []
    );

    const moveField = useCallback((fieldId: string, direction: 'up' | 'down') => {
        setSchema((prev) => moveFieldInTree(prev, fieldId, direction));
    }, []);

    const importSchemaJson = useCallback((rawJson: string): { ok: boolean; error?: string } => {
        try {
            const parsed: unknown = JSON.parse(rawJson);
            const arraySchema = z.array(fieldDefinitionSchema).min(1).max(50);
            const verified = arraySchema.safeParse(parsed);

            if (!verified.success) {
                const msg = verified.error.errors
                    .map((e) => `[${e.path.join('.') || 'root'}]: ${e.message}`)
                    .join('; ');
                return { ok: false, error: msg };
            }

            setSchema(cloneSchemaTree(verified.data));
            setFieldErrors({});
            setClientFatalError(null);
            setActivePresetId(null);
            return { ok: true };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Invalid JSON syntax';
            return { ok: false, error: msg };
        }
    }, []);

    // --------------------------------------------------------------------------
    // PRESET & WORKSPACE MANAGEMENT
    // --------------------------------------------------------------------------

    const loadPreset = useCallback(
        (presetId: string) => {
            const found = PRESETS.find((p) => p.id === presetId);
            if (!found) return;

            // Cancel any ongoing extraction
            abortControllerRef.current?.abort();
            stopTimer();
            setIsExtracting(false);

            setSchema(cloneSchemaTree(found.schema));
            setRawTextState(found.rawText);
            setActivePresetId(found.id);
            setFieldErrors({});
            setClientFatalError(null);
            setResponse(null);
            setSelectedAttemptNumber(null);
        },
        [stopTimer]
    );

    const clearWorkspace = useCallback(() => {
        abortControllerRef.current?.abort();
        stopTimer();
        setIsExtracting(false);
        setRawTextState('');
        setActivePresetId(null);
        setFieldErrors({});
        setClientFatalError(null);
        setResponse(null);
        setSelectedAttemptNumber(null);
    }, [stopTimer]);

    const cancelExtraction = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        stopTimer();
        setIsExtracting(false);
    }, [stopTimer]);

    // --------------------------------------------------------------------------
    // EXECUTION ENGINE (PRE-FLIGHT GUARD + HTTP TRANSPORT)
    // --------------------------------------------------------------------------

    const executeExtraction = useCallback(async () => {
        // 1. Clear previous errors
        setClientFatalError(null);
        setFieldErrors({});

        // 2. Run local Pre-Flight Zod Validation (`extractionRequestSchema`)
        const payloadCandidate = {
            rawText,
            schema,
            maxRetries
        };

        const preflight = extractionRequestSchema.safeParse(payloadCandidate);
        if (!preflight.success) {
            const nextFieldErrors: Record<string, string[]> = {};
            const generalMessages: string[] = [];

            for (const issue of preflight.error.errors) {
                const targetId = resolveFieldIdFromZodPath(schema, issue.path);
                if (targetId) {
                    if (!nextFieldErrors[targetId]) {
                        nextFieldErrors[targetId] = [];
                    }
                    nextFieldErrors[targetId].push(issue.message);
                } else {
                    generalMessages.push(issue.message);
                }
            }

            setFieldErrors(nextFieldErrors);
            setClientFatalError(
                generalMessages.length > 0
                    ? generalMessages.join(' • ')
                    : 'Please fix the highlighted schema configuration errors before running extraction.'
            );
            return;
        }

        // 3. Abort any prior in-flight request & start live elapsed timer
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsExtracting(true);
        setElapsedMs(0);
        const startTimestamp = performance.now();

        stopTimer();
        timerIntervalRef.current = setInterval(() => {
            setElapsedMs(Math.round(performance.now() - startTimestamp));
        }, 60);

        try {
            const httpRes = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(preflight.data),
                signal: controller.signal
            });

            const contentType = httpRes.headers.get('content-type') ?? '';
            if (!contentType.includes('application/json')) {
                throw new Error(
                    `Unexpected non-JSON response from server (HTTP ${httpRes.status}). Ensure the API server is running on port 3001.`
                );
            }

            const result: ExtractionResponse = await httpRes.json();

            stopTimer();
            setElapsedMs(result.totalDurationMs || Math.round(performance.now() - startTimestamp));
            setIsExtracting(false);
            setResponse(result);

            if (result.fatalError && !result.success && !result.isPartialSuccess) {
                setClientFatalError(result.fatalError);
            }

            // Smart Viewport Auto-Routing:
            // - If self-healing took >1 attempt, or failed, select the interesting attempt
            //   and switch to the timeline if there were retries so the user sees the self-healing!
            if (result.repairLogs && result.repairLogs.length > 0) {
                const lastLog = result.repairLogs[result.repairLogs.length - 1];
                setSelectedAttemptNumber(lastLog.attemptNumber);

                if (result.repairLogs.length > 1) {
                    setActiveTab('timeline');
                } else {
                    setActiveTab('json');
                }
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                // User intentionally cancelled
                return;
            }

            stopTimer();
            setIsExtracting(false);

            const errMsg =
                err instanceof Error
                    ? err.message
                    : 'Failed to reach /api/extract. Make sure the backend API is running on port 3001.';

            setClientFatalError(errMsg);
        }
    }, [rawText, schema, maxRetries, stopTimer]);

    return {
        schema,
        rawText,
        maxRetries,
        activePresetId,
        isExtracting,
        elapsedMs,
        clientFatalError,
        fieldErrors,
        response,
        activeTab,
        selectedAttemptNumber,
        setRawText,
        setMaxRetries,
        setActiveTab,
        setSelectedAttemptNumber,
        addField,
        removeField,
        updateField,
        updateFieldRules,
        moveField,
        importSchemaJson,
        loadPreset,
        clearWorkspace,
        executeExtraction,
        cancelExtraction
    };
}