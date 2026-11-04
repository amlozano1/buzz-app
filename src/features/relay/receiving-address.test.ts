import { expect, it } from "vitest";
import { createRelaySession } from "./session";
import { keypair, signed, scriptedTransport } from "./testing";
import { receivingProfileTemplate } from "../communities/receiving-profile";
import { TEST_RECEIVING_ADDRESS } from "../communities/receiving-profile-fixture";
import type { ReadTransport } from "./transport";

it("publishes once through the narrow writer and updates the shared profile only after verified readback", async () => {
  const viewer = keypair(),
    wire = scriptedTransport(viewer.pubkey, keypair().pubkey);
  let head = signed(viewer, {
    kind: 0,
    tags: [["keep", "tag"]],
    content: JSON.stringify({ name: "Sam", about: "Bio", lud06: "old" }),
  });
  let sends = 0;
  wire.transport.query = async () => [head];
  const updateReceivingAddress: NonNullable<
    ReadTransport["updateReceivingAddress"]
  > = async (address, profile, signal) => {
    signal.throwIfAborted();
    sends++;
    head = signed(
      viewer,
      receivingProfileTemplate({ address, profile }, viewer.pubkey),
    );
  };
  const store = createRelaySession({
    ...wire.transport,
    updateReceivingAddress,
  });
  try {
    expect(store.session.outbox?.supports(0)).toBeFalsy();
    await expect(
      store.session.receivingAddress?.update(
        TEST_RECEIVING_ADDRESS,
        new AbortController().signal,
      ),
    ).resolves.toBe(TEST_RECEIVING_ADDRESS);
    expect(sends).toBe(1);
    expect(
      JSON.parse(
        store.session.profiles.event?.(viewer.pubkey)?.content ?? "null",
      ),
    ).toEqual({ name: "Sam", about: "Bio", lud16: TEST_RECEIVING_ADDRESS });
    expect(head.tags).toEqual([["keep", "tag"]]);
  } finally {
    store.dispose();
  }
});

it("does not retry publication or accept an unconfirmed readback, and fences disposed sessions", async () => {
  const viewer = keypair(),
    wire = scriptedTransport(viewer.pubkey, keypair().pubkey);
  const head = signed(viewer, {
    kind: 0,
    tags: [],
    content: JSON.stringify({ name: "Sam" }),
  });
  let sends = 0,
    fail = true;
  wire.transport.query = async () => [head];
  const updateReceivingAddress = async () => {
    sends++;
    if (fail) throw new Error("Unconfirmed publication");
  };
  const store = createRelaySession({
    ...wire.transport,
    updateReceivingAddress,
  });
  try {
    await expect(
      store.session.receivingAddress?.update(
        TEST_RECEIVING_ADDRESS,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Unconfirmed publication");
    expect(sends).toBe(1);
    fail = false;
    await expect(
      store.session.receivingAddress?.update(
        TEST_RECEIVING_ADDRESS,
        new AbortController().signal,
      ),
    ).rejects.toThrow("not been confirmed");
    expect(sends).toBe(2);
  } finally {
    store.dispose();
  }
  await expect(
    store.session.receivingAddress?.update(
      TEST_RECEIVING_ADDRESS,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(sends).toBe(2);
});

it("does not advertise profile writes on older or cached transports", () => {
  const wire = scriptedTransport(keypair().pubkey, keypair().pubkey);
  const old = createRelaySession(wire.transport);
  const cached = createRelaySession(
    { ...wire.transport, updateReceivingAddress: async () => {} },
    { cachedOnly: true },
  );
  try {
    expect(old.session.receivingAddress).toBeUndefined();
    expect(cached.session.receivingAddress).toBeUndefined();
  } finally {
    old.dispose();
    cached.dispose();
  }
});
