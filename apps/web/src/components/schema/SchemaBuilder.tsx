/**
 * ============================================================================
 * @schema-extractor/web - Schema Studio Container (Pane 1)
 * ============================================================================
 * Renders:
 * 1. Top header with field count, Max Retries budget selector, and Raw JSON toggle
 * 2. Interactive list of recursive `FieldCard` components
 * 3. Raw Schema JSON Import / Export modal drawer validated by `fieldSchema.ts`
 */

import React, { useState } from 'react';
import { FieldDefinition, ValidationRules } from '@schema-extractor/shared';
import { FieldCard } from './FieldCard';
import {
  Sliders,
  Plus,
  Code2,
  Check,
  Copy,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

interface SchemaBuilderProps {
  schema: FieldDefinition[];
  maxRetries: number;
  onMaxRetriesChange: (retries: number) => void;
  isExtracting: boolean;
  fieldErrors: Record<string, string[]>;
  onAddField: (parentId?: string) => void;
  onRemoveField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<FieldDefinition>) => void;
  onUpdateRules: (fieldId: string, rulesPatch: Partial<ValidationRules>) => void;
  onMoveField: (fieldId: string, direction: 'up' | 'down') => void;
  onImportSchemaJson: (rawJson: string) => { ok: boolean; error?: string };
}

export const SchemaBuilder: React.FC<SchemaBuilderProps> = ({
  schema,
  maxRetries,
  onMaxRetriesChange,
  isExtracting,
  fieldErrors,
  onAddField,
  onRemoveField,
  onUpdateField,
  onUpdateRules,
  onMoveField,
  onImportSchemaJson
}) => {
  const [isJsonMode, setIsJsonMode] = useState<boolean>(false);
  const [jsonBuffer, setJsonBuffer] = useState<string>('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const toggleJsonMode = () => {
    if (!isJsonMode) {
      setJsonBuffer(JSON.stringify(schema, null, 2));
      setJsonImportError(null);
      setIsJsonMode(true);
    } else {
      setIsJsonMode(false);
      setJsonImportError(null);
    }
  };

  const handleApplyJson = () => {
    const result = onImportSchemaJson(jsonBuffer);
    if (result.ok) {
      setJsonImportError(null);
      setIsJsonMode(false);
    } else {
      setJsonImportError(result.error ?? 'Invalid schema JSON');
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-panel text-slate-100 select-none">
      {/* ------------------------------------------------------------------ */}
      {/* PANE 1 HEADER                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="h-11 px-4 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-accent-coral" />
          <span className="text-xs font-mono font-semibold text-slate-200 tracking-wider uppercase">
            01 // Schema Studio
          </span>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-accent-teal">
            {schema.length} {schema.length === 1 ? 'field' : 'fields'}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleJsonMode}
          disabled={isExtracting}
          className={`px-2 py-1 rounded border font-mono text-[11px] flex items-center gap-1.5 transition-colors ${
            isJsonMode
              ? 'bg-accent-coral text-surface-canvas border-accent-coral font-semibold'
              : 'bg-surface-card border-surface-border text-slate-300 hover:border-accent-teal'
          } disabled:opacity-40`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{isJsonMode ? 'Visual Editor' : 'Raw JSON'}</span>
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SUB-BAR: SELF-HEALING RETRY BUDGET SELECTOR                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 py-2 border-b border-surface-border bg-surface-canvas/40 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-1.5 text-slate-300">
          <RotateCcw className="w-3.5 h-3.5 text-accent-teal" />
          <span>Max Self-Healing Retries:</span>
        </div>

        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isExtracting}
              onClick={() => onMaxRetriesChange(num)}
              className={`w-6 h-6 rounded border text-[11px] font-mono transition-colors ${
                maxRetries === num
                  ? 'bg-accent-plum/40 border-accent-coral text-slate-100 font-bold'
                  : 'bg-surface-card border-surface-border text-slate-400 hover:text-slate-200'
              } disabled:opacity-40`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* BODY: EITHER RAW JSON IMPORT/EXPORT OR VISUAL FIELD CARD TREE      */}
      {/* ------------------------------------------------------------------ */}
      {isJsonMode ? (
        <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Edit or paste FieldDefinition[] JSON array:</span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1 text-accent-teal hover:text-slate-200 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-status-success" />
                  <span className="text-status-success">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
          </div>

          <textarea
            value={jsonBuffer}
            onChange={(e) => setJsonBuffer(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-surface-canvas border border-surface-border rounded p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-accent-coral resize-none"
          />

          {jsonImportError && (
            <div className="p-2 rounded bg-accent-coral/10 border border-accent-coral/40 flex items-start gap-2 text-xs font-mono text-accent-coral">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{jsonImportError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsJsonMode(false)}
              className="px-3 py-1.5 rounded border border-surface-border bg-surface-card text-slate-300 hover:text-slate-100 font-mono text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyJson}
              className="px-4 py-1.5 rounded bg-accent-coral text-surface-canvas font-mono text-xs font-semibold hover:opacity-90"
            >
              Validate & Apply Schema
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Scrollable Visual Field Tree */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
            {schema.map((field, idx) => (
              <FieldCard
                key={field.id}
                field={field}
                index={idx}
                siblingCount={schema.length}
                depth={0}
                isExtracting={isExtracting}
                fieldErrors={fieldErrors}
                onUpdateField={onUpdateField}
                onUpdateRules={onUpdateRules}
                onRemoveField={onRemoveField}
                onMoveField={onMoveField}
                onAddChildField={(parentId) => onAddField(parentId)}
              />
            ))}
          </div>

          {/* Footer: Add Root Field CTA */}
          <div className="p-3 border-t border-surface-border bg-surface-panel">
            <button
              type="button"
              disabled={isExtracting || schema.length >= 50}
              onClick={() => onAddField()}
              className="w-full py-2 rounded border border-dashed border-accent-teal/60 hover:border-accent-coral bg-surface-card/60 hover:bg-surface-card text-slate-200 font-mono text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-accent-coral" />
              <span>Add Root Schema Field</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};