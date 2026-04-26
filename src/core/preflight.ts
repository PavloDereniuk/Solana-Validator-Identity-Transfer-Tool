export type CheckLevel = 'pass' | 'warn' | 'fail';

export type CheckResult = {
  name: string;
  level: CheckLevel;
  weight: number;
  message: string;
  detail?: string;
};

export type Check = {
  name: string;
  weight: number;
  run: () => Promise<Omit<CheckResult, 'name' | 'weight'>>;
};

export type Recommendation = 'go' | 'wait' | 'no-go';

export type PreflightReport = {
  results: CheckResult[];
  score: number;
  recommendation: Recommendation;
};

export async function runChecks(checks: Check[]): Promise<PreflightReport> {
  const results: CheckResult[] = [];
  for (const c of checks) {
    try {
      const r = await c.run();
      results.push({ name: c.name, weight: c.weight, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        name: c.name,
        weight: c.weight,
        level: 'fail',
        message: 'check threw',
        detail: msg,
      });
    }
  }

  const total = results.reduce((s, r) => s + r.weight, 0);
  const earned = results.reduce((s, r) => {
    if (r.level === 'pass') return s + r.weight;
    if (r.level === 'warn') return s + r.weight * 0.5;
    return s;
  }, 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);

  // any single fail collapses to no-go regardless of score.
  const hasFail = results.some((r) => r.level === 'fail');
  const hasWarn = results.some((r) => r.level === 'warn');
  const recommendation: Recommendation = hasFail ? 'no-go' : hasWarn ? 'wait' : 'go';

  return { results, score, recommendation };
}
