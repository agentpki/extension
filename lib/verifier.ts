// Thin client over verify.agentpki.dev/v1/* endpoints.
//
// Used by the background service worker (which has fetch + persistent
// storage) — content scripts forward observations via runtime messaging
// and the background does the actual network calls.

import type {
  VerificationResult,
  ReputationSummary,
  TrustedIssuer,
  AbuseReportPayload,
} from './types';

const DEFAULT_VERIFIER = 'https://verify.agentpki.dev';

export function verifierBase(override?: string): string {
  return (override && override.replace(/\/+$/, '')) || DEFAULT_VERIFIER;
}

/** POST /v1/verify */
export async function verifyToken(
  token: string,
  opts?: { base?: string; signal?: AbortSignal },
): Promise<VerificationResult> {
  const res = await fetch(verifierBase(opts?.base) + '/v1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    signal: opts?.signal,
  });
  if (!res.ok && res.status !== 400) {
    // 400 still returns a VerificationResult shape with verdict=deny
    throw new Error(`verify failed: HTTP ${res.status}`);
  }
  return (await res.json()) as VerificationResult;
}

/** GET /v1/trusted-issuers — cached at edge for 10 min. */
export async function fetchTrustedIssuers(opts?: {
  base?: string;
  signal?: AbortSignal;
}): Promise<TrustedIssuer[]> {
  const res = await fetch(verifierBase(opts?.base) + '/v1/trusted-issuers', {
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`trusted-issuers fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { v: 1; updated_at: number; issuers: TrustedIssuer[] };
  return body.issuers ?? [];
}

/** GET /v1/passport/:id/reputation */
export async function fetchReputation(
  passportId: string,
  opts?: { base?: string; signal?: AbortSignal },
): Promise<ReputationSummary> {
  const url =
    verifierBase(opts?.base) +
    '/v1/passport/' +
    encodeURIComponent(passportId) +
    '/reputation';
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) throw new Error(`reputation fetch failed: HTTP ${res.status}`);
  return (await res.json()) as ReputationSummary;
}

/** POST /v1/abuse/report — signed only by reporter_kind:'extension' + UUID. */
export async function submitAbuseReport(
  payload: AbuseReportPayload,
  opts?: { base?: string; signal?: AbortSignal },
): Promise<{ accepted: boolean; report_id?: string; error?: string }> {
  const res = await fetch(verifierBase(opts?.base) + '/v1/abuse/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts?.signal,
  });
  const body = (await res.json()) as {
    accepted?: boolean;
    report_id?: string;
    error?: string;
  };
  return {
    accepted: !!body.accepted,
    report_id: body.report_id,
    error: body.error,
  };
}
