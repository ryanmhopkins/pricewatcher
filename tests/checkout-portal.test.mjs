import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function loadHandler(file, fetch, env) {
  let handler;
  const source = readFileSync(new URL(`../supabase/functions/${file}/index.ts`, import.meta.url), 'utf8')
    .replace(/^import "jsr:[^\n]+\n/, '');
  vm.runInNewContext(stripTypeScriptTypes(source), {
    Deno: { env: { get: (name) => env[name] }, serve: (fn) => { handler = fn; } },
    fetch, Response, Request, URL, URLSearchParams, Object, String, Date,
  });
  return handler;
}
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service',
  STRIPE_PLANSENTRY_SECRET_KEY: 'test-new-key',
  STRIPE_SECRET_KEY: 'test-legacy-key',
};
let account = { plan: 'free', subscription_status: null, stripe_customer_id: null, stripe_price_id: null };
let stripeAccountId = 'acct_1UZYXlLoEh09m2mc';
let checkoutCalls = 0;
const checkoutFetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  if (path === '/auth/v1/user') return Response.json({ id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test' });
  if (path === '/rest/v1/user_accounts') return Response.json([account]);
  if (path === '/v1/account') return Response.json({ id: stripeAccountId });
  if (path === '/v1/checkout/sessions') {
    checkoutCalls++;
    assert.equal(init.headers.Authorization, 'Bearer test-new-key');
    assert.equal(new URLSearchParams(init.body).get('line_items[0][price]'), 'price_1UZZ3lLoEh09m2mcjIg1nsEZ');
    return Response.json({ url: 'https://checkout.stripe.com/test-session' });
  }
  throw new Error(`Unexpected checkout request ${url}`);
};
const checkout = loadHandler('plansentry-checkout', checkoutFetch, env);
const checkoutRequest = (authorization = 'Bearer test-token') => new Request('https://example.test', {
  method: 'POST', headers: { authorization }, body: JSON.stringify({ plan: 'growth' }),
});
assert.equal((await checkout(checkoutRequest(''))).status, 401);
assert.equal((await checkout(checkoutRequest())).status, 200);
assert.equal(checkoutCalls, 1);
account = { ...account, plan: 'pro', subscription_status: 'active' };
assert.equal((await checkout(checkoutRequest())).status, 409, 'legacy paid subscriber cannot start a duplicate subscription');
assert.equal(checkoutCalls, 1);
account = { ...account, plan: 'free', subscription_status: null };
stripeAccountId = 'acct_wrong';
assert.equal((await checkout(checkoutRequest())).status, 503, 'wrong Stripe account cannot start checkout');
assert.equal(checkoutCalls, 1);

let portalKey = '';
let portalAccount = { stripe_customer_id: 'cus_test', stripe_price_id: 'price_1UZZ3lLoEh09m2mcjIg1nsEZ' };
const portalFetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  if (path === '/auth/v1/user') return Response.json({ id: '11111111-1111-4111-8111-111111111111' });
  if (path === '/rest/v1/user_accounts') return Response.json([portalAccount]);
  if (path === '/v1/billing_portal/sessions') {
    portalKey = init.headers.Authorization;
    return Response.json({ url: 'https://billing.stripe.com/test-session' });
  }
  throw new Error(`Unexpected portal request ${url}`);
};
const portal = loadHandler('pricewatcher-billing-portal', portalFetch, env);
const portalRequest = () => new Request('https://example.test', { method: 'POST', body: JSON.stringify({ access_token: 'test-token' }) });
assert.equal((await portal(portalRequest())).status, 200);
assert.equal(portalKey, 'Bearer test-new-key');
portalAccount = { stripe_customer_id: 'cus_legacy', stripe_price_id: 'price_1U4RaDELIgx07EKQcQhv6yWu' };
assert.equal((await portal(portalRequest())).status, 200);
assert.equal(portalKey, 'Bearer test-legacy-key');
console.log('Checkout and portal routing tests passed');
