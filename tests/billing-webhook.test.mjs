import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/pricewatcher-stripe-webhook/index.ts', import.meta.url), 'utf8')
  .replace(/^import "jsr:[^\n]+\n/, '');
const tables = {
  stripe_webhook_config: [{ signing_secret: 'legacy-test-secret', plansentry_signing_secret: 'new-test-secret' }],
  stripe_entitlements: [],
  user_accounts: [{ user_id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', plan: 'free' }],
};
let handler;
const fetch = async (url, init = {}) => {
  const parsed = new URL(url);
  const table = parsed.pathname.split('/').at(-1);
  const rows = tables[table];
  assert.ok(rows, `Unexpected table ${table}`);
  const query = parsed.searchParams;
  const match = (row) => [...query].every(([key, value]) => {
    if (!['stripe_customer_id', 'user_id', 'email'].includes(key)) return true;
    const [op, expected] = value.split('.', 2);
    return op === 'ilike'
      ? String(row[key] || '').toLowerCase() === expected.toLowerCase()
      : row[key] === expected;
  });
  if (!init.method || init.method === 'GET') return Response.json(rows.filter(match));
  if (init.method === 'POST') {
    const input = JSON.parse(init.body);
    const existing = rows.find((row) => row.stripe_customer_id === input.stripe_customer_id);
    if (existing) Object.assign(existing, input);
    else rows.push(input);
    return Response.json([existing || input]);
  }
  if (init.method === 'PATCH') {
    const found = rows.filter(match);
    found.forEach((row) => Object.assign(row, JSON.parse(init.body)));
    return Response.json(found);
  }
  throw new Error(`Unexpected method ${init.method}`);
};
const context = {
  Deno: { env: { get: (name) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' })[name] }, serve: (fn) => { handler = fn; } },
  fetch, Response, Request, URL, TextEncoder, crypto: webcrypto, Date, console,
};
vm.runInNewContext(stripTypeScriptTypes(source), context);

async function deliver(type, object, secret = 'new-test-secret') {
  const body = JSON.stringify({ id: `evt_${type}`, type, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return handler(new Request('https://example.supabase.co/functions/v1/pricewatcher-stripe-webhook', {
    method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${digest}` }, body,
  }));
}
const customer = 'cus_new_test';
const user = tables.user_accounts[0];
const checkout = { customer, subscription: 'sub_new', client_reference_id: user.user_id, customer_details: { email: user.email }, metadata: { plan: 'business' } };
assert.equal((await deliver('checkout.session.completed', checkout)).status, 200);
assert.equal(user.plan, 'free', 'checkout metadata cannot grant a paid plan');
const subscription = { id: 'sub_new', customer, status: 'active', items: { data: [{ price: { id: 'price_1UZZ3lLoEh09m2mcjIg1nsEZ' }, current_period_end: 2000000000 }] } };
assert.equal((await deliver('customer.subscription.created', subscription)).status, 200);
assert.equal(user.plan, 'growth');
assert.ok(user.current_period_end, 'item-level period end is recorded');
assert.equal((await deliver('checkout.session.completed', checkout)).status, 200);
assert.equal(user.plan, 'growth', 'late checkout cannot downgrade an entitlement');
subscription.items.data[0].price.id = 'price_1UZZ3oLoEh09m2mcDKSem4SN';
assert.equal((await deliver('customer.subscription.updated', subscription)).status, 200);
assert.equal(user.plan, 'business');
subscription.status = 'canceled';
assert.equal((await deliver('customer.subscription.deleted', subscription)).status, 200);
assert.equal(user.plan, 'free');
subscription.status = 'active';
subscription.items.data[0].price.id = 'price_unknown';
assert.equal((await deliver('customer.subscription.updated', subscription)).status, 200);
assert.equal(user.plan, 'free', 'unrecognized prices cannot grant paid access');
const legacy = { ...subscription, id: 'sub_legacy', customer: 'cus_legacy', items: { data: [{ price: { id: 'price_1U4RaDELIgx07EKQcQhv6yWu' } }] } };
assert.equal((await deliver('customer.subscription.created', legacy, 'legacy-test-secret')).status, 200);
assert.equal(tables.stripe_entitlements.find((row) => row.stripe_customer_id === 'cus_legacy').plan, 'pro');
assert.equal((await deliver('customer.subscription.created', legacy, 'wrong-secret')).status, 400);
console.log('Billing webhook lifecycle tests passed');
