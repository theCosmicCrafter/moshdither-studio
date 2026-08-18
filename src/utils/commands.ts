/**
 * Command registry for the Command Palette.
 *
 * Every action in the app should be registered here with a unique ID,
 * human-readable label, and optional keyboard shortcut.
 */

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

let registry: Command[] = [];

// Commands are registered from a component effect, i.e. after that component's
// first render. Consumers therefore need to be *notified* when the registry
// fills, not merely able to read it -- the palette previously built its list in
// a useMemo keyed on the search query, so it kept the empty first result and
// rendered "No commands found" until the user typed. This is the external-store
// contract React provides for exactly this case (useSyncExternalStore).
const listeners = new Set<() => void>();

// A stable snapshot is required: useSyncExternalStore compares by reference and
// will loop forever if getSnapshot returns a fresh array each call.
let snapshot: Command[] = [];

function emit(): void {
  snapshot = [...registry];
  for (const listener of listeners) listener();
}

export function subscribeCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCommandsSnapshot(): Command[] {
  return snapshot;
}

export function registerCommand(cmd: Command): void {
  const existing = registry.findIndex((c) => c.id === cmd.id);
  if (existing >= 0) {
    registry[existing] = cmd;
  } else {
    registry.push(cmd);
  }
  emit();
}

export function getCommands(): Command[] {
  return [...registry];
}

export function clearCommands(): void {
  registry = [];
  emit();
}

/**
 * Simple fuzzy match. Returns a score > 0 if query matches label.
 * Higher score = better match.
 */
export function fuzzyMatch(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) {
    // Bonus for exact substring match
    return q.length / t.length + (t.startsWith(q) ? 2 : 1);
  }

  // Check if all characters in query appear in order in text
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 0.5 : 0;
}
