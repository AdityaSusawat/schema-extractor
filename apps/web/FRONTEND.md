# Frontend Architecture: `@schema-extractor/web`

## 1. Monorepo Integration & Network Boundary

- **Shared Contracts**: Zero duplicated interfaces. All types (`FieldDefinition`, `ExtractionRequest`, `ExtractionResponse`, `RepairAttemptLog`) and validation schemas (`extractionRequestSchema`) are imported directly from `@schema-extractor/shared`.
- **Vite Proxy**: In development, Vite runs on `http://localhost:5173` and proxies all `/api/*` traffic to Express on `http://localhost:3001`.

```
[apps/web (Port 5173)] ──(Vite Proxy: /api)──► [apps/api (Port 3001)] ──► [Groq API]
         ▲
         │ (Compile-time types & Zod schemas)
 [packages/shared]
```

---

## 2. Visual Identity & Design System (Sanzo Wada No. 224)

Industrial developer-tool aesthetic inspired by Sanzo Wada. Avoids generic AI gradient meshes and neon blur rings.

### Palette Tokens

| Token | Hex | Role |
| :--- | :--- | :--- |
| `surface-canvas` | `#111317` | Root background (warm obsidian). |
| `surface-panel`  | `#181b20` | Pane containers & input backgrounds. |
| `surface-card`   | `#20242b` | Field cards & timeline items. |
| `surface-border` | `#2d333d` | Technical 1px dividers. |
| `accent-coral`   | `#f27291` | Primary CTA, focus states, validation violations. |
| `accent-teal`    | `#547076` | Type pills, array coordinates, secondary tags. |
| `accent-plum`    | `#7a4456` | Timeline attempt markers, diff accents. |
| `status-success` | `#4ea685` | Muted sage green for passing checks. |

---

## 3. Top-Level 3-Pane Layout

The app occupies `100vh` without global scrollbars. Each pane scrolls its own content independently:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Backend Health Indicator | Model: Llama-3.3-70B | Active Retries │
├───────────────────────┬────────────────────────────┬───────────────────────┤
│ PANE 1: SCHEMA STUDIO │ PANE 2: GROUND TRUTH INPUT │ PANE 3: DIAGNOSTICS   │
│ - Field list builder  │ - Source textarea          │ - JSON / Table view   │
│ - Type selector       │ - Preset buttons (Receipt, │ - Self-Healing        │
│ - Validation rules    │   Invoice, Stress Test)    │   Timeline Drawer     │
│   (date, regex, min)  │ - "Extract" action CTA     │   (Attempt diffs)     │
└───────────────────────┴────────────────────────────┴───────────────────────┘
```

---

## 4. Client State Machine (`useExtractionController`)

A single custom hook manages all state to prevent prop drilling:

```typescript
interface ExtractionState {
  schema: FieldDefinition[];
  rawText: string;
  maxRetries: number;
  isExtracting: boolean;
  elapsedMs: number;
  response: ExtractionResponse | null;
  activeTab: 'json' | 'table' | 'timeline';
}
```

### Core Actions
- `addField(field)` / `removeField(id)` / `updateField(id, patch)`
- `loadPreset(presetKey)`: Atomically updates `schema` and `rawText`.
- `executeExtraction()`: Validates input with `fieldSchema.ts`, POSTs to `/api/extract`, and captures response logs.

---

## 5. Component Tree

```
apps/web/src/
├── main.tsx
├── App.tsx                          # 3-pane grid shell & header
├── hooks/
│   └── useExtractionController.ts   # Central state & API caller
├── components/
│   ├── SchemaBuilder.tsx            # Pane 1: Dynamic field editor
│   ├── DocumentInput.tsx            # Pane 2: Textarea & presets
│   └── ResultsViewport.tsx          # Pane 3: JSON, Table & Timeline
└── data/
    └── presets.ts                   # Built-in sample documents & schemas
```