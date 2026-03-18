import { z } from "zod";

const ISODateTimeSchema = z.string().datetime({ offset: true });

export const CategorySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  description: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  isCore: z.boolean(),
});

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["ai", "user", "mcp"]),
  type: z.enum(["highlight", "underline"]),
  category: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  textSpan: z.string().min(1),
  offsetHint: z.number().int().nonnegative().optional(),
  comment: z.string().min(1).optional(),
  skimNote: z.string().min(1).optional(),
  createdAt: ISODateTimeSchema,
});

export const AnnotationFileSchema = z
  .object({
    documentSlug: z.string().min(1),
    categories: z.array(CategorySchema),
    annotations: z.array(AnnotationSchema),
  })
  .superRefine((value, ctx) => {
    const coreCategoryIds = ["key_term", "key_concept"];
    const categoryIds = new Set(value.categories.map((category) => category.id));

    for (const coreCategoryId of coreCategoryIds) {
      if (!categoryIds.has(coreCategoryId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required core category: ${coreCategoryId}`,
          path: ["categories"],
        });
      }
    }

    for (const annotation of value.annotations) {
      if (annotation.source === "user") {
        continue;
      }

      if (!annotation.category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI and MCP annotations must declare a category",
          path: ["annotations"],
        });
        continue;
      }

      if (!categoryIds.has(annotation.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown annotation category: ${annotation.category}`,
          path: ["annotations"],
        });
      }
    }
  });

export const UserAnnotationListSchema = z.array(
  AnnotationSchema.superRefine((annotation, ctx) => {
    if (annotation.source !== "user") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User annotation lists can only contain source='user'",
      });
    }
  }),
);

export const BibliographyReferenceSchema = z.object({
  id: z.string().min(1),
  authors: z.array(z.string().min(1)),
  year: z.string().min(1),
  title: z.string().min(1),
  venue: z.string().min(1).optional(),
  doi: z.string().min(1).optional(),
  url: z.string().url().optional(),
  rawText: z.string().min(1),
});

export const BibliographyFileSchema = z.object({
  references: z.array(BibliographyReferenceSchema),
});

export const DocumentMetadataSchema = z.object({
  slug: z.string().min(1),
  originalFilename: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string().min(1)),
  year: z.string().min(1).optional(),
  pageCount: z.number().int().positive(),
  wordCount: z.number().int().nonnegative(),
  processedAt: ISODateTimeSchema,
  models: z.object({
    tidy: z.string().min(1),
    annotate: z.string().min(1),
  }),
  extractionMethod: z.string().min(1),
});
