/**
 * Chat Widget Builder
 *
 * Returns self-contained browser JavaScript as a string.
 * The script creates a floating chat bubble + chat window that communicates
 * with the backend via Socket.IO (real-time streaming) with a fetch POST
 * fallback when WebSocket is unavailable.
 *
 * Intentionally has NO Node/NestJS imports — it is served as-is to browsers.
 */

export interface WidgetConfig {
  readonly apiKey: string;
  readonly apiBase: string;
  readonly primaryColor?: string;
  readonly greeting?: string;
  readonly position?: 'bottom-right' | 'bottom-left';
}

/**
 * Generates the browser-side widget script as a JavaScript string.
 * Injected values (apiKey, apiBase, etc.) are embedded at build time.
 */
export function buildWidgetScript(config: WidgetConfig): string {
  const {
    apiKey,
    apiBase,
    primaryColor = '#2563eb',
    greeting = 'Hello! How can I help you today?',
    position = 'bottom-right',
  } = config;

  // Sanitise values embedded into the script string
  const safeApiKey = JSON.stringify(apiKey);
  const safeApiBase = JSON.stringify(apiBase);
  const safeColor = JSON.stringify(primaryColor);
  const safeGreeting = JSON.stringify(greeting);
  const safePosition = JSON.stringify(position);

  return `
(function() {
  'use strict';

  var API_KEY    = ${safeApiKey};
  var API_BASE   = ${safeApiBase};
  var COLOR      = ${safeColor};
  var GREETING   = ${safeGreeting};
  var POSITION   = ${safePosition};

  // ── State ────────────────────────────────────────────────────────────────
  var sessionId    = null;
  var isOpen       = false;
  var socket       = null;
  var socketReady  = false;
  var currentBotEl = null; // streaming target element

  // ── Generate or restore session id ──────────────────────────────────────
  function getSessionId() {
    if (sessionId) return sessionId;
    var stored = null;
    try { stored = localStorage.getItem('_mw_sid_' + API_KEY); } catch(e) {}
    if (!stored) {
      stored = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      try { localStorage.setItem('_mw_sid_' + API_KEY, stored); } catch(e) {}
    }
    sessionId = stored;
    return sessionId;
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    var pos = POSITION === 'bottom-left' ? 'left:24px' : 'right:24px';
    var css = [
      '#_mw_bubble{position:fixed;' + pos + ';bottom:24px;width:56px;height:56px;border-radius:50%;background:' + COLOR + ';display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);z-index:99999;border:none;outline:none;}',
      '#_mw_bubble svg{width:28px;height:28px;fill:#fff;}',
      '#_mw_window{position:fixed;' + pos + ';bottom:92px;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:none;flex-direction:column;z-index:99999;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '#_mw_window.open{display:flex;}',
      '#_mw_header{background:' + COLOR + ';padding:16px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
      '#_mw_header h3{margin:0;font-size:15px;font-weight:600;}',
      '#_mw_status{font-size:11px;opacity:.8;margin-top:2px;}',
      '#_mw_close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0;}',
      '#_mw_messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}',
      '._mw_msg{max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.45;word-break:break-word;}',
      '._mw_msg.user{background:' + COLOR + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}',
      '._mw_msg.assistant{background:#f1f5f9;color:#1e293b;align-self:flex-start;border-bottom-left-radius:4px;}',
      '._mw_typing{display:flex;gap:4px;align-items:center;padding:10px 14px;background:#f1f5f9;border-radius:12px;align-self:flex-start;border-bottom-left-radius:4px;}',
      '._mw_typing span{width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:_mw_bounce 1.2s infinite;}',
      '._mw_typing span:nth-child(2){animation-delay:.2s;}',
      '._mw_typing span:nth-child(3){animation-delay:.4s;}',
      '@keyframes _mw_bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',
      '#_mw_footer{padding:12px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-shrink:0;}',
      '#_mw_input{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;resize:none;max-height:100px;font-family:inherit;}',
      '#_mw_input:focus{border-color:' + COLOR + ';}',
      '#_mw_send{background:' + COLOR + ';color:#fff;border:none;border-radius:8px;padding:10px 16px;cursor:pointer;font-size:14px;font-weight:500;white-space:nowrap;}',
      '#_mw_send:disabled{opacity:.6;cursor:not-allowed;}',
    ].join('\\n');
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  function buildDOM() {
    // Bubble button
    var bubble = document.createElement('button');
    bubble.id = '_mw_bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
    bubble.addEventListener('click', toggleWindow);
    document.body.appendChild(bubble);

    // Chat window
    var win = document.createElement('div');
    win.id = '_mw_window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat support');
    win.innerHTML = [
      '<div id="_mw_header">',
      '  <div>',
      '    <h3>Support Chat</h3>',
      '    <div id="_mw_status"></div>',
      '  </div>',
      '  <button id="_mw_close" aria-label="Close chat">&times;</button>',
      '</div>',
      '<div id="_mw_messages" aria-live="polite"></div>',
      '<div id="_mw_footer">',
      '  <textarea id="_mw_input" rows="1" placeholder="Type a message..." aria-label="Message input"></textarea>',
      '  <button id="_mw_send">Send</button>',
      '</div>',
    ].join('');
    document.body.appendChild(win);

    document.getElementById('_mw_close').addEventListener('click', closeWindow);
    document.getElementById('_mw_send').addEventListener('click', handleSend);
    document.getElementById('_mw_input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    document.getElementById('_mw_input').addEventListener('input', function() {
      if (socket && socketReady) {
        socket.emit('typing', { isTyping: this.value.length > 0 });
      }
    });

    // Show greeting immediately
    appendMessage('assistant', GREETING);
  }

  // ── Window visibility ─────────────────────────────────────────────────────
  function toggleWindow() { isOpen ? closeWindow() : openWindow(); }

  function openWindow() {
    isOpen = true;
    document.getElementById('_mw_window').classList.add('open');
    document.getElementById('_mw_bubble').setAttribute('aria-expanded', 'true');
    document.getElementById('_mw_input').focus();
  }

  function closeWindow() {
    isOpen = false;
    document.getElementById('_mw_window').classList.remove('open');
    document.getElementById('_mw_bubble').setAttribute('aria-expanded', 'false');
  }

  // ── Message rendering ─────────────────────────────────────────────────────
  function appendMessage(role, text) {
    var msgs = document.getElementById('_mw_messages');
    var div = document.createElement('div');
    div.className = '_mw_msg ' + role;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function showTyping() {
    var msgs = document.getElementById('_mw_messages');
    var div = document.createElement('div');
    div.className = '_mw_typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function removeEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function setStatus(text) {
    var el = document.getElementById('_mw_status');
    if (el) el.textContent = text;
  }

  // ── Socket.IO transport ───────────────────────────────────────────────────

  function loadSocketIO(callback) {
    if (window.io) { callback(); return; }
    var script = document.createElement('script');
    // Load Socket.IO client from same origin as the API
    script.src = API_BASE + '/socket.io/socket.io.js';
    script.onload = callback;
    script.onerror = function() {
      // CDN fallback
      var cdn = document.createElement('script');
      cdn.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      cdn.onload = callback;
      cdn.onerror = function() { socketReady = false; };
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
  }

  function connectSocket() {
    loadSocketIO(function() {
      if (!window.io) return;

      socket = window.io(API_BASE + '/chat', {
        auth: { apiKey: API_KEY, sessionId: getSessionId() },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socket.on('connect', function() {
        socketReady = true;
        setStatus('');
      });

      socket.on('disconnect', function() {
        socketReady = false;
        setStatus('Reconnecting...');
      });

      socket.on('connect_error', function() {
        socketReady = false;
        setStatus('');
      });

      // Streaming token — append to the current bot message element
      socket.on('response_token', function(data) {
        if (!currentBotEl) {
          var msgs = document.getElementById('_mw_messages');
          currentBotEl = document.createElement('div');
          currentBotEl.className = '_mw_msg assistant';
          msgs.appendChild(currentBotEl);
        }
        currentBotEl.textContent += (data && data.token) || '';
        var msgs2 = document.getElementById('_mw_messages');
        if (msgs2) msgs2.scrollTop = msgs2.scrollHeight;
      });

      // Full response received — unlock input
      socket.on('response_complete', function() {
        currentBotEl = null;
        unlockInput();
      });

      // Server-sent typing indicator (other sessions / agent typing)
      socket.on('typing', function(data) {
        var indicator = document.getElementById('_mw_agent_typing');
        if (data && data.isTyping) {
          if (!indicator) {
            var msgs = document.getElementById('_mw_messages');
            var el = document.createElement('div');
            el.id = '_mw_agent_typing';
            el.className = '_mw_typing';
            el.innerHTML = '<span></span><span></span><span></span>';
            msgs.appendChild(el);
            msgs.scrollTop = msgs.scrollHeight;
          }
        } else {
          if (indicator && indicator.parentNode) indicator.parentNode.removeChild(indicator);
        }
      });

      socket.on('error', function(data) {
        appendMessage('assistant', (data && data.message) ? data.message : 'Sorry, something went wrong.');
        unlockInput();
      });
    });
  }

  // ── Send message ──────────────────────────────────────────────────────────

  function lockInput() {
    document.getElementById('_mw_send').disabled = true;
    document.getElementById('_mw_input').disabled = true;
  }

  function unlockInput() {
    document.getElementById('_mw_send').disabled = false;
    var input = document.getElementById('_mw_input');
    input.disabled = false;
    input.focus();
  }

  function handleSend() {
    var input = document.getElementById('_mw_input');
    var text  = (input.value || '').trim();
    if (!text) return;

    input.value = '';
    input.style.height = '';
    lockInput();

    appendMessage('user', text);

    if (socketReady && socket) {
      // Notify server we stopped typing
      socket.emit('typing', { isTyping: false });
      // Send via Socket.IO — streaming response via response_token events
      currentBotEl = null;
      socket.emit('message', { message: text });
    } else {
      // Fallback: HTTP POST /widget/:apiKey/message
      var typing = showTyping();

      fetch(API_BASE + '/widget/' + encodeURIComponent(API_KEY) + '/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), message: text }),
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        removeEl(typing);
        var reply = (data && data.data && data.data.reply) || 'Sorry, something went wrong.';
        appendMessage('assistant', reply);
      })
      .catch(function() {
        removeEl(typing);
        appendMessage('assistant', 'Sorry, I could not connect right now. Please try again later.');
      })
      .finally(function() {
        unlockInput();
      });
    }
  }

  // ── Auto-expand textarea ──────────────────────────────────────────────────
  function autoExpand() {
    var input = document.getElementById('_mw_input');
    if (!input) return;
    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }

  function bootstrap() {
    injectStyles();
    buildDOM();
    autoExpand();
    getSessionId(); // warm-up session id
    connectSocket(); // establish Socket.IO connection eagerly
  }

  init();
})();
`;
}
