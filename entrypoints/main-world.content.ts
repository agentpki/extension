// MAIN-world content script.
//
// Runs in the page's actual JavaScript context (not the ISOLATED extension
// sandbox). Can see window globals set by the page or by DevTools, and can
// monkey-patch fetch / XMLHttpRequest to capture RFC 9421 outbound signatures.
//
// Communicates with the ISOLATED-world content.ts via window-level
// CustomEvents, since MAIN-world has no access to chrome.runtime APIs.
//
// WXT runs this script declaratively at document_start with world:'MAIN'
// (per the manifest content_scripts entry it generates). This is more
// reliable than the inline <script>-tag injection trick on pages with
// strict CSP — the manifest-declared world: MAIN content script is
// privileged and bypasses page CSP.

import { defineContentScript } from 'wxt/sandbox';

interface LibraryFingerprint {
  name: string;
  keys: string[];
}

const KNOWN: LibraryFingerprint[] = [
  { name: 'LangChain.js', keys: ['__LANGCHAIN__', 'langchain'] },
  { name: 'Vercel AI SDK', keys: ['__VERCEL_AI_SDK__', 'aiStream'] },
  { name: 'Anthropic SDK (JS)', keys: ['Anthropic', 'AnthropicVertex'] },
  { name: 'OpenAI Agents JS', keys: ['__OPENAI_AGENTS__', 'OpenAIAgents'] },
  { name: 'CrewAI JS', keys: ['__CREWAI__', 'CrewAI'] },
  { name: 'Mastra', keys: ['__MASTRA__', 'Mastra'] },
];

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    // Idempotent — content_scripts may fire twice in some Chrome versions
    if ((window as unknown as Record<string, unknown>).__agentpki_mainworld__) return;
    (window as unknown as Record<string, unknown>).__agentpki_mainworld__ = true;

    console.log('[AgentPKI] MAIN-world script active. Library scan running every 2s.');

    // ─── (3) Library scan ────────────────────────────────────────
    function scanLibs() {
      const found: string[] = [];
      const w = window as unknown as Record<string, unknown>;
      for (const lib of KNOWN) {
        for (const k of lib.keys) {
          if (k in w && w[k] != null) {
            found.push(lib.name);
            break;
          }
        }
      }
      try { console.log('[AgentPKI] lib scan:', found); } catch {}
      if (found.length > 0) {
        window.dispatchEvent(
          new CustomEvent('agentpki:libraries-detected', { detail: { libraries: found } }),
        );
      }
    }
    scanLibs();
    setInterval(scanLibs, 2000);

    // ─── (4) RFC 9421 outbound signature interception ─────────────
    function notifyOutbound(detail: { kid: string; signature_input: string }) {
      try {
        window.dispatchEvent(new CustomEvent('agentpki:outbound-signed', { detail }));
      } catch {}
    }
    function extractKidFromSigInput(value: string): string | null {
      const m = value.match(/keyid="([^"]+)"/);
      return m ? m[1]! : null;
    }
    function inspectHeaders(headers: unknown): void {
      if (!headers) return;
      let sigInput: string | null = null;
      if (typeof (headers as Headers).get === 'function') {
        sigInput = (headers as Headers).get('Signature-Input') || (headers as Headers).get('signature-input');
      } else if (Array.isArray(headers)) {
        for (const p of headers as Array<[string, string]>) {
          if (p[0] === 'Signature-Input' || p[0] === 'signature-input') sigInput = p[1] || null;
        }
      } else if (typeof headers === 'object') {
        const h = headers as Record<string, string>;
        sigInput = h['Signature-Input'] || h['signature-input'] || null;
      }
      if (!sigInput) return;
      const kid = extractKidFromSigInput(String(sigInput));
      if (kid) notifyOutbound({ kid, signature_input: String(sigInput) });
    }

    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (this: typeof window, input: RequestInfo | URL, init?: RequestInit) {
        try {
          const headers = init?.headers ?? (input as Request | undefined)?.headers;
          inspectHeaders(headers);
        } catch {}
        return origFetch.apply(this, [input, init] as never);
      } as typeof window.fetch;
    }
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
      try {
        if (String(name).toLowerCase() === 'signature-input') {
          const kid = extractKidFromSigInput(String(value));
          if (kid) notifyOutbound({ kid, signature_input: String(value) });
        }
      } catch {}
      return origSetHeader.apply(this, [name, value]);
    };
  },
});
