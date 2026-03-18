import { describe, expect, it } from "vitest";

import { annotateMarkdown } from "./annotate";
import { extractBibliography } from "./bibliography";
import { tidyExtractedText } from "./tidy";

describe("tidyExtractedText", () => {
  it("adds a title heading and promotes common section labels", () => {
    const markdown = tidyExtractedText(
      "Sample Reading",
      "Introduction\n\nA paragraph.\n\nReferences\n\nAuthor. 2024. Title.",
    );

    expect(markdown).toContain("# Sample Reading");
    expect(markdown).toContain("## Introduction");
    expect(markdown).toContain("## References");
  });
});

describe("annotateMarkdown", () => {
  it("generates heuristic annotations for headings and definitional sentences", () => {
    const markdown = `# Sample Reading

## Introduction

Diffraction is not reflection. This paper develops a key argument about method.`;

    const result = annotateMarkdown("sample-reading", markdown);

    expect(result.categories).toHaveLength(4);
    expect(result.annotations.length).toBeGreaterThan(1);
    expect(result.annotations.some((annotation) => annotation.category === "definition")).toBe(
      true,
    );
  });
});

describe("extractBibliography", () => {
  it("parses a references section into structured entries", () => {
    const result = extractBibliography(`## References

Barad, Karen. 2007. Meeting the Universe Halfway. Duke University Press.
Haraway, Donna. 1988. Situated Knowledges. Feminist Studies.`);

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({
      year: "2007",
    });
  });
});
