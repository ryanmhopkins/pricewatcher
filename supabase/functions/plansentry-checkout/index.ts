import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_PLANSENTRY_SECRET_KEY") || "";
const STRIPE_ACCOUNT = "acct_1UZYXlLoEh09m2mc";
const PRICES: Record<string, string> = {
  growth: "price_1UZZ3lLoEh09m2mcjIg1nsEZ",
  business: "price_1UZZ3oLoEh09m2mcDKSem4SN",
};
const CORS = {
  "Access-Control-Allow-Origin": "https://plansentry.com",
  "Access-Control-Allow-Headers": "content-type,authorization,apikey",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, "Content-Type": "application/json" },
});

async function signedInUser(bearer: string) {
  if (!bearer.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: bearer },
  });
  return response.ok ? response.json() : null;
}

async function accountFor(userId: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_accounts?user_id=eq.${encodeURIComponent(userId)}&select=plan,subscription_status,stripe_customer_id,stripe_price_id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!response.ok) throw new Error("Unable to check billing account");
  return (await response.json())[0] || null;
}

async function stripeAccountMatches() {
  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!response.ok) return false;
  const account = await response.json();
  return account.id === STRIPE_ACCOUNT;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!STRIPE_KEY || !PUBLISHABLE_KEY || !SERVICE_KEY) return json({ error: "Checkout is not configured" }, 503);

  try {
    const user = await signedInUser(request.headers.get("authorization") || "");
    if (!user?.id) return json({ error: "Sign in required" }, 401);
    const body = await request.json().catch(() => ({}));
    const plan = String(body.plan || "");
    if (!Object.hasOwn(PRICES, plan)) return json({ error: "Invalid plan" }, 400);
    const account = await accountFor(user.id);
    if (account?.plan !== "free" && ["active", "trialing", "past_due"].includes(account?.subscription_status)) {
      return json({ error: "Manage your current subscription before starting another one" }, 409);
    }
    if (!await stripeAccountMatches()) return json({ error: "Checkout account is not configured correctly" }, 503);

    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": PRICES[plan],
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      "metadata[plan]": plan,
      "subscription_data[metadata][plan]": plan,
      success_url: "https://plansentry.com/account.html?checkout=success",
      cancel_url: "https://plansentry.com/#pricing",
    });
    const existingPlanSentryCustomer = Object.values(PRICES).includes(account?.stripe_price_id);
    if (existingPlanSentryCustomer && account?.stripe_customer_id) {
      params.set("customer", account.stripe_customer_id);
    } else if (user.email) {
      params.set("customer_email", user.email);
    }
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.url !== "string") return json({ error: "Unable to create checkout session" }, 502);
    return json({ url: result.url });
  } catch {
    return json({ error: "Unable to start checkout" }, 502);
  }
});
