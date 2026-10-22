const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const question = document.getElementById('question');
const trace = document.getElementById('trace');
const sourceUsed = document.getElementById('sourceUsed');
const HISTORY_KEY = 'rag-chat-history-v1';
const MAX_HISTORY = 12;
const WELCOME_HTML = chat.innerHTML;

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

async function askAgent(q) {
  addMessage('user', q);
  question.value = '';
    resizeQuestion();
  renderTrace(['Running LangGraph workflow...']);
  sourceUsed.textContent = 'Running';
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const history = conversation.slice(0, -1).map(({role, content}) => ({role, content}));
    const res = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question: q, history})});
    const responseText = await res.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      const detail = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      const hint = res.status >= 500 ? ' Check the FastAPI terminal for the traceback.' : '';
      throw new Error(`Server returned a non-JSON response (HTTP ${res.status}). ${detail}${hint}`);
    }
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    addMessage('assistant', data.answer, data.source_used, data.citations || []);
    renderTrace(data.trace || []);
    sourceUsed.textContent = data.source_used;
  } catch (e) {
    addMessage('assistant', `Error: ${e.message}`);
    renderTrace(['Request failed']);
    sourceUsed.textContent = 'Error';
  } finally {
    btn.disabled = false;
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
  const status = document.getElementById('uploadStatus');
  if (!file) { status.textContent = 'Choose a file first.'; return; }
  status.textContent = 'Indexing document...';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/ingest', {method: 'POST', headers: {'X-Admin-Key': key}, body: fd});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Upload failed');
    status.textContent = `Indexed ${d.file}: ${d.chunks} chunks.`;
  } catch (e) { status.textContent = `Error: ${e.message}`; }
};
