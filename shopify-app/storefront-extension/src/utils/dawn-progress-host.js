/**
 * Deterministic UpsellTrix progress host inside a live Dawn cart drawer.
 * Never uses recommendation blocks as the mount anchor. Safe to run after
 * Dawn replaces `.drawer__inner` / `#CartDrawer` innerHTML.
 */

function childMatches(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const hit = childMatches(kids[i], pred);
    if (hit) return hit;
  }
  return null;
}

export function isNodeConnected(node) {
  if (!node) return false;
  if (typeof node.isConnected === "boolean") return node.isConnected;
  const seen = new Set();
  let p = node;
  while (p) {
    if (seen.has(p)) return false;
    seen.add(p);
    if (p.__root) return true;
    p = p.parentNode;
  }
  return false;
}

export function drawerContains(drawer, node) {
  if (!drawer || !node) return false;
  if (typeof drawer.contains === "function") return drawer.contains(node);
  let p = node;
  while (p) {
    if (p === drawer) return true;
    p = p.parentNode;
  }
  return false;
}

export function isRecsNode(node) {
  return !!(node && node.getAttribute && node.getAttribute("data-fgpb-recs") != null);
}

export function findLiveDawnDrawer(root) {
  if (!root || typeof root.querySelector !== "function") return null;
  return (
    root.querySelector("cart-drawer") ||
    root.querySelector("#CartDrawer") ||
    root.querySelector("[data-cart-drawer]") ||
    root.querySelector(".cart-drawer")
  );
}

export function findDawnDrawerInner(drawer) {
  if (!drawer) return null;
  return (
    childMatches(drawer, (n) => n.classList && n.classList.contains("drawer__inner")) ||
    childMatches(drawer, (n) => n.classList && n.classList.contains("cart-drawer__inner")) ||
    childMatches(drawer, (n) => n.getAttribute && n.getAttribute("role") === "dialog") ||
    drawer
  );
}

export function findDrawerHeader(drawer) {
  return childMatches(
    drawer,
    (n) =>
      n.classList &&
      (n.classList.contains("drawer__header") || n.classList.contains("cart-drawer__header")),
  );
}

export function findDrawerItems(drawer) {
  return childMatches(drawer, (n) => {
    const tag = n.tagName ? String(n.tagName).toUpperCase() : "";
    if (tag === "CART-DRAWER-ITEMS") return true;
    return !!(n.classList && n.classList.contains("cart-drawer-items"));
  });
}

/**
 * Anchor for the progress host. Header → cart items → drawer inner.
 * Recommendation nodes are never the parent or the insertion point.
 */
export function findProgressMountAnchor(drawer) {
  const header = findDrawerHeader(drawer);
  if (header && header.parentNode && !isRecsNode(header) && !isRecsNode(header.parentNode)) {
    return { parent: header.parentNode, before: header.nextSibling || null, reason: "header" };
  }
  const items = findDrawerItems(drawer);
  if (items && items.parentNode && !isRecsNode(items) && !isRecsNode(items.parentNode)) {
    return { parent: items.parentNode, before: items, reason: "items" };
  }
  const inner = findDawnDrawerInner(drawer);
  if (inner && !isRecsNode(inner)) {
    const first = inner.firstChild || (inner.children && inner.children[0]) || null;
    return { parent: inner, before: first, reason: "inner" };
  }
  // Never append to the <cart-drawer> host — that becomes a flex sibling of
  // .drawer__inner and collapses Dawn's sliding panel.
  return null;
}

export function liveProgressHost(drawer) {
  return (
    childMatches(
      drawer,
      (n) => n.getAttribute && n.getAttribute("data-fgpb-progress-host") === "1",
    ) ||
    childMatches(drawer, (n) => n.getAttribute && n.getAttribute("data-fg-drawer") === "1")
  );
}

export function mountProgressHost(drawer, host) {
  if (!drawer || !host) return null;
  if (host.setAttribute) {
    host.setAttribute("data-fgpb-progress-host", "1");
    host.setAttribute("data-fg-drawer", "1");
  }
  const anchor = findProgressMountAnchor(drawer);
  if (!anchor || !anchor.parent) return null;
  if (host.parentNode === anchor.parent) {
    const next = host.nextSibling || null;
    if (next === anchor.before || (!next && !anchor.before)) return host;
  }
  if (typeof anchor.parent.insertBefore === "function") {
    anchor.parent.insertBefore(host, anchor.before || null);
  }
  return host;
}

/**
 * After Dawn replaces drawer inner HTML, the previous host is disconnected.
 * Mount a new host into the live drawer. Idempotent if a live host already exists.
 */
export function recoverProgressHostAfterSectionReplace({ drawer, oldHost, createHost }) {
  const oldHostDestroyed = !oldHost || !isNodeConnected(oldHost) || !drawerContains(drawer, oldHost);
  if (!drawer) {
    return { host: null, oldHostDestroyed, recovered: false, reason: "no-drawer" };
  }
  const existing = liveProgressHost(drawer);
  if (existing && isNodeConnected(existing) && drawerContains(drawer, existing)) {
    return {
      host: existing,
      oldHostDestroyed,
      recovered: false,
      reason: "already-live",
      visible: true,
    };
  }
  const host = typeof createHost === "function" ? createHost() : null;
  if (!host) {
    return { host: null, oldHostDestroyed, recovered: false, reason: "no-create" };
  }
  mountProgressHost(drawer, host);
  return {
    host,
    oldHostDestroyed,
    recovered: true,
    reason: "remount",
    visible: isNodeConnected(host) && drawerContains(drawer, host),
  };
}

/** Simulate Dawn `element.innerHTML = sectionHtml` for `.drawer__inner`. */
export function replaceDawnDrawerInner(inner, nextChildren) {
  if (!inner) return [];
  const old = (inner.children || []).slice();
  if (typeof inner.removeChild === "function") {
    while (inner.children && inner.children.length) {
      inner.removeChild(inner.children[0]);
    }
  } else {
    inner.children = [];
    for (let i = 0; i < old.length; i++) old[i].parentNode = null;
  }
  for (let j = 0; j < (nextChildren || []).length; j++) {
    const ch = nextChildren[j];
    if (typeof inner.appendChild === "function") inner.appendChild(ch);
    else {
      if (!inner.children) inner.children = [];
      inner.children.push(ch);
      ch.parentNode = inner;
    }
  }
  return old;
}

/**
 * MutationObserver on a replaced node never sees the new drawer.
 * Always re-observe the live cart-drawer after a section swap.
 */
export function shouldReobserveLiveDrawer(observedRoot, liveDrawer) {
  if (!liveDrawer) return false;
  if (!observedRoot) return true;
  if (observedRoot === liveDrawer) return false;
  return !isNodeConnected(observedRoot) || !drawerContains(observedRoot, liveDrawer);
}

/**
 * Wrap a prototype method at most once. Preserves `this`, arguments, return
 * value, throws, and rejected promises. Does not run follow-up work inside
 * the original call — that is how Dawn loading cleanup gets skipped.
 */
export function wrapMethodOnce(proto, name) {
  if (!proto || typeof proto[name] !== "function") {
    return { applied: false, reason: "missing" };
  }
  const current = proto[name];
  if (current.__fgpbWrappedOnce) {
    return { applied: false, reason: "already-wrapped", method: current };
  }
  const orig = current;
  function wrapped() {
    return orig.apply(this, arguments);
  }
  wrapped.__fgpbWrappedOnce = true;
  wrapped.__fgpbOriginal = orig;
  proto[name] = wrapped;
  return { applied: true, original: orig, method: wrapped };
}

/**
 * One scheduled recovery max. Nested schedule() during a run is ignored so
 * observer callbacks cannot recurse into another recovery on the same turn.
 */
export function createCoalescedScheduler(fn) {
  let scheduled = false;
  let running = false;
  let runCount = 0;
  function flush() {
    scheduled = false;
    if (running) return;
    running = true;
    runCount += 1;
    try {
      fn();
    } finally {
      running = false;
    }
  }
  return {
    schedule() {
      if (running || scheduled) return false;
      scheduled = true;
      setTimeout(flush, 0);
      return true;
    },
    get runCount() {
      return runCount;
    },
    get running() {
      return running;
    },
    get scheduled() {
      return scheduled;
    },
  };
}

/**
 * Dawn CartItems.updateQuantity: fetch → renderContents → finally disableLoading.
 * Recovery must not run inside renderContents; cleanup must always run.
 */
export async function runDawnCartChangeLifecycle({ request, renderContents, disableLoading, afterRender }) {
  try {
    const state = await request();
    renderContents(state);
    if (typeof afterRender === "function") afterRender(state);
    return state;
  } finally {
    disableLoading();
  }
}
