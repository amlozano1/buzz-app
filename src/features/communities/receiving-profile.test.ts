import { expect, it } from "vitest";
import { keypair, signed } from "../relay/testing";
import { receivingProfileTemplate } from "./receiving-profile";

it("changes only the receiving fields of the viewer's signed profile, preserving tags and other metadata", () => {
  const viewer = keypair();
  const metadata = {
    name: "Sam",
    display_name: "Different display",
    about: "Keep",
    picture: "",
    nip05: "sam@example.test",
    custom: { keep: true },
    lud06: "old",
  };
  const profile = signed(viewer, {
    kind: 0,
    tags: [["custom", "keep"]],
    content: JSON.stringify(metadata),
    created_at: Math.floor(Date.now() / 1000),
  });
  const template = receivingProfileTemplate(
    { address: " sam@lexe.app ", profile },
    viewer.pubkey,
  );
  expect(JSON.parse(template.content)).toEqual({
    ...metadata,
    lud06: undefined,
    lud16: "sam@lexe.app",
  });
  expect(template.tags).toEqual(profile.tags);
  expect(template.kind).toBe(0);
  expect(template.created_at).toBeGreaterThan(profile.created_at);
});

it("rejects another author, forged metadata, invalid addresses, and arbitrary fields", () => {
  const viewer = keypair();
  const profile = signed(viewer, {
    kind: 0,
    tags: [],
    content: JSON.stringify({ name: "Sam" }),
  });
  for (const input of [
    { address: "sam@lexe.app", profile: { ...profile, content: "{}" } },
    { address: "sam@lexe.app", profile, content: "{}" },
    { address: 5, profile },
    { address: "https://evil.test/", profile },
  ])
    expect(() => receivingProfileTemplate(input, viewer.pubkey)).toThrow();
  expect(() =>
    receivingProfileTemplate(
      { address: "sam@lexe.app", profile },
      keypair().pubkey,
    ),
  ).toThrow();
});
