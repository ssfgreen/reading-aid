import type { AnnotationFile, Category } from "../../shared/types";

const CATEGORIES: Category[] = [
  {
    id: "key_term",
    label: "Key Term",
    description: "Important terminology the reader should keep track of.",
    color: "#5C9EAD",
    isCore: true,
  },
  {
    id: "key_concept",
    label: "Key Concept",
    description: "Central conceptual structure for the text.",
    color: "#CB9F6E",
    isCore: true,
  },
  {
    id: "argument_step",
    label: "Argument Step",
    description: "A move that advances the text's reasoning.",
    color: "#6D8B74",
    isCore: false,
  },
  {
    id: "definition",
    label: "Definition",
    description: "A sentence that defines or clarifies a term.",
    color: "#B5838D",
    isCore: false,
  },
];

export function annotateMarkdown(slug: string, markdown: string): AnnotationFile {
  const createdAt = new Date().toISOString();
  const annotations: AnnotationFile["annotations"] = [];
  const seenSpans = new Set<string>();
  let nextId = 1;

  for (const heading of findHeadings(markdown).slice(0, 6)) {
    pushAnnotation({
      category: heading.level === 1 ? "key_concept" : "argument_step",
      textSpan: heading.text,
      comment:
        heading.level === 1
          ? "The title anchors the overall frame of the reading and becomes the first conceptual reference point."
          : "This heading signals a structural move in the document, which helps the reader skim the argument's shape.",
      skimNote: heading.level === 1 ? "Document frame." : "Section turn.",
      offsetHint: heading.offset,
    });
  }

  for (const sentence of findCandidateSentences(markdown).slice(0, 8)) {
    const category = /\b(is|are|means|refers to|defined as)\b/i.test(sentence.text)
      ? "definition"
      : "key_term";

    pushAnnotation({
      category,
      textSpan: sentence.text,
      comment:
        category === "definition"
          ? "This sentence reads like a local definition or clarification, so it is worth pausing on while building up the paper's vocabulary."
          : "This sentence carries a likely key phrase or recurring term, which makes it useful as a skim anchor.",
      skimNote:
        category === "definition" ? "Definition cue." : "Terminology cue.",
      offsetHint: sentence.offset,
    });
  }

  if (annotations.length === 0) {
    const fallbackSpan = markdown.slice(0, Math.min(140, markdown.length)).trim();
    if (fallbackSpan) {
      pushAnnotation({
        category: "key_concept",
        textSpan: fallbackSpan,
        comment:
          "This fallback annotation keeps the reader view functional even when the document is too short for richer heuristic annotation.",
        skimNote: "Fallback annotation.",
        offsetHint: 0,
      });
    }
  }

  return {
    documentSlug: slug,
    categories: CATEGORIES,
    annotations,
  };

  function pushAnnotation(input: {
    category: string;
    textSpan: string;
    comment: string;
    skimNote: string;
    offsetHint: number;
  }) {
    const normalizedSpan = input.textSpan.trim().replace(/\s+/g, " ");
    if (!normalizedSpan || normalizedSpan.length < 12 || seenSpans.has(normalizedSpan)) {
      return;
    }

    seenSpans.add(normalizedSpan);
    annotations.push({
      id: `ai-${String(nextId).padStart(3, "0")}`,
      source: "ai",
      type: "highlight",
      category: input.category,
      textSpan: normalizedSpan,
      offsetHint: input.offsetHint,
      comment: input.comment,
      skimNote: input.skimNote,
      createdAt,
    });
    nextId += 1;
  }
}

function findHeadings(markdown: string) {
  return markdown
    .split("\n")
    .map((line, index, lines) => {
      const match = /^(#{1,4})\s+(.+)$/.exec(line.trim());
      if (!match) {
        return null;
      }

      const offset = lines.slice(0, index).join("\n").length + (index > 0 ? 1 : 0) + line.indexOf(match[2]);
      return {
        level: match[1].length,
        text: match[2].trim(),
        offset,
      };
    })
    .filter((heading): heading is { level: number; text: string; offset: number } => heading !== null);
}

function findCandidateSentences(markdown: string) {
  const plainText = markdown.replace(/^#{1,4}\s+/gm, "");
  const matches = plainText.matchAll(/([A-Z][^.?!\n]{20,220}[.?!])/g);
  const sentences: Array<{ text: string; offset: number }> = [];

  for (const match of matches) {
    const text = match[1].replace(/\s+/g, " ").trim();
    const offset = markdown.indexOf(text);
    if (offset >= 0) {
      sentences.push({ text, offset });
    }
  }

  return sentences;
}
