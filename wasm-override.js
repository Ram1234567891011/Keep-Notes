/* wasm-override-404-retry.js
   Behavior:
    - Let the app attempt original fetch normally.
    - If any fetch for a URL containing "wPxSCaJj.wasm" returns 404 or fails, automatically try proxy fallback:
        proxy + encodeURIComponent(originalUrl)
    - Expose window.__wasmBypass for debugging.
   Configure via window.WasmBypassConfig (see below).
*/

(function(){
  const DEFAULT = {
    // the substring to match in requested URL
    matchSubstr: "wPxSCaJj.wasm",
    // proxy endpoint; worker must accept ?u=encodedURL or any templated usage
    proxyPrefix: "" // e.g. "https://my-worker.workers.dev/proxy?u="
  };
  const C = Object.assign({}, DEFAULT, window.WasmBypassConfig || {});
  const ORIGINAL_FETCH = window.fetch.bind(window);

  // helper: if response is 404, try proxy
  async function fetchWith404Fallback(input, init) {
    // call original fetch
    try {
      const res = await ORIGINAL_FETCH(input, init);
      // if URL matches our wasm and server returned 404 -> try proxy
      const url = (typeof input === "string") ? input : (input && input.url) || "";
      if (url && url.indexOf(C.matchSubstr) !== -1) {
        if (res.status === 404) {
          // try proxy if configured
          if (C.proxyPrefix && C.proxyPrefix.length) {
            const proxyUrl = C.proxyPrefix + encodeURIComponent(url);
            try {
              const pRes = await ORIGINAL_FETCH(proxyUrl, init);
              if (pRes.ok) return pRes;
              // else fallthrough to return original res
              console.warn("[wasm-bypass] proxy fetch returned", pRes.status);
            } catch (pe) {
              console.warn("[wasm-bypass] proxy fetch error", pe);
            }
          }
        }
      }
      return res;
    } catch (e) {
      // network-level error: if input matches and proxy exists try proxy
      const url = (typeof input === "string") ? input : (input && input.url) || "";
      if (url && url.indexOf(C.matchSubstr) !== -1 && C.proxyPrefix && C.proxyPrefix.length) {
        const proxyUrl = C.proxyPrefix + encodeURIComponent(url);
        try {
          const pRes = await ORIGINAL_FETCH(proxyUrl, init);
          if (pRes.ok) return pRes;
        } catch (pe) {
          console.warn("[wasm-bypass] proxy fetch after network error also failed", pe);
        }
      }
      throw e;
    }
  }

  // install global fetch override that uses the fallback logic
  window.fetch = function(input, init) {
    // If the requested resource matches the wasm substring, route via fetchWith404Fallback
    try {
      const url = (typeof input === "string") ? input : (input && input.url) || "";
      if (url && url.indexOf(C.matchSubstr) !== -1) {
        return fetchWith404Fallback(input, init);
      }
    } catch (e) { /* ignore parsing errors */ }
    return ORIGINAL_FETCH(input, init);
  };

  // override XHR.open to rewrite direct XHR calls (best-effort)
  try {
    const XHRProto = XMLHttpRequest.prototype;
    const origOpen = XHRProto.open;
    XHRProto.open = function(method, url /*...*/) {
      try {
        if (url && url.indexOf(C.matchSubstr) !== -1 && C.proxyPrefix && C.proxyPrefix.length) {
          // do not rewrite here (we prefer to let fetch override handle fetch-based flows).
          // But for XHR 404 handling, we rely on consumer to detect and retry via proxy.
        }
      } catch(e){ }
      return origOpen.apply(this, arguments);
    };
  } catch(e){ /* ignore */ }

  // WebAssembly.instantiateStreaming: some libs use instantiateStreaming(fetch('...'))
  if (window.WebAssembly && window.WebAssembly.instantiateStreaming) {
    const origInst = WebAssembly.instantiateStreaming.bind(WebAssembly);
    WebAssembly.instantiateStreaming = async function(respOrPromise, importObject) {
      try {
        const maybeResp = await Promise.resolve(respOrPromise);
        const url = (maybeResp && maybeResp.url) ? maybeResp.url : null;
        if (url && url.indexOf(C.matchSubstr) !== -1) {
          // use our fetchWith404Fallback to get a Response (handles 404->proxy)
          const r = await fetchWith404Fallback(url);
          return origInst(r, importObject);
        }
      } catch (e) {
        // fall through to original behavior
      }
      return origInst(respOrPromise, importObject);
    };
  }

  window.__wasmBypass = {
    config: C,
    info: function(){ return { matchSubstr: C.matchSubstr, proxyPrefix: C.proxyPrefix }; }
  };

  console.info("wasm-override-404-retry installed", C);
})();
