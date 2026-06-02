const APIDetectors = {
  detectors: {
    ticketing: {
      name: 'Ticketing',
      keywords: ['ticket', 'service', 'request', 'helpdesk', 'support', 'incident'],
      methods: ['POST', 'PUT', 'PATCH', 'GET']
    },
    crm: {
      name: 'CRM',
      keywords: ['lead', 'contact', 'customer', 'account', 'opportunity', 'deal'],
      methods: ['GET', 'POST', 'PUT', 'PATCH']
    },
    financial: {
      name: 'Financial',
      keywords: ['commission', 'payment', 'transaction', 'deposit', 'withdraw', 'balance'],
      methods: ['GET', 'POST']
    },
    auth: {
      name: 'Authentication',
      keywords: ['login', 'auth', 'token', 'session', 'oauth', 'jwt'],
      methods: ['POST']
    },
    user_management: {
      name: 'User Management',
      keywords: ['user', 'profile', 'account', 'register', 'signup'],
      methods: ['GET', 'POST', 'PUT', 'PATCH']
    },
    reporting: {
      name: 'Reporting',
      keywords: ['report', 'analytics', 'dashboard', 'export', 'download'],
      methods: ['GET', 'POST']
    },
    notification: {
      name: 'Notification',
      keywords: ['notification', 'message', 'email', 'sms', 'alert'],
      methods: ['POST']
    },
    file_upload: {
      name: 'File Upload',
      keywords: ['upload', 'file', 'attachment', 'document', 'image'],
      methods: ['POST', 'PUT']
    },
    search: {
      name: 'Search',
      keywords: ['search', 'query', 'filter', 'find'],
      methods: ['GET', 'POST']
    },
    admin: {
      name: 'Admin',
      keywords: ['admin', 'manage', 'config', 'setting', 'control'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
  },

  detectApiType(url, method) {
    const urlLower = url.toLowerCase();
    const upperMethod = (method || 'GET').toUpperCase();
    const detected = [];
    Object.entries(this.detectors).forEach(([key, detector]) => {
      if (!detector.methods.includes(upperMethod)) return;
      if (detector.keywords.some(keyword => urlLower.includes(keyword))) {
        detected.push({ type: key, name: detector.name });
      }
    });
    return detected;
  },

  categorizeRequests(requests) {
    const categorized = {};

    Object.entries(this.detectors).forEach(([key, detector]) => {
      categorized[key] = {
        name: detector.name,
        keywords: detector.keywords,
        methods: detector.methods,
        detected_count: 0,
        detected_requests: [],
        unique_urls: new Set()
      };
    });

    requests.forEach(req => {
      const detected = this.detectApiType(req.url, req.method);
      const endpoint = req.endpoint_pattern;

      detected.forEach(det => {
        const bucket = categorized[det.type];
        bucket.detected_count++;
        bucket.detected_requests.push(req);
        bucket.unique_urls.add(endpoint);
      });
    });

    Object.values(categorized).forEach(bucket => {
      bucket.unique_urls = Array.from(bucket.unique_urls);
    });

    return categorized;
  }
};

// Guarded export for the Node test harness (no-op in the extension runtime).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APIDetectors };
}
