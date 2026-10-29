// Pure helpers for logged-out quality checks (console errors, timings, a11y basics).
// Unit-tested without a browser. Thresholds are generous: these are smoke guards,
// not benchmarks, so CI stays stable on shared runners.
export const QUALITY_PAGES = ['/', '/login', '/register'];
export const PERF_BUDGET_MS = { domContentLoaded: 10000, load: 20000 };

// Console noise that is not a product defect (blocked by our own request routing,
// favicon, browser extensions). Anything else counts as an error.
const IGNORED = [/net::ERR_FAILED/i, /ERR_BLOCKED_BY_CLIENT/i, /favicon/i, /Failed to load resource/i];
export function realConsoleErrors(messages = []) {
  return messages.filter(m => typeof m === 'string' && !IGNORED.some(re => re.test(m)));
}

// nav: a PerformanceNavigationTiming-like object. Returns {ok, domContentLoaded, load}.
export function checkTiming(nav, budget = PERF_BUDGET_MS) {
  if (!nav || !Number.isFinite(nav.domContentLoadedEventEnd) || !Number.isFinite(nav.loadEventEnd)) {
    return { ok: false, reason: 'no_timing' };
  }
  const domContentLoaded = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
  const load = Math.round(nav.loadEventEnd - nav.startTime);
  return { ok: domContentLoaded <= budget.domContentLoaded && load <= budget.load, domContentLoaded, load };
}

// snapshot: {lang, title, inputs:[{type, labelled}], images:[{alt}]}. Returns a list of issues.
export function a11yIssues(snapshot) {
  const issues = [];
  if (!snapshot?.lang) issues.push('html_lang_missing');
  if (!snapshot?.title?.trim()) issues.push('title_missing');
  for (const i of snapshot?.inputs || []) if (!['hidden', 'submit', 'button'].includes(i.type) && !i.labelled) issues.push(`unlabelled_input_${i.type}`);
  for (const img of snapshot?.images || []) if (img.alt === null) issues.push('img_alt_missing');
  return [...new Set(issues)];
}
