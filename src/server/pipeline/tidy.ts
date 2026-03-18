export function tidyExtractedText(title: string, rawText: string) {
  const normalized = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const body = normalized.startsWith("# ")
    ? normalized
    : `# ${title}\n\n${promoteSectionHeadings(normalized)}`;

  return `${body}\n`;
}

function promoteSectionHeadings(value: string) {
  const sectionLikeHeadings = [
    "abstract",
    "introduction",
    "background",
    "method",
    "methods",
    "discussion",
    "conclusion",
    "references",
    "bibliography",
  ];

  return value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (sectionLikeHeadings.includes(trimmed.toLowerCase())) {
        return `## ${trimmed}`;
      }

      return line;
    })
    .join("\n");
}
