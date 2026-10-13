/* =========================================================
   IronPeak chatbot widget — talks to POST /api/chat
   ========================================================= */

const STORE_KEY = "ironpeak-chat-v1";
const MAX_SENT = 10; // messages of history sent per request (server trims too)
const GREETING = "Hi! I'm **Peak**, IronPeak's virtual assistant 👋\n\nAsk me anything about our **membership plans**, prices, free trial, classes, coaches or opening hours.";
const SUGGESTIONS = [
  "What membership plans do you have?",
  "Is there a free trial?",
  "Which plan includes personal training?",
  "What classes are on Saturday?",
  "What are your opening hours?",
];

const PEAK_PATH = "M8 52 L26 18 L36 36 L42 26 L56 52 Z";
const ICON = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  reset: '<path d="M4 4v6h6"/><path d="M20 12a8 8 0 0 0-14.9-4L4 10M4 20v-6h6"/><path d="M4 12a8 8 0 0 0 14.9 4l1.1-2"/>',
};

const svg = (inner, viewBox = "0 0 24 24", cls = "") => `<svg viewBox="${viewBox}" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${inner}</svg>`;
const peak = () => svg(`<path d="${PEAK_PATH}"/>`, "0 0 64 64");

/* ---------- Safe mini-markdown (escape first, then format) ---------- */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/\b([\w.+-]+@[\w-]+\.[\w.]+)\b/g, '<a href="mailto:$1">$1</a>')
    .replace(/\((\d{3})\) (\d{3})-(\d{4})/g, '<a href="tel:+1$1$2$3">($1) $2-$3</a>');
}
function renderMarkdown(text) {
  const lines = escapeHtml(text.trim()).split(/\r?\n/);
  let html = "", list = null, para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (list !== type) { flushList(); html += `<${type}>`; list = type; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else if (!line) {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushPara(); flushList();
  return html;
}

/* ---------- Storage (per tab; optional) ---------- */
function loadHistory() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function saveHistory(history) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-40))); } catch { /* ignore */ }
}

/* ---------- Widget ---------- */
function createWidget() {
  const root = document.createElement("div");
  root.className = "chatbot";
  root.innerHTML = `
    <div class="chatbot__teaser" id="cbTeaser">Questions about plans or prices? Ask Peak! 💬</div>
    <section class="chatbot__panel" id="cbPanel" role="dialog" aria-modal="false" aria-labelledby="cbTitle">
      <header class="chatbot__head">
        <div class="chatbot__avatar">${peak()}</div>
        <div class="chatbot__title"><strong id="cbTitle">Peak · IronPeak Assistant</strong><span id="cbStatus">Online · replies in seconds</span></div>
        <button class="chatbot__icon-btn" id="cbReset" type="button" aria-label="Start a new chat" title="New chat">${svg(ICON.reset)}</button>
        <button class="chatbot__icon-btn" id="cbClose" type="button" aria-label="Close chat" title="Close">${svg(ICON.close)}</button>
      </header>
      <div class="chatbot__log" id="cbLog" aria-live="polite"></div>
      <div class="chatbot__chips" id="cbChips"></div>
      <form class="chatbot__form" id="cbForm" autocomplete="off">
        <textarea id="cbInput" rows="1" maxlength="1000" placeholder="Ask about plans, prices, classes…" aria-label="Type your question"></textarea>
        <button class="chatbot__send" id="cbSend" type="submit" aria-label="Send" disabled>${svg(ICON.send)}</button>
      </form>
      <div class="chatbot__foot">AI assistant · answers come from IronPeak's gym guide</div>
    </section>
    <button class="chatbot__launcher" id="cbLauncher" type="button" aria-label="Open chat with IronPeak assistant" aria-expanded="false" aria-controls="cbPanel">
      ${svg(ICON.chat, "0 0 24 24", "icon-chat")}
      ${svg(ICON.close, "0 0 24 24", "icon-close")}
      <span class="chatbot__badge" aria-hidden="true"></span>
    </button>`;
  document.body.append(root);
  return root;
}

function initChatbot() {
  const root = createWidget();
  const $ = (id) => root.querySelector(`#${id}`);
  const launcher = $("cbLauncher"), panel = $("cbPanel"), log = $("cbLog"), chips = $("cbChips");
  const form = $("cbForm"), input = $("cbInput"), sendBtn = $("cbSend"), teaser = $("cbTeaser");

  let history = loadHistory();     // [{role: "user"|"assistant", content}]
  let busy = false;
  let enabled = true;

  /* ----- rendering ----- */
  function addBubble(role, text, { error = false, animate = true } = {}) {
    const row = document.createElement("div");
    row.className = `cb-msg cb-msg--${role === "user" ? "user" : "bot"}${error ? " cb-msg--error" : ""}`;
    if (!animate) row.style.animation = "none";
    const bubble = document.createElement("div");
    bubble.className = "cb-msg__bubble";
    if (role === "user") bubble.textContent = text;
    else bubble.innerHTML = renderMarkdown(text);
    if (role !== "user") {
      const dot = document.createElement("span");
      dot.className = "cb-msg__dot";
      dot.innerHTML = peak();
      row.append(dot);
    }
    row.append(bubble);
    log.append(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "cb-msg cb-msg--bot";
    row.innerHTML = `<span class="cb-msg__dot">${peak()}</span><div class="cb-msg__bubble cb-typing" aria-label="Peak is typing"><i></i><i></i><i></i></div>`;
    log.append(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  function renderChips() {
    chips.replaceChildren();
    if (history.some((m) => m.role === "user") || !enabled) return;
    SUGGESTIONS.forEach((q) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = q;
      b.addEventListener("click", () => send(q));
      chips.append(b);
    });
  }

  function renderAll() {
    log.replaceChildren();
    addBubble("assistant", GREETING, { animate: false });
    history.forEach((m) => addBubble(m.role, m.content, { animate: false }));
    if (!enabled) {
      addBubble("assistant", "The chat assistant is offline right now. Please call us on (303) 555-0142, email hello@ironpeakfitness.com or use the contact form on this page.", { error: true, animate: false });
    }
    renderChips();
  }

  /* ----- sending ----- */
  async function send(text) {
    text = text.trim();
    if (!text || busy || !enabled) return;
    busy = true;
    input.value = "";
    autoGrow();
    updateSend();
    chips.replaceChildren();

    history.push({ role: "user", content: text });
    saveHistory(history);
    addBubble("user", text);
    const typing = showTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_SENT) }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (res.ok && data.ok) {
        history.push({ role: "assistant", content: data.reply });
        saveHistory(history);
        addBubble("assistant", data.reply);
      } else {
        // Keep the failed question out of the history so it isn't resent as context.
        history.pop();
        saveHistory(history);
        addBubble("assistant", data.error || "Sorry, something went wrong. Please try again.", { error: true });
      }
    } catch {
      typing.remove();
      history.pop();
      saveHistory(history);
      addBubble("assistant", "I can't reach the server right now. Please check your connection and try again.", { error: true });
    } finally {
      busy = false;
      updateSend();
      if (root.classList.contains("is-open")) input.focus();
    }
  }

  /* ----- composer ----- */
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  }
  function updateSend() { sendBtn.disabled = busy || !enabled || !input.value.trim(); }
  input.addEventListener("input", () => { autoGrow(); updateSend(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

  /* ----- open / close ----- */
  function setOpen(open) {
    root.classList.toggle("is-open", open);
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Close chat" : "Open chat with IronPeak assistant");
    if (open) {
      root.classList.add("was-opened");
      teaser.classList.remove("is-visible");
      try { sessionStorage.setItem(`${STORE_KEY}-seen`, "1"); } catch { /* ignore */ }
      setTimeout(() => { log.scrollTop = log.scrollHeight; if (window.matchMedia("(pointer: fine)").matches) input.focus(); }, 300);
    }
  }
  launcher.addEventListener("click", () => setOpen(!root.classList.contains("is-open")));
  $("cbClose").addEventListener("click", () => { setOpen(false); launcher.focus(); });
  teaser.addEventListener("click", () => setOpen(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("is-open")) { setOpen(false); launcher.focus(); }
  });
  $("cbReset").addEventListener("click", () => {
    if (busy) return;
    history = [];
    saveHistory(history);
    renderAll();
    input.focus();
  });

  // Friendly nudge a few seconds after the page loads (once per visit).
  let seen = false;
  try { seen = sessionStorage.getItem(`${STORE_KEY}-seen`) === "1"; } catch { /* ignore */ }
  if (seen) root.classList.add("was-opened");
  else {
    setTimeout(() => { if (!root.classList.contains("is-open")) teaser.classList.add("is-visible"); }, 6000);
    setTimeout(() => teaser.classList.remove("is-visible"), 16000);
  }

  // Ask the server whether the assistant has an API key configured.
  fetch("/api/chat/status")
    .then((r) => r.json())
    .then((s) => { enabled = !!s.enabled; })
    .catch(() => { enabled = false; })
    .finally(() => {
      root.classList.toggle("is-offline", !enabled);
      $("cbStatus").textContent = enabled ? "Online · replies in seconds" : "Offline";
      input.disabled = !enabled;
      if (!enabled) input.placeholder = "Chat is offline";
      renderAll();
      updateSend();
    });
  renderAll();
}

initChatbot();
