import React, { useEffect, useState } from 'react';
import { Terminal, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');

  useEffect(() => {
    fetch('/api/extract', { method: 'OPTIONS' })
      .then(() => setApiStatus('healthy'))
      .catch(() => setApiStatus('offline'));
  }, []);

  return (
    <div className="min-h-screen bg-surface-canvas text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="h-12 border-b border-surface-border bg-surface-panel px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent-coral" />
          <span className="font-semibold text-sm tracking-wide text-slate-100">
            SCHEMA EXTRACTOR
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-surface-card border border-surface-border text-accent-teal font-mono">
            Workbench v1.0
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-card border border-surface-border font-mono text-slate-300">
            {apiStatus === 'healthy' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                <span>API :3001 Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-accent-coral" />
                <span>API Offline</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 3-Pane Skeleton Preview */}
      <main className="flex-1 grid grid-cols-12 divide-x divide-surface-border overflow-hidden">
        <section className="col-span-4 p-4 bg-surface-panel flex flex-col gap-2">
          <h2 className="text-xs font-mono text-accent-teal tracking-wider uppercase font-semibold">
            01 // Schema Studio
          </h2>
          <p className="text-xs text-slate-400">Scaffolding verified. Ready for Step 6.2.</p>
        </section>

        <section className="col-span-4 p-4 bg-surface-canvas flex flex-col gap-2">
          <h2 className="text-xs font-mono text-accent-teal tracking-wider uppercase font-semibold">
            02 // Ingestion & Ground Truth
          </h2>
          <p className="text-xs text-slate-400">Ready for Document Input & Presets.</p>
        </section>

        <section className="col-span-4 p-4 bg-surface-panel flex flex-col gap-2">
          <h2 className="text-xs font-mono text-accent-teal tracking-wider uppercase font-semibold">
            03 // Diagnostics & Self-Healing
          </h2>
          <p className="text-xs text-slate-400">Ready for Timeline & Extracted Output.</p>
        </section>
      </main>
    </div>
  );
}