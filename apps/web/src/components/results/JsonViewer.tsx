/**
 * ============================================================================
 * @schema-extractor/web - XSS-Safe Recursive JSON Syntax Viewer (Pane 3)
 * ============================================================================
 */

import React, { useState } from 'react';
import { Copy, Check, FileJson } from 'lucide-react';

interface JsonViewerProps {
  data: Record<string, unknown> | null;
  isPartialSuccess?: boolean;
}

/**
 * Recursive, XSS-safe JSON value renderer styled with Sanzo Wada No. 224 tokens.
 */
const renderJsonNode = (value: unknown, indentLevel = 0): React.ReactNode => {
  const indent = '  '.repeat(indentLevel);
  const childIndent = '  '.repeat(indentLevel + 1);

  if (value === null) {
    return <span className="text-accent-coral italic font-semibold">null</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-accent-coral font-semibold">{String(value)}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-status-success font-semibold">{value}</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-slate-200">{JSON.stringify(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-400">[]</span>;
    }
    return (
      <>
        <span className="text-slate-400">{'[\n'}</span>
        {value.map((item, idx) => (
          <React.Fragment key={idx}>
            <span>{childIndent}</span>
            {renderJsonNode(item, indentLevel + 1)}
            {idx < value.length - 1 ? <span className="text-slate-500">{',\n'}</span> : '\n'}
          </React.Fragment>
        ))}
        <span>{indent}</span>
        <span className="text-slate-400">{']'}</span>
      </>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-slate-400">{'{}'}</span>;
    }
    return (
      <>
        <span className="text-slate-400">{'{\n'}</span>
        {entries.map(([k, v], idx) => (
          <React.Fragment key={k}>
            <span>{childIndent}</span>
            <span className="text-accent-teal">{JSON.stringify(k)}</span>
            <span className="text-slate-400">{': '}</span>
            {renderJsonNode(v, indentLevel + 1)}
            {idx < entries.length - 1 ? <span className="text-slate-500">{',\n'}</span> : '\n'}
          </React.Fragment>
        ))}
        <span>{indent}</span>
        <span className="text-slate-400">{'}'}</span>
      </>
    );
  }

  return <span className="text-slate-400">{String(value)}</span>;
};

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, isPartialSuccess }) => {
  const [copied, setCopied] = useState(false);

  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 font-mono text-xs">
        <FileJson className="w-8 h-8 text-surface-border mb-2" />
        <p>No valid structured JSON payload available.</p>
        <p className="text-[11px] text-slate-600 mt-1">
          Inspect the Self-Healing Timeline tab to debug attempt failures.
        </p>
      </div>
    );
  }

  const rawJsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawJsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-surface-border bg-surface-canvas/50 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">
            Keys: <strong className="text-slate-200">{Object.keys(data).length}</strong>
          </span>
          {isPartialSuccess && (
            <span className="px-1.5 py-0.5 rounded bg-status-warning/20 border border-status-warning/50 text-status-warning text-[10px]">
              Best-Effort Partial Candidate
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="px-2 py-1 rounded bg-surface-card border border-surface-border hover:border-accent-teal text-slate-300 hover:text-slate-100 flex items-center gap-1.5 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-status-success" />
              <span className="text-status-success">Copied JSON</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-accent-teal" />
              <span>Copy JSON</span>
            </>
          )}
        </button>
      </div>

      {/* Formatted Code Pre Block */}
      <div className="flex-1 overflow-auto p-3 bg-surface-canvas font-mono text-xs leading-relaxed select-text">
        <pre className="whitespace-pre-wrap break-words">{renderJsonNode(data, 0)}</pre>
      </div>
    </div>
  );
};