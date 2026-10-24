/**
 * ============================================================================
 * @schema-extractor/web - Root Application Workstation Shell
 * ============================================================================
 * Connects Pane 1 (Schema Studio), Pane 2 (Document Ingestion), and
 * Pane 3 (Diagnostics & Timeline) to `useExtractionController`.
 */

import React, { useEffect, useState } from 'react';
import { useExtractionController } from './hooks/useExtractionController';
import { SchemaBuilder } from './components/schema/SchemaBuilder';
import { DocumentInput } from './components/DocumentInput';
import { ResultsViewport } from './components/results/ResultsViewport';
import { Cpu, CheckCircle2, AlertCircle, RefreshCw, Terminal } from 'lucide-react';

export default function App() {
  const controller = useExtractionController();
  const [apiHealth, setApiHealth] = useState<'checking' | 'healthy' | 'offline'>('checking');

  // Check backend service health on mount
  const checkHealth = async () => {
    setApiHealth('checking');
    try {
      const res = await fetch('/health');
      if (res.ok) {
        setApiHealth('healthy');
      } else {
        setApiHealth('offline');
      }
    } catch {
      setApiHealth('offline');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="h-screen w-screen bg-surface-canvas text-slate-100 flex flex-col font-sans overflow-hidden select-none">
      {/* ------------------------------------------------------------------ */}
      {/* GLOBAL TOP NAVIGATION & STATUS BAR                                 */}
      {/* ------------------------------------------------------------------ */}
      <header className="h-12 border-b border-surface-border bg-surface-panel px-4 flex items-center justify-between shrink-0">
        {/* Left: Branding & Tag */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-accent-coral" />
            <span className="font-semibold text-sm tracking-wide text-slate-100 font-mono">
              SCHEMA EXTRACTOR
            </span>
          </div>

          <div className="h-4 w-px bg-surface-border" />

          <span className="text-[11px] px-2 py-0.5 rounded bg-surface-card border border-surface-border text-accent-teal font-mono">
            Self-Healing LLM Workstation
          </span>
        </div>

        {/* Right: Engine Details & Backend Health Pill */}
        <div className="flex items-center gap-3 text-xs">
          {/* Active Model Pill */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-card border border-surface-border font-mono text-[11px] text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-accent-teal" />
            <span>Engine: </span>
            <strong className="text-slate-100 font-semibold">openai/gpt-oss-120b</strong>
          </div>

          {/* Backend Connection Indicator */}
          <button
            type="button"
            onClick={checkHealth}
            title="Click to re-check API connection"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-card border border-surface-border font-mono text-[11px] text-slate-300 hover:border-accent-teal transition-colors"
          >
            {apiHealth === 'checking' ? (
              <>
                <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
                <span>Checking API...</span>
              </>
            ) : apiHealth === 'healthy' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                <span>API :3001 Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-accent-coral" />
                <span className="text-accent-coral font-semibold">API Offline (:3001)</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 3-PANE INDUSTRIAL WORKBENCH (FULL SCREEN VIEWPORT)                 */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 grid grid-cols-12 divide-x divide-surface-border overflow-hidden min-h-0">
        {/* PANE 1: SCHEMA STUDIO (Width: 4/12 cols) */}
        <section className="col-span-12 lg:col-span-4 h-full overflow-hidden">
          <SchemaBuilder
            schema={controller.schema}
            maxRetries={controller.maxRetries}
            onMaxRetriesChange={controller.setMaxRetries}
            isExtracting={controller.isExtracting}
            fieldErrors={controller.fieldErrors}
            onAddField={controller.addField}
            onRemoveField={controller.removeField}
            onUpdateField={controller.updateField}
            onUpdateRules={controller.updateFieldRules}
            onMoveField={controller.moveField}
            onImportSchemaJson={controller.importSchemaJson}
          />
        </section>

        {/* PANE 2: GROUND TRUTH & DOCUMENT INGESTION (Width: 4/12 cols) */}
        <section className="col-span-12 lg:col-span-4 h-full overflow-hidden">
          <DocumentInput
            rawText={controller.rawText}
            onRawTextChange={controller.setRawText}
            activePresetId={controller.activePresetId}
            onSelectPreset={controller.loadPreset}
            onClear={controller.clearWorkspace}
            isExtracting={controller.isExtracting}
            elapsedMs={controller.elapsedMs}
            onExecute={controller.executeExtraction}
            onCancel={controller.cancelExtraction}
            clientFatalError={controller.clientFatalError}
          />
        </section>

        {/* PANE 3: DIAGNOSTICS & SELF-HEALING TIMELINE (Width: 4/12 cols) */}
        <section className="col-span-12 lg:col-span-4 h-full overflow-hidden">
          <ResultsViewport
            response={controller.response}
            schema={controller.schema}
            isExtracting={controller.isExtracting}
            elapsedMs={controller.elapsedMs}
            activeTab={controller.activeTab}
            onTabChange={controller.setActiveTab}
            selectedAttemptNumber={controller.selectedAttemptNumber}
            onSelectAttempt={controller.setSelectedAttemptNumber}
          />
        </section>
      </main>
    </div>
  );
}