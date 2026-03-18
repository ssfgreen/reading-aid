import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import {
  AnnotationFileSchema,
  BibliographyFileSchema,
  DocumentMetadataSchema,
  UserAnnotationListSchema,
} from "../shared/schemas";
import type {
  AnnotationFile,
  BibliographyFile,
  DocumentMetadata,
  UserAnnotationList,
} from "../shared/types";

export class DocumentNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Document not found: ${slug}`);
    this.name = "DocumentNotFoundError";
  }
}

export interface ReadingsStore {
  listDocuments(): Promise<DocumentMetadata[]>;
  getMetadata(slug: string): Promise<DocumentMetadata>;
  getMarkdown(slug: string): Promise<string>;
  getAnnotations(slug: string): Promise<AnnotationFile>;
  getUserAnnotations(slug: string): Promise<UserAnnotationList>;
  getBibliography(slug: string): Promise<BibliographyFile>;
}

export function createReadingsStore(readingsDir = resolve(process.cwd(), "readings")): ReadingsStore {
  return {
    async listDocuments() {
      const entries = await readdir(readingsDir, { withFileTypes: true }).catch((error) => {
        if (isMissingPathError(error)) {
          return [];
        }

        throw error;
      });

      const documents = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            return readValidatedJson(
              resolve(readingsDir, entry.name, "metadata.json"),
              DocumentMetadataSchema,
            ).catch((error) => {
              if (isMissingPathError(error)) {
                return null;
              }

              throw error;
            });
          }),
      );

      return documents
        .filter((document): document is DocumentMetadata => document !== null)
        .sort((left, right) => right.processedAt.localeCompare(left.processedAt));
    },

    async getMetadata(slug) {
      return readValidatedJson(
        resolveDocumentPath(readingsDir, slug, "metadata.json"),
        DocumentMetadataSchema,
      );
    },

    async getMarkdown(slug) {
      return readTextFile(resolveDocumentPath(readingsDir, slug, "document.md"));
    },

    async getAnnotations(slug) {
      return readValidatedJson(
        resolveDocumentPath(readingsDir, slug, "annotations.json"),
        AnnotationFileSchema,
      );
    },

    async getUserAnnotations(slug) {
      const filePath = resolveDocumentPath(readingsDir, slug, "user-annotations.json");

      try {
        return await readValidatedJson(filePath, UserAnnotationListSchema);
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          return [];
        }

        throw error;
      }
    },

    async getBibliography(slug) {
      const filePath = resolveDocumentPath(readingsDir, slug, "bibliography.json");

      try {
        return await readValidatedJson(filePath, BibliographyFileSchema);
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          return { references: [] };
        }

        throw error;
      }
    },
  };
}

function resolveDocumentPath(readingsDir: string, slug: string, fileName: string) {
  return resolve(readingsDir, slug, fileName);
}

async function readTextFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new DocumentNotFoundError(extractSlugFromPath(path));
    }

    throw error;
  }
}

async function readValidatedJson<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  try {
    const content = await readFile(path, "utf8");
    return schema.parse(JSON.parse(content));
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new DocumentNotFoundError(extractSlugFromPath(path));
    }

    throw error;
  }
}

function extractSlugFromPath(path: string) {
  const parts = path.split("/");
  return parts.at(-2) ?? "unknown";
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
