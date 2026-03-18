import { describe, expect, it } from "vitest";

import { matchTextSpan } from "./textspan-matcher";

describe("matchTextSpan", () => {
  it("finds an exact match in the document", () => {
    const document = "The quick brown fox jumps over the lazy dog.";
    const result = matchTextSpan(document, "brown fox jumps");

    expect(result).toMatchObject({
      start: 10,
      end: 25,
      matchType: "exact",
      score: 1,
    });
  });

  it("disambiguates duplicate spans using the offset hint", () => {
    const document =
      "Key term appears here. Another paragraph. Key term appears here too.";
    const result = matchTextSpan(document, "Key term appears here", {
      offsetHint: 40,
    });

    expect(result?.start).toBe(document.lastIndexOf("Key term appears here"));
  });

  it("falls back to fuzzy matching when punctuation differs", () => {
    const document = "Diffraction, not reflection, reworks the relation.";
    const result = matchTextSpan(
      document,
      "Diffraction not reflection reworks the relation",
    );

    expect(result?.matchType).toBe("fuzzy");
    expect(result?.score).toBeGreaterThan(0.85);
    expect(result?.matchedText).toContain("Diffraction, not reflection");
  });

  it("returns null when no acceptable match exists", () => {
    const document = "The archive remains closed to the public.";
    const result = matchTextSpan(document, "This text does not exist anywhere.");

    expect(result).toBeNull();
  });

  it("handles spans that cross paragraph boundaries", () => {
    const document =
      "The first paragraph ends here.\n\nThe second paragraph begins with the argument.";
    const result = matchTextSpan(
      document,
      "ends here. The second paragraph begins with the argument.",
    );

    expect(result?.matchType).toBe("fuzzy");
    expect(result?.matchedText).toContain("ends here.\n\nThe second paragraph");
  });

  it("handles unicode and special characters", () => {
    const document = "Barad's notion of différance meets intra-action in the text.";
    const result = matchTextSpan(document, "différance meets intra-action");

    expect(result).toMatchObject({
      matchType: "exact",
      matchedText: "différance meets intra-action",
    });
  });

  it("does not fuzzy match short ambiguous spans", () => {
    const document = "Method, method, method.";
    const result = matchTextSpan(document, "Method method");

    expect(result).toBeNull();
  });
});
