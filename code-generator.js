// --- String escapers for emitted code ---
// Python single-quoted: backslash first, then quote, then control chars.
// Order matters: backslash MUST be escaped before any other char that contains
// a backslash, otherwise we'd double-escape the substitutions we just inserted.
function escapePythonSingleQuoted(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

// POSIX shell single-quoted: single quotes can't be escaped inside, so we
// close the quote, insert an escaped quote, and reopen: ' -> '\''
function escapeShellSingleQuoted(s) {
  return String(s).replace(/'/g, "'\\''");
}

function filterHeaders(headers, skipList) {
  const skip = new Set(skipList);
  const result = {};
  Object.entries(headers).forEach(([k, v]) => {
    if (!skip.has(k.toLowerCase())) result[k] = v;
  });
  return result;
}

function lowerHeaderMap(headers) {
  const map = {};
  Object.entries(headers).forEach(([k, v]) => { map[k.toLowerCase()] = v; });
  return map;
}

function stringifyBody(body) {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function dedupeByEndpoint(requests) {
  const seen = new Map();
  requests.forEach(req => {
    const endpoint = req.endpoint_pattern;
    const method = (req.method || 'GET').toUpperCase();
    const key = `${method} ${endpoint}`;
    if (!seen.has(key)) seen.set(key, req);
  });
  return Array.from(seen.values());
}

function appendParamDocs(codeLines, label, params) {
  if (!params || Object.keys(params).length === 0) return;
  codeLines.push('        ');
  codeLines.push(`        ${label}`);
  Object.entries(params).forEach(([param, info]) => {
    const required = info.required ? '(required)' : '(optional)';
    const example = info.examples && info.examples[0] ? info.examples[0] : 'N/A';
    codeLines.push(`        - ${param} ${required}: ${info.type} - Example: ${example}`);
  });
}

// Endpoint patterns carry typed placeholders ({id}, {uuid}, {date}, {hex},
// {token}) produced by APIAnalyzer.extractEndpointPattern. These helpers turn
// a pattern back into a Python f-string with one named parameter per
// placeholder, so generated scraper methods read like hand-written clients.
const PLACEHOLDER_RE = /\{(id|uuid|date|hex|token)\}/g;

// "https://x/api/users/{id}/items/{id}" ->
//   { fstring: "https://x/api/users/{id}/items/{id_2}", params: ["id", "id_2"] }
// Repeated placeholder names are suffixed; literal braces are escaped ({{ }}).
function buildPathFString(endpointPattern) {
  const params = [];
  const used = new Map();
  let out = '';
  let last = 0;
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(endpointPattern)) !== null) {
    out += endpointPattern.slice(last, m.index).replace(/\{/g, '{{').replace(/\}/g, '}}');
    const baseName = m[1];
    const n = (used.get(baseName) || 0) + 1;
    used.set(baseName, n);
    const name = n === 1 ? baseName : `${baseName}_${n}`;
    params.push(name);
    out += `{${name}}`;
    last = PLACEHOLDER_RE.lastIndex;
  }
  out += endpointPattern.slice(last).replace(/\{/g, '{{').replace(/\}/g, '}}');
  return { fstring: out, params };
}

// Recover concrete values for the path placeholders from one real URL, so the
// __main__ demo call is actually runnable (e.g. get_users(id="123")).
function recoverPathExamples(realUrl, endpointPattern) {
  try {
    const base = endpointPattern.split('?')[0];
    const rx = base
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{(?:id|uuid|date|hex|token)\\\}/g, '([^/]+)');
    const m = (realUrl || '').split('?')[0].match(new RegExp('^' + rx + '$'));
    return m ? m.slice(1) : [];
  } catch (_) {
    return [];
  }
}

function toPyIdent(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  return cleaned || '_';
}

const CodeGenerator = {
  generatePythonRequestsCode(requests) {
    return dedupeByEndpoint(requests).map(req => {
      const url = req.url || '';
      const method = (req.method || 'GET').toLowerCase();
      const headers = req.headers || {};
      const postData = req.request_body || '';
      const parsedData = req.parsed_data || {};

      const filteredHeaders = filterHeaders(headers, ['host', 'content-length', 'connection']);

      const codeLines = [
        'import requests\n',
        `url = '${escapePythonSingleQuoted(url)}'\n`
      ];

      if (Object.keys(filteredHeaders).length > 0) {
        codeLines.push('headers = {');
        Object.entries(filteredHeaders).forEach(([k, v]) => {
          codeLines.push(`    '${escapePythonSingleQuoted(k)}': '${escapePythonSingleQuoted(v)}',`);
        });
        codeLines.push('}\n');
      }

      const isWriteMethod = ['post', 'put', 'patch'].includes(method);
      let requestLine;

      if (postData && isWriteMethod) {
        if (parsedData.json_data) {
          codeLines.push('json_data = ' + JSON.stringify(parsedData.json_data, null, 4) + '\n');
          requestLine = `response = requests.${method}(url, headers=headers, json=json_data)`;
        } else if (parsedData.form_data) {
          codeLines.push('data = ' + JSON.stringify(parsedData.form_data, null, 4) + '\n');
          requestLine = `response = requests.${method}(url, headers=headers, data=data)`;
        } else {
          // Use a normal single-quoted string (escaped) instead of triple-quoted
          // so multi-line bodies and stray quotes can't break the literal.
          codeLines.push(`data = '${escapePythonSingleQuoted(stringifyBody(postData))}'\n`);
          requestLine = `response = requests.${method}(url, headers=headers, data=data)`;
        }
      } else if (parsedData.url_params && Object.keys(parsedData.url_params).length > 0) {
        codeLines.push('params = ' + JSON.stringify(parsedData.url_params, null, 4) + '\n');
        requestLine = `response = requests.${method}(url, headers=headers, params=params)`;
      } else {
        requestLine = `response = requests.${method}(url, headers=headers)`;
      }

      codeLines.push(requestLine);
      codeLines.push("print(f'Status: {response.status_code}')");
      codeLines.push("print(f'Response body: {response.text}')");

      return {
        url,
        method: method.toUpperCase(),
        python_code: codeLines.join('\n'),
        timestamp: req.timestamp,
        endpoint_pattern: req.endpoint_pattern
      };
    });
  },

  generateCurlCommands(requests) {
    return dedupeByEndpoint(requests).map(req => {
      const url = req.url || '';
      const method = req.method || 'GET';
      const postData = req.request_body || '';
      const filteredHeaders = filterHeaders(req.headers || {}, ['host', 'content-length']);

      let curlCmd = `curl '${escapeShellSingleQuoted(url)}' \\\n  -X '${escapeShellSingleQuoted(method)}'`;
      Object.entries(filteredHeaders).forEach(([headerName, headerValue]) => {
        curlCmd += ` \\\n  -H '${escapeShellSingleQuoted(`${headerName}: ${headerValue}`)}'`;
      });

      if (postData && ['POST', 'PUT', 'PATCH'].includes(method)) {
        curlCmd += ` \\\n  -d '${escapeShellSingleQuoted(stringifyBody(postData))}'`;
      }

      return { url, method, curl_command: curlCmd, timestamp: req.timestamp };
    });
  },

  // Generates a complete, runnable scraper class. Each unique endpoint becomes
  // one method whose signature exposes the real parameters discovered from
  // traffic: path placeholders become positional args interpolated into an
  // f-string URL, and JSON body fields become keyword-only args assembled into
  // the payload. This is what the README's headline example shows.
  generateCompleteScraper(requests, scraperName = 'auto_scraper', paramAnalysis = null, authInfo = null) {
    if (!requests || requests.length === 0) return '';

    const className = this.toPascalCase(scraperName);
    const commonHeaders = this.extractCommonHeaders(requests);
    const headersLiteral = JSON.stringify(commonHeaders, null, 12).replace(/\n/g, '\n        ');

    const codeLines = [
      '"""',
      `Auto-generated scraper - ${scraperName}`,
      `Generated: ${new Date().toISOString()}`,
      '"""',
      '',
      'import requests',
      'import json',
      'from typing import Any, Dict',
      '',
      '',
      `class ${className}:`,
      '    """Auto-generated API scraper. One method per discovered endpoint."""',
      '',
      '    def __init__(self):',
      '        self.session = requests.Session()',
      '        self.base_headers = ' + headersLiteral,
      '        self.session.headers.update(self.base_headers)'
    ];

    if (authInfo) {
      // Newlines in authInfo would break out of the comment; collapse them.
      codeLines.push(`        # Auth: ${String(authInfo).replace(/[\r\n]+/g, ' ')}`);
    }
    codeLines.push('');

    const uniqueEndpoints = dedupeByEndpoint(requests);
    const usedMethodNames = new Set();
    const demoCalls = [];

    uniqueEndpoints.forEach(req => {
      const endpoint = req.endpoint_pattern || req.url || '';
      const httpMethod = (req.method || 'GET').toLowerCase();

      let methodName = this.generateMethodName(endpoint, httpMethod);
      if (usedMethodNames.has(methodName)) {
        let i = 2;
        while (usedMethodNames.has(`${methodName}_${i}`)) i++;
        methodName = `${methodName}_${i}`;
      }
      usedMethodNames.add(methodName);

      const { fstring, params } = buildPathFString(endpoint);
      const pathParams = params.map(toPyIdent);

      const isWriteMethod = ['post', 'put', 'patch'].includes(httpMethod);
      const paramsInfo = paramAnalysis && paramAnalysis[endpoint];

      // Keyword-only body params for write methods that send JSON. Required
      // fields come first; anything colliding with a path param is dropped.
      // Keep the original JSON key (sent on the wire) alongside the Python
      // identifier (used in the signature) — they differ for keys like "user-id".
      let bodyParams = [];
      if (isWriteMethod && paramsInfo && paramsInfo.json_params) {
        const entries = Object.entries(paramsInfo.json_params);
        entries.sort((a, b) => (b[1].required === true) - (a[1].required === true));
        const seen = new Set();
        entries.forEach(([origKey]) => {
          const pyName = toPyIdent(origKey);
          if (seen.has(pyName) || pathParams.includes(pyName)) return;
          seen.add(pyName);
          bodyParams.push({ pyName, origKey });
        });
      }

      // Signature: self, <path params>, *, <body params>, **kwargs
      const sigParts = ['self', ...pathParams];
      if (bodyParams.length > 0) sigParts.push('*', ...bodyParams.map(b => b.pyName));
      sigParts.push('**kwargs');
      codeLines.push(`    def ${methodName}(${sigParts.join(', ')}) -> Dict[str, Any]:`);

      codeLines.push('        """');
      codeLines.push(`        ${httpMethod.toUpperCase()} ${endpoint}`);
      if (paramsInfo) {
        appendParamDocs(codeLines, 'Path / URL params:', paramsInfo.url_params);
        appendParamDocs(codeLines, 'JSON body params:', paramsInfo.json_params);
      }
      codeLines.push('        """');

      if (pathParams.length > 0) {
        codeLines.push(`        url = f'${escapePythonSingleQuoted(fstring)}'`);
      } else {
        codeLines.push(`        url = '${escapePythonSingleQuoted(endpoint)}'`);
      }

      codeLines.push('        try:');
      if (isWriteMethod && bodyParams.length > 0) {
        const payloadItems = bodyParams
          .map(b => `'${escapePythonSingleQuoted(b.origKey)}': ${b.pyName}`)
          .join(', ');
        codeLines.push(`            payload = {${payloadItems}, **kwargs}`);
        codeLines.push(`            response = self.session.${httpMethod}(url, json=payload, timeout=30)`);
      } else if (isWriteMethod) {
        codeLines.push('            payload = kwargs.get("json", kwargs)');
        codeLines.push(`            response = self.session.${httpMethod}(url, json=payload, timeout=30)`);
      } else {
        codeLines.push('            params = kwargs.get("params", {})');
        codeLines.push(`            response = self.session.${httpMethod}(url, params=params, timeout=30)`);
      }
      codeLines.push('            response.raise_for_status()');
      codeLines.push('            ctype = response.headers.get("content-type", "")');
      codeLines.push('            return response.json() if ctype.startswith("application/json") else {"text": response.text}');
      codeLines.push('        except requests.exceptions.RequestException as e:');
      codeLines.push('            print(f"Request failed: {e}")');
      codeLines.push('            return {}');
      codeLines.push('');

      const vals = recoverPathExamples(req.url, endpoint);
      const demoArgs = pathParams.map((p, i) =>
        `${p}=${JSON.stringify(vals[i] != null ? vals[i] : 'EXAMPLE')}`);
      demoCalls.push(`scraper.${methodName}(${demoArgs.join(', ')})`);
    });

    codeLines.push('');
    codeLines.push('if __name__ == "__main__":');
    codeLines.push(`    scraper = ${className}()`);
    if (demoCalls.length > 0) {
      codeLines.push(`    result = ${demoCalls[0]}`);
      codeLines.push('    print(json.dumps(result, indent=2, ensure_ascii=False))');
    }

    return codeLines.join('\n');
  },

  extractCommonHeaders(requests) {
    if (!requests || requests.length === 0) return {};

    const allHeaders = requests.map(req => req.headers || {});
    const candidate = filterHeaders(allHeaders[0], ['host', 'content-length', 'connection', 'cookie']);
    const commonHeaders = {};

    Object.entries(candidate).forEach(([key, value]) => {
      if (allHeaders.every(h => key in h)) commonHeaders[key] = value;
    });

    return commonHeaders;
  },

  extractAuthInfo(requests) {
    const authMethods = new Set();

    requests.forEach(req => {
      const lowerHeaders = lowerHeaderMap(req.headers || {});

      const authValue = lowerHeaders['authorization'];
      if (authValue) {
        if (authValue.startsWith('Bearer')) authMethods.add('Bearer Token');
        else if (authValue.startsWith('Basic')) authMethods.add('Basic Auth');
        else authMethods.add('Custom Authorization');
      }

      if (lowerHeaders['cookie']) authMethods.add('Cookie');
      if (lowerHeaders['x-csrf-token'] || lowerHeaders['x-xsrf-token']) authMethods.add('CSRF Token');
      if (lowerHeaders['x-api-key']) authMethods.add('API Key');
    });

    return authMethods.size > 0 ? Array.from(authMethods).join(', ') : null;
  },

  generateMethodName(endpoint, method) {
    // Strip scheme+host so method names derive from the path, not the domain
    // ("https://x.com/api/users/{id}" -> "get_users", not "get_x_com_users").
    const pathOnly = String(endpoint).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
    const meaningfulParts = pathOnly.split('/').filter(p =>
      p && !p.startsWith('{') && !['api', 'v1', 'v2', 'v3'].includes(p)
    );

    const base = meaningfulParts.length > 0 ? meaningfulParts.slice(-2).join('_') : 'api_call';
    const name = base.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
    return `${method}_${name}`;
  },

  toPascalCase(str) {
    return str
      .replace(/[^a-zA-Z0-9]/g, '_')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  },

  exportPostmanCollection(requests, collectionName = 'API Collection') {
    return {
      info: {
        name: collectionName,
        description: `API collection generated on ${new Date().toISOString()}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: requests.map(req => {
        const url = req.url || '';
        const method = req.method || 'GET';
        const headers = req.headers || {};
        const postData = req.request_body || '';

        const item = {
          name: `${method} ${url.split('/').pop() || 'request'}`,
          request: {
            method,
            header: Object.entries(headers).map(([k, v]) => ({ key: k, value: v })),
            url: {
              raw: url,
              protocol: url.startsWith('https') ? 'https' : 'http',
              host: this.extractHost(url),
              path: this.extractPath(url)
            }
          }
        };

        if (postData && ['POST', 'PUT', 'PATCH'].includes(method)) {
          item.request.body = {
            mode: 'raw',
            raw: stringifyBody(postData),
            options: { raw: { language: 'json' } }
          };
        }

        return item;
      })
    };
  },

  extractHost(url) {
    try { return new URL(url).hostname.split('.'); } catch (e) { return []; }
  },

  extractPath(url) {
    try { return new URL(url).pathname.split('/').filter(p => p); } catch (e) { return []; }
  }
};

// Guarded export for the Node test harness. In the service-worker / content-
// script runtime `module` is undefined, so this is a no-op there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CodeGenerator, buildPathFString, recoverPathExamples, toPyIdent };
}
