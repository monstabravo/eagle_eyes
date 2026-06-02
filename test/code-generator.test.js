'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { APIAnalyzer } = require('../analyzer.js');
const {
  CodeGenerator,
  buildPathFString,
  recoverPathExamples,
  toPyIdent
} = require('../code-generator.js');

test('buildPathFString names placeholders and escapes literal braces', () => {
  const { fstring, params } = buildPathFString('https://x.com/api/users/{id}/items/{id}');
  assert.deepStrictEqual(params, ['id', 'id_2']);
  assert.strictEqual(fstring, 'https://x.com/api/users/{id}/items/{id_2}');
});

test('recoverPathExamples pulls concrete values back out', () => {
  const vals = recoverPathExamples(
    'https://x.com/api/users/123',
    'https://x.com/api/users/{id}'
  );
  assert.deepStrictEqual(vals, ['123']);
});

test('toPyIdent sanitises non-identifier keys', () => {
  assert.strictEqual(toPyIdent('user-id'), 'user_id');
  assert.strictEqual(toPyIdent('2fa'), '_2fa');
});

function buildRequests() {
  const requests = [
    { url: 'https://example.com/api/users/123', method: 'GET', headers: {} },
    { url: 'https://example.com/api/users/456', method: 'GET', headers: {} },
    {
      url: 'https://example.com/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      request_body: '{"customer_id":1,"items":[1,2]}'
    }
  ];
  requests.forEach(r => {
    r.endpoint_pattern = APIAnalyzer.extractEndpointPattern(r.url);
    r.parsed_data = APIAnalyzer.parseRequestData(r);
  });
  return requests;
}

test('GET endpoint becomes a method with a named path param and f-string URL', () => {
  const requests = buildRequests();
  const pa = APIAnalyzer.analyzeRequestParameters(requests);
  const code = CodeGenerator.generateCompleteScraper(requests, 'eagle_eyes_scraper', pa, null);

  assert.match(code, /def get_users\(self, id, \*\*kwargs\)/);
  assert.match(code, /url = f'https:\/\/example\.com\/api\/users\/\{id\}'/);
});

test('POST endpoint exposes JSON body fields as keyword-only params', () => {
  const requests = buildRequests();
  const pa = APIAnalyzer.analyzeRequestParameters(requests);
  const code = CodeGenerator.generateCompleteScraper(requests, 'eagle_eyes_scraper', pa, null);

  assert.match(code, /def post_orders\(self, \*, customer_id, items, \*\*kwargs\)/);
  assert.match(code, /payload = \{'customer_id': customer_id, 'items': items, \*\*kwargs\}/);
});

test('__main__ demo call passes the recovered example value', () => {
  const requests = buildRequests();
  const pa = APIAnalyzer.analyzeRequestParameters(requests);
  const code = CodeGenerator.generateCompleteScraper(requests, 'eagle_eyes_scraper', pa, null);

  // first endpoint is GET /api/users/{id}; recovered example is "123"
  assert.match(code, /scraper\.get_users\(id="123"\)/);
});

test('generated scraper is valid (balanced) Python-ish output, no **kwargs duplication', () => {
  const requests = buildRequests();
  const pa = APIAnalyzer.analyzeRequestParameters(requests);
  const code = CodeGenerator.generateCompleteScraper(requests, 'eagle_eyes_scraper', pa, null);

  assert.ok(code.includes('import requests'));
  assert.ok(code.includes('class EagleEyesScraper:'));
  assert.ok(code.includes('response.raise_for_status()'));
  // no leftover **kwargs placeholder bug
  assert.ok(!/\*\*kwargs, \*\*kwargs/.test(code));
});
