import express from "express";

import { DocumentNotFoundError, createReadingsStore } from "./readings-store";
import { createDocumentsRouter } from "./routes/documents";
import { createUploadRouter } from "./routes/upload";

interface CreateServerOptions {
  readingsDir?: string;
}

export function createServer(options: CreateServerOptions = {}) {
  const app = express();
  const store = createReadingsStore(options.readingsDir);

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/documents", createDocumentsRouter(store));
  app.use("/api/upload", createUploadRouter({ readingsDir: options.readingsDir }));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof DocumentNotFoundError) {
      response.status(404).json({
        error: error.message,
      });
      return;
    }

    console.error(error);
    response.status(500).json({
      error: "Internal server error",
    });
  });

  return app;
}

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  const app = createServer();
  app.listen(port, () => {
    console.log(`Reading Aid server listening on http://localhost:${port}`);
  });
}
