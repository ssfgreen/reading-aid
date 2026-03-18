import { useEffect, useState } from "react";

import { renderAnnotatedMarkdown, resolveAnnotations, SectionList } from "./reader";

interface DocumentSummary {
  slug: string;
  title: string;
  processedAt: string;
  wordCount: number;
}

interface DocumentDetail extends DocumentSummary {
  originalFilename: string;
  authors: string[];
  extractionMethod: string;
}

interface AnnotationFile {
  categories: Array<{
    id: string;
    label: string;
    color: string;
  }>;
  annotations: Array<{
    id: string;
    category?: string;
    skimNote?: string;
    comment?: string;
    textSpan: string;
    offsetHint?: number;
  }>;
}

type LoadState = "idle" | "loading" | "ready" | "error";

export function App() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [annotations, setAnnotations] = useState<AnnotationFile | null>(null);
  const [listState, setListState] = useState<LoadState>("idle");
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const resolvedAnnotations = annotations
    ? resolveAnnotations(markdown, annotations.annotations, annotations.categories)
    : [];

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null);
      setMarkdown("");
      setAnnotations(null);
      return;
    }

    void loadDocument(selectedSlug);
  }, [selectedSlug]);

  async function loadDocuments(preferredSlug?: string) {
    setListState("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/documents");
      if (!response.ok) {
        throw new Error("Could not load documents");
      }

      const data = (await response.json()) as { documents: DocumentSummary[] };
      setDocuments(data.documents);
      setListState("ready");

      const nextSlug = preferredSlug ?? selectedSlug ?? data.documents[0]?.slug ?? null;
      setSelectedSlug(nextSlug);
    } catch (error) {
      setListState("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    }
  }

  async function loadDocument(slug: string) {
    setDetailState("loading");
    setErrorMessage(null);

    try {
      const [metadataResponse, markdownResponse, annotationsResponse] = await Promise.all([
        fetch(`/api/documents/${slug}`),
        fetch(`/api/documents/${slug}/markdown`),
        fetch(`/api/documents/${slug}/annotations`),
      ]);

      if (!metadataResponse.ok || !markdownResponse.ok || !annotationsResponse.ok) {
        throw new Error("Could not load the selected reading");
      }

      const [metadata, markdownText, annotationData] = await Promise.all([
        metadataResponse.json() as Promise<DocumentDetail>,
        markdownResponse.text(),
        annotationsResponse.json() as Promise<AnnotationFile>,
      ]);

      setDetail(metadata);
      setMarkdown(markdownText);
      setAnnotations(annotationData);
      setDetailState("ready");
    } catch (error) {
      setDetailState("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = (await response.json()) as { slug: string };
      await loadDocuments(data.slug);
      event.target.value = "";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="eyebrow">Reading Aid</p>
          <h1>Reading workspace</h1>
          <p className="lede">
            Upload a file, persist it into the `readings/` structure, and open
            it through the same API contract the real pipeline will use.
          </p>
        </div>

        <label className="upload-card">
          <span>{uploading ? "Uploading..." : "Upload a reading"}</span>
          <small>PDF, Markdown, or text</small>
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            accept=".pdf,.md,.txt,text/plain,text/markdown,application/pdf"
          />
        </label>

        <div className="document-list">
          <div className="section-heading">
            <span>Library</span>
            <small>{listState === "ready" ? `${documents.length} saved` : "Loading"}</small>
          </div>

          {documents.length === 0 && listState === "ready" ? (
            <div className="empty-state">
              <p>No readings yet.</p>
              <small>The first upload will generate a file-backed reading folder.</small>
            </div>
          ) : null}

          {documents.map((document) => (
            <button
              key={document.slug}
              type="button"
              className={document.slug === selectedSlug ? "document-card active" : "document-card"}
              onClick={() => setSelectedSlug(document.slug)}
            >
              <strong>{document.title}</strong>
              <span>{document.wordCount} words</span>
              <small>{new Date(document.processedAt).toLocaleString()}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="reader">
        <header className="reader-header">
          <div>
            <p className="eyebrow">Current Reading</p>
            <h2>{detail?.title ?? "Choose a document"}</h2>
          </div>
          {detail ? (
            <div className="meta-grid">
              <span>{detail.originalFilename}</span>
              <span>{detail.extractionMethod}</span>
            </div>
          ) : null}
        </header>

        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

        {detailState === "loading" ? (
          <div className="panel">
            <p>Loading reading...</p>
          </div>
        ) : detail ? (
          <div className="reader-layout">
            <article className="panel markdown-panel">
              {renderAnnotatedMarkdown(markdown, resolvedAnnotations)}
            </article>

            <aside className="panel annotation-panel">
              <div className="section-heading">
                <span>Outline</span>
              </div>
              <SectionList markdown={markdown} />

              <div className="section-heading annotation-heading">
                <span>Categories</span>
                <small>{annotations?.categories.length ?? 0}</small>
              </div>
              <div className="category-list">
                {annotations?.categories.map((category) => (
                  <div key={category.id} className="category-item">
                    <span
                      className="category-dot"
                      style={{ backgroundColor: category.color }}
                    />
                    <span>{category.label}</span>
                  </div>
                ))}
              </div>

              <div className="section-heading">
                <span>Annotations</span>
                <small>{annotations?.annotations.length ?? 0}</small>
              </div>
              {annotations?.annotations.map((annotation) => (
                <div key={annotation.id} className="annotation-card">
                  <span className="annotation-kicker">{annotation.category ?? "note"}</span>
                  <strong>{annotation.skimNote ?? annotation.textSpan}</strong>
                  <p>{annotation.comment ?? annotation.textSpan}</p>
                </div>
              ))}
            </aside>
          </div>
        ) : (
          <div className="panel empty-panel">
            <p>Select a reading from the library or upload a new file.</p>
          </div>
        )}
      </section>
    </main>
  );
}
