import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Creates a live Stripe billing_portal session for the signed-in user and
// redirects them straight into their own subscription management page,
// instead of a static billing.stripe.com/p/login/... link that drops every
// user at a generic email-verification gate regardless of who they are.
//
// Requires STRIPE_SECRET_KEY to be set in this function's environment
// (Project Settings > Edge Functions > pricewatcher-billing-portal > Secrets).
// Until that key is set this function returns a clean 503 rather than erroring.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEGACY_STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const PLANSENTRY_STRIPE_KEY = Deno.env.get("STRIPE_PLANSENTRY_SECRET_KEY") || "";
const PLANSENTRY_PRICES = new Set(["price_1UZZ3lLoEh09m2mcjIg1nsEZ", "price_1UZZ3oLoEh09m2mcDKSem4SN"]);
const RETURN_URL = "https://plansentry.com/account.html";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,authorization,apikey",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

async function authUser(token: string) {
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json();
}

async function billingAccount(userId: string): Promise<{stripe_customer_id: string; stripe_price_id: string | null} | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_accounts?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id,stripe_price_id&limit=1`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return rows[0] || null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {

    const body = await request.json().catch(() => ({}));
    const user = await authUser(String(body.access_token || ""));
    if (!user?.id) return json({ error: "Authentication required" }, 401);

    const account = await billingAccount(user.id);
    const customerId = account?.stripe_customer_id;
    if (!customerId) {
      return json({ error: "No billing account found for this user yet. Subscribe to a plan first." }, 404);
    }

    const stripeKey = PLANSENTRY_PRICES.has(account?.stripe_price_id || "") ? PLANSENTRY_STRIPE_KEY : LEGACY_STRIPE_KEY;
    if (!stripeKey) return json({ error: "Billing portal is not configured yet." }, 503);

    const params = new URLSearchParams({
      customer: customerId,
      return_url: RETURN_URL,
    });

    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: "Unable to open billing portal." }, 502);
    }

    return json({ url: data.url });
  } catch (error) {
    return json({ error: "Unable to open billing portal." }, 500);
  }
});
