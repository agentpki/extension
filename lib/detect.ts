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
  // If multiple meta tags exist (testing/dev pattern: user injects a second
  // one without removing the first), take the LAST one — that's the most
  // recently appended and matches user expectation that the new injection
  // wins.
  const metas = doc.querySelectorAll('meta[name="agentpki-passport"]');
  for (let i = metas.length - 1; i >= 0; i--) {
    const content = metas[i]?.getAttribute('content');
    if (content && content.startsWith('v4.public.')) return content;
  }
  return null;
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
// Now handled by entrypoints/main-world.content.ts (manifest-declared
// world: MAIN content script) — bypasses page CSP entirely. The old
// inline <script>-injection approach this file previously contained
// was unreliable on certain Chrome / CSP combinations.

// (Old inline-script injection removed. Replaced by the manifest-declared
// MAIN-world content script at entrypoints/main-world.content.ts which
// runs at document_start with world: 'MAIN' — bypasses page CSP entirely.)

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
