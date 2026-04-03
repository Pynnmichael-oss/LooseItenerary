/* ============================================================
   LOOSE ITINERARY — claude.js
   Trip Planner chat panel, Memory Writer, PDF export
   ============================================================ */

'use strict';

const ANTHROPIC_KEY_STORE = 'li_anthropic_key';
const CLAUDE_MODEL        = 'claude-haiku-4-5-20251001';
const PLANNER_HISTORY_KEY = 'li_planner_history';

/* ── Shared Claude API call ─────────────────────────────────── */

async function callClaude(messages, systemPrompt) {
  const key = localStorage.getItem(ANTHROPIC_KEY_STORE);
  if (!key) throw new Error('NO_KEY');

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

/* ══════════════════════════════════════════════════════════════
   TRIP PLANNER CHAT PANEL
   ══════════════════════════════════════════════════════════════ */

const PLANNER_SYSTEM = `You are a friendly, knowledgeable travel planning assistant embedded in "Loose Itinerary" — a personal travel memoir app. Help users plan upcoming trips, suggest activities, recommend accommodations, give packing tips, discuss visa requirements, and answer any travel-related questions. Keep responses concise and practical. Use markdown sparingly — prefer plain prose. Do not use bullet lists unless the user asks for a list.`;

let plannerHistory = [];

function initPlannerPanel() {
  // Inject HTML if not already present
  if (document.getElementById('planner-panel')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'planner-backdrop';
  backdrop.className = 'planner-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('aside');
  panel.id = 'planner-panel';
  panel.className = 'planner-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Trip Planner');
  panel.innerHTML = `
    <div class="planner-header">
      <span class="planner-title">Trip Planner</span>
      <div class="planner-header-actions">
        <button class="planner-clear-btn" id="planner-clear-btn" title="Clear conversation">Clear</button>
        <button class="planner-close-btn" id="planner-close-btn" aria-label="Close planner">✕</button>
      </div>
    </div>
    <div class="planner-messages" id="planner-messages"></div>
    <div class="planner-input-bar">
      <textarea
        class="planner-input"
        id="planner-input"
        placeholder="Where are you headed next?"
        rows="1"
        aria-label="Message"
      ></textarea>
      <button class="planner-send-btn" id="planner-send-btn" aria-label="Send">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8 1l7 7-7 7M15 8H1"/>
        </svg>
      </button>
    </div>
  `;

  const fab = document.createElement('button');
  fab.id = 'planner-fab';
  fab.className = 'planner-fab';
  fab.setAttribute('aria-label', 'Open Trip Planner');
  fab.title = 'Trip Planner';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(fab);

  // Restore history
  try {
    plannerHistory = JSON.parse(localStorage.getItem(PLANNER_HISTORY_KEY) || '[]');
  } catch { plannerHistory = []; }
  plannerHistory.forEach(msg => appendPlannerMessage(msg.role, msg.content, false));

  if (plannerHistory.length === 0) {
    showPlannerWelcome();
  }

  // Wire events
  fab.addEventListener('click', openPlanner);
  backdrop.addEventListener('click', closePlanner);
  document.getElementById('planner-close-btn').addEventListener('click', closePlanner);
  document.getElementById('planner-clear-btn').addEventListener('click', clearPlanner);
  document.getElementById('planner-send-btn').addEventListener('click', sendPlannerMessage);

  const input = document.getElementById('planner-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPlannerMessage();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}

function openPlanner() {
  document.getElementById('planner-panel').classList.add('open');
  document.getElementById('planner-backdrop').classList.add('open');
  document.getElementById('planner-fab').classList.add('open');
  document.getElementById('planner-input')?.focus();
}

function closePlanner() {
  document.getElementById('planner-panel').classList.remove('open');
  document.getElementById('planner-backdrop').classList.remove('open');
  document.getElementById('planner-fab').classList.remove('open');
}

function clearPlanner() {
  plannerHistory = [];
  localStorage.removeItem(PLANNER_HISTORY_KEY);
  const feed = document.getElementById('planner-messages');
  if (feed) { feed.innerHTML = ''; showPlannerWelcome(); }
}

function showPlannerWelcome() {
  appendPlannerMessage('claude',
    'Where to next? Ask me anything — destinations, visas, packing, itinerary ideas.',
    false);
}

function savePlannerHistory() {
  // Keep last 40 messages to avoid localStorage bloat
  if (plannerHistory.length > 40) plannerHistory = plannerHistory.slice(-40);
  localStorage.setItem(PLANNER_HISTORY_KEY, JSON.stringify(plannerHistory));
}

function appendPlannerMessage(role, content, scroll = true) {
  const feed = document.getElementById('planner-messages');
  if (!feed) return;

  const wrapper = document.createElement('div');
  wrapper.className = `planner-message planner-message-${role === 'user' ? 'user' : 'claude'}`;

  const bubble = document.createElement('div');
  bubble.className = 'planner-bubble';
  bubble.textContent = content;
  wrapper.appendChild(bubble);
  feed.appendChild(wrapper);

  if (scroll) feed.scrollTop = feed.scrollHeight;
  return wrapper;
}

function showPlannerLoading() {
  const feed = document.getElementById('planner-messages');
  if (!feed) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'planner-message planner-message-claude';
  wrapper.id = 'planner-loading-msg';
  wrapper.innerHTML = `
    <div class="planner-loading-bubble">
      <div class="planner-dot"></div>
      <div class="planner-dot"></div>
      <div class="planner-dot"></div>
    </div>
  `;
  feed.appendChild(wrapper);
  feed.scrollTop = feed.scrollHeight;
  return wrapper;
}

async function sendPlannerMessage() {
  const input   = document.getElementById('planner-input');
  const sendBtn = document.getElementById('planner-send-btn');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Check API key
  if (!localStorage.getItem(ANTHROPIC_KEY_STORE)) {
    appendPlannerMessage('claude', 'Add your Anthropic API key in Settings to use the Trip Planner.');
    return;
  }

  // Append user message
  input.value = '';
  input.style.height = 'auto';
  plannerHistory.push({ role: 'user', content: text });
  appendPlannerMessage('user', text);

  sendBtn.disabled = true;
  const loadingEl = showPlannerLoading();

  try {
    const reply = await callClaude(
      plannerHistory.map(m => ({ role: m.role, content: m.content })),
      PLANNER_SYSTEM
    );
    loadingEl?.remove();
    plannerHistory.push({ role: 'assistant', content: reply });
    savePlannerHistory();
    appendPlannerMessage('claude', reply);
  } catch (err) {
    loadingEl?.remove();
    const notice = err.message === 'NO_KEY'
      ? 'Add your Anthropic API key in Settings to chat.'
      : `Something went wrong: ${err.message}`;
    appendPlannerMessage('claude', notice);
  } finally {
    sendBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   MEMORY WRITER
   ══════════════════════════════════════════════════════════════ */

function initMemoryWriter() {
  // Add "Write memory" buttons to each day item
  document.querySelectorAll('.day-item').forEach((item, i) => {
    if (item.querySelector('.memory-write-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'memory-write-btn';
    btn.dataset.dayIndex = i;
    btn.innerHTML = `<span>✦</span> Write memory`;
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'Write a travel memory for this day');

    const content = item.querySelector('.day-content');
    if (content) content.appendChild(btn);

    btn.addEventListener('click', () => toggleMemoryWriter(btn, item, i));
  });
}

function toggleMemoryWriter(btn, dayItem, dayIndex) {
  // Close any existing writer
  const existing = dayItem.querySelector('.memory-writer-panel');
  if (existing) {
    existing.remove();
    return;
  }

  // Build inline writer panel
  const panel = document.createElement('div');
  panel.className = 'memory-writer-panel';
  panel.innerHTML = `
    <label class="memory-writer-label">Raw notes — what happened?</label>
    <textarea
      class="memory-writer-textarea"
      placeholder="We woke up early and drove to the trailhead. The fog was still low over the valley..."
      rows="4"
    ></textarea>
    <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
      <button class="btn btn-primary btn-sm memory-generate-btn" type="button">Write it</button>
      <button class="btn btn-ghost btn-sm memory-cancel-btn" type="button">Cancel</button>
    </div>
    <div class="memory-result-area" style="display:none;"></div>
  `;

  dayItem.appendChild(panel);
  panel.querySelector('textarea').focus();

  panel.querySelector('.memory-cancel-btn').addEventListener('click', () => panel.remove());
  panel.querySelector('.memory-generate-btn').addEventListener('click', () => runMemoryWriter(panel, dayItem, dayIndex));
}

async function runMemoryWriter(panel, dayItem, dayIndex) {
  const textarea  = panel.querySelector('.memory-writer-textarea');
  const resultArea = panel.querySelector('.memory-result-area');
  const generateBtn = panel.querySelector('.memory-generate-btn');
  const notes = textarea.value.trim();

  if (!notes) { textarea.focus(); return; }

  if (!localStorage.getItem(ANTHROPIC_KEY_STORE)) {
    resultArea.style.display = 'block';
    resultArea.innerHTML = `<p class="planner-notice">Add your Anthropic API key in Settings to use Memory Writer.</p>`;
    return;
  }

  // Get day context
  const titleEl   = dayItem.querySelector('[data-editable="day-title"]');
  const summaryEl = dayItem.querySelector('[data-editable="day-summary"]');
  const dayTitle  = titleEl?.textContent?.trim() || '';
  const daySummary = summaryEl?.textContent?.trim() || '';

  const systemPrompt = `You are a lyrical travel memoir writer. Given raw notes from a day of travel, write a single polished paragraph (2–4 sentences) in first-person, past tense. Capture the mood, sensory details, and emotion. Avoid clichés. Write with the voice of a thoughtful traveller — vivid but not overwrought. Return only the paragraph, nothing else.`;

  const userMsg = [
    dayTitle    ? `Day title: ${dayTitle}`   : '',
    daySummary  ? `Day context: ${daySummary}` : '',
    `Notes: ${notes}`
  ].filter(Boolean).join('\n');

  generateBtn.disabled = true;
  resultArea.style.display = 'block';
  resultArea.innerHTML = `
    <div class="memory-loading">
      <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
      <span>Writing your memory…</span>
    </div>
  `;

  try {
    const memoir = await callClaude(
      [{ role: 'user', content: userMsg }],
      systemPrompt
    );

    resultArea.innerHTML = `
      <div class="memory-result-box">${memoir}</div>
      <div class="memory-result-actions">
        <button class="btn btn-primary btn-sm memory-save-btn" type="button">Save to day summary</button>
        <button class="btn btn-ghost btn-sm memory-retry-btn" type="button">Try again</button>
        <button class="btn btn-ghost btn-sm memory-discard-btn" type="button">Discard</button>
      </div>
    `;

    resultArea.querySelector('.memory-save-btn').addEventListener('click', () => {
      if (summaryEl) {
        summaryEl.textContent = memoir;
        summaryEl.dispatchEvent(new Event('blur'));
      }
      panel.remove();
    });

    resultArea.querySelector('.memory-retry-btn').addEventListener('click', () => {
      resultArea.style.display = 'none';
      generateBtn.disabled = false;
    });

    resultArea.querySelector('.memory-discard-btn').addEventListener('click', () => panel.remove());

  } catch (err) {
    resultArea.innerHTML = `<p class="planner-notice">Error: ${err.message}</p>`;
  } finally {
    generateBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   PDF EXPORT
   ══════════════════════════════════════════════════════════════ */

function initPdfExport() {
  const hero = document.querySelector('.trip-hero');
  if (!hero || document.getElementById('pdf-export-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pdf-export-btn';
  btn.className = 'pdf-export-btn';
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-label', 'Export trip as PDF');
  btn.innerHTML = `
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 1v10M4 7l4 4 4-4M2 13h12"/>
    </svg>
    Export PDF
  `;
  hero.appendChild(btn);
  btn.addEventListener('click', exportPdf);
}

async function exportPdf() {
  // Use browser print with a print-friendly stylesheet
  const overlay = document.createElement('div');
  overlay.className = 'pdf-overlay show';
  overlay.innerHTML = `<span class="pdf-overlay-text">Preparing your memoir…</span>`;
  document.body.appendChild(overlay);

  // Small delay so overlay renders, then open print
  await new Promise(r => setTimeout(r, 400));
  overlay.remove();
  window.print();
}

/* ══════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Trip Planner is available on any page
  initPlannerPanel();

  // Memory Writer & PDF export only on trip detail page
  if (document.body.classList.contains('trip-page')) {
    // Wait for trip content to render (it's async)
    const observer = new MutationObserver(() => {
      if (document.querySelector('.day-item')) {
        initMemoryWriter();
        initPdfExport();
        observer.disconnect();
      }
    });
    observer.observe(document.getElementById('trip-content') || document.body, {
      childList: true, subtree: true
    });
  }
});
