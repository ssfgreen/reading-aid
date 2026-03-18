import { mkdtemp, readFile, rm } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequest, createResponse } from "node-mocks-http";
import { afterEach, describe, expect, it } from "vitest";

import { createUploadHandler } from "./upload";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("createUploadHandler", () => {
  it("returns 400 when no file is provided", async () => {
    const handler = createUploadHandler();
    const request = createRequest({ method: "POST", url: "/api/upload" });
    const response = createResponse({ eventEmitter: EventEmitter });

    await runHandler(handler, request, response);

    expect(response.statusCode).toBe(400);
    expect(response._getJSONData().error).toContain("file");
  });

  it("persists the upload and returns the created slug", async () => {
    const readingsDir = await mkdtemp(join(tmpdir(), "reading-aid-route-"));
    createdDirectories.push(readingsDir);

    const handler = createUploadHandler({ readingsDir });
    const request = createRequest({
      method: "POST",
      url: "/api/upload",
    }) as unknown as Parameters<ReturnType<typeof createUploadHandler>>[0] & {
      file: Express.Multer.File;
    };
    request.file = {
      fieldname: "file",
      buffer: Buffer.from("Uploaded content", "utf8"),
      destination: "",
      encoding: "7bit",
      filename: "route-upload.txt",
      mimetype: "text/plain",
      originalname: "route-upload.txt",
      path: "",
      size: "Uploaded content".length,
      stream: undefined as unknown as NodeJS.ReadableStream,
    } as Express.Multer.File;

    const response = createResponse({ eventEmitter: EventEmitter });

    await runHandler(handler, request, response);

    expect(response.statusCode).toBe(201);
    expect(response._getJSONData().slug).toBe("route-upload");

    const document = await readFile(
      join(readingsDir, "route-upload", "document.md"),
      "utf8",
    );
    expect(document).toContain("Uploaded content");
  });
});

async function runHandler(
  handler: ReturnType<typeof createUploadHandler>,
  request: Parameters<ReturnType<typeof createUploadHandler>>[0],
  response: Parameters<ReturnType<typeof createUploadHandler>>[1],
) {
  await new Promise<void>((resolve, reject) => {
    const mockResponse = response as unknown as EventEmitter;
    mockResponse.on("end", resolve);
    mockResponse.on("error", reject);
    Promise.resolve(handler(request, response, reject)).catch(reject);
  });
}
