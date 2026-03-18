# reading-aid

Local MVP for turning uploaded readings into a file-backed reading workspace.

## Run it

1. `bun install`
2. `bun run dev`
3. Open the Vite URL it prints, usually `http://localhost:5173`

`bun run dev` starts both:

- the frontend on port `5173`
- the Express API on port `3000`

## Current MVP

- Upload `.pdf`, `.md`, or `.txt`
- Persist each upload into `readings/<slug>/`
- Generate `document.md`, `metadata.json`, `annotations.json`, `bibliography.json`, and `user-annotations.json`
- Browse saved readings in the UI
- Open a reading with structured markdown rendering and inline annotation highlights

## Notes

- PDF uploads are saved and surfaced through the same pipeline contract, but full PDF text extraction is still a placeholder stage.
- Text and markdown uploads already flow through the local extraction, tidy, annotation, and bibliography stages.

## Checks

- `bun run test`
- `bun run typecheck`
- `bun run build`
