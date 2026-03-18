import { Router } from "express";

import type { ReadingsStore } from "../readings-store";

export function createDocumentsRouter(store: ReadingsStore) {
  const router = Router();

  router.get("/", async (_request, response) => {
    const documents = await store.listDocuments();
    response.json({ documents });
  });

  router.get("/:slug", async (request, response) => {
    const metadata = await store.getMetadata(request.params.slug);
    response.json(metadata);
  });

  router.get("/:slug/markdown", async (request, response) => {
    const markdown = await store.getMarkdown(request.params.slug);
    response.type("text/markdown").send(markdown);
  });

  router.get("/:slug/annotations", async (request, response) => {
    const annotations = await store.getAnnotations(request.params.slug);
    response.json(annotations);
  });

  router.get("/:slug/user-annotations", async (request, response) => {
    const annotations = await store.getUserAnnotations(request.params.slug);
    response.json(annotations);
  });

  router.get("/:slug/bibliography", async (request, response) => {
    const bibliography = await store.getBibliography(request.params.slug);
    response.json(bibliography);
  });

  return router;
}
