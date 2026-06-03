import { useCallback, useEffect, useState } from 'react';
import type {
  AbuseReportPayload,
  ReputationSummary,
  TabState,
  TrustedIssuer,
  UserLists,
} from '../../lib/types';
import { DEFAULT_USER_LISTS } from '../../lib/storage';

export function Popup() {
  const [state, setState] = useState<TabState | null>(null);
  const [lists, setLists] = useState<UserLists>(DEFAULT_USER_LISTS);
  const [trustedIssuers, setTrustedIssuers] = useState<TrustedIssuer[]>([]);
  const [reputation, setReputation] = useState<ReputationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) {
        setLoading(false);
        return;
      }
      const [tabRes, listsRes, trustedRes] = await Promise.all([
        chrome.runtime.sendMessage({ kind: 'request_tab_state', tab_id: tab.id }) as Promise<
          { kind: 'tab_state'; state: TabState | null }
        >,
        chrome.runtime.sendMessage({ kind: 'request_user_lists' }) as Promise<
          { kind: 'user_lists'; lists: UserLists }
        >,
        chrome.runtime.sendMessage({ kind: 'request_trusted_issuers' }) as Promise<
          { kind: 'trusted_issuers'; issuers: TrustedIssuer[] }
        >,
      ]);
      const tabState = tabRes?.state ?? null;
      setState(tabState);
      setLists(listsRes?.lists ?? DEFAULT_USER_LISTS);
      setTrustedIssuers(trustedRes?.issuers ?? []);

      // Reputation lookup — only if we have a verified passport with a jti
      const jti = tabState?.verification?.passport?.jti;
      if (jti) {
        const repRes = (await chrome.runtime.sendMessage({
          kind: 'request_reputation',
          passport_id: jti,
        })) as { kind: 'reputation'; summary: ReputationSummary | null };
        setReputation(repRes?.summary ?? null);
      }
    } catch (e) {
      console.warn('[AgentPKI popup] load failed', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendMessage = async (msg: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = (await chrome.runtime.sendMessage(msg)) as { kind: 'user_lists'; lists: UserLists };
      if (res?.lists) setLists(res.lists);
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (
    report: Omit<AbuseReportPayload, 'reporter' | 'reporter_kind' | 'v'>,
  ) => {
    setBusy(true);
    try {
      const res = (await chrome.runtime.sendMessage({
        kind: 'report_abuse',
        report,
      })) as { kind: 'abuse_report_result'; accepted: boolean; report_id?: string; error?: string };
      if (res?.accepted) {
        setToast({ kind: 'ok', text: 'Report submitted. Thanks.' });
        setReportOpen(false);
        // Re-fetch reputation with `fresh:true` so we bypass the verifier's
        // 60s edge cache and the popup count increments immediately.
        const jti = state?.verification?.passport?.jti;
        if (jti) {
          const repRes = (await chrome.runtime.sendMessage({
            kind: 'request_reputation',
            passport_id: jti,
            fresh: true,
          })) as { kind: 'reputation'; summary: ReputationSummary | null };
          setReputation(repRes?.summary ?? null);
        }
      } else {
        setToast({
          kind: 'err',
          text: 'Report failed: ' + (res?.error ?? 'unknown error'),
        });
      }
    } finally {
      setBusy(false);
      // Auto-dismiss after 4s
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="w-[380px] min-h-[200px] p-4 bg-zinc-950 text-zinc-100 font-sans relative">
      <header className="flex items-center gap-2 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
        <span className="font-semibold tracking-tight">AgentPKI</span>
        <span className="text-xs text-zinc-500 ml-auto">AI Agent Verification</span>
      </header>

      {loading && <Skeleton />}

      {!loading && loadError && (
        <div className="text-sm text-amber-300 bg-amber-950/40 border border-amber-900 rounded p-3">
          <p className="font-medium mb-1">Couldn't reach the background worker.</p>
          <p className="text-xs text-amber-200/80">{loadError}</p>
          <p className="text-xs mt-2 text-zinc-400">
            Try reloading the extension at <code>chrome://extensions</code>.
          </p>
        </div>
      )}

      {!loading && !loadError && !state && <Empty />}

      {!loading && !loadError && state && (
        <TabStateView
          state={state}
          lists={lists}
          trustedIssuers={trustedIssuers}
          reputation={reputation}
          busy={busy}
          onAction={sendMessage}
          onOpenReport={() => setReportOpen(true)}
        />
      )}

      {reportOpen && state?.verification?.passport && (
        <ReportAbuseModal
          passportJti={state.verification.passport.jti}
          agentId={state.verification.passport.agent_id}
          issuer={state.verification.passport.issuer}
          pageUrl={state.page_url}
          busy={busy}
          onClose={() => setReportOpen(false)}
          onSubmit={submitReport}
        />
      )}

      {toast && (
        <div
          className={`absolute left-4 right-4 bottom-4 px-3 py-2 rounded text-xs font-medium shadow-lg ${
            toast.kind === 'ok'
              ? 'bg-green-900/80 text-green-200 border border-green-800'
              : 'bg-red-900/80 text-red-200 border border-red-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      <footer className="mt-4 pt-3 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500">
        <a className="hover:text-zinc-300" href="https://agentpki.dev" target="_blank" rel="noreferrer">
          agentpki.dev
        </a>
        <div className="flex gap-3">
          <button
            className="hover:text-zinc-300"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            Activity & Settings ⚙
          </button>
        </div>
      </footer>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 bg-zinc-800 rounded w-3/4" />
      <div className="h-3 bg-zinc-800 rounded w-1/2" />
      <div className="h-3 bg-zinc-800 rounded w-2/3" />
    </div>
  );
}

function Empty() {
  return (
    <div className="text-sm text-zinc-400">
      <p className="font-medium text-zinc-300 mb-1">No agent detected on this page.</p>
      <p className="text-xs leading-relaxed">
        The toolbar badge will turn green when an AgentPKI-verified agent is present,
        yellow if an agent is detected but unverified, red if revoked or reported
        for abuse, and blue if it's your own agent.
      </p>
    </div>
  );
}

function TabStateView({
  state,
  lists,
  trustedIssuers,
  reputation,
  busy,
  onAction,
  onOpenReport,
}: {
  state: TabState;
  lists: UserLists;
  trustedIssuers: TrustedIssuer[];
  reputation: ReputationSummary | null;
  busy: boolean;
  onAction: (msg: Record<string, unknown>) => Promise<void>;
  onOpenReport: () => void;
}) {
  const v = state.verification;
  const agentId = v?.passport?.agent_id;
  const issuer = v?.passport?.issuer;

  const trustedEntry = issuer ? trustedIssuers.find((t) => t.issuer === issuer) : undefined;
  const isTrustedIssuer = !!trustedEntry;
  const isBlocked = !!agentId && lists.blocked_agents.includes(agentId);
  const isOwn = !!agentId && lists.own_agents.includes(agentId);
  const isIssuerBlocked = !!issuer && lists.blocked_issuers.includes(issuer);
  // Show "verifying…" hint when we have observations but no verify result yet
  const verifyingPending = !v && state.observations.some((o) => o.token);

  return (
    <div className="text-sm">
      <BadgePill color={state.badge} />
      {verifyingPending && (
        <p className="text-xs text-zinc-500 mt-2 animate-pulse">
          Verifying token with verify.agentpki.dev…
        </p>
      )}
      <div className="mt-3 space-y-2">
        {v?.passport && (
          <>
            <Field label="Issuer">
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                <code className="text-violet-300">{v.passport.issuer}</code>
                {isTrustedIssuer && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-300 border border-green-800"
                    title={trustedEntry?.note ?? 'On the AgentPKI verified-issuer list'}
                  >
                    ✓ Verified
                  </span>
                )}
                {(trustedEntry?.name || v.passport.issuer_name) && (
                  <span className="text-zinc-400 text-xs">
                    ({trustedEntry?.name ?? v.passport.issuer_name})
                  </span>
                )}
              </span>
            </Field>
            <Field label="Agent">
              <code className="text-zinc-200 text-xs break-all">{v.passport.agent_id}</code>
            </Field>
            <Field label="Scopes">
              <code className="text-zinc-300 text-xs">
                {v.passport.scopes.join(', ') || '(none)'}
              </code>
            </Field>
            <Field label="Tier">
              <span className="text-zinc-300">{v.passport.tier}</span>
            </Field>
            {typeof v.abuse_score === 'number' && (
              <Field label="Abuse score">
                <span className={v.abuse_score > 0.5 ? 'text-red-400' : 'text-zinc-300'}>
                  {v.abuse_score.toFixed(2)}
                </span>
              </Field>
            )}
            {reputation && reputation.data_available && (
              <Field label="Reputation">
                <span className="flex items-center gap-2 text-xs">
                  <span className={reputationColor(reputation.reputation_score)}>
                    {reputationLabel(reputation.reputation_score)}
                  </span>
                  <span className="text-zinc-500">
                    · {reputation.abuse_reports_count} report
                    {reputation.abuse_reports_count === 1 ? '' : 's'} filed
                    {reputation.last_report_at && (
                      <> (last {timeAgo(reputation.last_report_at)})</>
                    )}
                  </span>
                </span>
              </Field>
            )}
            {v.failure_reason && (
              <Field label="Reason">
                <code className="text-red-300 text-xs">{v.failure_reason}</code>
              </Field>
            )}
          </>
        )}
        {!v && state.observations.length > 0 && !verifyingPending && (
          <p className="text-xs text-zinc-400">
            Detected {state.observations.length} signal
            {state.observations.length === 1 ? '' : 's'} on this page (
            {state.observations.map((o) => o.vector).join(', ')}). No verifiable
            token attached.
          </p>
        )}
      </div>

      {agentId && (
        <div className="mt-4 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-2">
          {!isBlocked && !isOwn && (
            <ActionBtn
              variant="danger"
              disabled={busy}
              onClick={() => onAction({ kind: 'block_agent', agent_id: agentId })}
            >
              ⛔ Block agent
            </ActionBtn>
          )}
          {isBlocked && (
            <ActionBtn
              variant="ghost"
              disabled={busy}
              onClick={() => onAction({ kind: 'unblock_agent', agent_id: agentId })}
            >
              ↺ Unblock agent
            </ActionBtn>
          )}
          {!isIssuerBlocked && issuer && (
            <ActionBtn
              variant="ghost"
              disabled={busy}
              onClick={() => onAction({ kind: 'block_issuer', issuer })}
            >
              Block issuer
            </ActionBtn>
          )}
          {isIssuerBlocked && issuer && (
            <ActionBtn
              variant="ghost"
              disabled={busy}
              onClick={() => onAction({ kind: 'unblock_issuer', issuer })}
            >
              ↺ Unblock issuer
            </ActionBtn>
          )}
          {!isOwn && (
            <ActionBtn
              variant="info"
              disabled={busy}
              onClick={() => onAction({ kind: 'mark_as_own_agent', agent_id: agentId })}
            >
              👤 This is my agent
            </ActionBtn>
          )}
          {isOwn && (
            <ActionBtn
              variant="ghost"
              disabled={busy}
              onClick={() => onAction({ kind: 'unmark_own_agent', agent_id: agentId })}
            >
              ↺ Not my agent
            </ActionBtn>
          )}
          {v?.passport && !isOwn && (
            <ActionBtn
              variant="danger"
              disabled={busy}
              onClick={onOpenReport}
            >
              🚩 Report abuse
            </ActionBtn>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: 'danger' | 'info' | 'ghost';
}) {
  const base = 'px-2 py-1.5 rounded text-xs font-medium transition disabled:opacity-50';
  const styles =
    variant === 'danger'
      ? 'bg-red-950 text-red-300 border border-red-800 hover:bg-red-900'
      : variant === 'info'
      ? 'bg-blue-950 text-blue-300 border border-blue-800 hover:bg-blue-900'
      : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800';
  return (
    <button className={`${base} ${styles}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function reputationLabel(score: number): string {
  if (score < 0.05) return 'Clean';
  if (score < 0.2) return 'Mostly clean';
  if (score < 0.4) return 'Some reports';
  if (score < 0.7) return 'Many reports';
  return 'High-confidence bad';
}
function reputationColor(score: number): string {
  if (score < 0.2) return 'text-green-300';
  if (score < 0.4) return 'text-amber-300';
  if (score < 0.7) return 'text-orange-300';
  return 'text-red-400';
}
function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function BadgePill({ color }: { color: TabState['badge'] }) {
  const style: Record<TabState['badge'], { bg: string; text: string; label: string }> = {
    gray: { bg: 'bg-zinc-800', text: 'text-zinc-400', label: 'No agent' },
    white: { bg: 'bg-zinc-700', text: 'text-zinc-200', label: 'Verifying…' },
    green: { bg: 'bg-green-900/40', text: 'text-green-300', label: '✓  Verified' },
    yellow: { bg: 'bg-amber-900/40', text: 'text-amber-300', label: '!  Unverified' },
    red: { bg: 'bg-red-900/40', text: 'text-red-300', label: '⛔  Blocked / Revoked' },
    blue: { bg: 'bg-blue-900/40', text: 'text-blue-300', label: '👤  Your own agent' },
  };
  const s = style[color];
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md ${s.bg} ${s.text} font-mono text-sm`}>
      {s.label}
    </div>
  );
}

// ─── Report-abuse modal ────────────────────────────────────────────────
// User picks a category + severity + writes a short description. The
// modal sends a `report_abuse` message to background, which fills in the
// install UUID and reporter_kind:'extension' and POSTs to the verifier.

const CATEGORIES: Array<{ value: AbuseReportPayload['category']; label: string }> = [
  { value: 'impersonation', label: 'Impersonating a brand or person' },
  { value: 'fraud', label: 'Fraud / phishing / scam' },
  { value: 'harm', label: 'Harmful or unsafe behaviour' },
  { value: 'scope-violation', label: 'Acting outside its declared scopes' },
  { value: 'rate-abuse', label: 'Rate abuse / scraping' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES: Array<{ value: AbuseReportPayload['severity']; label: string }> = [
  { value: 'low', label: 'Low — annoyance' },
  { value: 'medium', label: 'Medium — meaningful harm' },
  { value: 'high', label: 'High — material damage' },
  { value: 'critical', label: 'Critical — fraud, safety, large-scale' },
];

function ReportAbuseModal({
  passportJti,
  agentId,
  issuer,
  pageUrl,
  busy,
  onClose,
  onSubmit,
}: {
  passportJti: string;
  agentId: string;
  issuer: string;
  pageUrl: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    report: Omit<AbuseReportPayload, 'reporter' | 'reporter_kind' | 'v'>,
  ) => Promise<void>;
}) {
  const [category, setCategory] = useState<AbuseReportPayload['category']>('impersonation');
  const [severity, setSeverity] = useState<AbuseReportPayload['severity']>('medium');
  const [description, setDescription] = useState('');
  const [includePageUrl, setIncludePageUrl] = useState(true);

  const canSubmit = description.trim().length >= 10 && !busy;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmit({
      passport_jti: passportJti,
      agent_id: agentId,
      category,
      severity,
      occurred_at: Math.floor(Date.now() / 1000),
      description: description.trim(),
      evidence_urls: includePageUrl && pageUrl ? [pageUrl] : undefined,
    });
  };

  return (
    <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur z-10 flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">Report abuse</h2>
        <button
          className="text-zinc-500 hover:text-zinc-200 text-xs"
          onClick={onClose}
          disabled={busy}
        >
          ✕ Close
        </button>
      </div>

      <div className="text-xs text-zinc-400 mb-3">
        Reporting <code className="text-zinc-300">{agentId}</code> from{' '}
        <code className="text-violet-300">{issuer}</code>.
      </div>

      <label className="block mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">Category</span>
        <select
          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 px-2 py-1.5"
          value={category}
          onChange={(e) => setCategory(e.target.value as AbuseReportPayload['category'])}
          disabled={busy}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">Severity</span>
        <select
          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 px-2 py-1.5"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as AbuseReportPayload['severity'])}
          disabled={busy}
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          What happened? <span className="text-zinc-600">(min 10 chars)</span>
        </span>
        <textarea
          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 px-2 py-1.5 h-20 resize-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences. What did the agent do that warrants a report?"
          disabled={busy}
          maxLength={1000}
        />
        <div className="text-[10px] text-zinc-600 mt-1 text-right">
          {description.length}/1000
        </div>
      </label>

      <label className="flex items-start gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={includePageUrl}
          onChange={(e) => setIncludePageUrl(e.target.checked)}
          disabled={busy}
          className="mt-0.5"
        />
        <span className="text-xs text-zinc-400">
          Include this page URL as evidence
          <br />
          <code className="text-[10px] text-zinc-600 break-all">{pageUrl}</code>
        </span>
      </label>

      <div className="text-[10px] text-zinc-600 mb-3 leading-relaxed">
        Your report is sent with an anonymous UUID — no email, no IP retention.
        It feeds into the public reputation signal for this passport. False
        reports erode reporter weight over time.
      </div>

      <div className="flex gap-2 mt-auto">
        <button
          className="flex-1 px-3 py-2 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-50"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="flex-1 px-3 py-2 rounded text-xs font-medium bg-red-950 text-red-300 border border-red-800 hover:bg-red-900 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {busy ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </div>
  );
}
