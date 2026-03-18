import { describe, expect, it } from "vitest";

import { resolveAnnotations } from "./reader";

describe("resolveAnnotations", () => {
  it("maps annotations onto markdown offsets using shared matching", () => {
    const markdown = "# Title\n\nDiffraction is not reflection.";
    const annotations = resolveAnnotations(
      markdown,
      [
        {
          id: "ai-001",
          category: "key_concept",
          textSpan: "Diffraction is not reflection.",
          offsetHint: markdown.indexOf("Diffraction"),
        },
      ],
      [{ id: "key_concept", label: "Key Concept", color: "#CB9F6E" }],
    );

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      start: markdown.indexOf("Diffraction"),
      color: "#CB9F6E",
    });
  });
});
