/**
 * ============================================================================
 * @schema-extractor/web - Results & Self-Healing Viewport Container (Pane 3)
 * ============================================================================
 */

import React from 'react';
import { ExtractionResponse, FieldDefinition } from '@schema-extractor/shared';
import { ViewportTab } from '../../hooks/useExtractionController';
import { JsonViewer } from './JsonViewer';
import { TableViewer } from './TableViewer';
import { RepairTimeline } from './RepairTimeline';
import {
  Activity,
  FileJson,
  Table,
  GitCommit,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Cpu
} from 'lucide-react';

interface ResultsViewportProps {
  response: ExtractionResponse | null;
  schema: FieldDefinition[];
  isExtracting: boolean;
  elapsedMs: number;
  activeTab: ViewportTab;
  onTabChange: (tab: ViewportTab) => void;
  selectedAttemptNumber: number | null;
  onSelectAttempt: (attemptNumber: number) => void;
}

export const ResultsViewport: React.FC<ResultsViewportProps> = ({
  response,
  schema,
  isExtracting,
  elapsedMs,
  activeTab,
  onTabChange,
  selectedAttemptNumber,
  onSelectAttempt
}) => {
  const retryCount = response ? Math.max(0, response.totalAttempts - 1) : 0;

  return (
    <div className="flex flex-col h-full bg-surface-panel text-slate-100 select-none">
      {/* ------------------------------------------------------------------ */}
      {/* PANE 3 HEADER                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="h-11 px-4 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-coral" />
          <span className="text-xs font-mono font-semibold text-slate-200 tracking-wider uppercase">
            03 // Diagnostics & Output
          </span>
        </div>

        {/* High-level Metrics Pill */}
        {response && !isExtracting && (
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate-300">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-accent-teal" />
              {response.totalDurationMs}ms
            </span>
            <span className="text-surface-border">|</span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-accent-teal" />
              {response.totalTokensUsed} tok
            </span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* VIEWPORT TAB BAR (JSON | TABLE | SELF-HEALING TIMELINE)            */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-3 pt-2 border-b border-surface-border bg-surface-canvas/40 flex items-center gap-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => onTabChange('json')}
          className={`px-3 py-1.5 rounded-t border-t border-x flex items-center gap-1.5 transition-colors ${
            activeTab === 'json'
              ? 'bg-surface-panel border-surface-border text-accent-coral font-semibold'
              : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileJson className="w-3.5 h-3.5" />
          <span>JSON Payload</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('table')}
          className={`px-3 py-1.5 rounded-t border-t border-x flex items-center gap-1.5 transition-colors ${
            activeTab === 'table'
              ? 'bg-surface-panel border-surface-border text-accent-coral font-semibold'
              : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Tabular Grid</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('timeline')}
          className={`px-3 py-1.5 rounded-t border-t border-x flex items-center gap-1.5 transition-colors ${
            activeTab === 'timeline'
              ? 'bg-surface-panel border-surface-border text-accent-coral font-semibold'
              : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
          <span>Self-Healing Timeline</span>
          {response && response.repairLogs.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                response.repairLogs.length > 1
                  ? 'bg-accent-coral text-surface-canvas'
                  : 'bg-surface-card text-accent-teal border border-surface-border'
              }`}
            >
              {response.repairLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* STATUS BANNER WHEN A RESPONSE EXISTS                               */}
      {/* ------------------------------------------------------------------ */}
      {response && !isExtracting && (
        <div
          className={`px-3 py-2 border-b font-mono text-xs flex items-center justify-between ${
            response.success
              ? 'bg-status-success/10 border-status-success/30 text-status-success'
              : response.isPartialSuccess
              ? 'bg-status-warning/15 border-status-warning/40 text-status-warning'
              : 'bg-accent-coral/10 border-accent-coral/40 text-accent-coral'
          }`}
        >
          <div className="flex items-center gap-2">
            {response.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : response.isPartialSuccess ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-semibold">
              {response.success
                ? retryCount > 0
                  ? `Self-Healed & Validated in ${response.totalAttempts} Attempts`
                  : 'Validated on Attempt #1 (Zero Retries Needed)'
                : response.isPartialSuccess
                ? `Retries Exhausted (${response.totalAttempts}) — Best Partial Candidate Retained`
                : `Extraction Failed After ${response.totalAttempts} Attempts`}
            </span>
          </div>

          {retryCount > 0 && activeTab !== 'timeline' && (
            <button
              type="button"
              onClick={() => onTabChange('timeline')}
              className="underline text-[11px] hover:opacity-80"
            >
              View {retryCount} Repair {retryCount === 1 ? 'Step' : 'Steps'} →
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MAIN VIEWPORT BODY                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 min-h-0 relative">
        {isExtracting ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center font-mono">
            <div className="w-8 h-8 rounded-full border-2 border-accent-coral border-t-transparent animate-spin mb-3" />
            <p className="text-xs text-slate-200 font-semibold">
              Running LLM Extraction & Zod Validation Referee...
            </p>
            <p className="text-[11px] text-accent-teal mt-1">
              Elapsed: {(elapsedMs / 1000).toFixed(1)}s
            </p>
          </div>
        ) : !response ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center font-mono text-slate-500">
            <Activity className="w-8 h-8 text-surface-border mb-2" />
            <p className="text-xs text-slate-400">Awaiting Extraction Run</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
              Select a preset scenario or configure your schema on the left, then click{' '}
              <span className="text-accent-coral">Extract Structured Data</span>.
            </p>
          </div>
        ) : activeTab === 'json' ? (
          <JsonViewer data={response.data} isPartialSuccess={response.isPartialSuccess} />
        ) : activeTab === 'table' ? (
          <TableViewer data={response.data} schema={schema} />
        ) : (
          <RepairTimeline
            logs={response.repairLogs}
            selectedAttemptNumber={selectedAttemptNumber}
            onSelectAttempt={onSelectAttempt}
          />
        )}
      </div>
    </div>
  );
};