import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

// New prices map to Growth and Business. Retired prices remain mapped so
// existing subscribers keep their original entitlement.
const PRICE_TO_PLAN: Record<string, "growth" | "business" | "pro"> = {
  price_1UZZ3lLoEh09m2mcjIg1nsEZ: "growth", // PlanSentry Growth $19/mo
  price_1UZZ3oLoEh09m2mcDKSem4SN: "business", // PlanSentry Business $49/mo
  price_1U4RaDELIgx07EKQcQhv6yWu: "pro", // Pro monthly $5
  price_1U4RaLELIgx07EKQhUENC8sp: "pro", // Pro annual $29
  // Retired prices, retained so existing customers keep their entitlement.
  price_1U2u56ELIgx07EKQwjeDj2Bd: "pro",
  price_1U3InhELIgx07EKQoNmA1xtR: "pro",
  price_1U3IjqELIgx07EKQo0g2tjjN: "pro",
  price_1U2u5FELIgx07EKQimxeU1nD: "pro",
  price_1U3fceELIgx07EKQ0n2sElNS: "pro",
  price_1U3fclELIgx07EKQrCESMctQ: "pro",
  price_1U49nuELIgx07EKQQdDVPKlb: "pro",
};

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

// A v4 UUID with dashes, which is what Supabase auth.users.id looks like.
// client_reference_id is only trusted as a user_id match if it looks like one.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (priceId && PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  return "free";
}

function paidPlan(status: string, priceId: string | null, metadata: Record<string, unknown> | null | undefined) {
  return PAID_STATUSES.has(status) ? planFor(priceId, metadata) : "free";
}

// Prefer a hard match on user_id (from Stripe's client_reference_id, threaded
// through at checkout) over the previous email ilike match, which is fuzzy
// and silently does nothing if the checkout email differs from the account
// email. user_id match is attempted first and, if it hits, short-circuits
// the email fallback so we never patch two different accounts for one event.
async function syncUserAccounts(entitlement: Record<string, unknown>, userId?: string | null, allowEmailFallback = true) {
  if (userId && UUID_RE.test(userId)) {
    const matched = await update(
      "user_accounts",
      `user_id=eq.${encodeURIComponent(userId)}`,
      entitlement,
    );
    if (Array.isArray(matched) && matched.length) return;
  }
  if (entitlement.stripe_customer_id) {
    const matched = await update(
      "user_accounts",
      `stripe_customer_id=eq.${encodeURIComponent(String(entitlement.stripe_customer_id))}`,
      entitlement,
    );
    if (Array.isArray(matched) && matched.length) return;
  }
  if (allowEmailFallback && entitlement.email) {
    await update(
      "user_accounts",
      `email=ilike.${encodeURIComponent(String(entitlement.email))}`,
      entitlement,
    );
  }
}

async function putEntitlement(data: Record<string, unknown>, userId?: string | null, allowEmailFallback = true) {
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
  }, userId, allowEmailFallback);
  return saved;
}

async function updatePaymentStatus(customerId: string, status: string, allowEmailFallback = true) {
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
  }, null, allowEmailFallback);
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

    const config = (await select("stripe_webhook_config?select=signing_secret,plansentry_signing_secret,plansentry_sandbox_signing_secret&limit=1"))[0];
    const signingSecrets = [
      { secret: config?.signing_secret, legacy: true, sandbox: false },
      { secret: config?.plansentry_signing_secret, legacy: false, sandbox: false },
      { secret: config?.plansentry_sandbox_signing_secret, legacy: false, sandbox: true },
    ].filter((entry): entry is { secret: string; legacy: boolean; sandbox: boolean } =>
      typeof entry.secret === "string" && entry.secret.length > 0);
    if (!signingSecrets.length) return json({ error: "Webhook secret not configured" }, 503);
    if (!/^[0-9]+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return json({ error: "Stale Stripe signature" }, 400);
    }

    const expected = await Promise.all(signingSecrets.map(async (entry) => ({
      ...entry, digest: await hmac(entry.secret, `${timestamp}.${rawBody}`),
    })));
    const matched = expected.find((entry) =>
      signatures.some((signature: string) => safeEqual(signature, entry.digest)));
    if (!matched) {
      return json({ error: "Invalid Stripe signature" }, 400);
    }
    const event = JSON.parse(rawBody);
    if (matched.sandbox) {
      if (event.livemode !== false) return json({ error: "Sandbox signature requires a sandbox event" }, 400);
      return json({ received: true, sandbox: true });
    }
    if (event.livemode === false) return json({ error: "Sandbox event requires sandbox signature" }, 400);
    const allowEmailFallback = matched.legacy;
    const object = event.data?.object || {};

    if (["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"].includes(event.type)) {
      if (typeof event.id !== "string" || !event.id.startsWith("evt_") || !Number.isFinite(event.created)) {
        return json({ error: "Invalid risk event" }, 400);
      }
      const charge = event.type === "charge.refunded" ? object : object.charge;
      await upsert("billing_risk_events", {
        event_id: event.id,
        event_type: event.type,
        stripe_customer_id: typeof object.customer === "string" ? object.customer : null,
        stripe_charge_id: typeof charge === "string" ? charge : charge?.id || null,
        stripe_payment_intent_id: typeof object.payment_intent === "string" ? object.payment_intent : null,
        stripe_invoice_id: typeof object.invoice === "string" ? object.invoice : null,
        event_created_at: new Date(event.created * 1000).toISOString(),
      }, "event_id");
      return json({ received: true });
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
      const email = object.customer_details?.email || object.customer_email || null;
      const clientReferenceId = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
      if (customerId) {
        const existing = (await select(`stripe_entitlements?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`))[0];
        if (existing) {
          // Subscription events can arrive before checkout completion. Never downgrade
          // an already-verified subscription when the checkout event arrives later.
          await syncUserAccounts({
            stripe_customer_id: customerId,
            stripe_subscription_id: existing.stripe_subscription_id || subscriptionId,
            stripe_price_id: existing.stripe_price_id,
            plan: existing.plan,
            subscription_status: existing.subscription_status,
            current_period_end: existing.current_period_end,
            email: existing.email || email,
          }, clientReferenceId, allowEmailFallback);
        } else {
          await putEntitlement({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            email,
            plan: "free",
            subscription_status: "pending",
          }, clientReferenceId, allowEmailFallback);
        }
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      const priceId = object.items?.data?.[0]?.price?.id || null;
      const status = String(object.status || "");
      const periodEnd = object.current_period_end || object.items?.data?.[0]?.current_period_end;
      const currentPeriodEnd = periodEnd
        ? new Date(Number(periodEnd) * 1000).toISOString()
        : null;
      const existing = customerId
        ? (await select(`stripe_entitlements?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=email,stripe_subscription_id,subscription_status&limit=1`))[0]
        : null;
      if (customerId) {
        // Stripe can deliver events out of order. A canceled subscription cannot
        // become active again, and an old subscription's deletion must not
        // revoke access from a newer subscription on the same customer.
        if (existing?.stripe_subscription_id === object.id &&
          existing.subscription_status === "canceled" && status !== "canceled") {
          return json({ received: true });
        }
        if (status === "canceled" && existing?.stripe_subscription_id &&
          existing.stripe_subscription_id !== object.id) {
          return json({ received: true });
        }
        await putEntitlement({
          stripe_customer_id: customerId,
          stripe_subscription_id: object.id,
          email: existing?.email || null,
          stripe_price_id: priceId,
          plan: paidPlan(status, priceId, object.metadata),
          subscription_status: status,
          current_period_end: currentPeriodEnd,
        }, null, allowEmailFallback);
      }
    } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      if (customerId) {
        await updatePaymentStatus(customerId, event.type === "invoice.paid" ? "active" : "past_due", allowEmailFallback);
      }
    }

    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
