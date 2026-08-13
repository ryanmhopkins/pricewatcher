import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const PRICE_TO_PLAN: Record<string, "plus" | "pro"> = {
  price_1U3fceELIgx07EKQ0n2sElNS: "plus",
  price_1U3fclELIgx07EKQrCESMctQ: "plus",
  price_1U2u56ELIgx07EKQwjeDj2Bd: "pro",
  price_1U3InhELIgx07EKQoNmA1xtR: "pro",
  // Retained so existing customers on retired prices keep their entitlement.
  price_1U3IjqELIgx07EKQo0g2tjjN: "pro",
  price_1U2u5FELIgx07EKQimxeU1nD: "pro",
};

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

async function select(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function upsert(table: string, value: unknown, onConflict = "") {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${suffix}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json())[0];
}

async function update(table: string, query: string, value: unknown) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function planFor(priceId: string | null, metadata: Record<string, unknown> | null | undefined) {
  const metadataPlan = String(metadata?.plan || "").toLowerCase();
  if (metadataPlan === "plus" || metadataPlan === "pro") return metadataPlan;
  if (metadataPlan === "business") return "pro";
  return priceId ? PRICE_TO_PLAN[priceId] || "free" : "free";
}

function paidPlan(status: string, priceId: string | null, metadata: Record<string, unknown> | null | undefined) {
  return PAID_STATUSES.has(status) ? planFor(priceId, metadata) : "free";
}

async function syncUserAccounts(entitlement: Record<string, unknown>) {
  if (entitlement.stripe_customer_id) {
    await update(
      "user_accounts",
      `stripe_customer_id=eq.${encodeURIComponent(String(entitlement.stripe_customer_id))}`,
      entitlement,
    );
  }
  if (entitlement.email) {
    await update(
      "user_accounts",
      `email=ilike.${encodeURIComponent(String(entitlement.email))}`,
      entitlement,
    );
  }
}

async function putEntitlement(data: Record<string, unknown>) {
  const row = {
    stripe_customer_id: String(data.stripe_customer_id),
    stripe_subscription_id: data.stripe_subscription_id || null,
    email: data.email || null,
    stripe_price_id: data.stripe_price_id || null,
    plan: data.plan || "free",
    subscription_status: data.subscription_status || null,
    current_period_end: data.current_period_end || null,
    updated_at: new Date().toISOString(),
  };
  const saved = await upsert("stripe_entitlements", row, "stripe_customer_id");
  await syncUserAccounts({
    stripe_customer_id: saved.stripe_customer_id,
    stripe_subscription_id: saved.stripe_subscription_id,
    stripe_price_id: saved.stripe_price_id,
    plan: saved.plan,
    subscription_status: saved.subscription_status,
    current_period_end: saved.current_period_end,
    updated_at: new Date().toISOString(),
    email: saved.email,
  });
  return saved;
}

async function updatePaymentStatus(customerId: string, status: string) {
  const entitlement = (await select(
    `stripe_entitlements?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`,
  ))[0];
  if (!entitlement) return;
  const patch = { subscription_status: status, updated_at: new Date().toISOString() };
  await update("stripe_entitlements", `stripe_customer_id=eq.${encodeURIComponent(customerId)}`, patch);
  await syncUserAccounts({
    stripe_customer_id: customerId,
    email: entitlement.email || null,
    subscription_status: status,
    updated_at: new Date().toISOString(),
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: true });

  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("stripe-signature") || "";
    const signatureParts = signatureHeader.split(",").map((part) => part.trim());
    const timestamp = signatureParts.find((part) => part.startsWith("t="))?.slice(2) || "";
    const signatures = signatureParts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
    if (!timestamp || !signatures.length) return json({ error: "Missing Stripe signature" }, 400);

    const config = (await select("stripe_webhook_config?select=signing_secret&limit=1"))[0];
    if (!config?.signing_secret) return json({ error: "Webhook secret not configured" }, 503);
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return json({ error: "Stale Stripe signature" }, 400);
    }

    const expected = await hmac(config.signing_secret, `${timestamp}.${rawBody}`);
    if (!signatures.some((signature: string) => safeEqual(signature, expected))) {
      return json({ error: "Invalid Stripe signature" }, 400);
    }

    const event = JSON.parse(rawBody);
    const object = event.data?.object || {};

    if (event.type === "checkout.session.completed") {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
      const email = object.customer_details?.email || object.customer_email || null;
      if (customerId) {
        await putEntitlement({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          email,
          plan: planFor(null, object.metadata),
          subscription_status: "active",
        });
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      const priceId = object.items?.data?.[0]?.price?.id || null;
      const status = String(object.status || "");
      const currentPeriodEnd = object.current_period_end
        ? new Date(Number(object.current_period_end) * 1000).toISOString()
        : null;
      const existing = customerId
        ? (await select(`stripe_entitlements?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=email&limit=1`))[0]
        : null;
      if (customerId) {
        await putEntitlement({
          stripe_customer_id: customerId,
          stripe_subscription_id: object.id,
          email: existing?.email || null,
          stripe_price_id: priceId,
          plan: paidPlan(status, priceId, object.metadata),
          subscription_status: status,
          current_period_end: currentPeriodEnd,
        });
      }
    } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      if (customerId) {
        await updatePaymentStatus(customerId, event.type === "invoice.paid" ? "active" : "past_due");
      }
    }

    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
