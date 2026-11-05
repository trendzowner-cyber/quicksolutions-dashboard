// What the blog AI is allowed to link to.
//
// Both the idea generator and the article writer need to know what actually
// exists on quicksolutionspro.be: real product permalinks, real blog posts and
// the category tree. Before this module they only ever got a hardcoded string
// ("Apple iPhone, MacBook, iPad, refurbished") plus the category names, so the
// model invented URLs like /producten/?search=iphone+15 and the idea list was
// the same ten titles on every click.
//
// Server-only: talks to the WordPress/WooCommerce REST APIs through wp-client.
// Every call is best-effort — a dead WP API must degrade to "no link targets",
// never break idea generation.

import { getCategories, getPosts, getProducts } from "./wp-client";

export interface ProductTarget {
  name: string;
  url: string;
  category: string;
}

export interface PostTarget {
  title: string;
  url: string;
}

export interface LinkTargets {
  products: ProductTarget[];
  posts: PostTarget[];
  categories: { name: string; count: number }[];
  fetchedAt: number;
}

// The catalog changes slowly; 10 minutes keeps a burst of generations cheap
// without ever serving yesterday's prices/posts as link targets.
const TTL_MS = 10 * 60 * 1000;
const MAX_PRODUCTS = 45;

// Apple first — that is the shop's positioning — then the rest of the refurb
// catalog (business laptops, accessories) by size.
const CATEGORY_PRIORITY = ["Apple iPhone", "Apple MacBook", "Apple iPad", "iMac"];

let cache: LinkTargets | null = null;

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function pickProducts(rows: Record<string, unknown>[]): ProductTarget[] {
  const byCategory = new Map<string, ProductTarget[]>();
  const seen = new Set<string>();

  for (const row of rows) {
    const name = stripHtml(String(row.name ?? ""));
    const url = String(row.permalink ?? "");
    if (!name || !url) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cats = (row.categories as { name?: string }[] | undefined) ?? [];
    const category = stripHtml(String(cats[0]?.name ?? "Overig"));
    const list = byCategory.get(category) ?? [];
    list.push({ name, url, category });
    byCategory.set(category, list);
  }

  const ordered = [...byCategory.entries()].sort(([a, al], [b, bl]) => {
    const ia = CATEGORY_PRIORITY.indexOf(a);
    const ib = CATEGORY_PRIORITY.indexOf(b);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return bl.length - al.length;
  });

  const out: ProductTarget[] = [];
  for (const [category, list] of ordered) {
    const limit = CATEGORY_PRIORITY.includes(category) ? 8 : 4;
    out.push(...list.slice(0, limit));
    if (out.length >= MAX_PRODUCTS) break;
  }
  return out.slice(0, MAX_PRODUCTS);
}

export async function getLinkTargets(): Promise<LinkTargets> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;

  const [productsRes, postsRes, categoriesRes] = await Promise.allSettled([
    getProducts({ per_page: "100", status: "publish", stock_status: "instock" }),
    getPosts({ per_page: "100", status: "publish", _fields: "id,title,link,slug" }),
    getCategories({ per_page: "100", hide_empty: "true" }),
  ]);

  const products =
    productsRes.status === "fulfilled" ? pickProducts(productsRes.value.data) : [];
  const posts =
    postsRes.status === "fulfilled"
      ? postsRes.value.data
          .map((p) => ({
            title: stripHtml(String((p.title as { rendered?: string })?.rendered ?? "")),
            url: String(p.link ?? ""),
          }))
          .filter((p) => p.title && p.url)
      : [];
  const categories =
    categoriesRes.status === "fulfilled"
      ? categoriesRes.value.data
          .map((c) => ({ name: stripHtml(String(c.name ?? "")), count: Number(c.count ?? 0) }))
          .filter((c) => c.name)
      : [];

  cache = { products, posts, categories, fetchedAt: Date.now() };
  return cache;
}

// The exact URL set the model may use. Anything else is dropped after
// generation, which is what kills the invented /producten/?search=… links.
export function allowedUrls(targets: LinkTargets): Set<string> {
  const strip = (u: string) => u.replace(/\/+$/, "");
  return new Set([...targets.products.map((p) => strip(p.url)), ...targets.posts.map((p) => strip(p.url))]);
}

// Prompt-ready list of link targets. Compact on purpose: the model only needs
// the name, the category and the URL to choose a natural anchor text.
export function formatLinkTargets(targets: LinkTargets, opts?: { maxPosts?: number }): string {
  const maxPosts = opts?.maxPosts ?? 25;
  const lines: string[] = [];

  if (targets.products.length > 0) {
    lines.push("PRODUCTEN (anchor tekst = productnaam of een natuurlijke variant):");
    for (const p of targets.products) lines.push(`- ${p.name} [${p.category}] → ${p.url}`);
  }
  const posts = targets.posts.slice(0, maxPosts);
  if (posts.length > 0) {
    lines.push("", "BESTAANDE BLOGPOSTS (link hier ook naar waar het onderwerp raakt):");
    for (const p of posts) lines.push(`- ${p.title} → ${p.url}`);
  }
  if (targets.categories.length > 0) {
    lines.push(
      "",
      "CATEGORIEËN: " + targets.categories.map((c) => `${c.name} (${c.count})`).join(", ")
    );
  }
  return lines.join("\n");
}

export function formatExistingTitles(targets: LinkTargets, max = 60): string {
  return targets.posts
    .slice(0, max)
    .map((p) => `- ${p.title}`)
    .join("\n");
}
