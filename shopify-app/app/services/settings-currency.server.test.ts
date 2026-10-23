import assert from "node:assert/strict";
import { after, it } from "node:test";
let row: Record<string, unknown> | null = null;
const original = globalThis.prismaGlobal;
globalThis.prismaGlobal = { appSettings: {
  findUnique: async () => row,
  upsert: async ({ create }: { create: Record<string, unknown> }) => row ??= { defaultThreshold: 999, currencyCode: "INR", ...create },
  update: async ({ data }: { data: Record<string, unknown> }) => row = { ...row, ...data },
} } as never;
const { getSettings, updateSettings } = await import("./settings.server");
after(() => { globalThis.prismaGlobal = original; });
it("initializes with shop currency and preserves it on partial settings saves", async () => {
  for (const [currency, decimal, minor] of [["USD", "12.34", 1234n], ["JPY", "123", 123n], ["KWD", "12.345", 12345n]] as const) {
    row = null;
    assert.equal((await getSettings("test.myshopify.com", currency)).currencyCode, currency);
    const updated = await updateSettings("test.myshopify.com", { defaultThreshold: decimal });
    assert.equal(updated.currencyCode, currency);
    assert.equal(updated.defaultThresholdMinor, minor);
  }
});
it("re-encodes minor units rather than relabeling them when currency changes", async () => {
  row = { defaultThreshold: 12, defaultThresholdMinor: 1200n, currencyCode: "USD" };
  const updated = await updateSettings("test.myshopify.com", { currencyCode: "JPY" });
  assert.equal(updated.defaultThresholdMinor, 12n);
});
