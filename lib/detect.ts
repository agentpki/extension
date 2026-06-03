// Page-side agent detection logic. Runs inside the content script.
//
// Detection vectors implemented:
//   (1) <meta name="agentpki-passport" content="<token>">
//   (2) AgentPKI-Token: response headers (caught by declarativeNetRequest
//       in the background SW; content script only handles same-page tags
//       and globals)
//   (3) Known JS-library globals (window.AGENTPKI, LangChain.js fingerprints,
//       Vercel AI SDK fingerprints, Anthropic / OpenAI Agents JS markers)
//   (4) RFC 9421 outbound HTTP Message Signatures — we monkey-patch fetch()
//       in MAIN-world via an injected <script> to capture the signing
//       headers as they're attached. Reliability is best-effort: pages
//       with strict CSP may block injection; we ship a graceful fallback.

import type { AgentObservation, DetectionVector } from './types';

// ─── (1) Meta tag ─────────────────────────────────────────────────────

export function detectMetaTag(doc: Document): string | null {
  const meta = doc.querySelector('meta[name="agentpki-passport"]');
  if (!meta) return null;
  const content = meta.getAttribute('content');
  if (!content) return null;
  // Sanity: a PASETO token starts with v4.public.
  if (!content.startsWith('v4.public.')) return null;
  return content;
}

// ─── (3) JS library fingerprints ───────────────────────────────────────
//
// We don't need to be exhaustive. The bar: presence of these markers on
// the page strongly suggests an agent is running, even if no AgentPKI
// passport is attached yet. Renders a yellow badge with explanation.

interface LibraryFingerprint {
  /** Display name shown in popup. */
  name: string;
  /** Path on `window` to a marker we'd expect a real install of this lib to set. */
  windowKeys: string[];
}

const KNOWN_LIBRARIES: LibraryFingerprint[] = [
  { name: 'LangChain.js', windowKeys: ['__LANGCHAIN__', 'langchain'] },
  { name: 'Vercel AI SDK', windowKeys: ['__VERCEL_AI_SDK__', 'aiStream'] },
  { name: 'Anthropic SDK (JS)', windowKeys: ['Anthropic', 'AnthropicVertex'] },
  { name: 'OpenAI Agents JS', windowKeys: ['__OPENAI_AGENTS__', 'OpenAIAgents'] },
  { name: 'CrewAI JS', windowKeys: ['__CREWAI__', 'CrewAI'] },
  { name: 'Mastra', windowKeys: ['__MASTRA__', 'Mastra'] },
];

/** Returns the names of detected libraries (empty if none). */
export function detectLibraries(win: Window): string[] {
  const w = win as unknown as Record<string, unknown>;
  const found: string[] = [];
  for (const lib of KNOWN_LIBRARIES) {
    for (const k of lib.windowKeys) {
      if (k in w && w[k] != null) {
        found.push(lib.name);
        break;
      }
    }
  }
  return found;
}

// ─── (4) RFC 9421 outbound signature interception ──────────────────────
//
// We inject a small MAIN-world script that monkey-patches window.fetch and
// XMLHttpRequest.prototype.send. When the page attaches a `Signature-Input`
// header containing `keyid="agentpki:..."`, the patched fetch posts a
// CustomEvent('agentpki:outbound-signed', { detail: { kid, signature_input } })
// back to the page DOM, which the content script (ISOLATED world) listens
// for and forwards to the background SW.
//
// Pages with strict CSP that blocks inline scripts won't see this vector
// fire. That's an accepted limitation in v0.1 — we still get vectors (1)
// (2) (3) on those pages. Documented in the v0.1 README.

const INJECT_SCRIPT_TEXT = `
(function () {
  if (window.__agentpki_outbound_patched__) return;
  window.__agentpki_outbound_patched__ = true;
  function notify(detail) {
    try {
      window.dispatchEvent(new CustomEvent('agentpki:outbound-signed', { detail }));
    } catch (e) { /* swallow */ }
  }
  function extractFromHeaders(headers) {
    if (!headers) return null;
    // Headers can be plain object, array of [k,v], or Headers instance.
    var sigInput = null;
    if (typeof headers.get === 'function') {
      sigInput = headers.get('Signature-Input') || headers.get('signature-input');
    } else if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i++) {
        var p = headers[i];
        if (p && (p[0] === 'Signature-Input' || p[0] === 'signature-input')) sigInput = p[1];
      }
    } else if (typeof headers === 'object') {
      sigInput = headers['Signature-Input'] || headers['signature-input'];
    }
    if (!sigInput) return null;
    var m = String(sigInput).match(/keyid=\\"([^\\"]+)\\"/);
    return m ? { kid: m[1], signature_input: String(sigInput) } : null;
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        var headers = (init && init.headers) || (input && input.headers);
        var hit = extractFromHeaders(headers);
        if (hit) notify(hit);
      } catch (e) { /* swallow */ }
      return origFetch.apply(this, arguments);
    };
  }
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (String(name).toLowerCase() === 'signature-input') {
        var m = String(value).match(/keyid=\\"([^\\"]+)\\"/);
        if (m) notify({ kid: m[1], signature_input: String(value) });
      }
    } catch (e) { /* swallow */ }
    return origSetHeader.apply(this, arguments);
  };
})();
`;

export function injectOutboundInterceptor(doc: Document): void {
  // Inject only once
  if (doc.getElementById('agentpki-outbound-interceptor')) return;
  const s = doc.createElement('script');
  s.id = 'agentpki-outbound-interceptor';
  s.textContent = INJECT_SCRIPT_TEXT;
  (doc.head || doc.documentElement).appendChild(s);
  // Remove the script node from the DOM (logic persists in the page)
  s.remove();
}

// ─── Observation factory ──────────────────────────────────────────────

export function makeObservation(args: {
  pageUrl: string;
  tabId: number;
  vector: DetectionVector;
  token?: string;
  library?: string;
  signatureKid?: string;
  issuerHint?: string;
}): AgentObservation {
  return {
    detected_at: Math.floor(Date.now() / 1000),
    tab_id: args.tabId,
    page_url: args.pageUrl,
    vector: args.vector,
    token: args.token,
    library: args.library,
    signature_kid: args.signatureKid,
    issuer_hint: args.issuerHint,
  };
}
