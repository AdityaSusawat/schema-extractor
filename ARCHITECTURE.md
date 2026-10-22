# Schema Extractor Architecture & Rules

## System Overview
A dynamic, schema-driven data extraction engine. Users define arbitrary fields (names, types, validation rules) and provide messy text. The backend calls a free-tier LLM (via Groq/Gemini) for structured JSON, validates it with Zod, and triggers a self-healing retry loop (max 3 tries) if validation fails.

## Tech Stack
- Monorepo Manager: pnpm workspaces
- Backend (`apps/api`): Node.js, Express, TypeScript, Zod, Groq SDK
- Frontend (`apps/web`): React, Vite, Tailwind CSS, TypeScript
- Shared Package (`packages/shared`): Shared TypeScript definitions and schemas

## Critical Engineering Constraints
1. No Markdown wrappers: The LLM output MUST be sanitized to raw JSON before parsing (strip ```json fences).
2. Hard Retry Budget: Maximum 3 repair attempts to prevent rate limit exhaustion.
3. Strict Schema Enforcement: Backend always validates output against the dynamic Zod schema.
4. Clean Architecture: All shared contracts live in `packages/shared`.