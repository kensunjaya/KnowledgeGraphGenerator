const stages = ['VALIDATING', 'LOADING_MODEL', 'TRANSCRIBING', 'SAVING'];

// Ignore ordinary CLI output; only accept bounded, forward-moving progress.
export function parseProgress(line, current) {
  try {
    const event = JSON.parse(line);
    if (!stages.includes(event.stage) || !Number.isFinite(event.percent)
        || stages.indexOf(event.stage) < stages.indexOf(current.stage)) return current;
    return { stage: event.stage, percent: Math.max(current.percent, Math.min(99, Math.max(0, Math.floor(event.percent)))) };
  } catch { return current; }
}
