'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { APIAnalyzer } = require('../analyzer.js');

test('extractEndpointPattern collapses numeric ids', () => {
  assert.strictEqual(
    APIAnalyzer.extractEndpointPattern('https://x.com/api/users/123'),
    'https://x.com/api/users/{id}'
  );
  assert.strictEqual(
    APIAnalyzer.extractEndpointPattern('https://x.com/api/users/123?expand=1'),
    'https://x.com/api/users/{id}'
  );
});

test('extractEndpointPattern recognises uuid and date', () => {
  assert.strictEqual(
    APIAnalyzer.extractEndpointPattern('https://x.com/o/550e8400-e29b-41d4-a716-446655440000'),
    'https://x.com/o/{uuid}'
  );
  assert.strictEqual(
    APIAnalyzer.extractEndpointPattern('https://x.com/logs/2024-01-15'),
    'https://x.com/logs/{date}'
  );
});

test('two concrete urls collapse to one pattern', () => {
  const a = APIAnalyzer.extractEndpointPattern('https://x.com/api/users/1');
  const b = APIAnalyzer.extractEndpointPattern('https://x.com/api/users/2');
  assert.strictEqual(a, b);
});

test('analyzeRequestParameters infers required vs optional', () => {
  const requests = [
    { url: 'https://x.com/api/search?q=a&page=1', method: 'GET', headers: {} },
    { url: 'https://x.com/api/search?q=b', method: 'GET', headers: {} }
  ];
  requests.forEach(r => {
    r.endpoint_pattern = APIAnalyzer.extractEndpointPattern(r.url);
    r.parsed_data = APIAnalyzer.parseRequestData(r);
  });
  const pa = APIAnalyzer.analyzeRequestParameters(requests);
  const ep = requests[0].endpoint_pattern;

  // q appears in every request -> required; page only in one -> optional
  assert.strictEqual(pa[ep].url_params.q.required, true);
  assert.strictEqual(pa[ep].url_params.page.required, false);
});

test('parseRequestData parses JSON bodies', () => {
  const req = {
    url: 'https://x.com/api/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    request_body: '{"customer_id":7,"items":[1,2]}'
  };
  const parsed = APIAnalyzer.parseRequestData(req);
  assert.deepStrictEqual(parsed.json_data, { customer_id: 7, items: [1, 2] });
});
