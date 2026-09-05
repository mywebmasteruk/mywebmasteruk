/**
 * Analytics bootstrap.
 *
 * Two constraints shape this file:
 *  1. UK PECR requires consent before analytics cookies are set, so Google
 *     Consent Mode starts denied and only upgrades if the visitor agrees.
 *  2. This site argues that third-party scripts are what make websites slow,
 *     so the tag loads after the page is interactive and never blocks paint.
 */
(function () {
  var el = document.currentScript;
  var GA_ID = el && el.dataset.gaId;
  if (!GA_ID) return;

  var STORE = "mwm-consent";
  var banner;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // Denied until the visitor says otherwise. With storage denied, Google still
  // receives cookieless pings, so aggregate counts work without tracking anyone.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
  });

  function read() {
    try { return localStorage.getItem(STORE); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(STORE, v); } catch (e) { /* private mode */ }
  }

  function grant() {
    gtag("consent", "update", { analytics_storage: "granted" });
  }

  function loadTag() {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    // anonymize_ip is the default in GA4; stated here so the intent is auditable.
    gtag("config", GA_ID, { anonymize_ip: true });
  }

  function decide(choice) {
    write(choice);
    if (choice === "granted") grant();
    if (banner) banner.hidden = true;
  }

  function showBanner() {
    banner = document.getElementById("consent-banner");
    if (!banner) return;
    banner.hidden = false;
    banner.addEventListener("click", function (e) {
      var action = e.target && e.target.dataset && e.target.dataset.consent;
      if (action) decide(action);
    });
  }

  function start() {
    var stored = read();
    if (stored === "granted") grant();
    else if (stored !== "denied") showBanner();
    loadTag();
  }

  // Off the critical path: wait until the page has finished loading.
  if (document.readyState === "complete") setTimeout(start, 0);
  else window.addEventListener("load", function () { setTimeout(start, 0); });
})();
