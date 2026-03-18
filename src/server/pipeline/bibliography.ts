import type { BibliographyFile } from "../../shared/types";

export function extractBibliography(markdown: string): BibliographyFile {
  const match = /##\s+(References|Bibliography)\s*\n([\s\S]+)$/i.exec(markdown);

  if (!match) {
    return { references: [] };
  }

  const references = match[2]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const parts = line.split(".").map((part) => part.trim()).filter(Boolean);

      return {
        id: `ref-${String(index + 1).padStart(3, "0")}`,
        authors: parts[0] ? [parts[0]] : ["Unknown"],
        year: yearMatch?.[0] ?? "Unknown",
        title: parts[1] ?? line,
        venue: parts[2],
        rawText: line,
      };
    });

  return { references };
}
