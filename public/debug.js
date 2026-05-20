// 调试脚本：注入到 WebView 中监控所有网络请求
// 通过 Capacitor bridge 或 console.log 输出

(function() {
  // 拦截所有 fetch 请求
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    console.log('[FETCH-DEBUG] Requesting:', url);
    console.log('[FETCH-DEBUG] Options:', JSON.stringify(args[1]));
    
    try {
      const res = await origFetch.apply(this, args);
      console.log('[FETCH-DEBUG] Response:', res.status, res.statusText, url);
      return res;
    } catch (err) {
      console.error('[FETCH-DEBUG] ERROR:', err.message, url);
      console.error('[FETCH-DEBUG] Full error:', err);
      throw err;
    }
  };
  
  // 拦截 XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._debugUrl = url;
    this._debugMethod = method;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    console.log('[XHR-DEBUG]', this._debugMethod, this._debugUrl);
    this.addEventListener('load', () => {
      console.log('[XHR-DEBUG] Response:', this.status, this._debugUrl);
    });
    this.addEventListener('error', (e) => {
      console.error('[XHR-DEBUG] ERROR:', e, this._debugUrl);
    });
    return origSend.apply(this, args);
  };
  
  // 页面加载完成后显示调试信息
  window.addEventListener('load', () => {
    console.log('[PAGE-DEBUG] Page loaded');
    console.log('[PAGE-DEBUG] Location:', window.location.href);
    console.log('[PAGE-DEBUG] UserAgent:', navigator.userAgent);
    
    // 在页面上显示调试面板
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(220,53,69,0.95);color:#fff;padding:8px 12px;font-size:12px;font-family:monospace;max-height:40vh;overflow:auto;';
    panel.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;">🔧 Debug Panel</div><div id="debug-log"></div>';
    document.body.appendChild(panel);
    
    const logEl = document.getElementById('debug-log');
    const origLog = console.log;
    const origError = console.error;
    
    function addLog(msg) {
      const div = document.createElement('div');
      div.style.cssText = 'border-top:1px solid rgba(255,255,255,0.2);padding:2px 0;word-break:break-all;';
      div.textContent = new Date().toLocaleTimeString() + ' | ' + msg;
      logEl.appendChild(div);
    }
    
    console.log = function(...a) { addLog(a.join(' ')); origLog.apply(console, a); };
    console.error = function(...a) { addLog('❌ ' + a.join(' ')); origError.apply(console, a); };
    
    addLog('URL: ' + location.href);
    addLog('UA: ' + navigator.userAgent);
  });
  
  console.log('[DEBUG] Script injected successfully');
})();
