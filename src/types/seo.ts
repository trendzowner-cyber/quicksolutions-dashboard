export interface YoastMeta {
  title?: string;
  description?: string;
  focus_keyword?: string;
  _yoast_wpseo_metadesc?: string;
  _yoast_wpseo_focuskw?: string;
  _yoast_wpseo_title?: string;
  og_title?: string;
  og_description?: string;
  twitter_title?: string;
  twitter_description?: string;
}

export interface SEOMetaInput {
  meta_description: string;
  focus_keyphrase: string;
  seo_title: string;
}
