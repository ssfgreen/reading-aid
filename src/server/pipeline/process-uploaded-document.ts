import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  BibliographyFile,
  DocumentMetadata,
  UserAnnotationList,
} from "../../shared/types";
import { annotateMarkdown } from "./annotate";
import { extractBibliography } from "./bibliography";
import { extractDocument, type UploadedDocumentInput } from "./extract";
import { tidyExtractedText } from "./tidy";

export interface ProcessUploadedDocumentResult {
  slug: string;
  metadata: DocumentMetadata;
}

export async function processUploadedDocument(
  input: UploadedDocumentInput,
  readingsDir = resolve(process.cwd(), "readings"),
): Promise<ProcessUploadedDocumentResult> {
  await mkdir(readingsDir, { recursive: true });

  const extracted = extractDocument(input);
  const baseSlug = slugify(extracted.title) || "reading";
  const slug = await findAvailableSlug(baseSlug, readingsDir);
  const documentDir = join(readingsDir, slug);

  await mkdir(documentDir, { recursive: true });

  const markdown = tidyExtractedText(extracted.title, extracted.rawText);
  const annotations = annotateMarkdown(slug, markdown);
  const bibliography: BibliographyFile = extractBibliography(markdown);
  const metadata = createMetadata(slug, input.originalFilename, extracted.title, markdown);
  const userAnnotations: UserAnnotationList = [];

  await Promise.all([
    writeFile(join(documentDir, "document.md"), markdown, "utf8"),
    writeFile(join(documentDir, "annotations.json"), JSON.stringify(annotations, null, 2)),
    writeFile(join(documentDir, "metadata.json"), JSON.stringify(metadata, null, 2)),
    writeFile(join(documentDir, "bibliography.json"), JSON.stringify(bibliography, null, 2)),
    writeFile(
      join(documentDir, "user-annotations.json"),
      JSON.stringify(userAnnotations, null, 2),
    ),
    writeFile(join(documentDir, extracted.sourceFileName), input.buffer),
  ]);

  return { slug, metadata };
}

async function findAvailableSlug(baseSlug: string, readingsDir: string) {
  let candidate = baseSlug;
  let suffix = 2;

  while (await pathExists(join(readingsDir, candidate))) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function createMetadata(
  slug: string,
  originalFilename: string,
  title: string,
  markdown: string,
): DocumentMetadata {
  return {
    slug,
    originalFilename,
    title,
    authors: [],
    pageCount: 1,
    wordCount: countWords(markdown),
    processedAt: new Date().toISOString(),
    models: {
      tidy: "local-tidy-v1",
      annotate: "local-annotate-v1",
    },
    extractionMethod: "local-heuristic-pipeline",
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function countWords(value: string) {
  const words = value.trim().match(/\S+/g);
  return words ? words.length : 0;
}
