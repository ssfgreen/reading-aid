import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { matchTextSpan } from "../shared/textspan-matcher";

export interface ReaderAnnotation {
  id: string;
  category?: string;
  textSpan: string;
  offsetHint?: number;
}

export interface ReaderCategory {
  id: string;
  label: string;
  color: string;
}

export interface ResolvedAnnotation extends ReaderAnnotation {
  color: string;
  start: number;
  end: number;
}

export function resolveAnnotations(
  markdown: string,
  annotations: ReaderAnnotation[],
  categories: ReaderCategory[],
) {
  return annotations
    .map((annotation) => {
      const match = matchTextSpan(markdown, annotation.textSpan, {
        offsetHint: annotation.offsetHint,
      });
      const category = categories.find((item) => item.id === annotation.category);

      if (!match || !category) {
        return null;
      }

      return {
        ...annotation,
        color: category.color,
        start: match.start,
        end: match.end,
      } satisfies ResolvedAnnotation;
    })
    .filter((annotation): annotation is ResolvedAnnotation => annotation !== null)
    .sort((left, right) => left.start - right.start);
}

export function renderAnnotatedMarkdown(
  markdown: string,
  annotations: ResolvedAnnotation[],
) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={createMarkdownComponents(markdown, annotations)}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function createMarkdownComponents(
  markdown: string,
  annotations: ResolvedAnnotation[],
) {
  let searchCursor = 0;

  function renderChildren(children: React.ReactNode) {
    const text = flattenText(children);
    if (!text.trim()) {
      return children;
    }

    const start = markdown.indexOf(text, searchCursor);
    if (start < 0) {
      return children;
    }

    searchCursor = start + text.length;
    return highlightText(text, start, annotations);
  }

  return {
    h1: ({ children }: { children?: React.ReactNode }) => <h1>{renderChildren(children)}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2>{renderChildren(children)}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3>{renderChildren(children)}</h3>,
    h4: ({ children }: { children?: React.ReactNode }) => <h4>{renderChildren(children)}</h4>,
    p: ({ children }: { children?: React.ReactNode }) => <p>{renderChildren(children)}</p>,
    li: ({ children }: { children?: React.ReactNode }) => <li>{renderChildren(children)}</li>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote>{renderChildren(children)}</blockquote>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong>{renderChildren(children)}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => <em>{renderChildren(children)}</em>,
  };
}

function flattenText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(flattenText).join("");
  }

  if (node && typeof node === "object" && "props" in node) {
    return flattenText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }

  return "";
}

function highlightText(
  text: string,
  globalStart: number,
  annotations: ResolvedAnnotation[],
) {
  const globalEnd = globalStart + text.length;
  const overlapping = annotations.filter(
    (annotation) => annotation.start < globalEnd && annotation.end > globalStart,
  );

  if (overlapping.length === 0) {
    return text;
  }

  const segments: Array<{
    start: number;
    end: number;
    annotation?: ResolvedAnnotation;
  }> = [];
  let cursor = globalStart;

  for (const annotation of overlapping) {
    const start = Math.max(globalStart, annotation.start);
    const end = Math.min(globalEnd, annotation.end);
    if (start > cursor) {
      segments.push({
        start: cursor,
        end: start,
      });
    }

    if (end > start) {
      segments.push({
        start,
        end,
        annotation,
      });
      cursor = end;
    }
  }

  if (cursor < globalEnd) {
    segments.push({
      start: cursor,
      end: globalEnd,
    });
  }

  return segments.map((segment) => {
    const value = text.slice(segment.start - globalStart, segment.end - globalStart);
    if (!segment.annotation) {
      return value;
    }

    return (
      <mark
        key={`${segment.annotation.id}-${segment.start}`}
        className="inline-annotation"
        style={
          {
            "--annotation-color": segment.annotation.color,
          } as React.CSSProperties
        }
      >
        {value}
      </mark>
    );
  });
}

export function SectionList({ markdown }: { markdown: string }) {
  const headings = markdown
    .split("\n")
    .map((line) => /^(#{1,4})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      level: match[1].length,
      text: match[2],
    }));

  if (headings.length === 0) {
    return <p className="muted-copy">No headings detected yet.</p>;
  }

  return (
    <div className="outline-list">
      {headings.map((heading) => (
        <Fragment key={`${heading.level}-${heading.text}`}>
          <div
            className="outline-item"
            style={{ paddingLeft: `${(heading.level - 1) * 0.75}rem` }}
          >
            {heading.text}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
