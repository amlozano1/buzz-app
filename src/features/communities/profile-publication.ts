import { eventsDto } from "../relay/events.ts";

const publishing = new Set<string>();

/** Host-local exclusion, shared by the profile editor and receiving updates.
 * Refuse overlap rather than queue an already stale replacement document. */
export function reserveProfilePublication(community: string, viewer: string) {
  const key = `${community}:${viewer}`;
  if (publishing.has(key))
    throw new Error(
      "A profile save is already in progress. Check your profile before saving again.",
    );
  publishing.add(key);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    publishing.delete(key);
  };
}

export function receivingProfileFilter(viewer: string) {
  return [
    { kinds: [0], authors: [viewer], limit: 5, consistency: "strong" as const },
  ];
}

/** Detect observed conflicts after signing, before sending. The relay does not
 * offer conditional kind-0 publication; a remote writer can still race this read. */
export function assertReceivingProfileHead(
  raw: unknown,
  viewer: string,
  expected: string,
) {
  const head = eventsDto(raw)
    .filter((event) => event.kind === 0 && event.pubkey === viewer)
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
  if (head?.id !== expected)
    throw new Error(
      "Your profile changed while saving. Check your profile before saving again.",
    );
}
