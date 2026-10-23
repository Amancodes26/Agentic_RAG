const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const question = document.getElementById('question');
const trace = document.getElementById('trace');
const sourceUsed = document.getElementById('sourceUsed');
const HISTORY_KEY = 'rag-chat-history-v1';
const MAX_HISTORY = 12;
const WELCOME_HTML = chat.innerHTML;
const USER_KEY = 'rag-demo-username-v1';
const workspaceName = document.getElementById('workspaceName');
const workspaceStatus = document.getElementById('workspaceStatus');
const searchCommon = document.getElementById('searchCommon');
const workspaceModal = document.getElementById('workspaceModal');
let activeUsername = localStorage.getItem(USER_KEY) || '';
if (!activeUsername) workspaceModal.classList.remove('hidden');

document.getElementById('workspaceBtn').addEventListener('click', async () => {
  const username = workspaceName.value.trim();
  if (username.length < 2) { workspaceStatus.textContent = 'Enter at least 2 characters.'; return; }
  const button = document.getElementById('workspaceBtn');
  button.disabled = true;
  button.textContent = 'Opening…';
  workspaceStatus.textContent = 'Opening your workspace…';
  try {
    const res = await fetch('/api/workspace', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username})});
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not open workspace');
    const previousUsername = activeUsername;
    activeUsername = data.username;
    localStorage.setItem(USER_KEY, activeUsername);
    if (previousUsername && previousUsername.toLowerCase() !== activeUsername.toLowerCase()) {
      conversation = [];
      sessionStorage.removeItem(HISTORY_KEY);
      chat.innerHTML = WELCOME_HTML;
      renderTrace([]);
      sourceUsed.textContent = '—';
    }
    workspaceModal.classList.add('hidden');
    workspaceStatus.textContent = data.returning ? `Welcome back, ${activeUsername}.` : `Workspace ready for ${activeUsername}.`;
  } catch (e) {
    workspaceStatus.textContent = `Error: ${e.message}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Continue';
  }
});

document.getElementById('changeWorkspace').addEventListener('click', () => {
  workspaceName.value = activeUsername;
  workspaceStatus.textContent = '';
  workspaceModal.classList.remove('hidden');
  workspaceName.focus();
});
workspaceName.addEventListener('keydown', event => {
  if (event.key === 'Enter') document.getElementById('workspaceBtn').click();
});

function loadHistory() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(item => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

let conversation = loadHistory();

function resizeQuestion() {
  question.style.height = 'auto';
  question.style.height = `${Math.min(question.scrollHeight, 160)}px`;
}

function escapeHtml(s='') {
  return s.replace(/[&<>']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;'}[c])).replace(/\"/g, '&quot;');
}

function renderInlineMarkdown(text='') {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isTableSeparator(line) {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdownTable(headerLine, bodyLines) {
  const headers = parseTableRow(headerLine);
  const rows = bodyLines.map(parseTableRow);
  const head = `<thead><tr>${headers.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map(row => `<tr>${headers.map((_, i) => `<td>${renderInlineMarkdown(row[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="table-scroll"><table>${head}${body}</table></div>`;
}

function formatMarkdown(text='') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = '';

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push(`<${listType}>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${listType}>`);
      listItems = [];
      listType = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const codeFence = trimmed.match(/^```\s*([\w+-]*)\s*$/);
    if (codeFence) {
      flushParagraph();
      flushList();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      const languageClass = codeFence[1] ? ` class="language-${escapeHtml(codeFence[1])}"` : '';
      blocks.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();
      i += 2;
      const tableRows = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      blocks.push(renderMarkdownTable(line, tableRows));
      i--;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    const orderedItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const bulletItem = trimmed.match(/^[-+*]\s+(.+)$/);
    const quote = trimmed.match(/^>\s?(.*)$/);

    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 4);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
    } else if (orderedItem || bulletItem) {
      flushParagraph();
      const nextType = orderedItem ? 'ol' : 'ul';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((orderedItem || bulletItem)[1]);
    } else if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks.join('');
}

function addMessage(role, text, source='', citations=[], save=true) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const citeHtml = citations.length ? `<div class="citations"><strong>Sources</strong><br>${citations.map(c => c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>` : escapeHtml(c.title)).join('<br>')}</div>` : '';
  const body = role === 'assistant' ? formatMarkdown(text) : escapeHtml(text).replace(/\n/g, '<br>');
  wrap.innerHTML = `<div class="avatar">AI</div><div class="bubble">${body}${source ? `<div class="answer-source">Source: ${escapeHtml(source)}</div>` : ''}${citeHtml}</div>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  if (save) {
    conversation.push({role, content: text, source, citations});
    conversation = conversation.slice(-MAX_HISTORY);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(conversation));
  }
}

function renderSavedConversation() {
  if (!conversation.length) return;
  chat.innerHTML = '';
  for (const item of conversation) addMessage(item.role, item.content, item.source || '', item.citations || [], false);
}

function renderTrace(items=[]) {
  trace.innerHTML = items.length ? items.map(x => `<div class="trace-item">${escapeHtml(x)}</div>`).join('') : '<div class="empty">No trace.</div>';
}

function readableApiError(data, status) {
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    return detail.map(item => {
      const field = Array.isArray(item.loc) ? item.loc.filter(part => part !== 'body').join('.') : '';
      return `${field ? `${field}: ` : ''}${item.msg || 'Invalid value'}`;
    }).join(' · ') || `Request rejected (HTTP ${status})`;
  }
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail);
  return `Request failed (HTTP ${status})`;
}

function createStreamingMessage() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.innerHTML = '<div class="avatar">AI</div><div class="bubble"><div class="stream-body">Thinking…</div></div>';
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return {wrap, bubble: wrap.querySelector('.bubble'), body: wrap.querySelector('.stream-body')};
}

function finishStreamingMessage(view, text, source, citations) {
  view.body.innerHTML = formatMarkdown(text);
  const sourceEl = document.createElement('div');
  sourceEl.className = 'answer-source';
  sourceEl.textContent = `Source: ${source || 'unknown'}`;
  view.bubble.appendChild(sourceEl);
  if (citations.length) {
    const cites = document.createElement('div');
    cites.className = 'citations';
    cites.innerHTML = `<strong>Sources</strong><br>${citations.map(c => c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>` : escapeHtml(c.title)).join('<br>')}`;
    view.bubble.appendChild(cites);
  }
  conversation.push({role: 'assistant', content: text, source, citations});
  conversation = conversation.slice(-MAX_HISTORY);
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(conversation));
}

async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = block => {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (data) onEvent(JSON.parse(data));
  };
  while (true) {
    const {value, done} = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), {stream: !done}).replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      dispatch(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) dispatch(buffer);
}

async function askAgent(q) {
  if (!activeUsername) {
    workspaceModal.classList.remove('hidden');
    workspaceName.focus();
    return;
  }
  addMessage('user', q);
  question.value = '';
  resizeQuestion();
  renderTrace([searchCommon.checked ? 'Searching your workspace and shared knowledge…' : 'Searching your workspace…', 'Preparing a grounded answer…']);
  sourceUsed.textContent = 'Running';
  const btn = form.querySelector('button');
  const previousButtonText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Working…';
  let streamView = null;
  let streamedText = '';
  let streamFinished = false;
  try {
    const history = conversation.slice(0, -1)
      .filter(item => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
      .slice(-MAX_HISTORY)
      .map(({role, content}) => ({role, content: content.slice(-3000)}));
    const res = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'text/event-stream'}, body: JSON.stringify({question: q, history, username: activeUsername, search_common: searchCommon.checked})});
    if (!res.ok) {
      const responseText = await res.text();
      let data = {};
      try { data = responseText ? JSON.parse(responseText) : {}; } catch { data.detail = responseText; }
      throw new Error(readableApiError(data, res.status));
    }
    if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await res.json();
      const answer = data.answer || 'I could not generate an answer. Try asking about a specific detail.';
      addMessage('assistant', answer, data.source_used, data.citations || []);
      renderTrace(data.trace || []);
      sourceUsed.textContent = data.source_used;
      return;
    }
    streamView = createStreamingMessage();
    await readSse(res, event => {
      if (event.type === 'token') {
        streamedText += event.content || '';
        streamView.body.innerHTML = formatMarkdown(streamedText);
        chat.scrollTop = chat.scrollHeight;
      } else if (event.type === 'done') {
        const answer = streamedText.trim() ? streamedText : (event.answer || 'I could not generate an answer. Try asking about a specific detail.');
        finishStreamingMessage(streamView, answer, event.source_used, event.citations || []);
        renderTrace(event.trace || []);
        sourceUsed.textContent = event.source_used;
        streamFinished = true;
      } else if (event.type === 'error') {
        throw new Error(event.message || 'Streaming response failed');
      }
    });
    if (!streamFinished) throw new Error('The response stream ended before completion.');
  } catch (e) {
    if (streamView && !streamFinished) streamView.body.textContent = `Error: ${e.message}`;
    else if (!streamView) addMessage('assistant', `Error: ${e.message}`);
    renderTrace(['Request failed']);
    sourceUsed.textContent = 'Error';
  } finally {
    btn.disabled = false;
    btn.textContent = previousButtonText;
  }
}

renderSavedConversation();
form.addEventListener('submit', e => { e.preventDefault(); const q = question.value.trim(); if (q) askAgent(q); });
question.addEventListener('input', resizeQuestion);
question.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (question.value.trim() && !submitButton?.disabled) form.requestSubmit();
  }
});
resizeQuestion();
document.querySelectorAll('.example').forEach(b => b.addEventListener('click', () => askAgent(b.textContent.trim())));
document.getElementById('newChat').addEventListener('click', () => {
  conversation = [];
  sessionStorage.removeItem(HISTORY_KEY);
  chat.innerHTML = WELCOME_HTML;
  renderTrace([]);
  sourceUsed.textContent = '—';
  question.focus();
});

const modal = document.getElementById('uploadModal');
document.getElementById('openUpload').onclick = () => modal.classList.remove('hidden');
document.getElementById('closeUpload').onclick = () => modal.classList.add('hidden');
document.getElementById('uploadBtn').onclick = async () => {
  const file = document.getElementById('fileInput').files[0];
  const key = document.getElementById('adminKey').value;
  const scope = document.getElementById('uploadScope').value;
  const status = document.getElementById('uploadStatus');
  if (!activeUsername) { status.textContent = 'Open a workspace using your name first.'; return; }
  if (!file) { status.textContent = 'Choose a file first.'; return; }
  status.textContent = 'Indexing document...';
  const uploadButton = document.getElementById('uploadBtn');
  uploadButton.disabled = true;
  uploadButton.textContent = 'Uploading and indexing…';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const params = new URLSearchParams({username: activeUsername, scope});
    const headers = scope === 'common' ? {'X-Admin-Key': key} : {};
    const r = await fetch(`/api/ingest?${params}`, {method: 'POST', headers, body: fd});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Upload failed');
    status.textContent = `Indexed ${d.file}: ${d.chunks} chunks.`;
    document.getElementById('fileInput').value = '';
    setTimeout(() => modal.classList.add('hidden'), 650);
  } catch (e) { status.textContent = `Error: ${e.message}`; }
  finally {
    uploadButton.disabled = false;
    uploadButton.textContent = 'Index Document';
  }
};
