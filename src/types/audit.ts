export interface AuditIssue {
  itemId: number;
  itemType: "product" | "post" | "page";
  itemTitle: string;
  severity: "high" | "medium" | "low";
  category:
    | "missing_meta"
    | "short_content"
    | "bad_title"
    | "no_image"
    | "seo_opportunity"
    | "missing_focus_keyphrase";
  description: string;
  suggestion: string;
}

export interface AuditReport {
  issues: AuditIssue[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<string, number>;
    scannedProducts: number;
    scannedPosts: number;
    scannedPages: number;
  };
}
