export interface WCProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: "simple" | "variable" | "grouped" | "external";
  status: "publish" | "draft" | "pending" | "private";
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  manage_stock: boolean;
  categories: Array<{ id: number; name: string; slug: string }>;
  tags: Array<{ id: number; name: string }>;
  images: Array<{ id: number; src: string; alt: string }>;
  attributes: Array<{
    id: number;
    name: string;
    position: number;
    visible: boolean;
    variation: boolean;
    options: string[];
  }>;
  variations: number[];
  meta_data: Array<{ id?: number; key: string; value: unknown }>;
  date_created: string;
  date_modified: string;
}

export interface WCProductCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

export interface WCOrder {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  billing: { first_name: string; last_name: string; email: string };
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    quantity: number;
    total: string;
  }>;
}

export interface WCResponse<T> {
  data: T[];
  total: number;
  totalPages: number;
  page: number;
}
