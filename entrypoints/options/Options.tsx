import { useEffect, useState } from 'react';
import type { ActivityLogEntry, UserLists } from '../../lib/types';
import { DEFAULT_USER_LISTS } from '../../lib/storage';

export function Options() {
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [lists, setLists] = useState<UserLists>(DEFAULT_USER_LISTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [actRes, listsRes] = await Promise.all([
          chrome.runtime.sendMessage({ kind: 'request_activity' }) as Promise<{
            kind: 'activity';
            entries: ActivityLogEntry[];
          }>,
          chrome.runtime.sendMessage({ kind: 'request_user_lists' }) as Promise<{
            kind: 'user_lists';
            lists: UserLists;
          }>,
        ]);
        setActivity((actRes?.entries ?? []).slice().reverse()); // newest first
        setLists(listsRes?.lists ?? DEFAULT_USER_LISTS);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const remove = async (kind: string, value: string, field: 'agent_id' | 'issuer' | 'domain') => {
    const payload: Record<string, string> = { kind };
    payload[field] = value;
    const res = (await chrome.runtime.sendMessage(payload)) as { kind: 'user_lists'; lists: UserLists };
    if (res?.lists) setLists(res.lists);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(activity, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentpki-activity-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-zinc-950 text-zinc-100 min-h-screen font-sans">
      <header className="border-b border-zinc-800 pb-4 mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">AgentPKI Settings</h1>
          <p className="text-sm text-zinc-400 mt-1">AI Agent Verification — v0.1</p>
        </div>
        <a href="https://agentpki.dev" target="_blank" rel="noreferrer" className="text-xs text-zinc-500 hover:text-zinc-300">
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

          <Card title="Activity log" right={activity.length > 0 ? <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={downloadJson}>Download JSON</button> : null}>
            <p className="text-xs text-zinc-500 mb-3">
              Last {activity.length} detection events on this device. Rolling buffer
              — caps at 200 entries. Stored locally only; never sent anywhere.
            </p>
            {activity.length === 0 ? (
              <p className="text-sm text-zinc-500">No events yet.</p>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto font-mono text-xs">
                {activity.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-baseline gap-3 px-2 py-1.5 rounded hover:bg-zinc-900/50"
                  >
                    <span className="text-zinc-500 w-32 shrink-0">{new Date(e.ts * 1000).toLocaleString()}</span>
                    <VerdictDot verdict={e.verdict} />
                    <span className="text-zinc-300 break-all">
                      {e.issuer ?? '(unknown issuer)'}
                      {e.agent_id && <span className="text-zinc-500"> · {e.agent_id}</span>}
                    </span>
                    <span className="text-zinc-600 ml-auto shrink-0">{e.vector}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Privacy">
            <p className="text-sm text-zinc-300">
              AgentPKI does not collect personal data. All detection happens
              locally in your browser. Only the agent's passport token is sent
              to <code className="text-violet-300">verify.agentpki.dev</code> for
              cryptographic verification. Anonymous telemetry is{' '}
              <strong>off by default</strong> and cannot be enabled in v0.1.
            </p>
            <p className="text-sm text-zinc-400 mt-2">
              Source on{' '}
              <a className="text-violet-300 hover:text-violet-200" href="https://github.com/agentpki/extension" target="_blank" rel="noreferrer">
                GitHub
              </a>{' '}
              — MIT licensed.
            </p>
          </Card>
        </section>
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
