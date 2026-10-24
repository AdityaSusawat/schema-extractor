/**
 * ============================================================================
 * @schema-extractor/web - Interactive Self-Healing Audit Timeline (Pane 3)
 * ============================================================================
 * Visualizes every attempt in `response.repairLogs`:
 * - Attempt status badge (`NONE`, `ZOD_VALIDATION_ERROR`, `JSON_PARSE_ERROR`, etc.)
 * - Field-level Zod validation errors with zero-indexed path coordinates
 * - Expandable "Surgical Repair Prompt" drawer showing the exact feedback sent
 * - Expandable Raw LLM Output / Parsed Candidate JSON drawer
 */

import React, { useState } from 'react';
import { RepairAttemptLog } from '@schema-extractor/shared';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Cpu,
  ChevronDown,
  ChevronRight,
  Terminal,
  Wrench,
  Code
} from 'lucide-react';

interface RepairTimelineProps {
  logs: RepairAttemptLog[];
  selectedAttemptNumber: number | null;
  onSelectAttempt: (attemptNumber: number) => void;
}

export const RepairTimeline: React.FC<RepairTimelineProps> = ({
  logs,
  selectedAttemptNumber,
  onSelectAttempt
}) => {
  // Local toggles for inspecting raw prompt & raw output inside the active attempt card
  const [showPromptForAttempt, setShowPromptForAttempt] = useState<Record<number, boolean>>({});
  const [showRawOutputForAttempt, setShowRawOutputForAttempt] = useState<Record<number, boolean>>(
    {}
  );

  if (!logs || logs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 font-mono text-xs">
        <Terminal className="w-8 h-8 text-surface-border mb-2" />
        <p>No execution attempts recorded yet.</p>
      </div>
    );
  }

  const togglePromptDrawer = (attemptNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPromptForAttempt((prev) => ({
      ...prev,
      [attemptNum]: !prev[attemptNum]
    }));
  };

  const toggleRawOutputDrawer = (attemptNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRawOutputForAttempt((prev) => ({
      ...prev,
      [attemptNum]: !prev[attemptNum]
    }));
  };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3 select-text">
      {/* Top Explanation Banner */}
      <div className="p-2.5 rounded bg-surface-card border border-surface-border flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-accent-coral" />
          <span className="text-slate-200 font-semibold">Self-Healing Execution Trace</span>
        </div>
        <span className="text-[11px] text-accent-teal">
          {logs.length} {logs.length === 1 ? 'Attempt' : 'Attempts'} Executed
        </span>
      </div>

      {/* Vertical Timeline Rail */}
      <div className="relative pl-4 border-l-2 border-accent-plum/60 flex flex-col gap-3 my-1">
        {logs.map((log, idx) => {
          const isSelected =
            selectedAttemptNumber === log.attemptNumber ||
            (selectedAttemptNumber === null && idx === logs.length - 1);
          const isPromptOpen = !!showPromptForAttempt[log.attemptNumber];
          const isRawOpen = !!showRawOutputForAttempt[log.attemptNumber];

          return (
            <div
              key={log.attemptNumber}
              onClick={() => onSelectAttempt(log.attemptNumber)}
              className={`relative rounded border transition-all cursor-pointer ${
                isSelected
                  ? log.success
                    ? 'bg-surface-card border-status-success/70 shadow-[0_0_0_1px_rgba(78,166,133,0.4)]'
                    : 'bg-surface-card border-accent-coral shadow-[0_0_0_1px_#f27291]'
                  : 'bg-surface-panel border-surface-border hover:border-accent-teal/60'
              }`}
            >
              {/* Timeline Rail Node Dot */}
              <div
                className={`absolute -left-[23px] top-3.5 w-3 h-3 rounded-full border-2 ${
                  log.success
                    ? 'bg-status-success border-surface-canvas'
                    : 'bg-accent-coral border-surface-canvas'
                }`}
              />

              {/* Card Header */}
              <div className="p-3 flex items-center justify-between gap-2 border-b border-surface-border/60">
                <div className="flex items-center gap-2">
                  {log.success ? (
                    <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-accent-coral shrink-0" />
                  )}

                  <span className="font-mono text-xs font-bold text-slate-100">
                    Attempt #{log.attemptNumber}
                  </span>

                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                      log.success
                        ? 'bg-status-success/15 text-status-success border-status-success/30'
                        : 'bg-accent-coral/15 text-accent-coral border-accent-coral/40'
                    }`}
                  >
                    {log.success
                      ? log.attemptNumber > 1
                        ? 'SELF-HEALED & VALIDATED'
                        : 'PASSED FIRST TRY'
                      : log.failureType}
                  </span>
                </div>

                {/* Duration & Token Metrics */}
                <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-accent-teal" />
                    {log.durationMs}ms
                  </span>
                  {log.tokenUsage && (
                    <span className="flex items-center gap-1" title="Prompt + Completion Tokens">
                      <Cpu className="w-3 h-3 text-accent-teal" />
                      {log.tokenUsage.totalTokens} tok
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3 flex flex-col gap-2.5 text-xs">
                {/* 1. Surgical Repair Prompt Sent BEFORE This Attempt (for Attempt >= 2) */}
                {log.repairPromptSent && (
                  <div className="rounded border border-accent-plum bg-accent-plum/15 overflow-hidden">
                    <button
                      type="button"
                      onClick={(e) => togglePromptDrawer(log.attemptNumber, e)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-left font-mono text-[11px] text-slate-200 hover:bg-accent-plum/25 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-accent-coral" />
                        <span>
                          Surgical Repair Prompt Injected into Attempt #{log.attemptNumber}
                        </span>
                      </span>
                      {isPromptOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>

                    {isPromptOpen && (
                      <pre className="p-2.5 border-t border-accent-plum/50 bg-surface-canvas font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                        {log.repairPromptSent}
                      </pre>
                    )}
                  </div>
                )}

                {/* 2. Validation Errors Caught on This Attempt */}
                {!log.success && log.validationErrors.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-accent-coral font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        Zod Referee Violations Caught ({log.validationErrors.length})
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {log.validationErrors.map((err, eIdx) => (
                        <div
                          key={eIdx}
                          className="p-2 rounded bg-surface-canvas border border-accent-coral/35 font-mono text-[11px] flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-accent-teal/20 border border-accent-teal/40 text-slate-100 font-semibold">
                              {err.fieldPath}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Expected: <strong className="text-slate-300">{err.expectedRule}</strong>
                            </span>
                          </div>

                          <div className="text-accent-coral leading-snug mt-0.5">
                            {err.message}
                          </div>

                          {err.receivedValue !== undefined && (
                            <div className="text-[10px] text-slate-400">
                              Received Value:{' '}
                              <code className="px-1 py-0.5 rounded bg-surface-panel text-slate-200">
                                {JSON.stringify(err.receivedValue)}
                              </code>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Raw Parse / API Error Message (When validationErrors is empty) */}
                {!log.success && log.validationErrors.length === 0 && log.rawErrorMessage && (
                  <div className="p-2 rounded bg-accent-coral/10 border border-accent-coral/40 font-mono text-[11px] text-accent-coral">
                    {log.rawErrorMessage}
                  </div>
                )}

                {/* 4. Success Confirmation Summary */}
                {log.success && (
                  <div className="text-[11px] font-mono text-status-success flex items-center gap-1.5">
                    <span>
                      All schema fields, regex rules, and calendar date bounds verified cleanly.
                    </span>
                  </div>
                )}

                {/* 5. Expandable Raw LLM Output Inspector */}
                {log.rawLlmOutput && (
                  <div className="rounded border border-surface-border bg-surface-canvas/60 overflow-hidden">
                    <button
                      type="button"
                      onClick={(e) => toggleRawOutputDrawer(log.attemptNumber, e)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-left font-mono text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5 text-accent-teal" />
                        <span>Inspect Attempt #{log.attemptNumber} Raw Model Output</span>
                      </span>
                      {isRawOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {isRawOpen && (
                      <pre className="p-2.5 border-t border-surface-border bg-surface-canvas font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all overflow-x-auto">
                        {log.parsedJson
                          ? JSON.stringify(log.parsedJson, null, 2)
                          : log.rawLlmOutput}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};