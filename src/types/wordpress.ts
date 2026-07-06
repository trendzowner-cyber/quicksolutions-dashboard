export interface WPPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  status: "publish" | "draft" | "pending" | "private";
  date: string;
  modified: string;
  slug: string;
  categories: number[];
  tags: number[];
  featured_media: number;
  meta: Record<string, unknown>;
  yoast_head_json?: YoastHead;
}

export interface WPPage {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: "publish" | "draft";
  date: string;
  modified: string;
  slug: string;
  parent: number;
  featured_media: number;
  yoast_head_json?: YoastHead;
}

export interface YoastHead {
  title: string;
  description: string;
  og_title?: string;
  og_description?: string;
  twitter_title?: string;
  twitter_description?: string;
  robots?: { index: string; follow: string };
}
