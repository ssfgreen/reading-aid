import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { processUploadedDocument } from "./process-uploaded-document";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("processUploadedDocument", () => {
  it("persists an uploaded markdown document into the readings structure", async () => {
    const readingsDir = await mkdtemp(join(tmpdir(), "reading-aid-upload-"));
    createdDirectories.push(readingsDir);

    const result = await processUploadedDocument(
      {
        buffer: Buffer.from("## Section\n\nSome imported text.", "utf8"),
        mimeType: "text/markdown",
        originalFilename: "sample-reading.md",
      },
      readingsDir,
    );

    expect(result.slug).toBe("sample-reading");

    const markdown = await readFile(
      join(readingsDir, result.slug, "document.md"),
      "utf8",
    );
    const metadata = JSON.parse(
      await readFile(join(readingsDir, result.slug, "metadata.json"), "utf8"),
    );

    expect(markdown).toContain("# Sample Reading");
    expect(markdown).toContain("Some imported text.");
    expect(metadata.extractionMethod).toBe("local-heuristic-pipeline");
  });

  it("creates unique slugs for duplicate uploads", async () => {
    const readingsDir = await mkdtemp(join(tmpdir(), "reading-aid-upload-"));
    createdDirectories.push(readingsDir);

    const first = await processUploadedDocument(
      {
        buffer: Buffer.from("one", "utf8"),
        mimeType: "text/plain",
        originalFilename: "duplicate.txt",
      },
      readingsDir,
    );

    const second = await processUploadedDocument(
      {
        buffer: Buffer.from("two", "utf8"),
        mimeType: "text/plain",
        originalFilename: "duplicate.txt",
      },
      readingsDir,
    );

    expect(first.slug).toBe("duplicate");
    expect(second.slug).toBe("duplicate-2");
  });

  it("saves binary uploads with a source file and placeholder markdown", async () => {
    const readingsDir = await mkdtemp(join(tmpdir(), "reading-aid-upload-"));
    createdDirectories.push(readingsDir);

    const result = await processUploadedDocument(
      {
        buffer: Buffer.from("%PDF-1.4 placeholder", "utf8"),
        mimeType: "application/pdf",
        originalFilename: "paper.pdf",
      },
      readingsDir,
    );

    const markdown = await readFile(
      join(readingsDir, result.slug, "document.md"),
      "utf8",
    );
    const source = await readFile(join(readingsDir, result.slug, "source.pdf"), "utf8");

    expect(markdown).toContain("Full PDF text extraction will plug into this stage next.");
    expect(source).toContain("%PDF-1.4");
  });
});
