/**
 * ============================================================================
 * @schema-extractor/web - Recursive Schema Field Card (Pane 1)
 * ============================================================================
 * Handles:
 * 1. Root & nested child field rendering (`depth` 0 and `depth` 1)
 * 2. Depth-aware type switching (prevents nesting deeper than MAX_NESTING_DEPTH = 1)
 * 3. Contextual Validation Rule Drawer (`string`, `number`, `date`, `array`)
 * 4. Live RegExp syntax checking and NaN-safe numeric bound inputs
 * 5. Sanzo Wada No. 224 industrial styling & Coral Rose pre-flight error states
 */

import React, { useState, useMemo } from 'react';
import {
  FieldDefinition,
  FieldType,
  PrimitiveFieldType,
  ValidationRules,
  DateFormatOption
} from '@schema-extractor/shared';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  SlidersHorizontal,
  Plus,
  AlertCircle,
  CheckCircle2,
  CornerDownRight,
  Layers
} from 'lucide-react';

interface FieldCardProps {
  field: FieldDefinition;
  index: number;
  siblingCount: number;
  depth?: number;
  isExtracting: boolean;
  fieldErrors: Record<string, string[]>;
  onUpdateField: (fieldId: string, patch: Partial<FieldDefinition>) => void;
  onUpdateRules: (fieldId: string, rulesPatch: Partial<ValidationRules>) => void;
  onRemoveField: (fieldId: string) => void;
  onMoveField: (fieldId: string, direction: 'up' | 'down') => void;
  onAddChildField: (parentId: string) => void;
}

const ROOT_FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'date', label: 'date' },
  { value: 'boolean', label: 'boolean' },
  { value: 'array', label: 'array (list / table)' },
  { value: 'object', label: 'object (group)' }
];

const CHILD_PRIMITIVE_TYPES: { value: PrimitiveFieldType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'date', label: 'date' },
  { value: 'boolean', label: 'boolean' }
];

const DATE_FORMATS: DateFormatOption[] = ['DD-MM-YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'];

/**
 * Safely converts an HTML number input string to a finite number or `undefined`.
 */
function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Counts how many active validation rules are configured on a field.
 */
function countActiveRules(field: FieldDefinition): number {
  let count = 0;
  if (field.rules) {
    count += Object.keys(field.rules).filter(
      (k) => field.rules![k as keyof ValidationRules] !== undefined
    ).length;
  }
  if (field.examples && field.examples.length > 0) {
    count += 1;
  }
  return count;
}

export const FieldCard: React.FC<FieldCardProps> = ({
  field,
  index,
  siblingCount,
  depth = 0,
  isExtracting,
  fieldErrors,
  onUpdateField,
  onUpdateRules,
  onRemoveField,
  onMoveField,
  onAddChildField
}) => {
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);

  const errorsForThisField = fieldErrors[field.id] ?? [];
  const hasErrors = errorsForThisField.length > 0;
  const activeRuleCount = countActiveRules(field);

  // At depth >= 1, disallow nested arrays/objects to adhere to MAX_NESTING_DEPTH = 1
  const availableTypes = depth === 0 ? ROOT_FIELD_TYPES : CHILD_PRIMITIVE_TYPES;

  // Prevent deleting the last remaining child inside an object or array-of-objects
  // or the last root field in the schema
  const isDeleteDisabled = isExtracting || siblingCount <= 1;

  // Live check for custom regex syntax validity
  const regexStatus = useMemo(() => {
    const pattern = field.rules?.regexPattern;
    if (!pattern) return null;
    try {
      new RegExp(pattern);
      return { valid: true, message: 'Valid RegExp' };
    } catch (err: unknown) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Invalid RegExp syntax'
      };
    }
  }, [field.rules?.regexPattern]);

  // Auto-generate a clean camelCase JSON key from label if the user hasn't customized it
  const handleIdentifierChange = (rawVal: string) => {
    // Allow letters, numbers, and underscores cleanly
    const cleaned = rawVal.replace(/[^a-zA-Z0-9_]/g, '');
    onUpdateField(field.id, {
      name: cleaned,
      label: cleaned || field.label
    });
  };

  const showNestedChildren =
    depth === 0 &&
    (field.type === 'object' ||
      (field.type === 'array' && (field.arrayItemType ?? 'string') === 'object'));

  return (
    <div
      className={`rounded border transition-colors ${
        hasErrors
          ? 'bg-surface-card border-accent-coral shadow-[0_0_0_1px_#f27291]'
          : depth === 0
          ? 'bg-surface-card border-surface-border hover:border-surface-border/90'
          : 'bg-surface-panel/90 border-surface-border/80'
      }`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* ROW 1: FIELD KEY, DATA TYPE, REORDER & DELETE CONTROLS             */}
      {/* ------------------------------------------------------------------ */}
      <div className="p-2.5 flex items-center gap-2">
        {depth > 0 && (
          <CornerDownRight className="w-3.5 h-3.5 text-accent-teal shrink-0 ml-0.5" />
        )}

        {/* JSON Key Name Input */}
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={field.name}
            disabled={isExtracting}
            onChange={(e) => handleIdentifierChange(e.target.value)}
            placeholder="fieldName (camelCase)"
            title="JSON property key (must start with a letter and contain only letters, digits, or underscores)"
            className={`w-full bg-surface-canvas border rounded px-2 py-1 font-mono text-xs text-slate-100 placeholder-slate-500 focus:outline-none ${
              hasErrors
                ? 'border-accent-coral focus:border-accent-coral'
                : 'border-surface-border focus:border-accent-coral'
            } disabled:opacity-50`}
          />
        </div>

        {/* Field Type Dropdown */}
        <select
          value={field.type}
          disabled={isExtracting}
          onChange={(e) => onUpdateField(field.id, { type: e.target.value as FieldType })}
          className="bg-surface-canvas border border-surface-border rounded px-2 py-1 font-mono text-xs text-accent-teal focus:outline-none focus:border-accent-coral disabled:opacity-50 cursor-pointer"
        >
          {availableTypes.map((t) => (
            <option key={t.value} value={t.value} className="bg-surface-panel text-slate-200">
              {t.label}
            </option>
          ))}
        </select>

        {/* Up / Down Reorder Buttons */}
        <div className="flex items-center border border-surface-border rounded bg-surface-canvas overflow-hidden">
          <button
            type="button"
            disabled={isExtracting || index === 0}
            onClick={() => onMoveField(field.id, 'up')}
            title="Move field up"
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-surface-hover disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={isExtracting || index === siblingCount - 1}
            onClick={() => onMoveField(field.id, 'down')}
            title="Move field down"
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-surface-hover border-l border-surface-border disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Delete Field Button */}
        <button
          type="button"
          disabled={isDeleteDisabled}
          onClick={() => onRemoveField(field.id)}
          title={
            siblingCount <= 1
              ? 'At least one field is required'
              : `Delete field "${field.name}"`
          }
          className="p-1.5 rounded border border-surface-border bg-surface-canvas text-slate-400 hover:text-accent-coral hover:border-accent-coral/50 disabled:opacity-25 disabled:pointer-events-none transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ROW 1.5: ARRAY ITEM TYPE BAR (ONLY WHEN `field.type === 'array'`)  */}
      {/* ------------------------------------------------------------------ */}
      {field.type === 'array' && depth === 0 && (
        <div className="px-2.5 pb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-accent-teal" />
            <span>Array Element Mode:</span>
          </span>
          <select
            value={field.arrayItemType ?? 'string'}
            disabled={isExtracting}
            onChange={(e) =>
              onUpdateField(field.id, {
                arrayItemType: e.target.value as PrimitiveFieldType | 'object'
              })
            }
            className="bg-surface-canvas border border-accent-teal/50 rounded px-2 py-0.5 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-accent-coral disabled:opacity-50"
          >
            <option value="object">Object Table (Row Columns)</option>
            <option value="string">Primitive List: string[]</option>
            <option value="number">Primitive List: number[]</option>
            <option value="date">Primitive List: date[]</option>
            <option value="boolean">Primitive List: boolean[]</option>
          </select>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ROW 2: LLM EXTRACTION HINT (DESCRIPTION)                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-2.5 pb-2">
        <input
          type="text"
          value={field.description ?? ''}
          disabled={isExtracting}
          onChange={(e) => onUpdateField(field.id, { description: e.target.value })}
          placeholder="Extraction prompt hint (e.g., 'Final payable amount excluding tax')..."
          className="w-full bg-surface-canvas/70 border border-surface-border/70 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-accent-teal disabled:opacity-50"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ROW 3: TOGGLES (REQUIRED / ALLOW NULL) + RULES DRAWER BUTTON       */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-2.5 py-1.5 border-t border-surface-border/60 bg-surface-panel/40 flex items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex items-center gap-3">
          {/* Required Toggle */}
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={field.required}
              disabled={isExtracting}
              onChange={(e) => onUpdateField(field.id, { required: e.target.checked })}
              className="accent-[#f27291] rounded cursor-pointer"
            />
            <span>Required</span>
          </label>

          {/* Allow Null If Missing Toggle */}
          <label
            className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none"
            title="If absent in the source text, allow the LLM to output literal null instead of failing"
          >
            <input
              type="checkbox"
              checked={field.allowNullIfMissing ?? false}
              disabled={isExtracting}
              onChange={(e) =>
                onUpdateField(field.id, { allowNullIfMissing: e.target.checked })
              }
              className="accent-[#547076] rounded cursor-pointer"
            />
            <span className="text-slate-400">Nullable</span>
          </label>
        </div>

        {/* Contextual Rules Drawer Trigger (Hidden for boolean & object which need no extra rules) */}
        {field.type !== 'boolean' && field.type !== 'object' && (
          <button
            type="button"
            onClick={() => setIsRulesOpen((prev) => !prev)}
            className={`px-2 py-0.5 rounded border flex items-center gap-1.5 transition-colors ${
              isRulesOpen || activeRuleCount > 0
                ? 'bg-accent-plum/25 border-accent-plum text-slate-200'
                : 'bg-surface-canvas border-surface-border text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3 text-accent-coral" />
            <span>Rules</span>
            {activeRuleCount > 0 && (
              <span className="px-1 rounded bg-accent-coral text-surface-canvas font-bold text-[10px]">
                {activeRuleCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CONTEXTUAL VALIDATION RULES DRAWER                                 */}
      {/* ------------------------------------------------------------------ */}
      {isRulesOpen && field.type !== 'boolean' && field.type !== 'object' && (
        <div className="p-2.5 border-t border-surface-border bg-surface-canvas/90 flex flex-col gap-2.5 text-xs font-mono">
          {/* 1. STRING VALIDATION RULES */}
          {field.type === 'string' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                    Min Length
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={field.rules?.minLength ?? ''}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        minLength: parseOptionalNumber(e.target.value)
                      })
                    }
                    placeholder="None"
                    className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                    Max Length
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={field.rules?.maxLength ?? ''}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        maxLength: parseOptionalNumber(e.target.value)
                      })
                    }
                    placeholder="None"
                    className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
                  />
                </div>
              </div>

              {/* Regex Pattern Input + Live Syntax Badge */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-slate-400 uppercase">
                    Regex Pattern (JS RegExp)
                  </label>
                  {regexStatus && (
                    <span
                      className={`text-[10px] flex items-center gap-1 ${
                        regexStatus.valid ? 'text-status-success' : 'text-accent-coral'
                      }`}
                    >
                      {regexStatus.valid ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      <span>{regexStatus.valid ? 'Valid RegExp' : 'Invalid RegExp'}</span>
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={field.rules?.regexPattern ?? ''}
                  disabled={isExtracting}
                  onChange={(e) =>
                    onUpdateRules(field.id, {
                      regexPattern: e.target.value || undefined
                    })
                  }
                  placeholder="e.g. ^INV-[0-9]{4}$"
                  className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-coral"
                />
              </div>

              {/* Custom Regex Error Message */}
              {field.rules?.regexPattern && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                    Regex Repair Hint (Sent to LLM on Failure)
                  </label>
                  <input
                    type="text"
                    value={field.rules?.regexErrorMessage ?? ''}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        regexErrorMessage: e.target.value || undefined
                      })
                    }
                    placeholder="e.g. Must start with INV- followed by 4 digits"
                    className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-coral"
                  />
                </div>
              )}

              {/* Allowed Enum Values */}
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                  Allowed Enum Values (Comma-separated)
                </label>
                <input
                  type="text"
                  value={(field.rules?.allowedValues ?? []).join(', ')}
                  disabled={isExtracting}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const items = raw
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    onUpdateRules(field.id, {
                      allowedValues: items.length > 0 ? items : undefined
                    });
                  }}
                  placeholder="e.g. PAID, PENDING, FAILED"
                  className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-coral"
                />
              </div>
            </>
          )}

          {/* 2. NUMBER VALIDATION RULES */}
          {field.type === 'number' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                    Min Value
                  </label>
                  <input
                    type="number"
                    value={field.rules?.min ?? ''}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        min: parseOptionalNumber(e.target.value)
                      })
                    }
                    placeholder="No min"
                    className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                    Max Value
                  </label>
                  <input
                    type="number"
                    value={field.rules?.max ?? ''}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        max: parseOptionalNumber(e.target.value)
                      })
                    }
                    placeholder="No max"
                    className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.rules?.isInteger ?? false}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        isInteger: e.target.checked ? true : undefined
                      })
                    }
                    className="accent-[#f27291] rounded cursor-pointer"
                  />
                  <span className="text-[11px]">Whole Integer Only</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 uppercase">Currency:</span>
                  <input
                    type="text"
                    maxLength={5}
                    value={field.rules?.currencyCode ?? ''}
                    disabled={isExtracting}
                    onChange={(e) =>
                      onUpdateRules(field.id, {
                        currencyCode: e.target.value.toUpperCase() || undefined
                      })
                    }
                    placeholder="INR"
                    className="w-16 bg-surface-panel border border-surface-border rounded px-1.5 py-0.5 text-xs text-slate-200 uppercase focus:outline-none focus:border-accent-coral"
                  />
                </div>
              </div>
            </>
          )}

          {/* 3. DATE VALIDATION RULES */}
          {field.type === 'date' && (
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                Strict Calendar Date Format
              </label>
              <select
                value={field.rules?.dateFormat ?? 'DD-MM-YYYY'}
                disabled={isExtracting}
                onChange={(e) =>
                  onUpdateRules(field.id, {
                    dateFormat: e.target.value as DateFormatOption
                  })
                }
                className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
              >
                {DATE_FORMATS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt} (Verified Leap-Year & Calendar Bounds)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 4. ARRAY VALIDATION RULES */}
          {field.type === 'array' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                  Min Items
                </label>
                <input
                  type="number"
                  min={0}
                  value={field.rules?.minItems ?? ''}
                  disabled={isExtracting}
                  onChange={(e) =>
                    onUpdateRules(field.id, {
                      minItems: parseOptionalNumber(e.target.value)
                    })
                  }
                  placeholder="0"
                  className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                  Max Items
                </label>
                <input
                  type="number"
                  min={1}
                  value={field.rules?.maxItems ?? ''}
                  disabled={isExtracting}
                  onChange={(e) =>
                    onUpdateRules(field.id, {
                      maxItems: parseOptionalNumber(e.target.value)
                    })
                  }
                  placeholder="Unlimited"
                  className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent-coral"
                />
              </div>
            </div>
          )}

          {/* 5. FEW-SHOT EXAMPLES (AVAILABLE FOR PRIMITIVE FIELDS) */}
          {field.type !== 'array' && (
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                Few-Shot Format Examples (Comma-separated)
              </label>
              <input
                type="text"
                value={(field.examples ?? []).join(', ')}
                disabled={isExtracting}
                onChange={(e) => {
                  const items = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  onUpdateField(field.id, {
                    examples: items.length > 0 ? items : undefined
                  });
                }}
                placeholder="e.g. INV-2048, INV-9012"
                className="w-full bg-surface-panel border border-surface-border rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-coral"
              />
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PRE-FLIGHT ZOD VALIDATION ERRORS FOR THIS SPECIFIC FIELD CARD      */}
      {/* ------------------------------------------------------------------ */}
      {hasErrors && (
        <div className="px-2.5 py-1.5 border-t border-accent-coral/40 bg-accent-coral/10 flex flex-col gap-1">
          {errorsForThisField.map((errMsg, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] font-mono text-accent-coral"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{errMsg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* RECURSIVE NESTED CHILDREN (FOR `object` AND `array` OF `object`s)  */}
      {/* ------------------------------------------------------------------ */}
      {showNestedChildren && (
        <div className="p-2.5 border-t border-surface-border bg-surface-canvas/60 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-accent-teal font-semibold">
              {field.type === 'array'
                ? `Row Columns (${field.children?.length ?? 0})`
                : `Nested Properties (${field.children?.length ?? 0})`}
            </span>
            <button
              type="button"
              disabled={isExtracting}
              onClick={() => onAddChildField(field.id)}
              className="px-2 py-0.5 rounded bg-surface-card border border-accent-teal/50 hover:border-accent-coral text-slate-200 font-mono text-[11px] flex items-center gap-1 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3 h-3 text-accent-coral" />
              <span>Add Column</span>
            </button>
          </div>

          <div className="pl-2 border-l-2 border-accent-teal/40 flex flex-col gap-2">
            {(field.children ?? []).map((childField, childIdx) => (
              <FieldCard
                key={childField.id}
                field={childField}
                index={childIdx}
                siblingCount={field.children?.length ?? 0}
                depth={depth + 1}
                isExtracting={isExtracting}
                fieldErrors={fieldErrors}
                onUpdateField={onUpdateField}
                onUpdateRules={onUpdateRules}
                onRemoveField={onRemoveField}
                onMoveField={onMoveField}
                onAddChildField={onAddChildField}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};