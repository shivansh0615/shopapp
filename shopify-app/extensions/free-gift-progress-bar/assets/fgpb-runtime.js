/**
 * UpsellTrix storefront runtime: isolation stages + diagnostics recorder.
 *
 * Loaded before every other UpsellTrix asset. Owns the isolation flags, the
 * diagnostics recorder, and the storefront-password fetch guard:
 *
 *   1. window.__FGPB_RT.flags — the staged kill switch every satellite consults
 *      before it reads, paints, or mutates anything.
 *   2. window.__fgpbDiag — an opt-in, observe-only recorder used to capture live
 *      Dawn evidence. The recorder never modifies a request, a response, or the DOM.
 *   3. A storefront-password guard on cart and app-proxy fetches. Those requests
 *      send Accept: application/json; Shopify then redirects /password to itself
 *      and the browser follows that loop until the cart tab stops answering.
 *
 * Stages (?fgpb_stage=N, or window.__FGPB_STAGE before this asset loads):
 *   0 native Dawn only, all UpsellTrix behaviour off
 *   1 config/embed only, no cart interception, no gift sync, no recovery
 *   2 + progress rendering, read-only
 *   3 + passive owned-host recovery
 *   4 + gift eligibility evaluated in DRY RUN (plans logged, cart untouched)
 *   5 + serialized real gift mutations
 *
 * Default is stage 5: eligible gifts are added and Shopify must discount them
 * to $0. Stages 0–4 remain available as explicit, per-page diagnostic overrides.
 * A persistent localStorage override is deliberately ignored: diagnostic state
 * must never leave a shopper's browser permanently unable to receive gifts.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  installPasswordRedirectGuard();
  if (window.__FGPB_RT) return;

  /**
   * Shopify's password page redirects to itself when Accept is application/json.
   * fetch() follows that chain (about 20 hops) and Dawn leaves the cart in
   * loading until it finishes, so +/- on /cart appears dead. Stop on the first
   * hop. A real 200 from /cart.js is returned untouched.
   */
  function installPasswordRedirectGuard() {
    if (window.__fgpbPasswordGuard) return;
    if (typeof window.fetch !== "function") return;
    var orig = window.fetch.bind(window);
    window.__fgpbOrigFetch = window.__fgpbOrigFetch || orig;

    function ajaxPath(input) {
      var raw = "";
      if (typeof input === "string") raw = input;
      else {
        try {
          raw = input && input.url ? String(input.url) : "";
        } catch (_e) {
          raw = "";
        }
      }
      try {
        return new URL(raw, window.location.origin).pathname || "";
      } catch (_e2) {
        return String(raw).split("?")[0];
      }
    }

    function isStorefrontAjax(input) {
      var path = ajaxPath(input);
      return (
        path === "/cart.js" ||
        path === "/password" ||
        path.indexOf("/cart/") === 0 ||
        path.indexOf("/apps/free-gift/") === 0
      );
    }

    function passwordResponse() {
      return new Response(
        JSON.stringify({ status: 401, message: "password", description: "password" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    function locationOf(res) {
      try {
        return (res && res.headers && res.headers.get("location")) || "";
      } catch (_e) {
        return "";
      }
    }

    function guarded(native, input, init) {
      var send = typeof native === "function" ? native : orig;
      if (!isStorefrontAjax(input)) return send(input, init);
      var next = {};
      if (init) {
        for (var k in init) {
          if (Object.prototype.hasOwnProperty.call(init, k)) next[k] = init[k];
        }
      }
      next.redirect = "manual";
      return send(input, next).then(function (res) {
        if (!res || res.type === "opaqueredirect") return passwordResponse();
        if (res.status < 300 || res.status >= 400) return res;
        var loc = locationOf(res);
        if (!loc || /password/i.test(loc)) return passwordResponse();
        var follow = {};
        for (var key in next) {
          if (Object.prototype.hasOwnProperty.call(next, key)) follow[key] = next[key];
        }
        follow.redirect = "manual";
        return send(loc, follow).then(function (res2) {
          if (!res2 || res2.type === "opaqueredirect" || (res2.status >= 300 && res2.status < 400)) {
            return passwordResponse();
          }
          return res2;
        });
      });
    }

    window.__fgpbGuardFetch = guarded;
    window.fetch = function (input, init) {
      return guarded(orig, input, init);
    };
    window.__fgpbPasswordGuard = true;
  }

  var STAGE_OFF = 0;
  var STAGE_GIFT_LIVE = 5;
  var DEFAULT_STAGE = 5;
  var MAX_EVENTS = 500;

  function param(name) {
    try {
      var m = String(window.location.search || "").match(
        new RegExp("[?&]" + name + "=([^&#]*)"),
      );
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_e) {
      return null;
    }
  }

  function readStore(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (_e) {
      return null;
    }
  }

  function clampStage(n) {
    var v = Math.trunc(Number(n));
    if (!isFinite(v)) return DEFAULT_STAGE;
    if (v < STAGE_OFF) return STAGE_OFF;
    if (v > STAGE_GIFT_LIVE) return STAGE_GIFT_LIVE;
    return v;
  }

  function resolveStage() {
    var q = param("fgpb_stage");
    if (q != null && q !== "" && isFinite(Number(q))) return clampStage(q);
    if (isFinite(Number(window.__FGPB_STAGE))) return clampStage(window.__FGPB_STAGE);
    return DEFAULT_STAGE;
  }

  function flagsForStage(stage) {
    return {
      stage: stage,
      enabled: stage > STAGE_OFF,
      readCart: stage >= 1,
      renderProgress: stage >= 2,
      progressRecovery: stage >= 3,
      evaluateGifts: stage >= 4,
      mutateGifts: stage >= 5,
      optimisticPaint: stage >= 5,
      recommendations: stage >= 5,
      // UpsellTrix never replaces Dawn-owned cart section HTML. Dawn applies its
      // own sections from its own response; a second writer desynchronises the
      // visible cart from the authoritative cart.
      applyDawnSections: false,
    };
  }

  var stage = resolveStage();
  var flags = flagsForStage(stage);

  // ---------------------------------------------------------------- diagnostics

  var diagOn = param("fgpb_diag") === "1" || readStore("fgpb_diag") === "1";
  var events = [];
  var seq = 0;
  var t0 = Date.now();

  function push(type, data) {
    if (!diagOn) return null;
    var entry = {
      i: ++seq,
      t: Date.now() - t0,
      iso: new Date().toISOString(),
      type: type,
      gen: Number(window.__fgpbCartUiGen) || 0,
      data: data || {},
    };
    events.push(entry);
    if (events.length > MAX_EVENTS) events.shift();
    return entry;
  }

  function summarizeCart(cart) {
    if (!cart || typeof cart !== "object") return null;
    var items = Array.isArray(cart.items) ? cart.items : [];
    return {
      token: cart.token || null,
      item_count: cart.item_count,
      total_price: cart.total_price,
      items_subtotal_price: cart.items_subtotal_price,
      currency: cart.currency,
      lines: items.map(function (it) {
        var props = it.properties || {};
        return {
          key: it.key,
          variant_id: it.variant_id || it.id,
          qty: it.quantity,
          final_line_price: it.final_line_price,
          gift: props._fgpb_free_gift === "true" || props._fgpb_free_gift === true,
          campaign: props._fgpb_campaign_id || null,
          tier: props._fgpb_tier_id || null,
        };
      }),
    };
  }

  function isCartUrl(url) {
    return /\/cart(\/(add|change|update|clear)\.js|\.js|\?)/.test(String(url || ""));
  }

  function isTrackedUrl(url) {
    var u = String(url || "");
    return isCartUrl(u) || u.indexOf("/apps/") === 0 || u.indexOf("widget-state") > -1 || /sections=/.test(u);
  }

  function readBody(init) {
    try {
      if (!init || init.body == null) return null;
      if (typeof init.body === "string") return init.body.slice(0, 800);
      if (typeof FormData !== "undefined" && init.body instanceof FormData) {
        var out = {};
        init.body.forEach(function (v, k) {
          out[k] = String(v).slice(0, 200);
        });
        return out;
      }
      return String(init.body).slice(0, 800);
    } catch (_e) {
      return null;
    }
  }

  function installDiagnostics() {
    if (!diagOn || window.__fgpbDiagInstalled) return;
    window.__fgpbDiagInstalled = true;

    var origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : input && input.url;
        var method =
          (init && init.method) || (input && input.method) || "GET";
        if (!isTrackedUrl(url)) return origFetch.apply(this, arguments);
        var rec = push("request", {
          url: String(url),
          method: String(method).toUpperCase(),
          body: readBody(init),
          via: "fetch",
        });
        var started = Date.now();
        return origFetch.apply(this, arguments).then(
          function (res) {
            try {
              res
                .clone()
                .json()
                .then(function (json) {
                  push("response", {
                    ref: rec && rec.i,
                    url: String(url),
                    status: res.status,
                    ms: Date.now() - started,
                    cart: summarizeCart(json),
                    sectionKeys: json && json.sections ? Object.keys(json.sections) : null,
                  });
                })
                .catch(function () {
                  push("response", {
                    ref: rec && rec.i,
                    url: String(url),
                    status: res.status,
                    ms: Date.now() - started,
                    nonJson: true,
                  });
                });
            } catch (_e) {}
            return res;
          },
          function (err) {
            push("request-error", {
              ref: rec && rec.i,
              url: String(url),
              message: err && err.message,
            });
            throw err;
          },
        );
      };
    }

    try {
      var xhrOpen = XMLHttpRequest.prototype.open;
      var xhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__fgpbDiagUrl = url;
        this.__fgpbDiagMethod = method;
        return xhrOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        var url = this.__fgpbDiagUrl;
        if (isTrackedUrl(url)) {
          var rec = push("request", {
            url: String(url),
            method: String(this.__fgpbDiagMethod || "GET").toUpperCase(),
            body: typeof body === "string" ? body.slice(0, 800) : null,
            via: "xhr",
          });
          var self = this;
          this.addEventListener("loadend", function () {
            var parsed = null;
            try {
              parsed = JSON.parse(self.responseText);
            } catch (_e) {}
            push("response", {
              ref: rec && rec.i,
              url: String(url),
              status: self.status,
              cart: summarizeCart(parsed),
              sectionKeys: parsed && parsed.sections ? Object.keys(parsed.sections) : null,
            });
          });
        }
        return xhrSend.apply(this, arguments);
      };
    } catch (_e) {}

    window.addEventListener("error", function (e) {
      push("exception", {
        message: e && e.message,
        source: e && e.filename,
        line: e && e.lineno,
        stack: e && e.error && e.error.stack ? String(e.error.stack).slice(0, 1200) : null,
      });
    });
    window.addEventListener("unhandledrejection", function (e) {
      var r = e && e.reason;
      push("rejection", {
        message: r && r.message ? r.message : String(r),
        stack: r && r.stack ? String(r.stack).slice(0, 1200) : null,
      });
    });

    ["cart:refresh", "cart:updated", "fgpb:cart", "cart:change"].forEach(function (name) {
      document.addEventListener(name, function (e) {
        push("event", { name: name, detail: e && e.detail ? Object.keys(e.detail) : null });
      });
    });

    document.addEventListener(
      "click",
      function (e) {
        var el = e.target && e.target.closest ? e.target.closest("button, a, [name='minus'], [name='plus']") : null;
        if (!el) return;
        var label = (el.getAttribute("name") || el.getAttribute("aria-label") || el.textContent || "")
          .trim()
          .slice(0, 60);
        var row = el.closest ? el.closest(".cart-item, cart-drawer-items li, [data-index]") : null;
        push("click", {
          label: label,
          index: row && row.getAttribute ? row.getAttribute("data-index") : null,
          qtyBefore: row && row.querySelector ? readQty(row) : null,
        });
      },
      true,
    );
  }

  function readQty(row) {
    try {
      var input = row.querySelector("input[name='quantity'], .quantity__input");
      return input ? input.value : null;
    } catch (_e) {
      return null;
    }
  }

  // -------------------------------------------------------------------- public

  var api = {
    version: "142",
    stage: stage,
    flags: flags,
    diag: diagOn,
    /** Satellites call this instead of reading flags directly. */
    can: function (capability) {
      return !!flags[capability];
    },
    note: function (type, data) {
      return push(type, data);
    },
    setStage: function (next) {
      return "Reload with ?fgpb_stage=" + clampStage(next) + " to apply this diagnostic stage";
    },
    enableDiag: function () {
      try {
        window.localStorage.setItem("fgpb_diag", "1");
      } catch (_e) {}
      return "Reload to start recording";
    },
    disableDiag: function () {
      try {
        window.localStorage.removeItem("fgpb_diag");
      } catch (_e) {}
      return "Reload to stop recording";
    },
  };

  window.__FGPB_RT = api;
  window.__fgpbDiag = {
    get events() {
      return events.slice();
    },
    dump: function () {
      return JSON.stringify(
        { stage: stage, flags: flags, capturedAt: new Date().toISOString(), events: events },
        null,
        2,
      );
    },
    copy: function () {
      var text = this.dump();
      try {
        navigator.clipboard.writeText(text);
        return "Copied " + events.length + " events";
      } catch (_e) {
        return text;
      }
    },
    table: function () {
      try {
        console.table(
          events.map(function (e) {
            return {
              i: e.i,
              ms: e.t,
              type: e.type,
              gen: e.gen,
              what: e.data.url || e.data.name || e.data.label || e.data.message || "",
              status: e.data.status != null ? e.data.status : "",
            };
          }),
        );
      } catch (_e) {}
      return events.length + " events";
    },
    clear: function () {
      events.length = 0;
      seq = 0;
      t0 = Date.now();
      return "cleared";
    },
    /** Idle check: call, wait, call again. Deltas must be zero when settled. */
    counts: function () {
      var out = {};
      events.forEach(function (e) {
        out[e.type] = (out[e.type] || 0) + 1;
      });
      return out;
    },
  };

  installDiagnostics();

  if (stage < STAGE_GIFT_LIVE) {
    try {
      console.info(
        "[UpsellTrix] isolation stage " +
          stage +
          " active — " +
          (flags.mutateGifts ? "gift mutations live" : "gift mutations DISABLED (native Dawn cart only)") +
          ". __FGPB_RT.setStage(5) for full behaviour.",
      );
    } catch (_e) {}
  }
})();
