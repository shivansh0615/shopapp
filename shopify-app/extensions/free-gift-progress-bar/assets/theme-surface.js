/* Portable surface discovery. No cart mutations or theme HTML replacement. */
(function () {
  if (window.__FGPB_THEME) return;
  var drawers = 'cart-drawer,cart-drawer-component,cart-notification,[data-cart-drawer],#CartDrawer,.cart-drawer,mini-cart,.mini-cart,#mini-cart,.ajax-cart,#AjaxCart,.sidecart,#sidecart';
  function cartUrl() {
    var root = window.Shopify && window.Shopify.routes && window.Shopify.routes.root;
    return String(root || '/').replace(/\/?$/, '/') + 'cart';
  }
  function actionPath(form) {
    try {
      var url = new URL(form.getAttribute('action') || '', location.href);
      return url.origin === location.origin ? url.pathname.replace(/\/$/, '') : '';
    } catch (_e) { return ''; }
  }
  function findForm(kind) {
    var forms = document.querySelectorAll('form[action]');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (form.closest(drawers) || form.hidden || form.getAttribute('aria-hidden') === 'true') continue;
      var path = actionPath(form);
      if (kind === 'product' ? /\/cart\/add(?:\.js)?$/.test(path) && form.querySelector('[name="id"]') : /\/cart$/.test(path)) return form;
    }
    return null;
  }
  function cartAnchor() {
    return document.querySelector('[data-fgpb-cart-slot]') || findForm('cart') || document.querySelector('main,[role="main"],#MainContent');
  }
  function productAnchor() { return document.querySelector('[data-fgpb-product-anchor]') || findForm('product'); }
  function drawerInner(drawer) {
    if (!drawer) return null;
    return drawer.querySelector('[data-cart-drawer-content],[data-cart-content],.drawer__inner,.cart-drawer__inner,[role="dialog"],dialog') ||
      (drawer.getAttribute('role') === 'dialog' || String(drawer.tagName).toLowerCase() === 'dialog' ? drawer : null);
  }
  function isDawnDrawer(drawer) {
    return !!(drawer && drawer.querySelector('cart-drawer-items') && drawer.querySelector('.drawer__inner'));
  }
  function fallback(root, cfg) {
    var link = document.querySelector('[data-fgpb-cart-fallback]');
    if (!cfg || !cfg.enabled || !root) { if (link) link.remove(); return; }
    if (!link) {
      link = document.createElement('a');
      link.setAttribute('data-fgpb-cart-fallback', '1');
      link.textContent = 'View cart and free gifts';
      link.style.cssText = 'display:block;padding:12px 0;text-decoration:underline;color:inherit;font:inherit';
    }
    link.href = cartUrl();
    if (link.parentNode !== root) root.appendChild(link);
  }
  window.__FGPB_THEME = { drawers: drawers, cartUrl: cartUrl, actionPath: actionPath, cartAnchor: cartAnchor, productAnchor: productAnchor, drawerInner: drawerInner, isDawnDrawer: isDawnDrawer, fallback: fallback };
})();
