import type { RequestHandler } from "express";
import multer from "multer";
import { Router } from "express";

import { processUploadedDocument } from "../pipeline/process-uploaded-document";

interface CreateUploadRouterOptions {
  readingsDir?: string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

export function createUploadHandler(
  options: CreateUploadRouterOptions = {},
): RequestHandler {
  return async (request, response) => {
    if (!request.file) {
      response.status(400).json({
        error: "Expected a multipart upload with a `file` field",
      });
      return;
    }

    const result = await processUploadedDocument(
      {
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
        originalFilename: request.file.originalname,
      },
      options.readingsDir,
    );

    response.status(201).json({
      slug: result.slug,
      metadata: result.metadata,
    });
  };
}

export function createUploadRouter(options: CreateUploadRouterOptions = {}) {
  const router = Router();
  const handleUpload = createUploadHandler(options);

  router.post("/", upload.single("file"), handleUpload);

  return router;
}
