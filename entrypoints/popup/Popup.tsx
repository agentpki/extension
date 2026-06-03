import { useEffect, useState } from 'react';
import type { TabState } from '../../lib/types';

export function Popup() {
  const [state, setState] = useState<TabState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab?.id) {
          setLoading(false);
          return;
        }
        const res = (await chrome.runtime.sendMessage({
          kind: 'request_tab_state',
          tab_id: tab.id,
        })) as { kind: 'tab_state'; state: TabState | null };
        setState(res?.state ?? null);
      } catch (e) {
        console.warn('[AgentPKI popup] failed to get tab state', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="w-[360px] min-h-[200px] p-4 bg-zinc-950 text-zinc-100 font-sans">
      <header className="flex items-center gap-2 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
        <span className="font-semibold tracking-tight">AgentPKI</span>
        <span className="text-xs text-zinc-500 ml-auto">AI Agent Verification</span>
      </header>

      {loading && <Skeleton />}

      {!loading && !state && (
        <Empty />
      )}

      {!loading && state && (
        <TabStateView state={state} />
      )}

      <footer className="mt-4 pt-3 border-t border-zinc-800 flex justify-between text-xs text-zinc-500">
        <a className="hover:text-zinc-300" href="https://agentpki.dev" target="_blank" rel="noreferrer">
          agentpki.dev
        </a>
        <button
          className="hover:text-zinc-300"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Settings ⚙
        </button>
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
        yellow if an agent is detected but unverified, and red if it's revoked or
        flagged for abuse.
      </p>
    </div>
  );
}

function TabStateView({ state }: { state: TabState }) {
  const v = state.verification;
  return (
    <div className="text-sm">
      <BadgePill color={state.badge} />
      <div className="mt-3 space-y-2">
        {v?.passport && (
          <>
            <Field label="Issuer">
              <code className="text-violet-300">{v.passport.issuer}</code>
              {v.passport.issuer_name && (
                <span className="text-zinc-400 ml-1">({v.passport.issuer_name})</span>
              )}
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
            {v.failure_reason && (
              <Field label="Reason">
                <code className="text-red-300 text-xs">{v.failure_reason}</code>
              </Field>
            )}
          </>
        )}
        {!v && state.observations.length > 0 && (
          <p className="text-xs text-zinc-400">
            Detected {state.observations.length} signal
            {state.observations.length === 1 ? '' : 's'} on this page (
            {state.observations.map((o) => o.vector).join(', ')}). No verifiable
            token attached.
          </p>
        )}
      </div>
    </div>
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

function BadgePill({ color }: { color: TabState['badge'] }) {
  const style: Record<TabState['badge'], { bg: string; text: string; label: string }> = {
    gray: { bg: 'bg-zinc-800', text: 'text-zinc-400', label: 'No agent' },
    white: { bg: 'bg-zinc-700', text: 'text-zinc-200', label: 'Verifying…' },
    green: { bg: 'bg-green-900/40', text: 'text-green-300', label: '✓  Verified' },
    yellow: { bg: 'bg-amber-900/40', text: 'text-amber-300', label: '!  Unverified' },
    red: { bg: 'bg-red-900/40', text: 'text-red-300', label: '⛔  Revoked / abuse' },
    blue: { bg: 'bg-blue-900/40', text: 'text-blue-300', label: '👤  Your own agent' },
  };
  const s = style[color];
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md ${s.bg} ${s.text} font-mono text-sm`}>
      {s.label}
    </div>
  );
}
