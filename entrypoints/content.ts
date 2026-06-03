// AgentPKI content script.
//
// Runs in every page (`<all_urls>`). Detects AI agents via in-page signals
// and forwards observations to the background service worker.
//
// What this file does NOT do:
//   - Call the verifier (background handles that — only it has reliable
//     network access from the SW context and centralized caching)
//   - Persist anything (background owns storage)
//   - Render UI in the popup (popup.html owns that)

import { defineContentScript } from 'wxt/sandbox';
import {
  detectMetaTag,
  makeObservation,
} from '../lib/detect';
import type { ExtensionMessage } from '../lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.log('[AgentPKI] ISOLATED-world content script active.');
    runDetectionSweep();
    // Re-scan on SPA navigations / lazy-mounted agent libs
    const mo = new MutationObserver(() => {
      scheduleMetaResweep();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // (Library scanning is now done by the MAIN-world content script —
    // entrypoints/main-world.content.ts — which has access to the page's
    // actual window globals. ISOLATED world here only listens for the
    // dispatched CustomEvent and forwards to the background SW.)

    // Listen for outbound RFC 9421 events from the injected interceptor
    window.addEventListener('agentpki:outbound-signed', (ev) => {
      const e = ev as CustomEvent<{ kid: string; signature_input: string }>;
      const detail = e.detail;
      if (!detail?.kid) return;
      // Treat any agentpki:<...> kid as ours; broader kids may still be
      // interesting but we don't want to flag every signed-fetch in the world
      if (!detail.kid.startsWith('agentpki:')) return;
      sendObservation({
        vector: 'rfc9421_signature',
        signatureKid: detail.kid,
        issuerHint: extractIssuerFromKid(detail.kid),
      });
    });

    // Listen for MAIN-world library detection events (the injected script
    // does the scan, dispatches the CustomEvent; we forward to background).
    // This bridges the ISOLATED-world gap — content scripts can't see the
    // page's window globals directly.
    window.addEventListener('agentpki:libraries-detected', (ev) => {
      const e = ev as CustomEvent<{ libraries: string[] }>;
      const libs = e.detail?.libraries ?? [];
      for (const lib of libs) sendObservation({ vector: 'js_library', library: lib });
    });
  },
});

let metaResweepTimer: number | null = null;

function scheduleMetaResweep() {
  if (metaResweepTimer != null) return;
  metaResweepTimer = window.setTimeout(() => {
    metaResweepTimer = null;
    const token = detectMetaTag(document);
    if (token) sendObservation({ vector: 'meta_tag', token });
  }, 250);
}

function runDetectionSweep() {
  // (1) meta tag — ISOLATED world can see the DOM
  const token = detectMetaTag(document);
  if (token) sendObservation({ vector: 'meta_tag', token });

  // (3) JS library globals — handled by the MAIN-world content script
  //     (main-world.content.ts). It dispatches CustomEvents we listen for above.
  // (4) outbound RFC 9421 — also handled by main-world.content.ts. It
  //     monkey-patches fetch + XMLHttpRequest in the page's actual JS context.
  // (2) response headers — handled by background SW via declarativeNetRequest.
}

function sendObservation(args: {
  vector: import('../lib/types').DetectionVector;
  token?: string;
  library?: string;
  signatureKid?: string;
  issuerHint?: string;
}) {
  const obs = makeObservation({
    pageUrl: location.href,
    tabId: -1, // background resolves the real tab id from sender.tab.id
    ...args,
  });
  const msg: ExtensionMessage = { kind: 'observation', observation: obs };
  chrome.runtime.sendMessage(msg).catch(() => {
    // SW may be inactive briefly — re-deliver on next event. Swallowing
    // here is fine because the SW will be woken by the next observation.
  });
}

function extractIssuerFromKid(kid: string): string | undefined {
  // Convention: kid looks like `agentpki:<issuer-domain>:<key-version>` or
  // simply `<domain>-<year>-<q>-<hash>`. Best-effort extraction:
  const m = kid.match(/^agentpki:([^:]+):/);
  if (m) return m[1];
  return undefined;
}
