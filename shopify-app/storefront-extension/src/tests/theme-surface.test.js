import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../runtime/theme-surface.js', import.meta.url), 'utf8');
function fixture(forms = [], main = null, root = '/') {
  const document = {
    querySelectorAll: () => forms,
    querySelector: selector => selector.startsWith('[') ? null : main,
  };
  const window = { Shopify: { routes: { root } } };
  vm.runInNewContext(source, { window, document, URL, location: { href: 'https://store.example/fr/products/bag', origin: 'https://store.example' } });
  return window.__FGPB_THEME;
}
function form(action, options = {}) {
  return {
    hidden: !!options.hidden,
    getAttribute: name => name === 'action' ? action : null,
    closest: () => options.drawer || null,
    querySelector: () => options.variant ? {} : null,
  };
}
test('vintage cart form works without Dawn classes or section IDs', () => {
  const cart = form('/cart');
  assert.equal(fixture([cart]).cartAnchor(), cart);
});
test('localized and absolute same-store cart forms are supported', () => {
  const cart = form('https://store.example/fr/cart/');
  assert.equal(fixture([cart]).cartAnchor(), cart);
  assert.equal(fixture([], null, '/fr/').cartUrl(), '/fr/cart');
});
test('cross-origin forms cannot become cart anchors', () => {
  const main = {};
  assert.equal(fixture([form('https://other.example/cart')], main).cartAnchor(), main);
});
test('mini-cart forms and hidden forms cannot steal page placement', () => {
  const page = form('/cart');
  assert.equal(fixture([form('/cart', { drawer: {} }), form('/cart', { hidden: true }), page]).cartAnchor(), page);
});
test('empty cart themes fall back to their main landmark', () => {
  const main = {};
  assert.equal(fixture([], main).cartAnchor(), main);
});
test('product placement uses Shopify form semantics rather than a theme class', () => {
  const product = form('/fr/cart/add', { variant: true });
  assert.equal(fixture([form('/search'), product]).productAnchor(), product);
});
test('product quick-add drawers are excluded from the page widget', () => {
  assert.equal(fixture([form('/cart/add', { variant: true, drawer: {} })]).productAnchor(), null);
});
test('Dawn section replacement is opt-in by actual markup, not a generic drawer name', () => {
  const api = fixture();
  assert.equal(api.isDawnDrawer({ querySelector: () => null }), false);
  assert.equal(api.isDawnDrawer({ querySelector: () => ({}) }), true);
});


test('cart fallback is idempotent and disappears when the campaign is disabled', () => {
  let link = null;
  const root = { appendChild(node) { link = node; node.parentNode = this; } };
  const document = {
    querySelector: () => link,
    createElement: () => ({ style: {}, setAttribute() {}, remove() { link = null; } }),
  };
  const window = { Shopify: { routes: { root: '/fr/' } } };
  vm.runInNewContext(source, { window, document, URL, location: { href: 'https://store.example/fr/products/bag', origin: 'https://store.example' } });
  window.__FGPB_THEME.fallback(root, { enabled: true });
  const first = link;
  assert.equal(link.href, '/fr/cart');
  window.__FGPB_THEME.fallback(root, { enabled: true });
  assert.equal(link, first);
  window.__FGPB_THEME.fallback(root, { enabled: false });
  assert.equal(link, null);
});


const runtime = readFileSync(new URL('../runtime/cart-page-progress.js', import.meta.url), 'utf8');
const productStart = runtime.indexOf('  function fillProductCopy(');
const productPaint = runtime.slice(
  productStart !== -1 ? productStart : runtime.indexOf('  function paintPortableProduct()'),
  runtime.indexOf('  function paintEnabledChrome('),
);
function productFixture(placements, existingBlock = false) {
  let card = null;
  let creates = 0;
  const parent = { insertBefore(node) { card = node; node.parentNode = this; node.previousElementSibling = anchor; } };
  const anchor = { parentNode: parent, nextSibling: null };
  const heading = { textContent: 'You are 162 away from your free gift' };
  const text = { textContent: 'Add more items to your cart to unlock your gift.' };
  const fill = { style: { getPropertyValue() { return ''; }, setProperty() {} } };
  const attrs = {};
  const track = { setAttribute(name, value) { attrs[name] = value; } };
  const nodes = {
    hidden: false,
    classList: { remove() {}, add() {} },
    querySelector(sel) {
      if (sel.includes('heading')) return heading;
      if (sel.includes('text')) return text;
      if (sel.includes('fill')) return fill;
      if (sel.includes('track')) return track;
      return null;
    },
  };
  const block = existingBlock && existingBlock !== true ? existingBlock : nodes;
  const context = {
    window: { __FGPB_THEME: { productAnchor: () => anchor, fallback() {}, isDawnDrawer: () => false } },
    location: { pathname: '/products/bag' },
    document: { querySelector: selector => selector.startsWith('[data-fg-auto]') ? card : existingBlock ? block : null },
    lastCfg: {
      enabled: true,
      placements,
      remaining: 162,
      progress: 84,
      currency: 'USD',
      ht: 'You are {remaining} away from your free gift',
      ds: 'Add more items to your cart to unlock your gift.',
      uh: "You've unlocked your free gift!",
      ud: 'Your gift has been added to the cart.',
    },
    createProductCard: () => {
      creates++;
      return {
        ...nodes,
        setAttribute() {},
        remove() { card = null; },
      };
    },
    findDrawer: () => null,
    formatMoneyLabel: (n) => {
      const amt = Math.max(0, Number(n) || 0);
      const rounded = Math.round(amt * 100) / 100;
      if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
      return rounded.toFixed(2);
    },
    formatUnlockedHeading: () => "You've unlocked your free gift!",
    setFillWidth(el, pct) { el.progress = pct; },
  };
  vm.createContext(context);
  vm.runInContext(productPaint, context);
  return {
    context,
    paint: () => context.paintPortableProduct(),
    card: () => card,
    creates: () => creates,
    heading: () => heading,
    text: () => text,
    fill: () => fill,
    attrs: () => attrs,
  };
}
test('portable product widget survives empty-cart rendering and repeated paints without duplicates', () => {
  const f = productFixture(['Product Page']);
  f.paint(); f.paint();
  assert.equal(f.creates(), 1);
  assert.equal(f.card().hidden, false);
  assert.equal(f.heading().textContent, 'You are 162 away from your free gift');
  assert.doesNotMatch(f.heading().textContent, /\$|₹|Rs\.|USD|INR/);
  f.context.lastCfg.enabled = false;
  f.paint();
  assert.equal(f.card(), null);
});
test('portable widget respects excluded product placement', () => {
  const f = productFixture(['Cart Drawer']); f.paint();
  assert.equal(f.creates(), 0);
});
test('merchant product app block takes precedence over automatic placement', () => {
  const f = productFixture(['Product Page'], true); f.paint();
  assert.equal(f.creates(), 0);
});
test('merchant product app block updates remaining from live cart cfg', () => {
  const f = productFixture(['Product Page'], true);
  f.paint();
  assert.equal(f.creates(), 0);
  assert.equal(f.heading().textContent, 'You are 162 away from your free gift');
  assert.doesNotMatch(f.heading().textContent, /\$|₹|Rs\.|USD|INR/);
  assert.equal(f.fill().progress, 84);
  assert.equal(f.attrs()['aria-valuenow'], '84');
  assert.equal(f.attrs()['aria-valuetext'], 'You are 162 away from your free gift');
  assert.equal(f.attrs()['role'], 'progressbar');
  assert.equal(f.attrs()['aria-valuemin'], '0');
  assert.equal(f.attrs()['aria-valuemax'], '100');
  f.context.lastCfg.remaining = 0;
  f.context.lastCfg.progress = 100;
  f.paint();
  assert.match(f.heading().textContent, /unlocked/i);
  assert.equal(f.text().textContent, 'Your gift has been added to the cart.');
  assert.equal(f.fill().progress, 100);
  assert.equal(f.attrs()['aria-valuenow'], '100');
  assert.match(f.attrs()['aria-valuetext'], /unlocked/i);
});
