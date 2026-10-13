export function gate(env, now = Date.now()) {
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const parse = value => utc.test(value ?? '') && new Date(value).toISOString().replace('.000Z','Z') === value ? Date.parse(value) : NaN;
  if (env.QA_ENABLED !== 'true') return {allowed:false, reason:'disabled'};
  let start, end;
  try { start = parse(env.QA_STARTED_AT); end = parse(env.QA_EXPIRES_AT); } catch { return {allowed:false, reason:'invalid_window'}; }
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= start || end - start > 86400000) return {allowed:false, reason:'invalid_window'};
  if (end <= now) return {allowed:false, reason:'expired'};
  return {allowed:true, reason:'enabled'};
}
