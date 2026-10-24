/**
 * ============================================================================
 * @schema-extractor/web - Structured Scalar & Array Table Renderer (Pane 3)
 * ============================================================================
 * Automatically separates root scalar fields into a clean key-value summary
 * grid and renders dedicated relational data tables for any array fields.
 */

import React from 'react';
import { FieldDefinition } from '@schema-extractor/shared';
import { Table, Layers } from 'lucide-react';

interface TableViewerProps {
  data: Record<string, unknown> | null;
  schema: FieldDefinition[];
}

function formatCellValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-accent-coral/80 italic font-mono text-[11px]">null</span>;
  }
  if (typeof val === 'boolean') {
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
          val
            ? 'bg-status-success/15 text-status-success border border-status-success/30'
            : 'bg-surface-card text-slate-400 border border-surface-border'
        }`}
      >
        {String(val)}
      </span>
    );
  }
  if (typeof val === 'number') {
    return <span className="font-mono text-status-success font-medium">{val.toLocaleString()}</span>;
  }
  if (typeof val === 'object') {
    return <span className="font-mono text-[11px] text-slate-300">{JSON.stringify(val)}</span>;
  }
  return <span className="text-slate-200">{String(val)}</span>;
}

export const TableViewer: React.FC<TableViewerProps> = ({ data, schema }) => {
  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 font-mono text-xs">
        <Table className="w-8 h-8 text-surface-border mb-2" />
        <p>No tabular data available to render.</p>
      </div>
    );
  }

  // Partition fields into Scalar/Object Root entries vs Array entries
  const entries = Object.entries(data);
  const scalarEntries = entries.filter(([, val]) => !Array.isArray(val));
  const arrayEntries = entries.filter(([, val]) => Array.isArray(val)) as [string, unknown[]][];

  // Helper to look up friendly label from schema
  const getFieldLabel = (key: string): string => {
    const found = schema.find((f) => f.name === key);
    return found?.label || key;
  };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-4 select-text">
      {/* 1. Root Scalar Fields Table */}
      {scalarEntries.length > 0 && (
        <div className="rounded border border-surface-border bg-surface-card overflow-hidden">
          <div className="px-3 py-1.5 bg-surface-panel border-b border-surface-border flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-accent-teal font-semibold">
              Document Summary Fields ({scalarEntries.length})
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-surface-border bg-surface-canvas/50 font-mono text-[10px] text-slate-400 uppercase">
                <th className="py-2 px-3 w-2/5 border-r border-surface-border">Field</th>
                <th className="py-2 px-3">Extracted Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/60">
              {scalarEntries.map(([key, value]) => (
                <tr key={key} className="hover:bg-surface-hover/40 transition-colors">
                  <td className="py-2 px-3 border-r border-surface-border font-mono text-slate-300">
                    <div className="font-medium text-slate-200">{getFieldLabel(key)}</div>
                    <div className="text-[10px] text-slate-500">{key}</div>
                  </td>
                  <td className="py-2 px-3">{formatCellValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Dynamic Relational Tables for Array Fields */}
      {arrayEntries.map(([arrayKey, rows]) => {
        const schemaField = schema.find((f) => f.name === arrayKey);
        const isObjectRows =
          rows.length > 0 &&
          typeof rows[0] === 'object' &&
          rows[0] !== null &&
          !Array.isArray(rows[0]);

        // Determine columns from schema children first, plus any extra keys in rows
        const columnKeys: string[] = [];
        if (schemaField?.children && schemaField.children.length > 0) {
          schemaField.children.forEach((c) => {
            if (!columnKeys.includes(c.name)) columnKeys.push(c.name);
          });
        }
        if (isObjectRows) {
          rows.forEach((row) => {
            if (row && typeof row === 'object') {
              Object.keys(row as Record<string, unknown>).forEach((k) => {
                if (!columnKeys.includes(k)) columnKeys.push(k);
              });
            }
          });
        }

        return (
          <div
            key={arrayKey}
            className="rounded border border-surface-border bg-surface-card overflow-hidden"
          >
            <div className="px-3 py-1.5 bg-surface-panel border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-accent-coral" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  {getFieldLabel(arrayKey)}
                </span>
                <span className="text-[10px] font-mono text-accent-teal">({arrayKey})</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-canvas border border-surface-border text-slate-300">
                {rows.length} {rows.length === 1 ? 'row' : 'rows'}
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="p-4 text-center font-mono text-xs text-slate-500">
                Empty array `[]` extracted.
              </div>
            ) : isObjectRows || columnKeys.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-canvas/50 font-mono text-[10px] text-slate-400 uppercase">
                      <th className="py-2 px-2.5 w-10 text-center border-r border-surface-border">
                        #
                      </th>
                      {columnKeys.map((colKey) => {
                        const childDef = schemaField?.children?.find((c) => c.name === colKey);
                        return (
                          <th
                            key={colKey}
                            className="py-2 px-3 border-r border-surface-border last:border-r-0"
                          >
                            <div className="text-slate-200">{childDef?.label || colKey}</div>
                            <div className="text-[9px] text-accent-teal lowercase">{colKey}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border/60">
                    {rows.map((row, rIdx) => {
                      const rowObj =
                        row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
                      return (
                        <tr key={rIdx} className="hover:bg-surface-hover/40 transition-colors">
                          <td className="py-2 px-2.5 text-center font-mono text-[11px] text-slate-500 border-r border-surface-border">
                            {rIdx}
                          </td>
                          {columnKeys.map((colKey) => (
                            <td
                              key={colKey}
                              className="py-2 px-3 border-r border-surface-border last:border-r-0"
                            >
                              {formatCellValue(rowObj[colKey])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Primitive Array List */
              <div className="p-2.5 flex flex-wrap gap-1.5">
                {rows.map((item, idx) => (
                  <div
                    key={idx}
                    className="px-2 py-1 rounded bg-surface-canvas border border-surface-border font-mono text-xs flex items-center gap-1.5"
                  >
                    <span className="text-[10px] text-slate-500">[{idx}]</span>
                    {formatCellValue(item)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};