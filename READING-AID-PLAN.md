# Reading Aid — Build Plan

> An AI-powered reading comprehension tool that transforms dense academic PDFs into richly annotated, interactive reading experiences. Upload a PDF → clean it → annotate it with AI-generated comprehension scaffolding → read with margin notes, highlights, and your own annotations layered on top. Supports speed reading and skimming through structured visual hierarchy of annotations.

---

## 1. Project Overview

### 1.1 Core User Story

As a PhD researcher reading dense theoretical texts (Barad, Ferreira da Silva, Maldonado-Torres, etc.), I want to upload a PDF and receive an annotated, readable version with AI-generated comprehension scaffolding — key terms highlighted, arguments surfaced, connections explained — so I can:

1. **Deep read**: engage fully with margin notes and comprehension comments visible
2. **Speed read / skim**: quickly scan for key terms, key concepts, and argument structure using highlight colours and the annotation key as a visual guide — getting the shape of the argument without reading every sentence

The annotation system should serve both modes: when skimming, the highlight colours alone tell you "this is a definition", "this is the core claim", "this is methodological" at a glance. When deep reading, the margin comments explain *why* each highlighted passage matters.

### 1.2 Design Philosophy

- **Scholarly editorial aesthetic** — think Tufte meets a well-typeset philosophy journal
- **Comprehension scaffolding, not decoration** — every annotation should help the reader understand *why* something matters, not just *that* it matters
- **Skim-friendly visual hierarchy** — highlight colours and weight encode category meaning; a reader should be able to skim by colour alone
- **Portable & version-controllable** — all outputs are markdown + JSON flat files in git-friendly folder structure
- **Semi-adaptive categories** — a stable core set (Key Term, Key Concept) plus discipline-specific additions chosen by the AI
- **Test-driven development** — every module has tests written before or alongside implementation

### 1.3 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+ (full TypeScript, strict mode) |
| **Backend** | Express.js with `ts-node` or compiled via `tsx` |
| **Frontend** | React 18 + Vite + TypeScript (strict) |
| **PDF extraction** | `pdf-parse` (text) + `pdf-lib` (metadata) + `sharp` for image processing — all Node-native |
| **Tidy LLM** | Claude Haiku (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk` |
| **Annotation LLM** | Claude Opus (`claude-opus-4-6`) via `@anthropic-ai/sdk` |
| **Persistence** | Git-friendly flat files: markdown + JSON + binary assets |
| **MCP** | `@modelcontextprotocol/sdk` for annotation tool server |
| **Testing** | Vitest (unit + integration), Playwright (E2E) |
| **Project structure** | Single `package.json` with `src/server/`, `src/client/`, `src/shared/`, `src/mcp/` directories (extract to monorepo later if needed) |
| **Build** | Vite (frontend), `tsx` (backend) |

### 1.4 Key Library Choices (TypeScript-Compatible)

| Purpose | Library | Why |
|---------|---------|-----|
| PDF text extraction | `pdf-parse` (wraps `pdf.js`) | Pure JS, works in Node, typed |
| PDF metadata / manipulation | `pdf-lib` | Pure TS, well-typed, no native deps |
| Image extraction from PDF | `pdfjs-dist` + `@napi-rs/canvas` | Node-compatible canvas for rendering pages to images |
| Image processing | `sharp` | Fast, well-typed, handles PNG/JPEG |
| Anthropic API | `@anthropic-ai/sdk` | Official SDK, full TS types |
| MCP server | `@modelcontextprotocol/sdk` | Official MCP SDK |
| Markdown → React | `react-markdown` + `remark-gfm` | Well-maintained, typed, extensible |
| Markdown parsing (AST) | `unified` + `remark-parse` | For programmatic textSpan matching |
| HTTP server | `express` + `@types/express` | Standard, well-typed |
| File upload | `multer` + `@types/multer` | Handles multipart PDF uploads |
| Validation | `zod` | Runtime + static type safety for API & JSON schemas |
| Testing | `vitest` | Vite-native, fast, TS-first |
| E2E testing | `playwright` | Cross-browser, TS-native |
| Linting | `eslint` + `@typescript-eslint/*` | Strict TS linting |

---

## 2. Pipeline Architecture

### 2.1 Stage 1 — PDF Extraction (Node.js, Server-Side)

**Input**: Raw PDF file (uploaded via multipart form)
**Output**: Raw markdown text + extracted images + saved original PDF

**Requirements**:
- Extract all text preserving reading order (handle two-column academic layouts)
- Extract all images, process with `sharp`, save as PNG files named sequentially (`fig-001.png`, `fig-002.png`, etc.)
- Insert image placeholders in markdown: `![Figure N](images/fig-001.png)`
- Preserve basic structure: headings, paragraphs, lists, block quotes
- Extract document metadata (title, authors, year) from PDF metadata fields
- **Save the original PDF** to `source.pdf` in the document folder
- **Detect and extract bibliography/references section** (see §2.4)

**Node.js PDF extraction approach**:
```typescript
// Text extraction via pdf-parse
import pdfParse from 'pdf-parse';
const data = await pdfParse(pdfBuffer);
const rawText = data.text;
const metadata = data.info; // title, author, etc.

// Image extraction via pdfjs-dist + @napi-rs/canvas
// Render each page, detect image regions, extract with sharp
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
```

**Two-column detection**: Use `pdfjs-dist`'s `getTextContent()` which returns positioned text items with `transform` coordinates. Cluster items by x-position to detect columns, then merge in reading order (left column first, then right column, per page).

**Extraction quality risk**: `pdf-parse` wraps `pdf.js` and can struggle with two-column academic layouts, complex tables, and mathematical notation. Two-column detection via x-coordinate clustering is fragile across different journal formats.

**Mitigations**:
- Lean heavily on the Haiku tidy pass to fix structural issues from imperfect extraction
- Provide a **"paste markdown" escape hatch**: allow users to paste pre-cleaned markdown directly (bypassing PDF extraction) for documents where extraction fails
- Consider alternative extractors (`@opendocsg/pdf2md`, or a Python-based `marker` subprocess) if `pdf-parse` proves insufficient

**Edge cases**:
- Two-column layouts — detect via text item x-coordinates, merge in reading order
- Footnotes/endnotes — extract and place at section end with `[^n]` syntax
- Tables — best-effort extraction as markdown tables
- Equations — best-effort plain text; flag with `<!-- equation -->` comment for manual review
- Headers/footers/page numbers — strip via position detection (items in top/bottom 5% of page)

### 2.2 Stage 2 — Tidy Pass (Haiku)

**Input**: Raw extracted markdown
**Output**: Clean, well-structured markdown

**Model**: `claude-haiku-4-5-20251001` via `@anthropic-ai/sdk`

**System prompt**:
```
You are a document structure editor. Your job is to clean up markdown
extracted from an academic PDF. You must:

1. Fix OCR artefacts and encoding errors
2. Restore proper heading hierarchy (# for title, ## for sections, ### for subsections)
3. Normalise lists, tables, and block quotes
4. Merge broken paragraphs (lines split mid-sentence by PDF extraction)
5. Preserve all image placeholders exactly as they appear: ![...](images/...)
6. Preserve all footnote references
7. Remove page numbers, running headers/footers, and other PDF artefacts
8. Detect the bibliography/references section and wrap it in:
   <!-- BIBLIOGRAPHY_START -->
   ...references...
   <!-- BIBLIOGRAPHY_END -->
9. Do NOT alter the content, meaning, or wording — only fix structure and formatting
10. Do NOT summarise or omit any text

Return ONLY the cleaned markdown, no commentary.
```

**Chunking strategy**: If the document exceeds 4000 tokens, split by detected sections (## headings). Process each chunk independently. Reassemble in order.

**Implementation**:
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 8192,
  system: TIDY_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: rawMarkdown }],
});
```

### 2.3 Stage 3 — Annotation Pass (Opus)

**Input**: Clean markdown from Stage 2
**Output**: `annotations.json` containing categories + annotation array

**Model**: `claude-opus-4-6` via `@anthropic-ai/sdk`

**This is a TWO-PHASE prompt within a single API call:**

#### Phase 1 — Semi-Adaptive Category Proposal

```
You are an expert academic reading assistant. You are about to annotate
a scholarly text to scaffold reading comprehension for both deep reading
AND speed reading / skimming.

First, read the text and propose 5-7 highlight categories. Your categories
MUST include these two stable categories:

1. **Key Term** (id: "key_term") — Important terminology, jargon, or
   terms of art that a reader needs to understand. When skimming, these
   stand out as vocabulary anchors.
2. **Key Concept** (id: "key_concept") — Central ideas, theories, or
   frameworks that the text introduces, develops, or relies upon. When
   skimming, these reveal the conceptual architecture.

Then propose 3-5 ADDITIONAL categories specifically appropriate for THIS
text's discipline, genre, and argumentative structure. These should help
a reader who is skimming to quickly identify the *type* of move the
author is making at each point.

Examples of discipline-specific additional categories (adapt — do NOT
just copy):
- Philosophy/ontology: Key Ontological Move, Key Reframing, Central
  Tension, Methodological Commitment
- Empirical methods: Key Finding, Limitation, Methodological Choice,
  Statistical Claim
- Postcolonial theory: Key Power Relation, Colonial Logic Identified,
  Counter-Narrative, Epistemic Claim

For each category, provide:
- id: snake_case identifier
- label: Human-readable label (2-4 words)
- description: One sentence explaining what this category captures and
  how it helps during skimming
- color: A muted, accessible colour from this palette:
  Key Term always: #5C9EAD (teal)
  Key Concept always: #CB9F6E (amber)
  Additional categories from: #B5838D (dusty rose), #6D8B74 (sage),
  #7B8FA1 (slate blue), #8B7BB4 (lavender), #C4A882 (sand)
```

#### Phase 2 — Annotation

```
Now annotate the text using your proposed categories. For each annotation:

1. Identify the EXACT text span to highlight (copy it verbatim — this
   will be matched via string search)
2. Assign a category from your proposed set
3. Estimate the character offset where this span begins in the document
   (approximate is fine — this is used as a matching fallback only)
4. Write a comprehension comment (1-3 sentences) that explains:
   - WHY this matters to the argument
   - HOW it connects to the broader text/field
   - WHAT the reader should notice or question
5. Write a skim summary (1 short sentence or fragment) that captures
   the essential point for a speed reader

Your comments should function as comprehension scaffolding — help the
reader understand the text's architecture, not just label things.

Aim for 15-30 annotations for a typical 8000-word paper. Prioritise
quality over quantity. Distribute annotations across the full text —
don't front-load. Ensure Key Term and Key Concept annotations are
well-represented as they are the primary skim anchors.

Return ONLY valid JSON in this exact schema:
{
  "categories": [
    {
      "id": "string",
      "label": "string",
      "description": "string",
      "color": "string"
    }
  ],
  "annotations": [
    {
      "id": "ai-001",
      "source": "ai",
      "type": "highlight",
      "category": "category_id",
      "textSpan": "exact text from the document to highlight",
      "offsetHint": 1402,
      "comment": "full comprehension scaffolding comment",
      "skimNote": "short skim-mode summary"
    }
  ]
}
```

**textSpan matching with offset fallback**: Primary matching is exact string search in the markdown. If a textSpan matches multiple locations (e.g. common phrases), use `offsetHint` to disambiguate by choosing the match closest to the hinted offset. If no exact match is found, attempt fuzzy match (Levenshtein distance < 10% of span length) near the offset hint. Log unmatched annotations as warnings.

**Additional matching safeguards**:
- Minimum span length for fuzzy matching: 20 characters (short spans are too ambiguous for fuzzy match)
- For short spans (< 20 chars), require exact match only, disambiguated by `offsetHint`
- Consider surrounding context matching as a fallback: match a few words before/after the span to confirm location

**Chunking for long documents**: Run Phase 1 on the introduction/first 2 sections. Pass the resulting category set to all subsequent chunks for Phase 2 only, maintaining consistency.

### 2.4 Bibliography Extraction

**Input**: Clean markdown with `<!-- BIBLIOGRAPHY_START/END -->` markers (from tidy pass)
**Output**: Structured `bibliography.json` alongside the other document files

**Process**:
1. Extract text between bibliography markers
2. Send to Haiku with a bibliography-parsing prompt:

```
Parse the following academic bibliography into structured JSON.
For each reference, extract:
- id: a short citation key (e.g. "barad2007", "haraway1988")
- authors: array of author names
- year: publication year
- title: full title
- journal/publisher: publication venue
- doi: if present
- url: if present (construct from DOI if possible: https://doi.org/{doi})
- rawText: the original reference text verbatim

Return ONLY valid JSON: { "references": [...] }
```

3. Save as `bibliography.json`
4. In the reading view, detect in-text citations (e.g. "(Barad, 2007)", "Barad (2007)") and render them as hoverable links that show the full reference on hover and link to the DOI/URL on click.

**Bibliography schema**:
```typescript
interface BibliographyFile {
  references: BibReference[];
}

interface BibReference {
  id: string;          // "barad2007"
  authors: string[];   // ["Karen Barad"]
  year: string;        // "2007"
  title: string;
  venue?: string;      // journal or publisher
  doi?: string;
  url?: string;        // constructed from DOI or extracted
  rawText: string;     // original text for display on hover
}
```

---

## 3. Data Model

### 3.1 File Structure (Git-Friendly)

```
reading-aid/
  src/
    server/                          ← Express backend
      index.ts                       ← Server entry point
      extraction/                    ← PDF extraction logic
      pipeline/                      ← Tidy, annotate, bibliography passes
      routes/                        ← API route handlers
    client/                          ← React frontend
      App.tsx
      pages/
      components/
      hooks/
    shared/                          ← Types, schemas, utilities shared between server & client
      types.ts
      schemas.ts
      textspan-matcher.ts
    mcp/                             ← MCP annotation server
      server.ts
  readings/                          ← git-tracked (minus PDFs/images via .gitattributes)
    {document-slug}/
      document.md                    ← cleaned markdown from Stage 2
      annotations.json               ← AI annotations from Stage 3
      user-annotations.json          ← user annotations (separate file, merges at render)
      bibliography.json              ← parsed references
      metadata.json                  ← document metadata
      images/
        fig-001.png                  ← extracted images (git-lfs or .gitignore)
        fig-002.png
      source.pdf                     ← original PDF (git-lfs or .gitignore)
  package.json                       ← single package (not monorepo)
  tsconfig.json                      ← strict mode
  vite.config.ts
  vitest.config.ts
  .env.example                       ← ANTHROPIC_API_KEY=
  .gitignore                         ← ignores node_modules, .env, dist
  .gitattributes                     ← git-lfs tracking for *.pdf, images/*.png
```

**Git-friendliness**:
- All JSON and markdown files are plain text — clean diffs, mergeable
- Binary files (PDFs, images) tracked via git-lfs or listed in `.gitattributes`
- User annotations in a separate file from AI annotations — avoids merge conflicts when re-running the AI pipeline
- No database required; a database can be added later as a read-layer over these files if needed
- Each document is a self-contained folder — can be moved, zipped, shared independently

### 3.2 metadata.json Schema

```typescript
interface DocumentMetadata {
  slug: string;
  originalFilename: string;
  title: string;
  authors: string[];
  year?: string;
  pageCount: number;
  wordCount: number;                 // of cleaned markdown
  processedAt: string;               // ISO timestamp
  models: {
    tidy: string;                    // "claude-haiku-4-5-20251001"
    annotate: string;                // "claude-opus-4-6"
  };
  extractionMethod: string;          // "pdf-parse+pdfjs-dist"
}
```

### 3.3 annotations.json Schema

```typescript
// Shared types — in src/shared/types.ts
// Validated at runtime with Zod schemas

interface AnnotationFile {
  documentSlug: string;
  categories: Category[];
  annotations: Annotation[];
}

interface Category {
  id: string;                  // snake_case, e.g. "key_term", "key_concept"
  label: string;               // e.g. "Key Term"
  description: string;         // One sentence — includes skim-mode guidance
  color: string;               // Hex colour
  isCore: boolean;             // true for key_term and key_concept
}

interface Annotation {
  id: string;                  // "ai-001" or "user-001"
  source: 'ai' | 'user' | 'mcp';  // mcp = added via MCP tool
  type: 'highlight' | 'underline';
  category?: string;           // References Category.id (AI annotations always have this)
  color?: string;              // User annotations may have a custom colour
  textSpan: string;            // Exact text from the markdown to match
  offsetHint?: number;         // Approximate character offset (fallback for matching)
  comment?: string;            // Full comprehension comment (margin note)
  skimNote?: string;           // Short skim-mode note (shown in compact view)
  createdAt: string;           // ISO timestamp
}
```

### 3.4 user-annotations.json Schema

Same `Annotation[]` array, but stored separately. Merged with AI annotations at render time. This means:
- Re-running the AI pipeline replaces `annotations.json` without losing user notes
- User notes can be committed independently
- No merge conflicts between AI and user data

### 3.5 User Annotation Colours

User annotations use a distinct visual language from AI annotations:
- User highlights: semi-transparent background with a slightly saturated tone
- User underlines: coloured bottom border
- Both can have comments (shown in margin or tooltip)

Default user palette (user can pick):
- `#FFE066` (warm yellow)
- `#A8E6CF` (mint)
- `#FFB3BA` (pink)
- `#B5D8FF` (sky blue)

---

## 4. MCP Annotation Tool

### 4.1 Purpose

Instead of requiring the AI to produce all annotations in a single upfront JSON dump, expose an MCP tool server that allows any MCP-compatible AI agent (Claude, OpenAI, etc.) to **add annotations incrementally** via tool calls. This enables:

- Conversational annotation: "Annotate the methodology section more densely"
- Targeted requests: "Highlight all references to performativity as Key Terms"
- Multi-pass workflows: run a second annotation pass with a different model or focus
- Integration with Claude Code, Claude Desktop, or any MCP client

### 4.2 MCP Server Architecture

Located at `src/mcp/`:

```typescript
// src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'reading-aid',
  version: '1.0.0',
});

// Tool: add_annotation
server.tool(
  'add_annotation',
  'Add a highlight or underline annotation to a document with an optional comment',
  {
    documentSlug: z.string().describe('The document to annotate'),
    type: z.enum(['highlight', 'underline']).default('highlight'),
    category: z.string().describe('Category ID (e.g. "key_term", "key_concept", or a document-specific category)'),
    textSpan: z.string().describe('Exact text from the document to highlight'),
    offsetHint: z.number().optional().describe('Approximate character offset for disambiguation'),
    comment: z.string().optional().describe('Comprehension scaffolding comment'),
    skimNote: z.string().optional().describe('Short skim-mode note'),
  },
  async ({ documentSlug, type, category, textSpan, offsetHint, comment, skimNote }) => {
    // 1. Load document markdown, verify textSpan exists
    // 2. Load existing annotations.json
    // 3. Generate next annotation ID
    // 4. Append annotation, save file
    // 5. Return confirmation with matched offset
  }
);

// Tool: list_categories
server.tool(
  'list_categories',
  'List available annotation categories for a document',
  {
    documentSlug: z.string(),
  },
  async ({ documentSlug }) => {
    // Load annotations.json, return categories array
  }
);

// Tool: add_category
server.tool(
  'add_category',
  'Add a new annotation category to a document',
  {
    documentSlug: z.string(),
    id: z.string().describe('snake_case identifier'),
    label: z.string().describe('Human-readable label (2-4 words)'),
    description: z.string().describe('One sentence description'),
    color: z.string().describe('Hex colour'),
  },
  async ({ documentSlug, id, label, description, color }) => {
    // Append to categories array in annotations.json
  }
);

// Tool: list_documents
server.tool(
  'list_documents',
  'List all available documents in the reading library',
  {},
  async () => {
    // Scan readings/ directory, return slug + title + metadata for each
  }
);

// Tool: get_document_text
server.tool(
  'get_document_text',
  'Get the full markdown text of a document (or a section by heading)',
  {
    documentSlug: z.string(),
    section: z.string().optional().describe('Heading text to extract just that section'),
  },
  async ({ documentSlug, section }) => {
    // Load document.md, optionally extract section
  }
);

// Tool: remove_annotation
server.tool(
  'remove_annotation',
  'Remove an annotation by ID',
  {
    documentSlug: z.string(),
    annotationId: z.string(),
  },
  async ({ documentSlug, annotationId }) => {
    // Remove from annotations.json or user-annotations.json
  }
);
```

### 4.3 MCP Transport

Run as a stdio server for Claude Code / Claude Desktop integration:
```bash
npx tsx src/mcp/server.ts
```

Or as an SSE server for web-based MCP clients:
```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
```

### 4.4 Workflow: AI Annotation via MCP

The initial annotation pass (Stage 3) still happens in bulk via the Opus API call for efficiency. The MCP tools are for **incremental additions and refinements**:

1. Initial bulk pass → `annotations.json` populated
2. User reads, wants more annotation on a section → opens Claude Code / Claude Desktop
3. "Add more annotations to the section on diffractive methodology, focusing on how Barad distinguishes her approach from reflexivity"
4. Agent calls `get_document_text` → reads section → calls `add_annotation` multiple times
5. Annotations appear in the reading view on next load (or via filesystem watch + hot reload)

---

## 5. Frontend — Reading Interface

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [Reading Aid]                    [Skim Mode] [Upload] [Import] │
├──────────┬──────────────────────────────────┬───────────────────┤
│          │                                  │                   │
│ SIDEBAR  │     MAIN READING COLUMN          │  MARGIN NOTES     │
│          │     (max-width: 65ch)            │  (Tufte-style)    │
│ • Doc    │                                  │                   │
│   outline│  # Document Title                │  ┌─────────────┐  │
│          │                                  │  │ AI comment   │  │
│ • Anno-  │  Body text with [highlighted]    │  │ for nearby   │  │
│   tation │  spans and underlines...         │  │ highlight    │  │
│   key /  │                                  │  └─────────────┘  │
│   legend │  ![Figure 1](images/fig-001.png) │                   │
│          │                                  │  ┌─────────────┐  │
│ • Filter │  More body text with AI and      │  │ User comment │  │
│   toggles│  user annotations layered...     │  │ (distinct    │  │
│ • Bib    │                                  │  │  styling)    │  │
│   refs   │  In-text citation (Barad, 2007)  │  └─────────────┘  │
│          │  ↑ hover shows full ref          │                   │
├──────────┴──────────────────────────────────┴───────────────────┤
│  [Export ZIP]   [Save User Notes]                               │
└─────────────────────────────────────────────────────────────────┘
```

**Responsive behaviour**:
- **Desktop (>1200px)**: Three-column layout as above. Margin notes visible.
- **Tablet (768–1200px)**: Two columns — sidebar collapses to hamburger, margin notes become hover popovers.
- **Mobile (<768px)**: Single column, sidebar as drawer, all comments as hover/tap popovers.

### 5.2 Skim Mode

A toggle in the header switches between **Read Mode** and **Skim Mode**:

**Read Mode** (default):
- All text visible at full opacity
- Margin notes visible for annotated passages
- Full comprehension comments shown

**Skim Mode**:
- Non-annotated text reduced to 40% opacity
- Highlighted passages remain at full opacity with increased highlight saturation
- Margin notes collapse to show only `skimNote` (short fragment) instead of full comment
- Key Term and Key Concept highlights are given extra visual weight (bolder border, slightly larger skim note)
- The annotation key in the sidebar becomes a "reading map" — showing category distribution as a visual summary of the document's structure
- Scrolling is faster; non-highlighted paragraphs can optionally collapse to single-line summaries (stretch goal)

### 5.3 Aesthetic Specifications

**Typography**:
- Body: `Literata` or `Source Serif 4` (Google Fonts), 18px/1.7 line-height
- Headings: `Newsreader` or body font at weight 600
- Margin notes & UI: `DM Sans` or `Outfit`, 13px
- Code/mono: `JetBrains Mono`, 15px
- Max reading column width: 65ch

**Colour palette** (light editorial):
```css
:root {
  --bg-primary: #FAFAF7;        /* warm off-white */
  --bg-sidebar: #F2F0EB;        /* slightly darker warm */
  --bg-margin: transparent;
  --text-primary: #2C2C2C;      /* near-black, not pure black */
  --text-secondary: #6B6B6B;
  --text-muted: #9B9B9B;
  --text-dimmed: #C8C8C8;       /* skim mode: non-annotated text */
  --border: #E5E3DE;
  --accent: #5C9EAD;            /* teal, for interactive elements */
}
```

**Highlight rendering**:
- AI highlights: `background-color: {category.color}20` (20% opacity hex), with a subtle left border `border-left: 2px solid {category.color}`
- User highlights: `background-color: {user.color}30` (30% opacity), no border
- User underlines: `border-bottom: 2px solid {user.color}`
- MCP-added annotations: styled identically to AI annotations (same `source: 'mcp'` is visual equivalent)
- Overlapping annotations: stack both backgrounds — CSS handles blending

**Margin notes**:
- Positioned vertically aligned with the annotation they reference
- AI notes: small card with `1px solid var(--border)`, category colour dot indicator
- User notes: similar card but with a subtle dashed border to distinguish
- When notes would overlap vertically, nudge downward (collision avoidance)

**Annotation key / legend**:
- Rendered at the top of the sidebar below the document outline
- Each category: colour dot + label + count of annotations
- Core categories (Key Term, Key Concept) listed first, always present
- Clicking a category scrolls to the first annotation of that type
- Toggle visibility per category (checkbox)

**Bibliography hover links**:
- In-text citations detected via regex patterns: `(Author, Year)`, `Author (Year)`, `Author et al. (Year)`
- On hover: tooltip showing full reference text from `bibliography.json`
- On click: opens DOI URL or URL in new tab (if available)
- Visual treatment: subtle dotted underline, slightly different colour from regular text

### 5.4 User Annotation Tools

**Text selection flow**:
1. User selects text in the reading column
2. A floating toolbar appears above the selection with options:
   - **Highlight** (click to cycle through user colours, or click dropdown to pick)
   - **Underline** (click to apply with current colour)
   - **Comment** (opens a small inline text input; pressing Enter saves)
   - **Remove** (only shown if selection overlaps existing user annotation)
3. Annotation is immediately applied and added to the in-memory annotation array
4. Annotation is visually rendered with the appropriate style

**Editing existing annotations**:
- Click on a user annotation to select it
- The floating toolbar reappears with Edit / Delete options
- Editing a comment opens the inline input pre-filled

**Important**: User annotations are distinct from AI annotations. They never modify the AI annotations. Both layers render simultaneously.

### 5.5 Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd+Shift+H` | Apply highlight to selected text | Text must be selected |
| `Cmd+Shift+U` | Apply underline to selected text | Text must be selected |
| `Cmd+Shift+M` | Add annotation comment (margin note) to selection | Text must be selected; opens comment input |
| `Esc` | Dismiss floating toolbar / close comment input | Toolbar or comment input visible |
| `Cmd+S` | Save user annotations to disk | Any time |
| `Cmd+Shift+K` | Toggle skim mode | Any time |
| `?` | Toggle keyboard shortcut help panel | Any time |

**Implementation note**: Use `Cmd` on macOS, `Ctrl` on Windows/Linux. Shortcuts use `Cmd+Shift+` prefix to avoid conflicts with OS-level shortcuts (`Cmd+H` = Hide on macOS, `Cmd+A` = Select All). Only intercept when the reading view is focused.

### 5.6 Document Outline (Sidebar)

- Auto-generated from markdown headings (##, ###, ####)
- Clicking a heading scrolls the reading column to that section
- Current section highlighted as user scrolls (scroll spy)
- Indentation reflects heading hierarchy
- In skim mode, shows annotation count per section

### 5.7 Filter & Toggle Controls (Sidebar)

- **Show/Hide AI annotations**: Master toggle
- **Per-category toggles**: Show/hide individual annotation categories
- **Show/Hide user annotations**: Master toggle
- **Skim mode toggle** (duplicate of header button)
- **Annotation density indicator**: Visual bar showing annotation distribution across the document (like a minimap)

---

## 6. Upload & Import Flows

### 6.1 Upload New PDF

1. User clicks "Upload" or drags PDF onto the page
2. Upload screen shows: filename, page count, estimated processing time
3. **Original PDF is saved** to `readings/{slug}/source.pdf`
4. Pipeline runs: Extract → Tidy → Annotate → Bibliography Parse
5. Progress indicator shows current stage:
   - "Extracting text and images..."
   - "Cleaning up document structure..."
   - "Analysing text and generating annotations..."
   - "Parsing bibliography..."
6. On completion, the reading view loads with the annotated document
7. All files saved to `readings/{document-slug}/`

### 6.2 Import Existing Reading

1. User clicks "Import" and selects a folder, or drags in a `.md` + `.json` pair, or a `.zip`
2. App loads the markdown and applies annotations from JSON files
3. Reading state is fully restored including user annotations

### 6.3 Export

- **Download ZIP**: Creates `{slug}.zip` containing all files in the document folder (markdown, JSONs, images, source PDF)
- **Download individual files**: Links to download `.md` and `.json` files separately

---

## 7. Image Handling

### 7.1 Extraction (Node.js)

```typescript
// Render each PDF page to canvas, detect image regions
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

// For each page, render to canvas and extract image regions
// Or use pdf-lib to extract embedded image objects directly
// Save via sharp to readings/{slug}/images/fig-NNN.png
```

- In the markdown, insert `![](images/fig-001.png)` at approximately the right position

### 7.2 Rendering

- Images render inline in the reading column at `max-width: 100%`
- Optional: click to enlarge (lightbox)
- Images have a subtle border and caption area below (if caption text is detected)

### 7.3 Tidy Pass Image Handling

The Haiku tidy prompt must be instructed to **never remove or modify image placeholders**. Images pass through untouched.

---

## 8. API & Backend

### 8.1 Express Server Endpoints

```typescript
// src/server/routes/index.ts

POST /api/upload          // Upload PDF, run full pipeline, return document slug
GET  /api/documents       // List all documents in readings/
GET  /api/documents/:slug // Get metadata for a document
GET  /api/documents/:slug/markdown    // Get cleaned markdown
GET  /api/documents/:slug/annotations // Get AI annotations
GET  /api/documents/:slug/user-annotations // Get user annotations
PUT  /api/documents/:slug/user-annotations // Save user annotations
GET  /api/documents/:slug/bibliography // Get parsed bibliography
GET  /api/documents/:slug/images/:filename // Serve image files
GET  /api/documents/:slug/source.pdf  // Serve original PDF
POST /api/documents/:slug/re-annotate // Re-run annotation pass only
```

### 8.2 Anthropic SDK Usage

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // ANTHROPIC_API_KEY from .env

// Tidy pass
const tidyResponse = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 8192,
  system: TIDY_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: rawMarkdown }],
});

// Annotation pass
const annotateResponse = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 16384,
  system: ANNOTATE_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: cleanMarkdown }],
});
```

### 8.3 Error Handling

- Rate limit (429): Exponential backoff with 3 retries
- Timeout: 180s for Opus annotation pass (long documents)
- Malformed JSON response: Retry once with a stricter "return ONLY JSON" reminder appended
- Partial failure on chunked documents: Mark failed sections, allow retry

### 8.4 UI Error & Empty States

- **No documents yet**: Welcome screen with upload CTA and brief explanation
- **PDF extraction fails**: Show error with option to retry or paste markdown directly
- **LLM returns invalid JSON**: Retry once automatically with stricter prompt; if still fails, show error with option to retry or skip annotation
- **Document has 0 annotations**: Show the clean markdown with a note that annotation failed, offer re-annotate button
- **Upload in progress**: Stage-by-stage progress indicator (extraction → tidy → annotate → bibliography)
- **Network/API error during upload**: Preserve whatever stages completed; allow resuming from the failed stage

### 8.5 Cost Awareness

- **Estimated costs per document**: Haiku tidy pass ~$0.01–0.05, Opus annotation pass ~$0.50–2.00 (depending on document length)
- **Log token usage**: After each LLM call, log input/output token counts and estimated cost to the server console
- **Consider showing estimated cost**: Before processing, show approximate cost based on document word count (optional — can be a stretch goal)

### 8.6 API Key Management

- API key stored in `.env` file (never committed, `.env` in `.gitignore`)
- Frontend does NOT call the API directly — all LLM calls go through the backend
- Backend validates API key on startup

---

## 9. Testing Strategy (TDD)

### 9.1 Principles

- **Write tests for critical logic paths first** — textSpan matcher, schema validation, annotation merge logic
- **Test alongside implementation for UI and glue code** — not necessarily before
- **Test the contract, not the implementation** — focus on inputs/outputs
- **Use Zod schemas as test boundaries** — if it validates, it's correct
- **Mock LLM calls in unit tests** — use recorded responses as fixtures
- **E2E tests hit real endpoints** — but still mock LLM calls (use test fixtures)

### 9.2 Test Structure

```
src/
  shared/
    types.ts
    schemas.ts                   ← Zod schemas
    schemas.test.ts              ← Schema validation tests
    textspan-matcher.ts          ← textSpan matching logic
    textspan-matcher.test.ts
  server/
    extraction/
      pdf-extractor.ts
      pdf-extractor.test.ts      ← Test with real small PDF fixtures
    pipeline/
      tidy.ts
      tidy.test.ts               ← Test with mock LLM responses
      annotate.ts
      annotate.test.ts           ← Test with mock LLM responses
      bibliography.ts
      bibliography.test.ts
    routes/
      upload.ts
      upload.test.ts             ← Integration test with supertest
      documents.ts
      documents.test.ts
  client/
    components/
      AnnotationOverlay.tsx
      AnnotationOverlay.test.tsx   ← Test highlight rendering
      MarginNote.tsx
      MarginNote.test.tsx
      FloatingToolbar.tsx
      FloatingToolbar.test.tsx
      BibliographyTooltip.tsx
      BibliographyTooltip.test.tsx
      SkimMode.tsx
      SkimMode.test.tsx
    hooks/
      useAnnotations.ts
      useAnnotations.test.ts       ← Test merge logic, user + AI
      useKeyboardShortcuts.ts
      useKeyboardShortcuts.test.ts
      useTextSelection.ts
      useTextSelection.test.ts
  mcp/
    server.ts
    server.test.ts                 ← Test each tool handler
fixtures/
  sample.pdf                       ← Small test PDF (2-3 pages)
  raw-extraction.md                ← Expected extraction output
  tidy-response.md                 ← Mock Haiku response
  annotate-response.json           ← Mock Opus response
  bibliography-response.json
  test-readings/                   ← Minimal reading folder for MCP tests
```

### 9.3 Key Test Cases

**textSpan matcher** (critical path — test thoroughly):
```typescript
describe('textSpanMatcher', () => {
  it('finds exact match in document');
  it('disambiguates duplicate spans using offsetHint');
  it('handles fuzzy match when exact match fails');
  it('returns null for unmatched spans');
  it('handles spans crossing paragraph boundaries');
  it('handles unicode and special characters');
});
```

**Annotation schema validation**:
```typescript
describe('AnnotationSchema', () => {
  it('validates a well-formed AI annotation');
  it('validates a well-formed user annotation');
  it('rejects annotation missing textSpan');
  it('rejects annotation with unknown category');
  it('validates core categories are always present');
});
```

**Pipeline integration** (with mock LLM):
```typescript
describe('Full pipeline', () => {
  it('extracts text from sample PDF');
  it('tidy pass produces valid markdown');
  it('annotation pass produces valid JSON matching schema');
  it('bibliography is extracted and parsed');
  it('images are extracted and referenced in markdown');
  it('original PDF is saved to source.pdf');
});
```

**MCP tools**:
```typescript
describe('MCP add_annotation', () => {
  it('adds annotation to existing document');
  it('verifies textSpan exists in document');
  it('rejects annotation for non-existent document');
  it('rejects annotation with unmatched textSpan');
  it('generates sequential IDs');
});
```

**Frontend components**:
```typescript
describe('AnnotationOverlay', () => {
  it('renders highlights with correct category colours');
  it('shows margin note on hover');
  it('shows skim note in skim mode');
  it('handles overlapping annotations');
});

describe('Keyboard shortcuts', () => {
  it('Cmd+Shift+H applies highlight to selection');
  it('Cmd+Shift+U applies underline to selection');
  it('Cmd+Shift+M opens comment input');
  it('Esc dismisses toolbar');
  it('shortcuts are no-ops without text selection');
});
```

### 9.4 Running Tests

```bash
# All tests
bun run test

# Watch mode during development
bun run test:watch

# Coverage
bun run test:coverage

# E2E
bun run test:e2e

# With coverage
bun run test:coverage
```

---

## 10. Implementation Order (Vertical Slices)

> **Strategy**: Each phase delivers a working end-to-end slice. This gets a usable product faster than building all backend → all frontend sequentially. Tests are written for critical logic paths; UI and glue code can be tested alongside or after.

### Phase 0 — Project Setup
1. Initialise single-package project: `package.json`, `tsconfig.json` (strict), `vite.config.ts`, `vitest.config.ts`
2. Set up directory structure: `src/server/`, `src/client/`, `src/shared/`, `src/mcp/`
3. Create Zod schemas in `src/shared/schemas.ts` with validation tests
4. Create `textSpanMatcher` in `src/shared/textspan-matcher.ts` with comprehensive tests (critical path)
5. Create `.env.example`, `.gitignore`
6. **Verify**: `bun run dev` starts Vite, `bun run test` runs Vitest

### Phase 1 — PDF → Annotated Markdown (Backend Core)
1. `src/server/index.ts` — Express server with `POST /api/upload` route
2. `src/server/extraction/pdf-extractor.ts` — Extract text + metadata using `pdf-parse`
3. `src/server/pipeline/tidy.ts` — Haiku tidy pass (Anthropic SDK)
4. `src/server/pipeline/annotate.ts` — Opus annotation pass (Anthropic SDK)
5. `src/server/pipeline/bibliography.ts` — Bibliography extraction + parsing
6. Save outputs to `readings/{slug}/` directory structure
7. `GET /api/documents`, `GET /api/documents/:slug/*` endpoints
8. Tests: textSpan matcher, schema validation, pipeline with mock LLM responses
9. **Verify**: `curl -F "file=@test.pdf" localhost:3000/api/upload` produces valid `readings/` folder

### Phase 2 — Reading View (Frontend Core)
1. `src/client/App.tsx` — Router: document list → reading view
2. `src/client/pages/ReadingView.tsx` — Three-column layout
3. `src/client/components/MarkdownRenderer.tsx` — `react-markdown` with annotation overlay
4. `src/client/components/AnnotationOverlay.tsx` — Highlight spans with category colours
5. `src/client/components/MarginNote.tsx` — Positioned comments alongside highlights
6. `src/client/components/Sidebar.tsx` — Document outline (scroll spy) + annotation key/legend
7. Fonts + CSS variables (Literata, DM Sans, colour palette)
8. **Verify**: Navigate to reading view, see annotated document with highlights and margin notes

### Phase 3 — Upload Flow + Document Library
1. `src/client/pages/DocumentList.tsx` — Grid/list of processed documents
2. `src/client/components/UploadDialog.tsx` — Drag-and-drop PDF upload with progress
3. Server-sent events or polling for pipeline progress
4. Error states: extraction failure → offer retry or paste-markdown escape hatch
5. **Verify**: Upload PDF via UI, watch progress, see it in library, click to read

### Phase 4 — User Annotations
1. `src/client/hooks/useTextSelection.ts` — Detect text selection
2. `src/client/components/FloatingToolbar.tsx` — Highlight/underline/comment buttons
3. `src/client/hooks/useAnnotations.ts` — Merge AI + user annotations, manage state
4. `PUT /api/documents/:slug/user-annotations` — Persist user annotations
5. Keyboard shortcuts (`Cmd+Shift+H`, `Cmd+Shift+U`, `Cmd+Shift+M`, `Esc`)
6. **Verify**: Select text, apply highlight, add comment, refresh — annotation persists

### Phase 5 — Skim Mode + Bibliography
1. Skim mode toggle — dims non-annotated text, shows `skimNote` in margin
2. Bibliography hover tooltips for in-text citations
3. Citation regex matching + tooltip rendering
4. **Verify**: Toggle skim mode, see visual dimming. Hover citation, see reference.

### Phase 6 — MCP Annotation Server
1. `src/mcp/server.ts` — MCP server with all tools (add/remove annotation, list/add categories, get document text, list documents)
2. Test stdio transport
3. Document setup for Claude Code / Claude Desktop
4. **Verify**: From Claude Code, call `add_annotation` tool, see it in reading view

### Phase 7 — Polish & Integration
1. Import flow (load folder / zip) + Export as ZIP
2. Filter/toggle controls in sidebar (per-category visibility)
3. Responsive layout (tablet, mobile breakpoints)
4. Margin note collision avoidance
5. Image lightbox
6. Keyboard shortcut help panel (`?` to toggle)
7. E2E tests with Playwright

---

## 11. Key Technical Decisions & Rationale

| Decision | Choice | Why |
|----------|--------|-----|
| **textSpan matching + offset fallback** | Primary: exact string match. Fallback: closest match to `offsetHint` | Robust across transformations; offset disambiguates duplicates |
| **Separate tidy + annotate passes** | Two LLM calls: Haiku (cheap) → Opus (powerful) | Separation of concerns; Haiku is 10x cheaper for structural cleanup; Opus quality is highest for nuanced annotation |
| **Server-side PDF extraction (Node)** | `pdf-parse` + `pdfjs-dist` + `sharp`, with paste-markdown fallback | All TypeScript-native; fallback for when extraction quality is insufficient |
| **Git-friendly flat files** | Markdown + JSON in folders; binaries via git-lfs | Clean diffs, portable, no DB dependency; DB can be added as read-layer later |
| **Single package (not monorepo)** | `src/server/`, `src/client/`, `src/shared/` in one `package.json` | Reduces config overhead for solo dev; extract to monorepo later if needed |
| **Separate AI + user annotation files** | `annotations.json` + `user-annotations.json` | Avoids merge conflicts; AI pipeline can be re-run without losing user notes |
| **Semi-adaptive categories** | Key Term + Key Concept always present; 3-5 additional AI-chosen | Consistent skim anchors across all documents + discipline-specific nuance |
| **MCP tool for incremental annotation** | `@modelcontextprotocol/sdk` server | Enables conversational, targeted, multi-pass annotation from any MCP client |
| **Muted highlight palette** | 20% opacity backgrounds | Readable; doesn't obscure text; distinguishes from user highlights |
| **Skim mode** | Toggle that dims non-annotated text, shows skim notes | Supports the dual read/skim user story; makes annotation density directly useful |
| **Full TypeScript strict mode** | `strict: true` + Zod runtime validation | Catches errors at compile time; Zod ensures JSON files match expected schemas |
| **Vertical slice implementation** | Build end-to-end slices (backend+frontend) per phase | Get working product faster than layer-by-layer; each phase is independently demoable |
| **Tests on critical paths** | Tests for textSpan matcher, schemas, annotation merge; UI tests alongside | Focus testing effort where bugs are most likely and costly |

---

## 12. Future Enhancements (Out of Scope for V1)

- **Multi-document view**: Compare annotations across related readings
- **Citation graph**: Link references between loaded documents via bibliography cross-referencing
- **Flashcard generation**: Extract key terms + definitions into Anki-compatible format
- **Collaborative annotations**: Share annotation files with reading group members (git-based workflow)
- **Custom annotation prompts**: Let user modify the Opus system prompt per-document
- **Progressive rendering**: Stream sections as they complete
- **Equation rendering**: KaTeX/MathJax for detected LaTeX equations
- **Semantic search across readings**: Embed annotations for cross-document querying
- **Database read-layer**: SQLite or similar indexing over the flat files for search and aggregation
- **Collapsible paragraphs in skim mode**: Non-annotated paragraphs collapse to one-line AI summaries
- **Re-annotation endpoint**: Re-run Opus on specific sections with custom instructions
- **OpenAI agent support**: MCP tools also work with OpenAI function-calling agents via adapter
