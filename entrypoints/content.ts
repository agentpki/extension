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
  detectLibraries,
  injectOutboundInterceptor,
  makeObservation,
} from '../lib/detect';
import type { ExtensionMessage } from '../lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    runDetectionSweep();
    // Re-scan on SPA navigations / lazy-mounted agent libs
    const mo = new MutationObserver(() => {
      scheduleMetaResweep();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Periodic library re-scan (window properties don't fire DOM mutations,
    // and many agent SDKs lazily install their globals after `load`). Fires
    // every 3 seconds for the first 30 seconds, then stops. Cheap and bounded.
    let scans = 0;
    const libInterval = window.setInterval(() => {
      scans++;
      if (scans > 10) {
        clearInterval(libInterval);
        return;
      }
      const libs = detectLibraries(window);
      for (const lib of libs) sendObservation({ vector: 'js_library', library: lib });
    }, 3000);

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
  const pageUrl = location.href;

  // (1) meta tag
  const token = detectMetaTag(document);
  if (token) sendObservation({ vector: 'meta_tag', token });

  // (3) JS library globals
  const libs = detectLibraries(window);
  for (const lib of libs) sendObservation({ vector: 'js_library', library: lib });

  // (4) outbound RFC 9421 — inject the interceptor so we catch future fetches
  try {
    injectOutboundInterceptor(document);
  } catch (e) {
    // CSP blocked the inline script. (2)/(1)/(3) still work — we accept this.
    console.debug('[AgentPKI] outbound interceptor injection blocked:', e);
  }

  // (2) response headers are handled in the background SW via
  //     declarativeNetRequest — content script doesn't touch that path.
  void pageUrl;
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
