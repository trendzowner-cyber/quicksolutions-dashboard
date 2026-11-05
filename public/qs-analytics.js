/**
 * QuickSolutionsPro Analytics Bridge — Lightweight first-party tracker
 * Load on quicksolutionspro.be — async, non-blocking, privacy-aware
 *
 * Sends events to the Quicksolutions Control Center analytics API.
 * Session: 30min timeout, 12s heartbeat. Visitor: localStorage UUID.
 */
(function () {
  "use strict";

  // ═══════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════
  var ENDPOINT = "https://quicksolutions-dashboard.vercel.app/api/analytics/ingest";
  var HEARTBEAT_MS = 12000;
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  var BATCH_SIZE = 10;
  var BATCH_INTERVAL_MS = 2000;

  // ═══════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════
  var eventQueue = [];
  var heartbeatTimer = null;
  var batchTimer = null;
  var pageStartTime = Date.now();
  var currentPage = getPageInfo();
  var visitorId = initVisitorId();
  var sessionId = initSessionId();

  // ═══════════════════════════════════════════
  // ID GENERATION
  // ═══════════════════════════════════════════
  function randomId() {
    // crypto.randomUUID where available, fallback to Math.random
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "");
    }
    return Math.random().toString(36).substring(2, 10) +
           Math.random().toString(36).substring(2, 10) +
           Math.random().toString(36).substring(2, 10) +
           Math.random().toString(36).substring(2, 10);
  }

  function initVisitorId() {
    try {
      var stored = localStorage.getItem("_qs_vid");
      if (stored) return stored;
    } catch (_) {}
    var id = "v_" + randomId();
    try { localStorage.setItem("_qs_vid", id); } catch (_) {}
    return id;
  }

  function initSessionId() {
    try {
      var stored = sessionStorage.getItem("_qs_sid");
      var storedTs = sessionStorage.getItem("_qs_sid_ts");
      if (stored && storedTs) {
        var age = Date.now() - parseInt(storedTs, 10);
        if (age < SESSION_TIMEOUT_MS) return stored;
      }
    } catch (_) {}
    var id = "s_" + randomId();
    try {
      sessionStorage.setItem("_qs_sid", id);
      sessionStorage.setItem("_qs_sid_ts", String(Date.now()));
    } catch (_) {}
    return id;
  }

  // ═══════════════════════════════════════════
  // PAGE INFO
  // ═══════════════════════════════════════════
  function getPageInfo() {
    return {
      url: location.href,
      path: location.pathname,
      title: document.title,
      referrer: document.referrer || undefined,
    };
  }

  function getDeviceInfo() {
    var w = window.innerWidth;
    return {
      deviceCategory: w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop",
      viewportWidth: w,
      language: (navigator.language || "").split("-")[0],
    };
  }

  function getScrollDepth() {
    var top = window.pageYOffset || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - window.innerHeight;
    return height > 0 ? Math.round((top / height) * 100) : 100;
  }

  // ═══════════════════════════════════════════
  // UTM CAPTURE
  // ═══════════════════════════════════════════
  function getUtmParams() {
    try {
      var params = new URLSearchParams(location.search);
      var utm = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
        var v = params.get(k);
        if (v) utm[k] = v;
      });
      return utm;
    } catch (_) { return {}; }
  }

  function getStoredUtms() {
    try {
      var raw = sessionStorage.getItem("_qs_utm");
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function mergeAndStoreUtms() {
    var stored = getStoredUtms();
    var fresh = getUtmParams();
    var changed = false;
    Object.keys(fresh).forEach(function (k) {
      if (fresh[k] !== stored[k]) { stored[k] = fresh[k]; changed = true; }
    });
    if (changed) {
      try { sessionStorage.setItem("_qs_utm", JSON.stringify(stored)); } catch (_) {}
    }
    return stored;
  }

  function getLandingPage() {
    try {
      var stored = sessionStorage.getItem("_qs_landing");
      if (!stored) {
        sessionStorage.setItem("_qs_landing", location.pathname);
        return location.pathname;
      }
      return stored;
    } catch (_) { return location.pathname; }
  }

  // ═══════════════════════════════════════════
  // EVENT BUILDER
  // ═══════════════════════════════════════════
  function buildEvent(name, extraProps) {
    var device = getDeviceInfo();
    var utms = mergeAndStoreUtms();

    var props = {
      page_url: currentPage.url,
      page_path: currentPage.path,
      page_title: currentPage.title,
      referrer: currentPage.referrer,
      deviceCategory: device.deviceCategory,
      viewportWidth: device.viewportWidth,
      language: device.language,
    };

    // Merge UTM params
    for (var uk in utms) { if (utms.hasOwnProperty(uk)) props[uk] = utms[uk]; }
    // Merge extra properties
    if (extraProps) {
      for (var ek in extraProps) { if (extraProps.hasOwnProperty(ek)) props[ek] = extraProps[ek]; }
    }

    return {
      eventName: name,
      sessionId: sessionId,
      visitorId: visitorId,
      occurredAt: new Date().toISOString(),
      properties: props,
    };
  }

  // ═══════════════════════════════════════════
  // TRANSPORT
  // ═══════════════════════════════════════════
  function sendEvents(events) {
    if (!events || events.length === 0) return;
    try {
      var data = JSON.stringify(events.length === 1 ? events[0] : events);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([data], { type: "application/json" }));
      } else {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", ENDPOINT, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.timeout = 3000;
        xhr.send(data);
      }
    } catch (_) {}
  }

  function flush() {
    if (eventQueue.length === 0) return;
    var batch = eventQueue.splice(0, BATCH_SIZE);
    sendEvents(batch);
    if (eventQueue.length > 0) {
      setTimeout(flush, 50);
    }
  }

  function enqueue(event) {
    eventQueue.push(event);
    if (eventQueue.length >= BATCH_SIZE) {
      flush();
    }
  }

  // ═══════════════════════════════════════════
  // HEARTBEAT
  // ═══════════════════════════════════════════
  function heartbeat() {
    enqueue(buildEvent("heartbeat", {
      scroll_depth_pct: getScrollDepth(),
    }));
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ═══════════════════════════════════════════
  // PAGE LEAVE
  // ═══════════════════════════════════════════
  function trackPageLeave() {
    stopHeartbeat();
    var duration = Math.round((Date.now() - pageStartTime) / 1000);
    sendEvents([buildEvent("page_leave", {
      duration_seconds: duration,
      scroll_depth_pct: getScrollDepth(),
    })]);
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════
  window.QSAnalytics = {
    /** Track any custom event */
    track: function (eventName, props) {
      enqueue(buildEvent(eventName, props));
    },

    /** Called on page load (auto-invoked) and SPA navigations */
    page: function () {
      currentPage = getPageInfo();
      pageStartTime = Date.now();
      enqueue(buildEvent("page_view", { landing_page: getLandingPage() }));
      startHeartbeat();
    },

    /** Identify known user (call after login / on order-confirmation) */
    identify: function (userId, traits) {
      var props = { user_id: userId };
      if (traits) {
        for (var k in traits) { if (traits.hasOwnProperty(k)) props["user_" + k] = traits[k]; }
      }
      enqueue(buildEvent("user_identified", props));
    },

    /** Track ecommerce events */
    ecommerce: {
      productView: function (productId, name, category) {
        enqueue(buildEvent("product_view", {
          product_id: productId,
          product_name: name,
          product_category: category,
        }));
      },
      addToCart: function (productId, name, quantity, price) {
        enqueue(buildEvent("add_to_cart", {
          product_id: productId,
          product_name: name,
          quantity: quantity || 1,
          price: price,
        }));
      },
      removeFromCart: function (productId, name) {
        enqueue(buildEvent("remove_from_cart", {
          product_id: productId,
          product_name: name,
        }));
      },
      viewCart: function () {
        enqueue(buildEvent("view_cart"));
      },
      beginCheckout: function () {
        enqueue(buildEvent("begin_checkout", { checkout_url: location.href }));
      },
      addPaymentInfo: function () {
        enqueue(buildEvent("add_payment_info"));
      },
      purchase: function (orderId, total, currency, items) {
        enqueue(buildEvent("purchase", {
          order_id: orderId,
          total: total,
          currency: currency || "EUR",
          items: items ? JSON.stringify(items) : undefined,
        }));
      },
      search: function (query, resultsCount) {
        enqueue(buildEvent("search", {
          search_query: query,
          results_count: resultsCount,
        }));
      },
    },
  };

  // ═══════════════════════════════════════════
  // VISIBILITY CHANGE
  // ═══════════════════════════════════════════
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopHeartbeat();
    } else {
      startHeartbeat();
    }
  });

  // ═══════════════════════════════════════════
  // PAGE LEAVE HANDLERS
  // ═══════════════════════════════════════════
  window.addEventListener("beforeunload", trackPageLeave);
  window.addEventListener("pagehide", trackPageLeave);

  // ═══════════════════════════════════════════
  // BOOT — track initial page view + start heartbeat + batch flusher
  // ═══════════════════════════════════════════
  QSAnalytics.page();
  startHeartbeat();
  batchTimer = setInterval(flush, BATCH_INTERVAL_MS);

  // ═══════════════════════════════════════════
  // WOOCOMMERCE AUTO-DETECTION
  // ═══════════════════════════════════════════
  function setupWooDetection() {
    // --- Add-to-cart clicks (delegated) ---
    document.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== document.body) {
        if (el.tagName === "BUTTON" || el.tagName === "A") {
          var cls = el.className || "";
          var nameAttr = el.getAttribute("name") || "";
          if (cls.indexOf("add_to_cart_button") > -1 ||
              cls.indexOf("single_add_to_cart_button") > -1 ||
              nameAttr === "add-to-cart") {
            var productId = el.getAttribute("data-product_id") || undefined;
            var qtyEl = document.querySelector('input[name="quantity"]');
            var qty = qtyEl ? parseInt(qtyEl.value, 10) || 1 : 1;
            QSAnalytics.ecommerce.addToCart(
              productId ? parseInt(productId, 10) : undefined,
              undefined, qty, undefined
            );
            break;
          }
        }
        el = el.parentElement;
      }
    }, true);

    // --- Checkout page ---
    if (/\/checkout/.test(location.pathname)) {
      QSAnalytics.ecommerce.beginCheckout();
    }

    // --- Order received ---
    // NOTE: purchase tracking is handled server-side by the PHP plugin
    // (qs-analytics-tracker.php) which sends full order data reliably.
    // The JS auto-detection below is disabled to prevent double-counting.
    // if (/\/order-received/.test(location.pathname) ||
    //     /\/checkout\/order-received/.test(location.pathname)) {
    //   var orderIdEl = document.querySelector(".woocommerce-order-overview__order strong");
    //   var totalEl = document.querySelector(".woocommerce-order-overview__total .amount");
    //   QSAnalytics.ecommerce.purchase(
    //     orderIdEl ? orderIdEl.textContent.trim() : undefined,
    //     undefined,
    //     "EUR",
    //     undefined
    //   );
    // }

    // --- Cart page ---
    if (/\/cart/.test(location.pathname) || /\/winkelwagen/.test(location.pathname)) {
      QSAnalytics.ecommerce.viewCart();
    }

    // --- Product page ---
    if (/\/product\//.test(location.pathname)) {
      var titleEl = document.querySelector(".product_title, h1.product_title");
      var skuEl = document.querySelector(".sku");
      QSAnalytics.ecommerce.productView(
        skuEl ? skuEl.textContent.trim() : undefined,
        titleEl ? titleEl.textContent.trim() : document.title,
        undefined
      );
    }

    // --- Search ---
    if (/\/\?s=/.test(location.href) || /\/search\//.test(location.pathname)) {
      var params = new URLSearchParams(location.search);
      var query = params.get("s");
      if (query) {
        var countEl = document.querySelector(".woocommerce-result-count");
        var count = countEl ? parseInt(countEl.textContent, 10) : undefined;
        QSAnalytics.ecommerce.search(query, count);
      }
    }
  }

  // Run Woo detection when DOM is ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(setupWooDetection, 0);
  } else {
    document.addEventListener("DOMContentLoaded", setupWooDetection);
  }

})();
