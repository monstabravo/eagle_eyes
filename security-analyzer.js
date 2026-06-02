const SecurityAnalyzer = {
  detectSecurityIssues(requests) {
    const issues = [];
    const sensitiveKeywords = ['password', 'token', 'key', 'secret', 'api_key', 'apikey'];
    const securityHeaders = ['authorization', 'x-csrf-token', 'x-api-key', 'x-auth-token'];
    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    const weakPasswords = new Set(['123456', 'password', 'admin', '12345678', 'qwerty', '111111']);
    const passwordKeyPattern = /^(password|passwd|pwd|pass)$/i;

    requests.forEach(req => {
      const url = req.url || '';
      const method = req.method || 'GET';
      const headers = req.headers || {};
      const urlLower = url.toLowerCase();

      if (sensitiveKeywords.some(keyword => urlLower.includes(keyword))) {
        issues.push({
          type: 'sensitive_data_in_url',
          url, method, severity: 'high',
          description: 'Sensitive data in URL',
          recommendation: 'Sensitive data should be passed in the request body or headers, not the URL'
        });
      }

      if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        issues.push({
          type: 'insecure_protocol',
          url, method, severity: 'medium',
          description: 'Insecure HTTP protocol',
          recommendation: 'Use HTTPS to secure data transfer'
        });
      }

      const lowerHeaders = {};
      Object.entries(headers).forEach(([k, v]) => { lowerHeaders[k.toLowerCase()] = v; });

      if (writeMethods.includes(method) && !securityHeaders.some(h => h in lowerHeaders)) {
        issues.push({
          type: 'missing_auth_header',
          url, method, severity: 'low',
          description: 'Possibly missing auth header',
          recommendation: 'Sensitive operations should include proper authentication'
        });
      }

      if (lowerHeaders['access-control-allow-origin'] === '*') {
        issues.push({
          type: 'insecure_cors',
          url, method, severity: 'medium',
          description: 'CORS configuration is too permissive',
          recommendation: 'Restrict allowed origins; avoid the wildcard *'
        });
      }

      if (method === 'GET' && req.request_body) {
        issues.push({
          type: 'data_in_get_request',
          url, method, severity: 'low',
          description: 'GET request contains a body',
          recommendation: 'GET requests should not have a body — consider using POST'
        });
      }

      const pushWeakPwdIssue = (fieldName) => {
        issues.push({
          type: 'weak_password',
          url, method, severity: 'high',
          description: `Weak password detected in field "${fieldName}"`,
          recommendation: 'Use strong passwords with mixed case, digits and special characters'
        });
      };

      const checkObjectForWeakPasswords = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        Object.entries(obj).forEach(([k, v]) => {
          if (passwordKeyPattern.test(k) && typeof v === 'string' && weakPasswords.has(v.toLowerCase())) {
            pushWeakPwdIssue(k);
          } else if (v && typeof v === 'object') {
            checkObjectForWeakPasswords(v);
          }
        });
      };

      let parsedBody = null;
      const rawBody = req.request_body || '';
      if (typeof rawBody === 'string' && (rawBody.startsWith('{') || rawBody.startsWith('['))) {
        try { parsedBody = JSON.parse(rawBody); } catch (e) {}
      } else if (rawBody && typeof rawBody === 'object') {
        parsedBody = rawBody;
      }
      if (parsedBody) checkObjectForWeakPasswords(parsedBody);

      if (typeof rawBody === 'string' && rawBody.includes('=') && !parsedBody) {
        try {
          new URLSearchParams(rawBody).forEach((v, k) => {
            if (passwordKeyPattern.test(k) && weakPasswords.has(v.toLowerCase())) {
              pushWeakPwdIssue(k);
            }
          });
        } catch (e) {}
      }

      const jsonData = req.parsed_data && req.parsed_data.json_data;
      if (jsonData && (jsonData.sql || jsonData.query)) {
        issues.push({
          type: 'potential_sql_injection',
          url, method, severity: 'high',
          description: 'Possible SQL injection risk',
          recommendation: 'Use parameterised queries or an ORM to prevent SQL injection'
        });
      }
    });

    return issues;
  },

  generateSecurityRecommendations(issues) {
    const recommendationTemplates = [
      { type: 'sensitive_data_in_url', priority: 'high', title: 'Fix sensitive data leaking in URLs', description: 'Sensitive data must not appear in URLs — use POST bodies or encrypted headers' },
      { type: 'insecure_protocol', priority: 'high', title: 'Enforce site-wide HTTPS', description: 'All API requests should use HTTPS to protect data in transit' },
      { type: 'weak_password', priority: 'high', title: 'Enforce a strong password policy', description: 'Require users to choose strong passwords (mixed case, digits, special chars)' },
      { type: 'potential_sql_injection', priority: 'high', title: 'Prevent SQL injection', description: 'Use parameterised queries or an ORM framework — never concatenate SQL' },
      { type: 'insecure_cors', priority: 'medium', title: 'Tighten CORS configuration', description: 'Restrict allowed origins; do not use the wildcard *' },
      { type: 'missing_auth_header', priority: 'medium', title: 'Add proper authentication', description: 'All sensitive operations should include proper authentication and authorisation checks' }
    ];

    const issueCountsByType = issues.reduce((counts, issue) => {
      counts[issue.type] = (counts[issue.type] || 0) + 1;
      return counts;
    }, {});

    const recommendations = [];
    recommendationTemplates.forEach(template => {
      const affectedCount = issueCountsByType[template.type];
      if (affectedCount) {
        recommendations.push({
          priority: template.priority,
          title: template.title,
          description: template.description,
          affected_count: affectedCount
        });
      }
    });

    return recommendations;
  },

  calculateSecurityScore(issues) {
    const severityCounts = { high: 0, medium: 0, low: 0 };
    issues.forEach(issue => {
      if (severityCounts[issue.severity] !== undefined) severityCounts[issue.severity]++;
    });

    const score = Math.max(0, 100
      - severityCounts.high * 15
      - severityCounts.medium * 5
      - severityCounts.low * 2);

    let rating;
    if (score >= 90) rating = 'A — Excellent';
    else if (score >= 75) rating = 'B — Good';
    else if (score >= 60) rating = 'C — Pass';
    else if (score >= 40) rating = 'D — Needs Improvement';
    else rating = 'F — Critical Issues';

    return {
      score,
      rating,
      total_issues: issues.length,
      high_severity_count: severityCounts.high,
      medium_severity_count: severityCounts.medium,
      low_severity_count: severityCounts.low
    };
  }
};

// Guarded export for the Node test harness (no-op in the extension runtime).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SecurityAnalyzer };
}
