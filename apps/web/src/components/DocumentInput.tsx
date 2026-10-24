/**
 * ============================================================================
 * @schema-extractor/web - Document Ingestion & Presets (Pane 2)
 * ============================================================================
 * Styled using Sanzo Wada No. 224 palette tokens.
 */

import React from 'react';
import { PRESETS } from '../data/presets';
import { Play, Square, Sparkles, FileText, AlertCircle, Clock } from 'lucide-react';

interface DocumentInputProps {
  rawText: string;
  onRawTextChange: (text: string) => void;
  activePresetId: string | null;
  onSelectPreset: (presetId: string) => void;
  onClear: () => void;
  isExtracting: boolean;
  elapsedMs: number;
  onExecute: () => void;
  onCancel: () => void;
  clientFatalError: string | null;
}

export const DocumentInput: React.FC<DocumentInputProps> = ({
  rawText,
  onRawTextChange,
  activePresetId,
  onSelectPreset,
  onClear,
  isExtracting,
  elapsedMs,
  onExecute,
  onCancel,
  clientFatalError
}) => {
  // Approximate token count: 1 token ~= 4 characters in English
  const charCount = rawText.length;
  const lineCount = rawText.trim() ? rawText.split('\n').length : 0;
  const estimatedTokens = Math.ceil(charCount / 4);

  return (
    <div className="flex flex-col h-full bg-surface-canvas text-slate-100 select-none">
      {/* Pane Header */}
      <div className="h-11 px-4 border-b border-surface-border bg-surface-panel flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent-teal" />
          <span className="text-xs font-mono font-semibold text-slate-200 tracking-wider uppercase">
            02 // Ground Truth Input
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={isExtracting || (!rawText && !activePresetId)}
          className="text-xs text-slate-400 hover:text-accent-coral transition-colors disabled:opacity-30 disabled:pointer-events-none font-mono"
        >
          [Clear Text]
        </button>
      </div>

      {/* Preset Scenario Selector Bar */}
      <div className="p-3 border-b border-surface-border bg-surface-panel/50 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-accent-teal font-semibold">
            Test Scenarios (1-Click Load)
          </span>
          <span className="text-[10px] text-slate-400">Updates schema & document</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                disabled={isExtracting}
                className={`flex flex-col text-left p-2 rounded border transition-all text-xs ${
                  isSelected
                    ? 'bg-surface-card border-accent-coral shadow-[0_0_0_1px_#f27291]'
                    : 'bg-surface-panel border-surface-border hover:border-accent-teal/60 hover:bg-surface-card'
                } disabled:opacity-40`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-slate-100 truncate">{preset.name}</span>
                </div>
                <span className="text-[10px] font-mono text-accent-teal truncate">
                  {preset.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Textarea Container */}
      <div className="flex-1 p-3 flex flex-col min-h-0 relative">
        <textarea
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          disabled={isExtracting}
          placeholder="Paste or type raw unstructured text (invoice note, email, receipt transcript, messy chat)..."
          className="flex-1 w-full bg-surface-panel border border-surface-border rounded p-3 font-mono text-xs leading-relaxed text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-coral focus:ring-1 focus:ring-accent-coral resize-none disabled:opacity-60 transition-colors"
          spellCheck={false}
        />

        {/* Character & Token Stats Footer */}
        <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>{charCount} chars</span>
            <span>•</span>
            <span>{lineCount} lines</span>
            <span>•</span>
            <span>~{estimatedTokens} tokens</span>
          </div>

          {activePresetId && (
            <span className="text-[10px] text-accent-teal font-mono">
              Scenario: {PRESETS.find((p) => p.id === activePresetId)?.name}
            </span>
          )}
        </div>
      </div>

      {/* Error Banner (if preflight or fatal error exists) */}
      {clientFatalError && (
        <div className="mx-3 mb-2 p-2.5 rounded bg-accent-coral/10 border border-accent-coral/40 flex items-start gap-2 text-xs text-accent-coral font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-snug">{clientFatalError}</span>
        </div>
      )}

      {/* Action Footer Bar */}
      <div className="p-3 border-t border-surface-border bg-surface-panel flex items-center justify-between gap-3">
        {/* Elapsed Time Metric */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
          <Clock className="w-3.5 h-3.5 text-accent-teal" />
          <span>
            {isExtracting ? (
              <span className="text-accent-coral font-semibold">
                {(elapsedMs / 1000).toFixed(1)}s (running...)
              </span>
            ) : elapsedMs > 0 ? (
              <span>Last run: {(elapsedMs / 1000).toFixed(2)}s</span>
            ) : (
              <span className="text-slate-500">Ready</span>
            )}
          </span>
        </div>

        {/* Action Button */}
        {isExtracting ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded bg-surface-card border border-accent-coral text-accent-coral hover:bg-accent-coral hover:text-surface-canvas font-mono text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Cancel Extraction</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onExecute}
            disabled={!rawText.trim()}
            className="px-5 py-2 rounded bg-accent-coral text-surface-canvas hover:opacity-90 font-mono text-xs font-semibold tracking-wide flex items-center gap-2 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Extract Structured Data</span>
          </button>
        )}
      </div>
    </div>
  );
};