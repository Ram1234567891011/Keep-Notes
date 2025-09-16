/* bypass.js
   Simple connectivity detector + Private DNS helper for Android users.
   Usage:
     <script src="/bypass.js"></script>
     <script>window.BypassInit({domain:"keep-notes-one-black.vercel.app"});</script>
*/

(function () {
  const DEFAULT_TIMEOUT = 6000; // ms

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === "style") Object.assign(e.style, attrs[k]);
      else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    children.forEach(c => (typeof c === "string" ? e.appendChild(document.createTextNode(c)) : e.appendChild(c)));
    return e;
  }

  function timeoutFetch(url, opts = {}, ms = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      fetch(url, opts).then(r => {
        clearTimeout(timer);
        resolve(r);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async function dohResolve(domain, provider = "cloudflare") {
    // returns {ok:boolean, ips:[], raw:object|null, error:string|null}
    try {
      let url;
      if (provider === "cloudflare") {
        url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
      } else {
        url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
      }
      const res = await timeoutFetch(url, { headers: { Accept: "application/dns-json" } }, 5000);
      const txt = await res.text();
      let json;
      try { json = JSON.parse(txt); } catch(e) { json = null; }
      const ips = [];
      if (json && Array.isArray(json.Answer)) {
        json.Answer.forEach(a => {
          if (a && a.data) {
            // filter IPv4 only here
            if (/^\d+\.\d+\.\d+\.\d+$/.test(a.data)) ips.push(a.data);
          }
        });
      }
      return { ok: true, ips, raw: json, error: null };
    } catch (err) {
      return { ok: false, ips: [], raw: null, error: (err && err.message) || String(err) };
    }
  }

  function makeOverlay() {
    // create overlay but keep hidden initially
    const overlay = el("div", { id: "bypass-overlay", style: {
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box"
    }});
    const panel = el("div", { style: {
      width: "min(760px, 95%)", maxHeight: "90vh", overflowY: "auto", background: "#fff", color: "#111",
      borderRadius: "12px", padding: "18px", boxSizing: "border-box", boxShadow: "0 6px 30px rgba(0,0,0,0.35)",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial"
    }});
    const title = el("h2", {}, ["Connection help — If the app doesn't load"]);
    const msg = el("div", { id: "bypass-msg", style: { marginBottom: "12px" } }, [
      "We detected connectivity problems. Try the quick steps below to fix network/DNS issues."
    ]);
    const steps = el("ol", {}, [
      el("li", {}, ["On Android: Settings → Network & Internet → Advanced → Private DNS"]),
      el("li", {}, ["Choose \"Private DNS provider hostname\" and paste one of:"]),
      el("li", {}, [el("code", {}, ["one.one.one.one"]), "  or  ", el("code", {}, ["dns.google"])])
    ]);
    const dnsButtons = el("div", { style: { marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" } }, [
      el("button", { onclick: () => copyToClipboard("one.one.one.one") }, ["Copy: one.one.one.one"]),
      el("button", { onclick: () => copyToClipboard("dns.google") }, ["Copy: dns.google"]),
      el("button", { id: "bypass-retry", onclick: () => { hideOverlay(); window.BypassCheckLast && window.BypassCheckLast(); } }, ["Retry now"])
    ]);
    const debugTitle = el("h3", { style: { marginTop: "16px" } }, ["Debug info (for developer):"]);
    const debugPre = el("pre", { id: "bypass-debug", style: { whiteSpace: "pre-wrap", fontSize: "12px", background: "#f6f8fa", padding: "8px", borderRadius: "6px" } }, [""]);
    const footer = el("div", { style: { marginTop: "12px", display: "flex", gap: "8px", justifyContent: "flex-end" } }, [
      el("button", { onclick: hideOverlay }, ["Close"])
    ]);

    panel.appendChild(title);
    panel.appendChild(msg);
    panel.appendChild(steps);
    panel.appendChild(dnsButtons);
    panel.appendChild(debugTitle);
    panel.appendChild(debugPre);
    panel.appendChild(footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.style.display = "none";
    return { overlay, debugPre, msg };
  }

  function showOverlayWithDebug(text) {
    if (!window.__bypass_overlay) window.__bypass_overlay = makeOverlay();
    const { overlay, debugPre, msg } = window.__bypass_overlay;
    debugPre.textContent = text;
    msg.textContent = "We detected connectivity problems. Try switching Private DNS to Cloudflare (one.one.one.one) or Google DNS (dns.google). After changing, tap Retry.";
    overlay.style.display = "flex";
  }

  function hideOverlay() {
    if (window.__bypass_overlay) window.__bypass_overlay.overlay.style.display = "none";
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert("Copied: " + text + "\nNow paste it into Private DNS → Private DNS provider hostname.");
      }).catch(() => {
        fallbackCopy(text);
      });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); alert("Copied: " + text); } catch (e) { prompt("Copy this value:", text); }
    ta.remove();
  }

  async function check(domain, opts = {}) {
    opts = Object.assign({ timeout: DEFAULT_TIMEOUT, tryDoH: true }, opts || {});
    const start = Date.now();
    const debug = [];
    function push(k,v){ debug.push(`${k}: ${v}`); }

    // 1) quick fetch to root
    push("check_start", new Date(start).toISOString());
    let rootOk = false, rootStatus = null, rootErr = null;
    try {
      const r = await timeoutFetch((location.protocol ? location.protocol : "https:") + "//" + domain + "/", {}, opts.timeout);
      rootStatus = r.status;
      rootOk = r.ok;
      push("root_fetch", `ok=${rootOk} status=${rootStatus}`);
    } catch (err) {
      rootErr = err && err.message ? err.message : String(err);
      push("root_fetch_error", rootErr);
    }

    // If root OK, nothing to do
    if (rootOk) {
      push("result", "root_ok");
      const txt = debug.join("\n");
      // If previously overlay shown, hide
      hideOverlay();
      return { ok: true, debug: txt };
    }

    // 2) try DNS-over-HTTPS
    if (opts.tryDoH) {
      push("doh_try", "cloudflare");
      const doh1 = await dohResolve(domain, "cloudflare");
      push("doh_cloudflare_ok", String(doh1.ok));
      push("doh_cloudflare_ips", doh1.ips.join(", ") || "(none)");
      if (!doh1.ok) push("doh_cloudflare_err", doh1.error || "");
      // also try google for cross-check
      push("doh_try", "google");
      const doh2 = await dohResolve(domain, "google");
      push("doh_google_ok", String(doh2.ok));
      push("doh_google_ips", doh2.ips.join(", ") || "(none)");
      if (!doh2.ok) push("doh_google_err", doh2.error || "");
      // if both providers give IPs but root fetch failed, likely ISP blocking / routing
      const ips = (doh1.ips || []).concat(doh2.ips || []);
      push("doh_combined_ips", ips.join(", ") || "(none)");

      const finalDebug = debug.join("\n");
      // Show overlay with recommended steps
      showOverlayWithDebug(finalDebug);
      return { ok: false, debug: finalDebug, ips };
    } else {
      const finalDebug = debug.join("\n");
      showOverlayWithDebug(finalDebug);
      return { ok: false, debug: finalDebug };
    }
  }

  // export init function
  window.BypassInit = function (cfg) {
    const domain = cfg && cfg.domain ? cfg.domain : (location.hostname || "");
    // auto-run check, but wait until DOM ready
    function run() {
      // create overlay early (hidden)
      if (!window.__bypass_overlay) makeOverlay();
      // attach debug retry func
      window.BypassCheckLast = () => check(domain);
      // run initial check after small delay to avoid blocking first paint
      setTimeout(() => {
        check(domain).catch(e => {
          console.error("Bypass check failed:", e);
        });
      }, 600);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  };

  // small helper for direct usage
  window.BypassCheck = function(domain){ return window.BypassInit({domain:domain}); };

})();
