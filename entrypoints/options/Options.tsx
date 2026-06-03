import { useEffect, useMemo, useState } from 'react';
import type {
  ActivityLogEntry,
  Settings,
  UserLists,
  VerificationResult,
} from '../../lib/types';
import { DEFAULT_SETTINGS, DEFAULT_USER_LISTS } from '../../lib/storage';

type VerdictFilter = 'all' | VerificationResult['verdict'] | 'no_token';

export function Options() {
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [lists, setLists] = useState<UserLists>(DEFAULT_USER_LISTS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [verifierBaseDraft, setVerifierBaseDraft] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [actRes, listsRes, settingsRes] = await Promise.all([
          chrome.runtime.sendMessage({ kind: 'request_activity' }) as Promise<{
            kind: 'activity';
            entries: ActivityLogEntry[];
          }>,
          chrome.runtime.sendMessage({ kind: 'request_user_lists' }) as Promise<{
            kind: 'user_lists';
            lists: UserLists;
          }>,
          chrome.runtime.sendMessage({ kind: 'request_settings' }) as Promise<{
            kind: 'settings';
            settings: Settings;
          }>,
        ]);
        setActivity((actRes?.entries ?? []).slice().reverse()); // newest first
        setLists(listsRes?.lists ?? DEFAULT_USER_LISTS);
        const s = settingsRes?.settings ?? DEFAULT_SETTINGS;
        setSettings(s);
        setVerifierBaseDraft(s.verifier_base ?? '');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const remove = async (
    kind: string,
    value: string,
    field: 'agent_id' | 'issuer' | 'domain',
  ) => {
    const payload: Record<string, string> = { kind };
    payload[field] = value;
    const res = (await chrome.runtime.sendMessage(payload)) as {
      kind: 'user_lists';
      lists: UserLists;
    };
    if (res?.lists) setLists(res.lists);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const trimmed = verifierBaseDraft.trim();
      const partial: Partial<Settings> = {
        verifier_base: trimmed.length > 0 ? trimmed : undefined,
      };
      const res = (await chrome.runtime.sendMessage({
        kind: 'update_settings',
        settings: partial,
      })) as { kind: 'settings'; settings: Settings };
      if (res?.settings) {
        setSettings(res.settings);
        setToast('Settings saved.');
        setTimeout(() => setToast(null), 3000);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const clearAllData = async () => {
    const res = (await chrome.runtime.sendMessage({
      kind: 'clear_all_data',
    })) as { kind: 'clear_all_data_result'; cleared: boolean };
    if (res?.cleared) {
      setActivity([]);
      setLists(DEFAULT_USER_LISTS);
      setSettings(DEFAULT_SETTINGS);
      setVerifierBaseDraft('');
      setClearConfirm(false);
      setToast('All local data cleared.');
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast('Clear failed — see SW console.');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(activity, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentpki-activity-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredActivity = useMemo(() => {
    if (verdictFilter === 'all') return activity;
    return activity.filter((e) => e.verdict === verdictFilter);
  }, [activity, verdictFilter]);

  const verdictCounts = useMemo(() => {
    const c: Record<string, number> = { all: activity.length };
    for (const e of activity) c[e.verdict] = (c[e.verdict] ?? 0) + 1;
    return c;
  }, [activity]);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-zinc-950 text-zinc-100 min-h-screen font-sans relative">
      <header className="border-b border-zinc-800 pb-4 mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">AgentPKI Settings</h1>
          <p className="text-sm text-zinc-400 mt-1">AI Agent Verification — v0.1</p>
        </div>
        <a
          href="https://agentpki.dev"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          agentpki.dev →
        </a>
      </header>

      {!loaded && <p className="text-sm text-zinc-500">Loading…</p>}

      {loaded && (
        <section className="space-y-6">
          <ListCard
            title="Your own agents"
            description="Agents you operate. Marked with the blue badge when detected."
            items={lists.own_agents}
            empty="None yet. Click 'This is my agent' in the popup when you visit a page running your bot."
            onRemove={(v) => remove('unmark_own_agent', v, 'agent_id')}
          />
          <ListCard
            title="Blocked agents"
            description="Agents you've explicitly blocked. Red badge whenever seen."
            items={lists.blocked_agents}
            empty="None blocked."
            onRemove={(v) => remove('unblock_agent', v, 'agent_id')}
          />
          <ListCard
            title="Blocked issuers"
            description="Entire issuer domains you've blocked. Every agent from these gets the red badge."
            items={lists.blocked_issuers}
            empty="None blocked."
            onRemove={(v) => remove('unblock_issuer', v, 'issuer')}
          />

          <Card
            title="Activity log"
            right={
              activity.length > 0 ? (
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={downloadJson}
                >
                  Download JSON
                </button>
              ) : null
            }
          >
            <p className="text-xs text-zinc-500 mb-3">
              Last {activity.length} detection events on this device. Rolling
              buffer — caps at 200 entries. Stored locally only; never sent
              anywhere.
            </p>
            {activity.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <FilterChip
                  active={verdictFilter === 'all'}
                  count={verdictCounts.all ?? 0}
                  onClick={() => setVerdictFilter('all')}
                >
                  All
                </FilterChip>
                <FilterChip
                  active={verdictFilter === 'allow'}
                  count={verdictCounts.allow ?? 0}
                  onClick={() => setVerdictFilter('allow')}
                >
                  Verified
                </FilterChip>
                <FilterChip
                  active={verdictFilter === 'throttle'}
                  count={verdictCounts.throttle ?? 0}
                  onClick={() => setVerdictFilter('throttle')}
                >
                  Throttled
                </FilterChip>
                <FilterChip
                  active={verdictFilter === 'deny'}
                  count={verdictCounts.deny ?? 0}
                  onClick={() => setVerdictFilter('deny')}
                >
                  Denied
                </FilterChip>
                <FilterChip
                  active={verdictFilter === 'no_token'}
                  count={verdictCounts.no_token ?? 0}
                  onClick={() => setVerdictFilter('no_token')}
                >
                  No token
                </FilterChip>
                <FilterChip
                  active={verdictFilter === 'unknown'}
                  count={verdictCounts.unknown ?? 0}
                  onClick={() => setVerdictFilter('unknown')}
                >
                  Unknown
                </FilterChip>
              </div>
            )}
            {filteredActivity.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {activity.length === 0
                  ? 'No events yet.'
                  : `No events with verdict "${verdictFilter}".`}
              </p>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto font-mono text-xs">
                {filteredActivity.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-baseline gap-3 px-2 py-1.5 rounded hover:bg-zinc-900/50"
                  >
                    <span className="text-zinc-500 w-32 shrink-0">
                      {new Date(e.ts * 1000).toLocaleString()}
                    </span>
                    <VerdictDot verdict={e.verdict} />
                    <span className="text-zinc-300 break-all">
                      {e.issuer ?? '(unknown issuer)'}
                      {e.agent_id && (
                        <span className="text-zinc-500"> · {e.agent_id}</span>
                      )}
                    </span>
                    <span className="text-zinc-600 ml-auto shrink-0">
                      {e.vector}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Advanced settings">
            <p className="text-xs text-zinc-500 mb-4">
              Most users should leave these alone. Useful for testing against
              a local verifier or contributing to AgentPKI.
            </p>
            <label className="block mb-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                Verifier base URL
              </span>
              <input
                type="text"
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 px-2 py-1.5 font-mono"
                placeholder="https://verify.agentpki.dev (default)"
                value={verifierBaseDraft}
                onChange={(e) => setVerifierBaseDraft(e.target.value)}
                disabled={savingSettings}
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Override only if you're running your own verifier. Empty =
                use the default at verify.agentpki.dev.
              </p>
            </label>

            <label className="flex items-start gap-2 mb-4 cursor-not-allowed opacity-60">
              <input
                type="checkbox"
                checked={false}
                disabled
                className="mt-0.5"
              />
              <span className="text-xs text-zinc-400">
                Anonymous telemetry{' '}
                <span className="text-zinc-600">
                  (permanently disabled in v0.1)
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded text-xs font-medium bg-violet-950 text-violet-200 border border-violet-800 hover:bg-violet-900 disabled:opacity-50"
                onClick={saveSettings}
                disabled={
                  savingSettings ||
                  verifierBaseDraft.trim() === (settings.verifier_base ?? '')
                }
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </Card>

          <Card title="Privacy">
            <p className="text-sm text-zinc-300">
              AgentPKI does not collect personal data. All detection happens
              locally in your browser. Only the agent's passport token is sent
              to <code className="text-violet-300">verify.agentpki.dev</code>{' '}
              for cryptographic verification. Anonymous telemetry is{' '}
              <strong>off by default</strong> and cannot be enabled in v0.1.
            </p>
            <p className="text-sm text-zinc-400 mt-2">
              Full privacy policy:{' '}
              <a
                className="text-violet-300 hover:text-violet-200"
                href="https://agentpki.dev/privacy"
                target="_blank"
                rel="noreferrer"
              >
                agentpki.dev/privacy
              </a>
              . Source on{' '}
              <a
                className="text-violet-300 hover:text-violet-200"
                href="https://github.com/agentpki/extension"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>{' '}
              — MIT licensed.
            </p>
          </Card>

          <Card title="Danger zone">
            <p className="text-xs text-zinc-500 mb-3">
              Wipe everything this extension has stored on your device: own/
              blocked lists, activity log, settings, install UUID. Verified
              badges in open tabs revert to gray until next detection.
            </p>
            {!clearConfirm ? (
              <button
                className="px-3 py-1.5 rounded text-xs font-medium bg-red-950 text-red-300 border border-red-800 hover:bg-red-900"
                onClick={() => setClearConfirm(true)}
              >
                Clear all local data…
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-300">Are you sure?</span>
                <button
                  className="px-3 py-1.5 rounded text-xs font-medium bg-red-900 text-red-100 border border-red-700 hover:bg-red-800"
                  onClick={clearAllData}
                >
                  Yes, clear everything
                </button>
                <button
                  className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800"
                  onClick={() => setClearConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </Card>
        </section>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded bg-green-900/90 text-green-200 border border-green-800 text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-medium">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function ListCard({
  title,
  description,
  items,
  empty,
  onRemove,
}: {
  title: string;
  description: string;
  items: string[];
  empty: string;
  onRemove: (value: string) => void;
}) {
  return (
    <Card title={title}>
      <p className="text-xs text-zinc-500 mb-3">{description}</p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="space-y-1 font-mono text-xs">
          {items.map((v) => (
            <li
              key={v}
              className="flex items-center gap-3 px-2 py-1.5 rounded bg-zinc-900/60 border border-zinc-800"
            >
              <span className="text-zinc-200 break-all flex-1">{v}</span>
              <button
                className="text-zinc-500 hover:text-zinc-200 shrink-0"
                onClick={() => onRemove(v)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FilterChip({
  children,
  active,
  count,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`px-2 py-1 rounded-full text-[10px] font-medium border transition ${
        active
          ? 'bg-violet-900/60 text-violet-100 border-violet-700'
          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
      }`}
      onClick={onClick}
    >
      {children} <span className="opacity-60">({count})</span>
    </button>
  );
}

function VerdictDot({ verdict }: { verdict: ActivityLogEntry['verdict'] }) {
  const color: Record<ActivityLogEntry['verdict'], string> = {
    allow: 'bg-green-400',
    throttle: 'bg-amber-400',
    deny: 'bg-red-400',
    unknown: 'bg-zinc-500',
    no_token: 'bg-zinc-600',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${color[verdict]}`}
      title={`verdict: ${verdict}`}
    />
  );
}
