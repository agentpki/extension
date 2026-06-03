// Core domain types for the AgentPKI extension.
//
// All extension components (content script, background service worker,
// popup, options page) speak this vocabulary. Changes here ripple
// everywhere — keep additions backwards-compatible.

/** Color state of the toolbar badge. */
export type BadgeColor = 'gray' | 'white' | 'green' | 'yellow' | 'red' | 'blue';

/** How the extension first noticed an agent on the current page. */
export type DetectionVector =
  | 'meta_tag'           // <meta name="agentpki-passport">
  | 'response_header'    // AgentPKI-Token: response header
  | 'js_library'         // window.<langchain/openai/anthropic/...> globals
  | 'rfc9421_signature'  // RFC 9421 HTTP Message Signatures on outbound (v0.1+)
  | 'ui_signature';      // Known agent UI overlays (Computer Use, Operator, Mariner)

/** Result of a verify.agentpki.dev/v1/verify call. */
export interface VerificationResult {
  verified: boolean;
  verdict: 'allow' | 'throttle' | 'deny' | 'unknown';
  failure_reason?: string;
  failure_detail?: string;
  passport?: {
    issuer: string;
    issuer_name?: string;
    agent_id: string;
    scopes: string[];
    tier: 1 | 2 | 3;
    issued_at: number;
    expires_at: number;
    jti: string;
  };
  abuse_score?: number;   // 0.0 (clean) .. 1.0 (high-confidence bad)
  crl_fresh?: boolean;
  replay_checked?: boolean;
  cached_until?: number;
  verifier_id?: string;
  elapsed_ms?: number;
}

/** One observation of an agent on a page. */
export interface AgentObservation {
  detected_at: number;             // unix seconds
  tab_id: number;
  page_url: string;                // URL where the agent was detected
  vector: DetectionVector;
  token?: string;                  // raw PASETO if we have it
  issuer_hint?: string;            // best-effort domain guess if no token
  library?: string;                // when vector === 'js_library'
  signature_kid?: string;          // when vector === 'rfc9421_signature'
}

/** Tab-scoped state managed by the background SW. */
export interface TabState {
  tab_id: number;
  page_url: string;
  observations: AgentObservation[];
  verification?: VerificationResult;
  /** Token string corresponding to the cached `verification`. Used to detect
   *  when a fresh observation carries a NEW token and we should re-verify. */
  last_verified_token?: string;
  badge: BadgeColor;
  last_updated: number;
}

/** Trusted-issuers directory entry from /v1/trusted-issuers. */
export interface TrustedIssuer {
  issuer: string;
  name: string;
  tier: number;
  note?: string;
  added_at: number;
}

/** Reputation summary from /v1/passport/:id/reputation. */
export interface ReputationSummary {
  v: 1;
  passport_id: string;
  abuse_reports_count: number;
  last_report_at: number | null;
  reputation_score: number;
  data_available: boolean;
  generated_at: number;
}

/** A row in the user's activity log (200-entry rolling buffer). */
export interface ActivityLogEntry {
  ts: number;
  page_url: string;
  vector: DetectionVector;
  agent_id?: string;
  issuer?: string;
  verdict: VerificationResult['verdict'] | 'no_token';
  action_taken?: 'blocked' | 'whitelisted' | 'reported' | 'allowed';
}

/** Persistent user-managed lists. */
export interface UserLists {
  blocked_agents: string[];        // passport_id or agent_id
  blocked_issuers: string[];       // issuer domain
  blocked_domains: string[];       // page domain
  whitelisted_agents: string[];
  whitelisted_issuers: string[];
  own_agents: string[];            // user's own agent_ids — render with blue badge
}

/** Extension settings (stored in chrome.storage.sync where applicable). */
export interface Settings {
  /** Show in-page overlay over detected agents. Default true. */
  in_page_overlay: boolean;
  /** Send anonymous telemetry (NOT enabled by v0.1 — privacy default). */
  anonymous_telemetry: boolean;
  /** Override the default verifier base URL (advanced). */
  verifier_base?: string;
}

/** Messages exchanged across context boundaries via chrome.runtime. */
export type ExtensionMessage =
  | { kind: 'observation'; observation: AgentObservation }
  | { kind: 'request_tab_state'; tab_id: number }
  | { kind: 'tab_state'; state: TabState | null }
  | { kind: 'request_user_lists' }
  | { kind: 'user_lists'; lists: UserLists }
  | { kind: 'request_trusted_issuers' }
  | { kind: 'trusted_issuers'; issuers: TrustedIssuer[] }
  | { kind: 'request_reputation'; passport_id: string }
  | { kind: 'reputation'; summary: ReputationSummary | null }
  | { kind: 'request_activity' }
  | { kind: 'activity'; entries: ActivityLogEntry[] }
  | { kind: 'report_abuse'; report: AbuseReportPayload }
  | { kind: 'block_agent'; agent_id: string }
  | { kind: 'block_issuer'; issuer: string }
  | { kind: 'block_domain'; domain: string }
  | { kind: 'unblock_agent'; agent_id: string }
  | { kind: 'unblock_issuer'; issuer: string }
  | { kind: 'whitelist_agent'; agent_id: string }
  | { kind: 'whitelist_issuer'; issuer: string }
  | { kind: 'mark_as_own_agent'; agent_id: string }
  | { kind: 'unmark_own_agent'; agent_id: string };

/** Payload sent to /v1/abuse/report. */
export interface AbuseReportPayload {
  v: 1;
  reporter: string;                  // UUID of this extension installation
  reporter_kind: 'extension';
  passport_jti?: string;
  agent_id?: string;
  category:
    | 'impersonation'
    | 'fraud'
    | 'harm'
    | 'scope-violation'
    | 'rate-abuse'
    | 'spam'
    | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  occurred_at: number;
  description: string;
  evidence_urls?: string[];
}
