/**
 * Hybrid Logical Clock (HLC) helpers.
 *
 * Format: `<48-bit millis>:<16-bit counter>:<nodeId>` — fixed width so plain
 * lexicographic comparison is a valid causal ordering. This is what makes the
 * offline merge a CRDT: concurrent writes are ordered deterministically
 * (wall clock, then counter, then node id) without a coordinator, and the
 * ordering is identical on every replica.
 */
const WIDTH_MILLIS = 15;
const WIDTH_COUNTER = 5;

export interface Hlc {
  millis: number;
  counter: number;
  nodeId: string;
}

const HLC_PATTERN = /^(\d{15}):(\d{5}):([A-Za-z0-9_-]{1,64})$/;

export function formatHlc(hlc: Hlc): string {
  return `${String(hlc.millis).padStart(WIDTH_MILLIS, '0')}:${String(hlc.counter).padStart(WIDTH_COUNTER, '0')}:${hlc.nodeId}`;
}

export function parseHlc(value: string): Hlc | null {
  const match = HLC_PATTERN.exec(value);
  if (!match) return null;
  return { millis: Number(match[1]), counter: Number(match[2]), nodeId: match[3]! };
}

export function isValidHlc(value: string): boolean {
  return parseHlc(value) !== null;
}

/**
 * Compares two HLC strings: -1 when a < b, 1 when a > b, 0 when identical.
 * Falls back to string comparison for malformed input so merge never throws.
 */
export function compareHlc(a: string, b: string): number {
  const left = parseHlc(a);
  const right = parseHlc(b);
  if (!left || !right) return a < b ? -1 : a > b ? 1 : 0;

  if (left.millis !== right.millis) return left.millis < right.millis ? -1 : 1;
  if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1;
  return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0;
}

/** Local clock advance (send/receive), as specified by Kulkarni et al. */
export function tickHlc(previous: string | null, nodeId: string, physicalNow: number): string {
  if (!previous) return formatHlc({ millis: physicalNow, counter: 0, nodeId });
  const parsed = parseHlc(previous);
  if (!parsed) return formatHlc({ millis: physicalNow, counter: 0, nodeId });

  const millis = Math.max(physicalNow, parsed.millis);
  const counter = millis === parsed.millis ? parsed.counter + 1 : 0;
  return formatHlc({ millis, counter, nodeId });
}

/** Receive event: merges a remote clock into the local one. */
export function receiveHlc(local: string | null, remote: string, nodeId: string, physicalNow: number): string {
  const remoteParsed = parseHlc(remote);
  if (!remoteParsed) return tickHlc(local, nodeId, physicalNow);

  const localParsed = local ? parseHlc(local) : null;
  const millis = Math.max(physicalNow, localParsed?.millis ?? 0, remoteParsed.millis);

  let counter = 0;
  if (millis === localParsed?.millis && millis === remoteParsed.millis) {
    counter = Math.max(localParsed!.counter, remoteParsed.counter) + 1;
  } else if (millis === localParsed?.millis) {
    counter = localParsed!.counter + 1;
  } else if (millis === remoteParsed.millis) {
    counter = remoteParsed.counter + 1;
  }

  return formatHlc({ millis, counter, nodeId });
}

export interface FieldClockMap {
  [field: string]: string;
}

/**
 * Field-level LWW merge. Returns which fields the incoming payload wins and the
 * merged clock map. Untouched fields keep the local value, so two offline devices
 * editing different fields of the same record both succeed (no lost update).
 */
export function mergeFields(
  localValues: Record<string, unknown>,
  localClocks: FieldClockMap,
  incomingValues: Record<string, unknown>,
  incomingHlc: string,
): { merged: Record<string, unknown>; clocks: FieldClockMap; appliedFields: string[]; rejectedFields: string[] } {
  const merged: Record<string, unknown> = { ...localValues };
  const clocks: FieldClockMap = { ...localClocks };
  const appliedFields: string[] = [];
  const rejectedFields: string[] = [];

  for (const [field, value] of Object.entries(incomingValues)) {
    const localClock = localClocks[field];
    if (!localClock || compareHlc(incomingHlc, localClock) > 0) {
      merged[field] = value;
      clocks[field] = incomingHlc;
      appliedFields.push(field);
    } else {
      rejectedFields.push(field);
    }
  }

  return { merged, clocks, appliedFields, rejectedFields };
}