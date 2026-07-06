// Google Ads API client
const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";
const CLIENT_ID = "***REMOVED***";
const CLIENT_SECRET = "***REMOVED***";
const DEVELOPER_TOKEN = "***REMOVED***";
const MANAGER_ID = "307-370-2998";

export function getAuthUrl(customerId: string) {
  const redirectUri = "https://quicksolutions-dashboard.vercel.app/api/ads/oauth-callback";
  const scope = "https://www.googleapis.com/auth/adwords";
  const params = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: "code",
    scope, access_type: "offline", prompt: "consent",
    login_customer_hint: customerId,
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: "https://quicksolutions-dashboard.vercel.app/api/ads/oauth-callback",
      grant_type: "authorization_code" }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`OAuth error: ${err}`); }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("Failed to refresh token");
  return response.json();
}

export async function queryGoogleAds(customerId: string, query: string, accessToken: string) {
  const cleanId = customerId.replace(/-/g, "");
  const cleanManager = MANAGER_ID.replace(/-/g, "");
  const response = await fetch(`${GOOGLE_ADS_API}/customers/${cleanId}/googleAds:search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`,
      "developer-token": DEVELOPER_TOKEN, "login-customer-id": cleanManager },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`Google Ads API error: ${err}`); }
  return response.json();
}

// Build campaign query with optional date filter
export function buildCampaignQuery(dateRange: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let dateFilter = "WHERE campaign.status != 'REMOVED'";
  if (dateRange === "TODAY") dateFilter += ` AND segments.date = '${today}'`;
  else if (dateRange === "YESTERDAY") dateFilter += ` AND segments.date = '${yesterday}'`;
  else if (dateRange === "LAST_7_DAYS") dateFilter += " AND segments.date DURING LAST_7_DAYS";
  else if (dateRange === "LAST_30_DAYS") dateFilter += " AND segments.date DURING LAST_30_DAYS";
  else if (dateRange === "THIS_MONTH") dateFilter += " AND segments.date DURING THIS_MONTH";
  else if (dateRange === "LAST_MONTH") dateFilter += " AND segments.date DURING LAST_MONTH";
  // Default: no date filter = all time

  return `
    SELECT
      campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.conversions_value, metrics.impressions,
      segments.date
    FROM campaign
    ${dateFilter}
    ORDER BY metrics.impressions DESC
    LIMIT 100
  `;
}

export function buildAccountQuery(dateRange: string) {
  let dateFilter = "";
  if (dateRange === "LAST_7_DAYS") dateFilter = "WHERE segments.date DURING LAST_7_DAYS";
  else if (dateRange === "LAST_30_DAYS") dateFilter = "WHERE segments.date DURING LAST_30_DAYS";
  else if (dateRange === "THIS_MONTH") dateFilter = "WHERE segments.date DURING THIS_MONTH";

  return `
    SELECT
      customer.descriptive_name, customer.id,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.conversions_value
    FROM customer
    ${dateFilter}
    LIMIT 1
  `;
}
