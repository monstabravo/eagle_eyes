const APIAnalyzer = {
  extractEndpointPattern(url) {
    let pattern = url.split('?')[0];
    pattern = pattern.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/{uuid}');
    pattern = pattern.replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, '/{date}');
    pattern = pattern.replace(/\/\d+(?=\/|$)/g, '/{id}');
    pattern = pattern.replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, '/{hex}');
    pattern = pattern.replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/{token}');
    return pattern;
  },

  getHeader(headers, name) {
    if (!headers) return '';
    const lower = name.toLowerCase();
    const key = Object.keys(headers).find(h => h.toLowerCase() === lower);
    return key ? (headers[key] || '') : '';
  },

  parseRequestData(request) {
    const parsed = {
      url_params: {},
      post_params: {},
      json_data: null,
      form_data: null
    };

    if (request.url && request.url.includes('?')) {
      try {
        new URL(request.url).searchParams.forEach((value, key) => {
          parsed.url_params[key] = value;
        });
      } catch (e) {}
    }

    const postData = request.request_body;
    if (postData) {
      const contentType = this.getHeader(request.headers, 'Content-Type');

      if (contentType.includes('application/json')) {
        try {
          parsed.json_data = typeof postData === 'string' ? JSON.parse(postData) : postData;
        } catch (e) {}
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          new URLSearchParams(postData).forEach((value, key) => {
            parsed.form_data = parsed.form_data || {};
            parsed.form_data[key] = value;
          });
        } catch (e) {}
      }
    }

    return parsed;
  },

  collectParams(target, source, typeFn) {
    if (!source) return;
    Object.entries(source).forEach(([key, value]) => {
      if (!target[key]) {
        target[key] = { type: typeFn(value), examples: [], required: true, count: 0 };
      }
      target[key].examples.push(value);
      target[key].count++;
    });
  },

  analyzeRequestParameters(requests) {
    const paramAnalysis = {};
    const inferType = this.inferType.bind(this);
    const typeofFn = (v) => typeof v;

    requests.forEach(req => {
      const endpoint = req.endpoint_pattern;
      const parsedData = req.parsed_data;

      if (!paramAnalysis[endpoint]) {
        paramAnalysis[endpoint] = { url_params: {}, json_params: {}, form_params: {}, sample_count: 0 };
      }

      const entry = paramAnalysis[endpoint];
      this.collectParams(entry.url_params, parsedData.url_params, typeofFn);
      if (parsedData.json_data && typeof parsedData.json_data === 'object') {
        this.collectParams(entry.json_params, parsedData.json_data, inferType);
      }
      this.collectParams(entry.form_params, parsedData.form_data, typeofFn);
      entry.sample_count++;
    });

    Object.values(paramAnalysis).forEach(data => {
      ['url_params', 'json_params', 'form_params'].forEach(paramType => {
        Object.values(data[paramType]).forEach(info => {
          if (info.count < data.sample_count) info.required = false;
          info.examples = [...new Set(info.examples)].slice(0, 3);
        });
      });
    });

    return paramAnalysis;
  },

  inferType(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
    if (Array.isArray(value)) return 'list';
    if (typeof value === 'object') return 'dict';
    return 'string';
  },

  analyzeResponseStructure(requests) {
    const responseStructures = {};

    requests.forEach(req => {
      const endpoint = req.endpoint_pattern;
      const responseBody = req.response_body;
      if (!responseBody || responseStructures[endpoint]) return;

      try {
        const jsonData = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
        responseStructures[endpoint] = {
          type: 'json',
          structure: this.analyzeJsonStructure(jsonData),
          extraction_paths: this.generateExtractionPaths(jsonData)
        };
      } catch (e) {
        const text = typeof responseBody === 'string' ? responseBody : String(responseBody);
        responseStructures[endpoint] = { type: 'text', sample: text.substring(0, 200) };
      }
    });

    return responseStructures;
  },

  analyzeJsonStructure(data, prefix = '') {
    const structure = {};

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.entries(data).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        structure[key] = { type: this.inferType(value), path };
        if (value && typeof value === 'object') {
          structure[key].children = this.analyzeJsonStructure(value, path);
        }
      });
    } else if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      structure['[array]'] = { type: 'array', item_type: this.inferType(first), path: `${prefix}[0]` };
      if (first && typeof first === 'object') {
        structure['[array]'].children = this.analyzeJsonStructure(first, `${prefix}[0]`);
      }
    }

    return structure;
  },

  generateExtractionPaths(data, prefix = 'data') {
    const paths = [];

    const extract = (obj, pre) => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        Object.entries(obj).forEach(([key, value]) => {
          const path = `${pre}['${key}']`;
          const isObject = value !== null && typeof value === 'object';
          paths.push({
            field: key,
            path,
            type: this.inferType(value),
            sample: isObject ? '...' : String(value).substring(0, 50)
          });
          if (isObject) extract(value, path);
        });
      } else if (Array.isArray(obj) && obj.length > 0) {
        paths.push({ field: '[array]', path: pre, type: 'array', sample: `${obj.length} items` });
        if (obj[0] && typeof obj[0] === 'object') extract(obj[0], `${pre}[0]`);
      }
    };

    extract(data, prefix);
    return paths.slice(0, 10);
  },

  generateApiDocumentation(requests) {
    const apiDocs = {};

    requests.forEach(api => {
      const endpoint = api.endpoint_pattern;

      if (!apiDocs[endpoint]) {
        apiDocs[endpoint] = {
          methods: new Set(),
          parameters: {},
          examples: [],
          frequency: 0,
          response_types: new Set()
        };
      }

      const doc = apiDocs[endpoint];
      doc.methods.add(api.method);
      doc.frequency++;

      const parsed = api.parsed_data;
      if (parsed) {
        if (parsed.url_params && Object.keys(parsed.url_params).length > 0) {
          doc.parameters.url_params = Object.keys(parsed.url_params);
        }
        if (parsed.json_data && typeof parsed.json_data === 'object') {
          doc.parameters.json_fields = Object.keys(parsed.json_data);
        }
        if (parsed.form_data && Object.keys(parsed.form_data).length > 0) {
          doc.parameters.form_fields = Object.keys(parsed.form_data);
        }
      }

      const responseType = api.response_mime_type || api.content_type;
      if (responseType) doc.response_types.add(responseType);

      if (doc.examples.length < 3) {
        doc.examples.push({
          url: api.url,
          method: api.method,
          timestamp: api.timestamp,
          headers: api.headers,
          status: api.response_status
        });
      }
    });

    Object.values(apiDocs).forEach(data => {
      data.methods = Array.from(data.methods);
      data.response_types = Array.from(data.response_types);
    });

    return apiDocs;
  },

  calculateApiCoverage(requests) {
    if (!requests || requests.length === 0) {
      return { total_requests: 0, unique_endpoints: 0, method_distribution: {}, coverage_ratio: 0.0 };
    }

    const totalRequests = requests.length;
    const uniqueEndpoints = new Set(requests.map(req => req.endpoint_pattern)).size;

    const methodDistribution = {};
    requests.forEach(req => {
      const method = req.method || 'GET';
      methodDistribution[method] = (methodDistribution[method] || 0) + 1;
    });

    return {
      total_requests: totalRequests,
      unique_endpoints: uniqueEndpoints,
      method_distribution: methodDistribution,
      coverage_ratio: uniqueEndpoints / Math.max(totalRequests, 1)
    };
  },

  analyzeApiPatterns(requests) {
    return {
      time_distribution: this.analyzeTimeDistribution(requests),
      parameter_patterns: this.analyzeParameterPatterns(requests),
      authentication_methods: this.analyzeAuthMethods(requests),
      endpoint_clustering: this.clusterSimilarEndpoints(requests)
    };
  },

  analyzeTimeDistribution(requests) {
    const timeBuckets = {};
    requests.forEach(req => {
      if (!req.timestamp) return;
      try {
        const hour = new Date(req.timestamp).getHours();
        timeBuckets[hour] = (timeBuckets[hour] || 0) + 1;
      } catch (e) {}
    });
    return timeBuckets;
  },

  analyzeParameterPatterns(requests) {
    const paramPatterns = {};
    const tally = (prefix, source) => {
      if (!source) return;
      Object.keys(source).forEach(key => {
        const k = `${prefix}_${key}`;
        paramPatterns[k] = (paramPatterns[k] || 0) + 1;
      });
    };

    requests.forEach(req => {
      const parsed = req.parsed_data;
      tally('url', parsed.url_params);
      if (parsed.json_data && typeof parsed.json_data === 'object') {
        tally('post', parsed.json_data);
      }
    });
    return paramPatterns;
  },

  analyzeAuthMethods(requests) {
    const authMethods = {};
    const authHeaders = ['authorization', 'x-api-key', 'x-auth-token', 'cookie', 'x-csrf-token'];

    requests.forEach(req => {
      const headerKeys = new Set(Object.keys(req.headers || {}).map(h => h.toLowerCase()));
      authHeaders.forEach(header => {
        if (headerKeys.has(header)) {
          authMethods[header] = (authMethods[header] || 0) + 1;
        }
      });
    });
    return authMethods;
  },

  clusterSimilarEndpoints(requests) {
    const endpointGroups = {};

    requests.forEach(req => {
      try {
        const pathParts = new URL(req.url).pathname.split('/').filter(p => p);
        const groupKey = pathParts.slice(0, 3).join('/') || '/';
        if (!endpointGroups[groupKey]) endpointGroups[groupKey] = [];
        endpointGroups[groupKey].push(req.url);
      } catch (e) {}
    });

    return endpointGroups;
  }
};

// Guarded export for the Node test harness. In the service-worker / content-
// script runtime `module` is undefined, so this is a no-op there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APIAnalyzer };
}
