import { basename, extname } from "node:path";

export interface UploadedDocumentInput {
  buffer: Buffer;
  mimeType?: string;
  originalFilename: string;
}

export interface ExtractedDocument {
  title: string;
  rawText: string;
  sourceFileName: string;
}

export function extractDocument(input: UploadedDocumentInput): ExtractedDocument {
  const title = humanizeTitle(stripExtension(input.originalFilename));
  const extension = extname(input.originalFilename).toLowerCase();

  if (
    input.mimeType?.startsWith("text/") ||
    extension === ".md" ||
    extension === ".txt"
  ) {
    const rawText = input.buffer.toString("utf8").trim();

    return {
      title,
      rawText:
        rawText ||
        `${title}\n\nThe uploaded text file was empty, so a placeholder note was created.`,
      sourceFileName: createSourceFileName(input.originalFilename),
    };
  }

  return {
    title,
    rawText: [
      title,
      "",
      `Original file: ${input.originalFilename}`,
      "",
      "This local MVP saves the PDF and creates a working reading shell.",
      "Full PDF text extraction will plug into this stage next.",
    ].join("\n"),
    sourceFileName: createSourceFileName(input.originalFilename),
  };
}

function createSourceFileName(originalFilename: string) {
  const extension = extname(originalFilename).toLowerCase();
  return extension ? `source${extension}` : "source.bin";
}

function stripExtension(filename: string) {
  return basename(filename, extname(filename));
}

function humanizeTitle(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
