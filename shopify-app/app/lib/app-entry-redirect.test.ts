import assert from "node:assert/strict";
import test from "node:test";
import { appEntryRedirectTarget } from "./app-entry-redirect";

test("keeps the admin launch parameters on the way into the app", () => {
  const url = new URL(
    "https://upselltrixapp.algorithmtrix.com/?shop=algorithmtrix-development.myshopify.com&host=abc&embedded=1",
  );
  assert.equal(
    appEntryRedirectTarget(url),
    "/app?shop=algorithmtrix-development.myshopify.com&host=abc&embedded=1",
  );
});

test("sends a bare visit to the app home", () => {
  assert.equal(
    appEntryRedirectTarget(new URL("https://upselltrixapp.algorithmtrix.com/")),
    "/app",
  );
});
