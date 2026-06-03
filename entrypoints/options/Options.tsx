// Options page — full settings UI lands Days 11-12. v0.1 ships a minimal
// "what is this" placeholder so the chrome.runtime.openOptionsPage() call
// from the popup doesn't dead-end.

export function Options() {
  return (
    <div className="max-w-2xl mx-auto p-8 bg-zinc-950 text-zinc-100 min-h-screen font-sans">
      <header className="border-b border-zinc-800 pb-4 mb-6">
        <h1 className="text-xl font-semibold">AgentPKI Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">AI Agent Verification — v0.1</p>
      </header>

      <section className="space-y-4">
        <Card title="Blocklist">
          <p className="text-sm text-zinc-400">Coming in v0.1 day 5-6.</p>
        </Card>
        <Card title="Whitelist (your own agents)">
          <p className="text-sm text-zinc-400">Coming in v0.1 day 5-6.</p>
        </Card>
        <Card title="Activity log">
          <p className="text-sm text-zinc-400">Coming in v0.1 day 5-6.</p>
        </Card>
        <Card title="Privacy">
          <p className="text-sm text-zinc-300">
            AgentPKI does not collect personal data. All detection happens
            locally in your browser. Only the agent's passport token is sent
            to <code className="text-violet-300">verify.agentpki.dev</code> for
            cryptographic verification. Anonymous telemetry is{' '}
            <strong>off by default</strong> and cannot be enabled in v0.1.
          </p>
        </Card>
      </section>

      <footer className="mt-10 pt-4 border-t border-zinc-800 text-xs text-zinc-500">
        <a href="https://agentpki.dev" target="_blank" rel="noreferrer" className="hover:text-zinc-300">
          agentpki.dev
        </a>
        <span className="mx-2">·</span>
        <a href="https://github.com/agentpki/extension" target="_blank" rel="noreferrer" className="hover:text-zinc-300">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="font-medium mb-2">{title}</h2>
      {children}
    </div>
  );
}
