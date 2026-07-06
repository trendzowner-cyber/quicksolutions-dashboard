// Google Ads API client
// Developer Token: ***REMOVED***
// Customer IDs: 480-889-6252 (Google Shopping), 668-709-2345 (Repair)

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v20";
const CLIENT_ID =
  "***REMOVED***";
const CLIENT_SECRET = "***REMOVED***";
const DEVELOPER_TOKEN = "***REMOVED***";

// Generate OAuth2 authorization URL
export function getAuthUrl(customerId: string) {
  const redirectUri = "https://quicksolutions-dashboard.vercel.app/api/ads/oauth-callback";
  const scope = "https://www.googleapis.com/auth/adwords";

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    login_customer_hint: customerId,
  });

  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

// Exchange auth code for tokens
export async function exchangeCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "https://quicksolutions-dashboard.vercel.app/api/ads/oauth-callback",
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth error: ${err}`);
  }

  return response.json();
}

// Get fresh access token from refresh token
export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) throw new Error("Failed to refresh token");
  return response.json();
}

// Query Google Ads API using GAQL
export async function queryGoogleAds(
  customerId: string,
  query: string,
  accessToken: string
) {
  // Strip dashes from customer ID — API expects 4808896252 not 480-889-6252
  const cleanId = customerId.replace(/-/g, "");
  const response = await fetch(
    `${GOOGLE_ADS_API}/customers/${cleanId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "developer-token": DEVELOPER_TOKEN,
      },
      body: JSON.stringify({
        query,
        pageSize: 100,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Ads API error: ${err}`);
  }

  return response.json();
}

// Common GAQL queries
export const GAQL_QUERIES = {
  campaignPerformance: `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status != "REMOVED"
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `,

  accountSummary: `
    SELECT
      customer.descriptive_name,
      customer.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM customer
    WHERE metrics.impressions > 0
  `,

  keywordPerformance: `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr
    FROM keyword_view
    WHERE metrics.impressions > 0
    ORDER BY metrics.impressions DESC
    LIMIT 20
  `,
};
