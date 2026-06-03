// AgentPKI background service worker (Manifest V3).
//
// Responsibilities:
//   - Track per-tab observations from content scripts
//   - Call verify.agentpki.dev for tokens we see
//   - Maintain the verification cache (in-memory + brief storage.local mirror)
//   - Drive the toolbar badge color/text for the active tab
//   - Listen for AgentPKI-Token: response headers via declarativeNetRequest
//
// State model:
//   tabStates: Map<tab_id, TabState> — fast in-memory
//
// On Manifest V3 the SW can be terminated when idle, so we re-hydrate
// tab state from chrome.storage.session on event re-entry.

import { defineBackground } from 'wxt/sandbox';
import { verifyToken } from '../lib/verifier';
import { appendActivity, getSettings } from '../lib/storage';
import type {
  AgentObservation,
  BadgeColor,
  ExtensionMessage,
  TabState,
  VerificationResult,
} from '../lib/types';

const SESSION_KEY = 'agentpki:tab_states';

const tabStates = new Map<number, TabState>();

// ─── Rehydrate on cold start ──────────────────────────────────────────
async function rehydrate(): Promise<void> {
  try {
    const { [SESSION_KEY]: stored } = await chrome.storage.session.get(SESSION_KEY);
    if (stored && typeof stored === 'object') {
      for (const [id, st] of Object.entries(stored)) {
        const tid = Number(id);
        if (Number.isFinite(tid)) tabStates.set(tid, st as TabState);
      }
    }
  } catch {
    // session storage not available — fine, fresh-start state
  }
}

async function persist(): Promise<void> {
  const out: Record<number, TabState> = {};
  for (const [id, st] of tabStates) out[id] = st;
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: out });
  } catch {
    // swallow
  }
}

// ─── Badge color logic ────────────────────────────────────────────────

const BADGE_PALETTE: Record<BadgeColor, { text: string; color: string; title: string }> = {
  gray: { text: '',     color: '#6b6b78', title: 'AgentPKI — no agent detected' },
  white: { text: '?',    color: '#9c9cab', title: 'AgentPKI — agent detected, verifying…' },
  green: { text: '✓',    color: '#22c55e', title: 'AgentPKI — verified' },
  yellow: { text: '!',   color: '#fbbf24', title: 'AgentPKI — unverified agent' },
  red: { text: '⛔',     color: '#ef4444', title: 'AgentPKI — revoked or high-abuse' },
  blue: { text: '👤',    color: '#3b82f6', title: 'AgentPKI — your own agent' },
};

function deriveBadge(st: TabState): BadgeColor {
  const v = st.verification;
  if (!v) {
    if (st.observations.length === 0) return 'gray';
    // We have an observation but no verify result yet — show interim
    if (st.observations.some((o) => o.token)) return 'white';
    // Library / RFC fingerprint without a token = yellow (unverified)
    return 'yellow';
  }
  if (v.verdict === 'deny') {
    if (v.failure_reason === 'revoked' || v.failure_reason === 'revoked_key') return 'red';
    if (typeof v.abuse_score === 'number' && v.abuse_score > 0.5) return 'red';
    return 'yellow';
  }
  if (v.verdict === 'allow') {
    if (typeof v.abuse_score === 'number' && v.abuse_score > 0.5) return 'red';
    return 'green';
  }
  // throttle / unknown — neither clean allow nor explicit deny
  return 'yellow';
}

async function paintBadge(tabId: number, color: BadgeColor): Promise<void> {
  const p = BADGE_PALETTE[color];
  try {
    await chrome.action.setBadgeText({ tabId, text: p.text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: p.color });
    await chrome.action.setTitle({ tabId, title: p.title });
  } catch {
    // tab may have closed
  }
}

// ─── Observation handler ──────────────────────────────────────────────

async function ingestObservation(tabId: number, obs: AgentObservation): Promise<void> {
  if (!Number.isFinite(tabId) || tabId < 0) return;

  // Fresh state for new tabs or new navigations
  let st = tabStates.get(tabId);
  if (!st || st.page_url !== obs.page_url) {
    st = {
      tab_id: tabId,
      page_url: obs.page_url,
      observations: [],
      badge: 'gray',
      last_updated: obs.detected_at,
    };
    tabStates.set(tabId, st);
  }

  st.observations.push({ ...obs, tab_id: tabId });
  st.last_updated = obs.detected_at;

  // Initial interim badge before verify lands
  st.badge = deriveBadge(st);
  await paintBadge(tabId, st.badge);

  // If we have a token, verify it. If we only have a library fingerprint
  // or RFC signature kid, we stay yellow (v0.1 — extension cannot resolve
  // an issuer's pubkey just from a kid without the matching token).
  if (obs.token && !st.verification) {
    try {
      const settings = await getSettings();
      const verification = await verifyToken(obs.token, { base: settings.verifier_base });
      st.verification = verification;
      st.badge = deriveBadge(st);
      await paintBadge(tabId, st.badge);
      void recordActivity(obs, verification);
    } catch (e) {
      console.warn('[AgentPKI] verify failed:', e);
      st.badge = 'yellow';
      await paintBadge(tabId, 'yellow');
    }
  } else if (!obs.token) {
    void recordActivity(obs, null);
  }

  await persist();
}

async function recordActivity(
  obs: AgentObservation,
  verification: VerificationResult | null,
): Promise<void> {
  await appendActivity({
    ts: obs.detected_at,
    page_url: obs.page_url,
    vector: obs.vector,
    agent_id: verification?.passport?.agent_id,
    issuer: verification?.passport?.issuer ?? obs.issuer_hint,
    verdict: verification?.verdict ?? 'no_token',
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────

export default defineBackground({
  type: 'module',
  main() {
    void rehydrate();

    chrome.runtime.onInstalled.addListener(async () => {
      // First-run setup
      const settings = await getSettings();
      void settings;
    });

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
      if (message.kind === 'observation') {
        const tabId = sender.tab?.id ?? -1;
        void ingestObservation(tabId, message.observation);
        sendResponse({ ok: true });
        return true;
      }
      if (message.kind === 'request_tab_state') {
        const tabId = message.tab_id;
        const state = tabStates.get(tabId) ?? null;
        sendResponse({ kind: 'tab_state', state });
        return true;
      }
      // v0.1 stubs — full handlers land Days 5-6
      return false;
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      tabStates.delete(tabId);
      void persist();
    });
  },
});
