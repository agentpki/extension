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
import {
  verifyToken,
  fetchTrustedIssuers,
  fetchReputation,
  submitAbuseReport,
} from '../lib/verifier';
import {
  appendActivity,
  getActivity,
  getInstallationId,
  getSettings,
  getUserLists,
  setUserLists,
  DEFAULT_USER_LISTS,
} from '../lib/storage';
import type {
  AgentObservation,
  BadgeColor,
  ExtensionMessage,
  ReputationSummary,
  TabState,
  TrustedIssuer,
  UserLists,
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

// In-memory snapshot of UserLists. Refreshed on each storage.sync change so
// deriveBadge() stays synchronous + cheap. On cold start the SW awaits a one-
// shot load; subsequent updates flow through the chrome.storage.onChanged
// listener below.
let cachedUserLists: UserLists = DEFAULT_USER_LISTS;

// ─── Trusted-issuers cache (5 min in-memory)
// ─── Reputation cache (per passport_id, 60 s in-memory)
//
// Both are pure caches over the verifier's public, edge-cached endpoints.
// Local TTL is shorter than the edge TTL so the popup stays snappy + we
// don't issue redundant requests on every popup open.

interface TrustedIssuersCache {
  issuers: TrustedIssuer[];
  fetched_at: number;
}
let trustedIssuersCache: TrustedIssuersCache | null = null;
const TRUSTED_ISSUERS_TTL_SEC = 300;

interface ReputationCacheEntry {
  summary: ReputationSummary;
  fetched_at: number;
}
const reputationCache = new Map<string, ReputationCacheEntry>();
const REPUTATION_TTL_SEC = 60;

async function getTrustedIssuers(): Promise<TrustedIssuer[]> {
  const now = Math.floor(Date.now() / 1000);
  if (trustedIssuersCache && now - trustedIssuersCache.fetched_at < TRUSTED_ISSUERS_TTL_SEC) {
    return trustedIssuersCache.issuers;
  }
  try {
    const settings = await getSettings();
    const issuers = await fetchTrustedIssuers({ base: settings.verifier_base });
    trustedIssuersCache = { issuers, fetched_at: now };
    return issuers;
  } catch (e) {
    console.warn('[AgentPKI] fetch trusted-issuers failed:', e);
    return trustedIssuersCache?.issuers ?? [];
  }
}

async function getReputation(
  passportId: string,
  opts?: { fresh?: boolean },
): Promise<ReputationSummary | null> {
  const now = Math.floor(Date.now() / 1000);
  const cached = reputationCache.get(passportId);
  if (!opts?.fresh && cached && now - cached.fetched_at < REPUTATION_TTL_SEC) {
    return cached.summary;
  }
  try {
    const settings = await getSettings();
    const summary = await fetchReputation(passportId, {
      base: settings.verifier_base,
      fresh: opts?.fresh,
    });
    reputationCache.set(passportId, { summary, fetched_at: now });
    return summary;
  } catch (e) {
    console.warn('[AgentPKI] fetch reputation failed:', e);
    return cached?.summary ?? null;
  }
}

function deriveBadge(st: TabState): BadgeColor {
  const v = st.verification;

  // Blocked agents → red regardless of verification result
  if (v?.passport) {
    if (cachedUserLists.blocked_agents.includes(v.passport.agent_id)) return 'red';
    if (cachedUserLists.blocked_issuers.includes(v.passport.issuer)) return 'red';
  }
  if (st.page_url) {
    try {
      const host = new URL(st.page_url).host;
      if (cachedUserLists.blocked_domains.includes(host)) return 'red';
    } catch { /* swallow */ }
  }

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
    // Own-agent (blue) — user has whitelisted this agent_id as theirs
    if (v.passport && cachedUserLists.own_agents.includes(v.passport.agent_id)) return 'blue';
    return 'green';
  }
  // throttle / unknown — neither clean allow nor explicit deny
  return 'yellow';
}

// Repaint every tab's badge using the latest UserLists (called when user
// blocks/whitelists/etc. and the live badge should reflect the change).
async function repaintAllBadges(): Promise<void> {
  for (const [tabId, st] of tabStates) {
    st.badge = deriveBadge(st);
    await paintBadge(tabId, st.badge);
  }
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

  // Dedupe identical observations (periodic library scans, repeated meta-tag
  // re-sweeps with the same token) to keep TabState bounded.
  const fingerprint =
    obs.vector + '|' + (obs.token ?? '') + '|' + (obs.library ?? '') + '|' + (obs.signature_kid ?? '');
  const isDuplicate = st.observations.some((o) =>
    (o.vector + '|' + (o.token ?? '') + '|' + (o.library ?? '') + '|' + (o.signature_kid ?? '')) === fingerprint,
  );
  if (isDuplicate) return;

  st.observations.push({ ...obs, tab_id: tabId });
  st.last_updated = obs.detected_at;

  // Initial interim badge before verify lands
  st.badge = deriveBadge(st);
  await paintBadge(tabId, st.badge);

  // If we have a token, verify it. Re-verify when the token differs from the
  // last one we verified for this tab — supports dev/testing pattern where a
  // user injects a new <meta> to swap scenarios, and supports SPAs that swap
  // their passport between routes.
  if (obs.token) {
    const lastVerifiedToken = st.last_verified_token;
    if (obs.token !== lastVerifiedToken) {
      try {
        const settings = await getSettings();
        const verification = await verifyToken(obs.token, { base: settings.verifier_base });
        st.verification = verification;
        st.last_verified_token = obs.token;
        st.badge = deriveBadge(st);
        await paintBadge(tabId, st.badge);
        void recordActivity(obs, verification);
      } catch (e) {
        console.warn('[AgentPKI] verify failed:', e);
        st.badge = 'yellow';
        await paintBadge(tabId, 'yellow');
      }
    }
  } else {
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

async function applyListMutation(message: ExtensionMessage): Promise<UserLists> {
  const current = await getUserLists();
  const next: UserLists = {
    blocked_agents: [...current.blocked_agents],
    blocked_issuers: [...current.blocked_issuers],
    blocked_domains: [...current.blocked_domains],
    whitelisted_agents: [...current.whitelisted_agents],
    whitelisted_issuers: [...current.whitelisted_issuers],
    own_agents: [...current.own_agents],
  };
  const addUnique = (arr: string[], v: string) => {
    if (!arr.includes(v)) arr.push(v);
  };
  const removeAll = (arr: string[], v: string) => {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
  };
  switch (message.kind) {
    case 'block_agent':       addUnique(next.blocked_agents, message.agent_id); break;
    case 'block_issuer':      addUnique(next.blocked_issuers, message.issuer); break;
    case 'block_domain':      addUnique(next.blocked_domains, message.domain); break;
    case 'unblock_agent':     removeAll(next.blocked_agents, message.agent_id); break;
    case 'unblock_issuer':    removeAll(next.blocked_issuers, message.issuer); break;
    case 'whitelist_agent':   addUnique(next.whitelisted_agents, message.agent_id); break;
    case 'whitelist_issuer':  addUnique(next.whitelisted_issuers, message.issuer); break;
    case 'mark_as_own_agent': addUnique(next.own_agents, message.agent_id); break;
    case 'unmark_own_agent':  removeAll(next.own_agents, message.agent_id); break;
    default: return current;
  }
  await setUserLists(next);
  cachedUserLists = next;
  void repaintAllBadges();
  return next;
}

export default defineBackground({
  type: 'module',
  main() {
    void rehydrate();
    void getUserLists().then((lists) => { cachedUserLists = lists; void repaintAllBadges(); });

    chrome.runtime.onInstalled.addListener(async () => {
      // First-run setup
      const settings = await getSettings();
      void settings;
    });

    // Keep cachedUserLists fresh if the user edits them through the Options page
    // or another extension surface concurrently.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (!('agentpki:user_lists' in changes)) return;
      const newValue = changes['agentpki:user_lists']?.newValue;
      if (newValue && typeof newValue === 'object') {
        cachedUserLists = { ...DEFAULT_USER_LISTS, ...(newValue as UserLists) };
        void repaintAllBadges();
      }
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
      if (message.kind === 'request_user_lists') {
        sendResponse({ kind: 'user_lists', lists: cachedUserLists });
        return true;
      }
      if (message.kind === 'request_trusted_issuers') {
        void getTrustedIssuers().then((issuers) => {
          sendResponse({ kind: 'trusted_issuers', issuers });
        });
        return true;
      }
      if (message.kind === 'request_reputation') {
        void getReputation(message.passport_id, { fresh: message.fresh }).then((summary) => {
          sendResponse({ kind: 'reputation', summary });
        });
        return true;
      }
      if (message.kind === 'request_activity') {
        void getActivity().then((entries) => {
          sendResponse({ kind: 'activity', entries });
        });
        return true;
      }
      if (message.kind === 'report_abuse') {
        void (async () => {
          try {
            const [installationId, settings] = await Promise.all([
              getInstallationId(),
              getSettings(),
            ]);
            const payload = {
              v: 1 as const,
              reporter: installationId,
              reporter_kind: 'extension' as const,
              ...message.report,
            };
            const result = await submitAbuseReport(payload, { base: settings.verifier_base });
            // Invalidate reputation cache for this passport so the popup
            // reflects the new report immediately on next open.
            if (payload.passport_jti) {
              reputationCache.delete(payload.passport_jti);
            }
            sendResponse({
              kind: 'abuse_report_result',
              accepted: result.accepted,
              report_id: result.report_id,
              error: result.error,
            });
          } catch (e) {
            console.warn('[AgentPKI] abuse report failed:', e);
            sendResponse({
              kind: 'abuse_report_result',
              accepted: false,
              error: e instanceof Error ? e.message : 'unknown_error',
            });
          }
        })();
        return true;
      }
      if (
        message.kind === 'block_agent' ||
        message.kind === 'block_issuer' ||
        message.kind === 'block_domain' ||
        message.kind === 'unblock_agent' ||
        message.kind === 'unblock_issuer' ||
        message.kind === 'whitelist_agent' ||
        message.kind === 'whitelist_issuer' ||
        message.kind === 'mark_as_own_agent' ||
        message.kind === 'unmark_own_agent'
      ) {
        void applyListMutation(message).then((updated) => {
          sendResponse({ kind: 'user_lists', lists: updated });
        });
        return true;
      }
      return false;
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      tabStates.delete(tabId);
      void persist();
    });

    // ─── (2) Response header detection ───────────────────────────────
    // chrome.webRequest.onHeadersReceived in observation-only mode (MV3-safe).
    // Watches every response across <all_urls> for an AgentPKI-Token header
    // and synthesizes an observation tied to the tab that initiated the
    // request. Sub-resource responses (scripts, XHRs) are honored too — that's
    // the most common shape, since the agent runs in JS and gets its passport
    // via an authenticated XHR from its issuer.
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        if (details.tabId < 0) return; // ignore service-worker-initiated requests
        const headers = details.responseHeaders;
        if (!headers) return;
        let token: string | undefined;
        for (const h of headers) {
          if (h.name.toLowerCase() === 'agentpki-token' && h.value) {
            // Allow either bare token or `Bearer v4.public.…`
            const v = h.value.replace(/^Bearer\s+/i, '').trim();
            if (v.startsWith('v4.public.')) {
              token = v;
              break;
            }
          }
        }
        if (!token) return;
        const obs: AgentObservation = {
          detected_at: Math.floor(Date.now() / 1000),
          tab_id: details.tabId,
          page_url: details.initiator || details.url,
          vector: 'response_header',
          token,
          issuer_hint: safeHost(details.url),
        };
        void ingestObservation(details.tabId, obs);
      },
      { urls: ['<all_urls>'] },
      ['responseHeaders'],
    );

    function safeHost(url: string): string | undefined {
      try {
        return new URL(url).host;
      } catch {
        return undefined;
      }
    }

    // Reset per-tab state on every page navigation (including refresh).
    // Without this, a verified badge from a previous page-load lingers when
    // the same URL is reloaded — the stale verification keeps painting green
    // even though the refreshed page has no agent.
    chrome.webNavigation.onCommitted.addListener((details) => {
      if (details.frameId !== 0) return; // ignore iframes
      tabStates.delete(details.tabId);
      void paintBadge(details.tabId, 'gray');
      void persist();
    });
  },
});
