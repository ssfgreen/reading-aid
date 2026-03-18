import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequest, createResponse } from "node-mocks-http";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./index";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("createServer", () => {
  it("returns a health payload", async () => {
    const app = createServer();

    const response = await performRequest(app, "GET", "/api/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("lists documents from the readings directory", async () => {
    const readingsDir = await createSampleReadingsDir();
    const app = createServer({ readingsDir });

    const response = await performRequest(app, "GET", "/api/documents");

    expect(response.statusCode).toBe(200);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0]).toMatchObject({
      slug: "sample-paper",
      title: "Sample Paper",
    });
  });

  it("serves markdown and annotation files for a document", async () => {
    const readingsDir = await createSampleReadingsDir();
    const app = createServer({ readingsDir });

    const markdownResponse = await performRequest(
      app,
      "GET",
      "/api/documents/sample-paper/markdown",
    );
    const annotationsResponse = await performRequest(
      app,
      "GET",
      "/api/documents/sample-paper/annotations",
    );

    expect(markdownResponse.statusCode).toBe(200);
    expect(markdownResponse.text).toContain("# Sample Paper");
    expect(annotationsResponse.statusCode).toBe(200);
    expect(annotationsResponse.body.annotations).toHaveLength(1);
  });

  it("returns empty arrays for optional user annotations and bibliography files", async () => {
    const readingsDir = await createSampleReadingsDir();
    const app = createServer({ readingsDir });

    const userAnnotationsResponse = await performRequest(
      app,
      "GET",
      "/api/documents/sample-paper/user-annotations",
    );
    const bibliographyResponse = await performRequest(
      app,
      "GET",
      "/api/documents/sample-paper/bibliography",
    );

    expect(userAnnotationsResponse.statusCode).toBe(200);
    expect(userAnnotationsResponse.body).toEqual([]);
    expect(bibliographyResponse.statusCode).toBe(200);
    expect(bibliographyResponse.body).toEqual({ references: [] });
  });

  it("returns 404 for unknown documents", async () => {
    const readingsDir = await createSampleReadingsDir();
    const app = createServer({ readingsDir });

    const response = await performRequest(app, "GET", "/api/documents/missing-paper");

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain("Document not found");
  });

  it("validates missing upload payloads", async () => {
    const app = createServer();

    const response = await performRequest(app, "POST", "/api/upload");

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain("file");
  });
});

async function performRequest(
  app: ReturnType<typeof createServer>,
  method: "GET" | "POST",
  url: string,
) {
  const request = createRequest({
    method,
    url,
  });
  const response = createResponse({
    eventEmitter: EventEmitter,
  });

  await new Promise<void>((resolve, reject) => {
    response.on("end", () => resolve());
    response.on("error", reject);
    (
      app as unknown as (
        request: unknown,
        response: unknown,
        next: (error?: unknown) => void,
      ) => void
    )(request, response, reject);
  });

  const text = response._getData();
  const contentTypeHeader = response.getHeader("content-type");
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(";")
    : String(contentTypeHeader ?? "");
  const body = contentType.includes("application/json") ? JSON.parse(text || "{}") : null;

  return {
    statusCode: response.statusCode,
    body,
    text,
  };
}

async function createSampleReadingsDir() {
  const root = await mkdtemp(join(tmpdir(), "reading-aid-"));
  createdDirectories.push(root);

  const documentDir = join(root, "sample-paper");
  await mkdir(documentDir, { recursive: true });

  await writeFile(
    join(documentDir, "metadata.json"),
    JSON.stringify(
      {
        slug: "sample-paper",
        originalFilename: "sample-paper.pdf",
        title: "Sample Paper",
        authors: ["A. Author"],
        year: "2026",
        pageCount: 12,
        wordCount: 3210,
        processedAt: "2026-03-16T12:00:00.000Z",
        models: {
          tidy: "claude-haiku-4-5-20251001",
          annotate: "claude-opus-4-6",
        },
        extractionMethod: "pdf-parse+pdfjs-dist",
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(documentDir, "document.md"),
    "# Sample Paper\n\nThis is the cleaned markdown.",
  );

  await writeFile(
    join(documentDir, "annotations.json"),
    JSON.stringify(
      {
        documentSlug: "sample-paper",
        categories: [
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
            description: "Central conceptual architecture.",
            color: "#CB9F6E",
            isCore: true,
          },
        ],
        annotations: [
          {
            id: "ai-001",
            source: "ai",
            type: "highlight",
            category: "key_term",
            textSpan: "cleaned markdown",
            createdAt: "2026-03-16T12:00:00.000Z",
          },
        ],
      },
      null,
      2,
    ),
  );

  return root;
}
