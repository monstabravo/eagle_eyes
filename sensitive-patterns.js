// Shared regex catalogue for sensitive-field detection.
// Loaded by both:
//   - background.js (service worker, via importScripts)
//   - recorder.js   (content script, via manifest.json content_scripts list)
//
// Whichever side runs first creates the singleton; the other side reuses it.
// Edit ONLY here — both sides will pick up the change.

(function () {
  if (typeof globalThis !== 'undefined' && globalThis.EAGLE_EYES_PATTERNS) return;

  const PATTERNS = {
    // Request-side: form fields, JSON keys, URL params likely to be credentials
    REQUEST_SENSITIVE_RE:
      /password|passwd|pwd|token|secret|auth|apikey|api_key|bearer|username|account|login/i,

    // Response-side: tokens, sessions, JWTs returned by the server
    RESPONSE_SENSITIVE_RE:
      /token|auth|api[-_]?key|access[-_]?token|id[-_]?token|jwt|session|credential/i,

    // localStorage / sessionStorage keys to flag when read
    STORAGE_KEY_RE:
      /token|auth|api[-_]?key|session|user|credential/i,

    // localStorage / sessionStorage keys to flag when written
    STORAGE_SET_RE:
      /token|auth|api[-_]?key|access[-_]?token|id[-_]?token|jwt|password|passwd|pwd|secret|bearer|username|account|login/i,

    // Cookie names to flag
    COOKIE_RE:
      /token|auth|api[-_]?key|access[-_]?token|id[-_]?token|jwt|session/i,
  };

  if (typeof globalThis !== 'undefined') globalThis.EAGLE_EYES_PATTERNS = PATTERNS;
  // Fallback for environments without globalThis (none expected, but cheap insurance)
  if (typeof self !== 'undefined') self.EAGLE_EYES_PATTERNS = PATTERNS;
  if (typeof window !== 'undefined') window.EAGLE_EYES_PATTERNS = PATTERNS;
})();
