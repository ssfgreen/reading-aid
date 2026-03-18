import { describe, expect, it } from "vitest";

import {
  AnnotationFileSchema,
  DocumentMetadataSchema,
  UserAnnotationListSchema,
} from "./schemas";

const validCategorySet = [
  {
    id: "key_term",
    label: "Key Term",
    description: "Important vocabulary anchor.",
    color: "#5C9EAD",
    isCore: true,
  },
  {
    id: "key_concept",
    label: "Key Concept",
    description: "Core concept for the text.",
    color: "#CB9F6E",
    isCore: true,
  },
  {
    id: "methodological_move",
    label: "Method Move",
    description: "Methodological stakes for skimming.",
    color: "#6D8B74",
    isCore: false,
  },
];

describe("AnnotationFileSchema", () => {
  it("validates a well-formed AI annotation file", () => {
    const result = AnnotationFileSchema.safeParse({
      documentSlug: "sample-paper",
      categories: validCategorySet,
      annotations: [
        {
          id: "ai-001",
          source: "ai",
          type: "highlight",
          category: "methodological_move",
          textSpan: "Diffraction is not reflection.",
          offsetHint: 120,
          comment: "This is a central framing move.",
          skimNote: "Core methodological distinction.",
          createdAt: "2026-03-16T12:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects annotations with unknown categories", () => {
    const result = AnnotationFileSchema.safeParse({
      documentSlug: "sample-paper",
      categories: validCategorySet,
      annotations: [
        {
          id: "ai-001",
          source: "ai",
          type: "highlight",
          category: "not_real",
          textSpan: "Diffraction is not reflection.",
          createdAt: "2026-03-16T12:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Unknown annotation category");
  });

  it("requires the core categories to be present", () => {
    const result = AnnotationFileSchema.safeParse({
      documentSlug: "sample-paper",
      categories: validCategorySet.filter((category) => category.id !== "key_term"),
      annotations: [],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Missing required core category");
  });

  it("validates a well-formed user annotation list", () => {
    const result = UserAnnotationListSchema.safeParse([
      {
        id: "user-001",
        source: "user",
        type: "underline",
        color: "#FFE066",
        textSpan: "Situated knowledge",
        comment: "Return to this later.",
        createdAt: "2026-03-16T12:00:00.000Z",
      },
    ]);

    expect(result.success).toBe(true);
  });

  it("rejects non-user annotations in the user annotation file", () => {
    const result = UserAnnotationListSchema.safeParse([
      {
        id: "ai-001",
        source: "ai",
        type: "highlight",
        category: "key_term",
        textSpan: "Situated knowledge",
        createdAt: "2026-03-16T12:00:00.000Z",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("source='user'");
  });
});

describe("DocumentMetadataSchema", () => {
  it("validates document metadata", () => {
    const result = DocumentMetadataSchema.safeParse({
      slug: "sample-paper",
      originalFilename: "paper.pdf",
      title: "Sample Paper",
      authors: ["A. Author"],
      year: "2026",
      pageCount: 14,
      wordCount: 4821,
      processedAt: "2026-03-16T12:00:00.000Z",
      models: {
        tidy: "claude-haiku-4-5-20251001",
        annotate: "claude-opus-4-6",
      },
      extractionMethod: "pdf-parse+pdfjs-dist",
    });

    expect(result.success).toBe(true);
  });
});
