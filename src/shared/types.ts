import type {
  AnnotationFileSchema,
  AnnotationSchema,
  BibliographyFileSchema,
  BibliographyReferenceSchema,
  CategorySchema,
  DocumentMetadataSchema,
  UserAnnotationListSchema,
} from "./schemas";

export type Category = import("zod").infer<typeof CategorySchema>;
export type Annotation = import("zod").infer<typeof AnnotationSchema>;
export type AnnotationFile = import("zod").infer<typeof AnnotationFileSchema>;
export type UserAnnotationList = import("zod").infer<typeof UserAnnotationListSchema>;
export type BibliographyReference = import("zod").infer<typeof BibliographyReferenceSchema>;
export type BibliographyFile = import("zod").infer<typeof BibliographyFileSchema>;
export type DocumentMetadata = import("zod").infer<typeof DocumentMetadataSchema>;
