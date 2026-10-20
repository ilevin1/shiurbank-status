import { CHECKS, staleAfterMs } from './catalog.mjs';
export function emptyState() {
  return { version: 1, startedAt: null, generatedAt: null, checks: {}, incidents: [], coverage: 'External synthetic checks from one GitHub runner location. Scheduled runs may be delayed.' };
}
export function isDue(check, prior, now) {
  return !prior?.checkedAt || now - Date.parse(prior.checkedAt) >= check.everyMinutes * 60000 - 15000;
}
export function applyResults(previous, results, now = Date.now()) {
  const state = structuredClone(previous?.version === 1 ? previous : emptyState());
  const timestamp = new Date(now).toISOString();
  state.startedAt ||= timestamp;
  state.generatedAt = timestamp;
  for (const definition of CHECKS) {
    const result = results.find(r => r.id === definition.id);
    if (!result) continue;
    const prior = state.checks[definition.id] || {};
    const day = timestamp.slice(0, 10);
    const failures = result.outcome === 'fail' ? (prior.failures || 0) + 1 : 0;
    const successes = result.outcome === 'pass' ? (prior.successes || 0) + 1 : 0;
    let status = result.outcome === 'unknown' ? 'unknown' : result.outcome === 'fail' ? (failures >= 2 ? 'outage' : 'degraded') : result.outcome === 'slow' ? 'degraded' : 'operational';
    const active = state.incidents.find(i => i.checkId === definition.id && !i.resolvedAt);
    // Require two successful scheduled observations before declaring recovery.
    if (active && result.outcome === 'pass' && successes < 2) status = 'degraded';
    const history = prior.history || {};
    history[day] ||= { pass: 0, fail: 0, slow: 0, unknown: 0 };
    history[day][result.outcome]++;
    const cutoff = new Date(now - 90 * 86400000).toISOString().slice(0,10);
    for (const key of Object.keys(history)) if (key < cutoff) delete history[key];
    state.checks[definition.id] = {
      status, checkedAt: timestamp, durationMs: result.durationMs ?? null,
      reason: result.reason, failures, successes, history,
    };
    if (status === 'outage' && !active) {
      state.incidents.unshift({ id: `${definition.id}-${now}`, checkId: definition.id, title: `${definition.name} unavailable`, startedAt: timestamp, firstObservedAt: prior.checkedAt || timestamp, resolvedAt: null, automatic: true });
    }
    if (active && status === 'operational') active.resolvedAt = timestamp;
  }
  // Keep unresolved incidents regardless of age; bound resolved history to 90 days.
  state.incidents = state.incidents.filter(i => !i.resolvedAt || now - Date.parse(i.resolvedAt) < 90 * 86400000);
  return state;
}
export function effectiveStatus(check, result, now = Date.now()) {
  if (!result || !['operational','degraded','outage','unknown','maintenance'].includes(result.status) || !Number.isFinite(Date.parse(result.checkedAt)) || now - Date.parse(result.checkedAt) > staleAfterMs(check) || Date.parse(result.checkedAt) > now + 60000) return 'unknown';
  return result.status;
}
export function overallStatus(state, now = Date.now()) {
  const statuses = CHECKS.map(check => effectiveStatus(check, state.checks[check.id], now));
  return ['outage','degraded','unknown','maintenance'].find(status => statuses.includes(status)) || 'operational';
}
