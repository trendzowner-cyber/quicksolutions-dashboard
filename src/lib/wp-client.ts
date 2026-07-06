function getWPUrl(): string {
  return process.env.WP_API_URL || "";
}

function getWCUrl(): string {
  return process.env.WC_API_URL || "";
}

function wpAuth(): string {
  return Buffer.from(
    `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
  ).toString("base64");
}

function wcAuth(): string {
  return Buffer.from(
    `${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
  ).toString("base64");
}

// ─── WordPress (Posts, Pages, Media, Yoast) ───

export async function wpFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<{ data: T; headers: Headers }> {
  const url = `${getWPUrl()}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${wpAuth()}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return { data, headers: res.headers };
}

export async function getPosts(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return wpFetch<Record<string, unknown>[]>(`/posts${qs}`);
}

export async function getPost(id: number) {
  return wpFetch<Record<string, unknown>>(`/posts/${id}?_embed`);
}

export async function createPost(data: Record<string, unknown>) {
  return wpFetch<Record<string, unknown>>("/posts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePost(id: number, data: Record<string, unknown>) {
  return wpFetch<Record<string, unknown>>(`/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getPages(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return wpFetch<Record<string, unknown>[]>(`/pages${qs}`);
}

export async function getPage(id: number) {
  return wpFetch<Record<string, unknown>>(`/pages/${id}?_embed`);
}

export async function updatePage(id: number, data: Record<string, unknown>) {
  return wpFetch<Record<string, unknown>>(`/pages/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Yoast SEO ───
function getYoastUrl(): string {
  return (process.env.WP_API_URL || "").replace("/wp/v2", "");
}

export async function getSEOMeta(postId: number, postType = "post") {
  const res = await fetch(
    `${getYoastUrl()}/yoast/v1/get_meta?post_id=${postId}&post_type=${postType}`,
    {
      headers: {
        Authorization: `Basic ${wpAuth()}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Yoast API error ${res.status}`);
  return res.json();
}

export async function updateSEOMeta(
  postId: number,
  data: Record<string, unknown>,
  postType = "post"
) {
  const res = await fetch(
    `${getYoastUrl()}/yoast/v1/update_meta?post_id=${postId}&post_type=${postType}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${wpAuth()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) throw new Error(`Yoast API error ${res.status}`);
  return res.json();
}

// ─── WooCommerce (Products, Orders, Categories) ───

export async function wcFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<{ data: T; headers: Headers }> {
  const url = `${getWCUrl()}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${wcAuth()}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WC API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return { data, headers: res.headers };
}

export async function getProducts(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return wcFetch<Record<string, unknown>[]>(`/products${qs}`);
}

export async function getProduct(id: number) {
  return wcFetch<Record<string, unknown>>(`/products/${id}`);
}

export async function updateProduct(
  id: number,
  data: Record<string, unknown>
) {
  return wcFetch<Record<string, unknown>>(`/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getCategories(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return wcFetch<Record<string, unknown>[]>(
    `/products/categories${qs}`
  );
}

export async function getOrders(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return wcFetch<Record<string, unknown>[]>(`/orders${qs}`);
}

// ─── Stats helper ───

export async function getStats() {
  const [productsRes, postsRes, ordersRes] = await Promise.all([
    wcFetch<unknown[]>(`/products?per_page=1`),
    wpFetch<unknown[]>(`/posts?per_page=1`),
    wcFetch<unknown[]>(`/orders?per_page=1`),
  ]);

  const productCount = parseInt(
    productsRes.headers.get("X-WP-Total") || "0"
  );
  const postCount = parseInt(postsRes.headers.get("X-WP-Total") || "0");
  const orderCount = parseInt(
    ordersRes.headers.get("X-WP-Total") || "0"
  );

  return { productCount, postCount, orderCount };
}
