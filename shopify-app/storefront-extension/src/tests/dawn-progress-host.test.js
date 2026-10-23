import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCoalescedScheduler,
  findProgressMountAnchor,
  isNodeConnected,
  liveProgressHost,
  recoverProgressHostAfterSectionReplace,
  replaceDawnDrawerInner,
  runDawnCartChangeLifecycle,
  shouldReobserveLiveDrawer,
  wrapMethodOnce,
} from "../utils/dawn-progress-host.js";
import {
  emptyCart,
  mergeAddedItems,
  paidSubtotalCents,
  projectAfterChange,
  shouldAcceptCartVersion,
  shouldAcceptPaintGen,
  stampCartVersion,
  stripStaleCartSections,
} from "../utils/native-cart-predict.js";

function node(tag, attrs = {}, kids = []) {
  const n = {
    tagName: String(tag).toUpperCase(),
    attrs: { ...attrs },
    children: [],
    parentNode: null,
    __root: false,
    get firstChild() {
      return this.children[0] || null;
    },
    get nextSibling() {
      if (!this.parentNode) return null;
      const sibs = this.parentNode.children;
      const i = sibs.indexOf(this);
      return i >= 0 ? sibs[i + 1] || null : null;
    },
    get isConnected() {
      let p = this;
      while (p.parentNode) p = p.parentNode;
      return p.__root === true;
    },
    classList: {
      _c: new Set(String(attrs.class || "").split(/\s+/).filter(Boolean)),
      contains(c) {
        return this._c.has(c);
      },
    },
    getAttribute(name) {
      return this.attrs[name] != null ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    contains(other) {
      if (other === this) return true;
      for (let i = 0; i < this.children.length; i++) {
        if (this.children[i].contains(other)) return true;
      }
      return false;
    },
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (!ref) {
        this.children.push(child);
        return child;
      }
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(child);
      else this.children.splice(i, 0, child);
      return child;
    },
    appendChild(child) {
      return this.insertBefore(child, null);
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) {
        this.children.splice(i, 1);
        child.parentNode = null;
      }
      return child;
    },
  };
  kids.forEach((k) => n.appendChild(k));
  return n;
}

function createHost(heading) {
  const host = node("div", {
    class: "fgpb-progress-card fgpb-progress-strip",
    "data-fg-drawer": "1",
    "data-fgpb-progress-host": "1",
  });
  host.heading = heading;
  const banner = node("div", { class: "fgpb-strip-banner" });
  banner.textContent = heading;
  host.appendChild(banner);
  return host;
}

function dawnDrawer(withHost) {
  const header = node("div", { class: "drawer__header" });
  const items = node("cart-drawer-items", {}, [node("div", { class: "cart-item" })]);
  const recs = node("div", { "data-fgpb-recs": "theme" });
  const kids = [header];
  let host = null;
  if (withHost) {
    host = createHost("Add $1,499.10 more.");
    kids.push(host);
  }
  kids.push(items, recs);
  const inner = node("div", { class: "drawer__inner" }, kids);
  const drawer = node("cart-drawer", { class: "drawer active" }, [inner]);
  drawer.__root = true;
  return { drawer, inner, header, items, recs, host };
}

describe("Dawn drawer section replace remounts the progress host", () => {
  it("anchors the host after the header, never on the recommendation block", () => {
    const { drawer, recs, header } = dawnDrawer(true);
    const anchor = findProgressMountAnchor(drawer);
    assert.equal(anchor.reason, "header");
    assert.equal(anchor.parent, header.parentNode);
    assert.notEqual(anchor.parent, recs);
    assert.notEqual(anchor.before, recs);
  });

  it("replacing .drawer__inner destroys the old host and mounts a new visible one", () => {
    const first = dawnDrawer(true);
    const oldHost = first.host;
    assert.equal(isNodeConnected(oldHost), true);
    assert.equal(liveProgressHost(first.drawer), oldHost);

    const nextHeader = node("div", { class: "drawer__header" });
    const nextItems = node("cart-drawer-items", {}, [
      node("div", { class: "cart-item", "data-qty": "2" }),
    ]);
    const nextRecs = node("div", { "data-fgpb-recs": "theme" });
    replaceDawnDrawerInner(first.inner, [nextHeader, nextItems, nextRecs]);

    assert.equal(isNodeConnected(oldHost), false);
    assert.equal(liveProgressHost(first.drawer), null);

    const result = recoverProgressHostAfterSectionReplace({
      drawer: first.drawer,
      oldHost,
      createHost: () => createHost("Add $749.15 more."),
    });

    assert.equal(result.oldHostDestroyed, true);
    assert.equal(result.recovered, true);
    assert.equal(result.visible, true);
    assert.notEqual(result.host, oldHost);
    assert.equal(isNodeConnected(oldHost), false);
    assert.equal(isNodeConnected(result.host), true);
    assert.equal(liveProgressHost(first.drawer), result.host);
    assert.equal(result.host.heading, "Add $749.15 more.");
    const remountAnchor = findProgressMountAnchor(first.drawer);
    assert.equal(remountAnchor.reason, "header");
    assert.equal(result.host.parentNode, remountAnchor.parent);
    assert.notEqual(result.host.parentNode, nextRecs);
  });

  it("is idempotent against the live drawer and does not reuse a cached/replaced node", () => {
    const first = dawnDrawer(true);
    const cachedDrawer = first.drawer;
    replaceDawnDrawerInner(first.inner, [
      node("div", { class: "drawer__header" }),
      node("cart-drawer-items"),
    ]);
    const live = first.drawer;
    assert.equal(cachedDrawer, live);
    const a = recoverProgressHostAfterSectionReplace({
      drawer: live,
      oldHost: first.host,
      createHost: () => createHost("live-a"),
    });
    const b = recoverProgressHostAfterSectionReplace({
      drawer: live,
      oldHost: first.host,
      createHost: () => createHost("must-not-create"),
    });
    assert.equal(a.recovered, true);
    assert.equal(b.recovered, false);
    assert.equal(b.reason, "already-live");
    assert.equal(b.host, a.host);
    assert.equal(b.host.heading, "live-a");
  });

  it("re-observes when the MutationObserver was scoped to the replaced inner node", () => {
    const first = dawnDrawer(true);
    const observedInner = first.inner;
    replaceDawnDrawerInner(first.inner, [
      node("div", { class: "drawer__header" }),
      node("cart-drawer-items"),
    ]);
    // The inner element itself often stays; a detached observed root must reattach.
    const detached = node("div", { class: "drawer__inner" });
    assert.equal(shouldReobserveLiveDrawer(detached, first.drawer), true);
    assert.equal(shouldReobserveLiveDrawer(first.drawer, first.drawer), false);
    assert.equal(observedInner.parentNode, first.drawer);
  });
});

describe("qty UI 2 cannot keep a pending qty-1 response as final", () => {
  it("predicts qty 2 even when Dawn sends a Shopify key that does not match proj:vid", () => {
    let cart = mergeAddedItems(emptyCart("USD"), {
      key: "proj:11",
      variant_id: 11,
      quantity: 1,
      price: 74995,
      final_line_price: 74995,
    });
    cart = projectAfterChange(cart, { id: "44944999999999:abc123", quantity: 2 });
    stampCartVersion(cart, 2);
    assert.equal(cart.items[0].quantity, 2);
    assert.equal(paidSubtotalCents(cart), 74995 * 2);
  });

  it("rejects an older change.js while the quantity input already shows 2", () => {
    const liveGen = 2;
    const qtyUi = 2;
    const pendingOlder = stampCartVersion(
      {
        item_count: 1,
        total_price: 74995,
        items: [{ key: "paid", quantity: 1, price: 74995, final_line_price: 74995 }],
        sections: { "cart-drawer": "<qty-1-html>" },
      },
      1,
    );
    assert.equal(qtyUi, 2);
    assert.equal(shouldAcceptCartVersion(pendingOlder._fgpbVer, liveGen), false);
    assert.equal(shouldAcceptPaintGen(1, liveGen), false);
    const stripped = stripStaleCartSections(pendingOlder, 1, liveGen);
    assert.equal(stripped.sections, undefined);
    const confirmed = stampCartVersion(
      {
        item_count: 2,
        total_price: 149990,
        items: [{ key: "paid", quantity: 2, price: 74995, final_line_price: 149990 }],
        sections: { "cart-drawer": "<qty-2-html>" },
      },
      2,
    );
    assert.equal(shouldAcceptCartVersion(confirmed._fgpbVer, liveGen), true);
    assert.equal(stripStaleCartSections(confirmed, 2, liveGen).sections["cart-drawer"], "<qty-2-html>");
  });
});

describe("Dawn method wrap identity (must not be applied to CartDrawer)", () => {
  it("preserves this, arguments, and return value", () => {
    const proto = {
      renderContents(parsed, extra) {
        return { self: this, parsed, extra, ok: true };
      },
    };
    const first = wrapMethodOnce(proto, "renderContents");
    assert.equal(first.applied, true);
    const ctx = { id: "cart-drawer" };
    const out = proto.renderContents.call(ctx, { item_count: 4 }, "keep");
    assert.equal(out.self, ctx);
    assert.equal(out.parsed.item_count, 4);
    assert.equal(out.extra, "keep");
    assert.equal(out.ok, true);
  });

  it("rethrows from the original method and forwards rejected promises", async () => {
    const proto = {
      setInnerHTML() {
        throw new Error("Cannot read properties of null (reading 'innerHTML')");
      },
      renderContents() {
        return Promise.reject(new Error("Dawn render failed"));
      },
    };
    wrapMethodOnce(proto, "setInnerHTML");
    wrapMethodOnce(proto, "renderContents");
    assert.throws(() => proto.setInnerHTML(), /innerHTML/);
    await assert.rejects(() => proto.renderContents(), /Dawn render failed/);
  });

  it("repeated initialization does not double-wrap", () => {
    const proto = {
      renderContents() {
        return 1;
      },
    };
    const a = wrapMethodOnce(proto, "renderContents");
    const b = wrapMethodOnce(proto, "renderContents");
    assert.equal(a.applied, true);
    assert.equal(b.applied, false);
    assert.equal(b.reason, "already-wrapped");
    assert.equal(proto.renderContents, a.method);
    assert.equal(proto.renderContents.__fgpbOriginal, a.original);
  });
});

describe("coalesced observer recovery and Dawn cleanup", () => {
  it("observer recovery cannot recurse", async () => {
    let depth = 0;
    let maxDepth = 0;
    const sched = createCoalescedScheduler(() => {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      sched.schedule();
      sched.schedule();
      depth -= 1;
    });
    assert.equal(sched.schedule(), true);
    assert.equal(sched.schedule(), false);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(maxDepth, 1);
    assert.equal(sched.runCount, 1);
  });

  it("recovery during full inner replacement runs once after replacement", async () => {
    const first = dawnDrawer(true);
    const oldHost = first.host;
    let recoveries = 0;
    const sched = createCoalescedScheduler(() => {
      recoveries += 1;
      recoverProgressHostAfterSectionReplace({
        drawer: first.drawer,
        oldHost,
        createHost: () => createHost("after-replace"),
      });
    });
    replaceDawnDrawerInner(first.inner, [
      node("div", { class: "drawer__header" }),
      node("cart-drawer-items", {}, [node("div", { class: "cart-item" })]),
    ]);
    sched.schedule();
    sched.schedule();
    sched.schedule();
    assert.equal(recoveries, 0);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(recoveries, 1);
    assert.equal(sched.runCount, 1);
    assert.equal(isNodeConnected(oldHost), false);
    assert.equal(liveProgressHost(first.drawer).heading, "after-replace");
  });

  it("quantity/remove request always reaches Dawn cleanup even if recovery throws", async () => {
    let cleaned = false;
    let rendered = false;
    await assert.rejects(
      () =>
        runDawnCartChangeLifecycle({
          request: async () => ({ item_count: 4, sections: { "cart-drawer": "<ok>" } }),
          renderContents() {
            rendered = true;
          },
          afterRender() {
            throw new Error("progress recover exploded");
          },
          disableLoading() {
            cleaned = true;
          },
        }),
      /progress recover exploded/,
    );
    assert.equal(rendered, true);
    assert.equal(cleaned, true);
  });

  it("drawer remains open after a successful quantity mutation", async () => {
    const drawer = { classList: { _open: true, contains: (c) => c === "active" && drawer.classList._open } };
    let loading = true;
    await runDawnCartChangeLifecycle({
      request: async () => ({ item_count: 4 }),
      renderContents() {
        drawer.classList._open = true;
      },
      afterRender() {},
      disableLoading() {
        loading = false;
      },
    });
    assert.equal(drawer.classList.contains("active"), true);
    assert.equal(loading, false);
  });
});
