import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/pricewatcher-monitor-create/index.ts', import.meta.url), 'utf8')
  .replace(/^import "jsr:[^\n]+\n/, '');
let handler;
let plan = 'free';
let count = 0;
const fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth/v1/user')) return Response.json({ id: '11111111-1111-4111-8111-111111111111' });
  if (path.endsWith('/rest/v1/user_accounts')) return Response.json([{ plan }]);
  if (path.endsWith('/rest/v1/monitors') && options.method === 'POST') return Response.json([{ id: 'monitor-test' }]);
  if (path.endsWith('/rest/v1/monitors')) return Response.json(Array.from({ length: count }, (_, id) => ({ id })));
  if (path.endsWith('/functions/v1/pricewatcher-check')) return Response.json({ ok: true });
  throw new Error(`Unexpected URL ${url}`);
};
vm.runInNewContext(stripTypeScriptTypes(source), {
  Deno: { env: { get: (name) => name === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'test' }, serve: (fn) => { handler = fn; } },
  fetch, Response, Request, URL, Set, Date,
});
async function create(selectedPlan, existingCount) {
  plan = selectedPlan;
  count = existingCount;
  return handler(new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test', url: 'https://example.com/pricing', access_token: 'test' }),
  }));
}
for (const [selectedPlan, limit] of [['free', 3], ['growth', 25], ['business', 100]]) {
  const allowed = await create(selectedPlan, limit - 1);
  assert.equal(allowed.status, 201, `${selectedPlan} should allow monitor ${limit}: ${await allowed.text()}`);
  assert.equal((await create(selectedPlan, limit)).status, 402, `${selectedPlan} should stop at ${limit}`);
}
assert.equal((await create('pro', 101)).status, 201, 'legacy Pro remains unlimited');
console.log('Monitor limit tests passed');
