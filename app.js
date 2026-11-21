const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const STORE_KEY = 'rich-builder-v3-draft', OLD_KEY = 'rich-builder-v2-draft', HIST_KEY = 'rich-builder-v3-history';
let blocks = [], targetType = 'group', verified = false, botInfo = null, targetInfo = null;
let accessKey = sessionStorage.getItem('rb-key') || '';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

async function api(body) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessKey) headers['x-access-key'] = accessKey;
  const r = await fetch('/api/telegram', { method: 'POST', headers, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && j.code === 'locked') {
    const k = prompt('Dashboard ini dilindungi. Masukkan access key:');
    if (!k) throw Error('Access key diperlukan.');
    accessKey = k.trim();
    sessionStorage.setItem('rb-key', accessKey);
    return api(body);
  }
  if (!r.ok || !j.ok) throw Error(j.description || j.error || `Permintaan gagal (${r.status})`);
  return j.result;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ blocks, targetType, target: $('#target').value, silent: $('#silent').checked, protect: $('#protect').checked }));
  } catch {}
}

function restore() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_KEY) || '{}'); } catch {}
  if (Array.isArray(d.blocks)) blocks = d.blocks.map(b => ({ ...b, id: b.id || uid() }));
  if (d.targetType) targetType = d.targetType;
  if (d.target) $('#target').value = d.target;
  $('#silent').checked = !!d.silent;
  $('#protect').checked = !!d.protect;
  $$('[data-type]').forEach(x => x.classList.toggle('selected', x.dataset.type === targetType));
}

function go(page) {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  $$('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const p = $(`#page-${page}`);
  if (p) {
    $('#pageTitle').textContent = p.dataset.title;
    $('#pageDesc').textContent = p.dataset.desc;
    history.replaceState(null, '', `#${page}`);
  }
}

function addBlock(type) {
  const b = { id: uid(), type };
  if (type === 'table') b.rows = [['Fitur', 'Detail'], ['Rich text', 'Telegram']];
  if (type === 'buttons') b.buttons = [{ text: 'Buka website', url: 'https://example.com', style: 'primary' }];
  if (type === 'details') b.summary = 'Informasi tambahan';
  if (type === 'list') b.text = 'Poin pertama\nPoin kedua\nPoin ketiga';
  blocks.push(b);
  render(); save();
}

function duplicateBlock(id) {
  const i = blocks.findIndex(x => x.id === id);
  if (i < 0) return;
  const copy = JSON.parse(JSON.stringify(blocks[i]));
  copy.id = uid();
  blocks.splice(i + 1, 0, copy);
  render(); save();
}

function blockEditor(b, i) {
  const input = (key, ph, val = b[key] || '') => `<input data-key="${key}" placeholder="${ph}" value="${esc(val)}">`;
  let body = '';
  switch (b.type) {
    case 'heading': body = input('text', 'Judul pesan'); break;
    case 'paragraph': body = `<textarea data-key="text" placeholder="Tulis isi pesan...">${esc(b.text || '')}</textarea><div class="block-row"><label><input class="check" type="checkbox" data-key="bold" ${b.bold ? 'checked' : ''}> Tebal</label><label><input class="check" type="checkbox" data-key="italic" ${b.italic ? 'checked' : ''}> Miring</label></div>`; break;
    case 'list': body = `<label>Satu poin per baris</label><textarea data-key="text" placeholder="Poin pertama&#10;Poin kedua">${esc(b.text || '')}</textarea><select data-key="listStyle"><option value="bullet" ${b.listStyle !== 'number' ? 'selected' : ''}>Bullet</option><option value="number" ${b.listStyle === 'number' ? 'selected' : ''}>Nomor</option></select>`; break;
    case 'quote': body = `<textarea data-key="text" placeholder="Isi kutipan...">${esc(b.text || '')}</textarea>${input('caption', 'Sumber (opsional)')}`; break;
    case 'table': body = `<label>Pisahkan kolom dengan tanda |</label><textarea data-key="tableText">${esc((b.rows || []).map(r => r.join(' | ')).join('\n'))}</textarea><div class="block-row"><label><input class="check" type="checkbox" data-key="bordered" ${b.bordered === false ? '' : 'checked'}> Border</label><label><input class="check" type="checkbox" data-key="striped" ${b.striped ? 'checked' : ''}> Striped</label></div>`; break;
    case 'buttons': body = (b.buttons || []).map((x, n) => `<div class="block-card"><div class="block-row"><input data-btn="${n}" data-field="text" placeholder="Label tombol" value="${esc(x.text)}"><input data-btn="${n}" data-field="url" placeholder="https://..." value="${esc(x.url || '')}"></div><div class="block-row"><select data-btn="${n}" data-field="style">${['primary', 'success', 'danger', 'link'].map(s => `<option value="${s}" ${x.style === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select><button class="btn soft small" data-remove-btn="${n}">Hapus</button></div></div>`).join('') + `<button class="btn soft small" data-add-btn>＋ Tambah tombol</button><small>Gunakan URL HTTPS. Maksimal 8 tombol.</small>`; break;
    case 'photo': case 'video': case 'animation': body = input('url', 'URL media publik (HTTPS)') + input('caption', 'Caption'); break;
    case 'map': body = `<div class="block-row">${input('latitude', 'Latitude')}${input('longitude', 'Longitude')}</div>${input('title', 'Nama lokasi (opsional)')}`; break;
    case 'details': body = input('summary', 'Judul detail') + `<textarea data-key="text" placeholder="Isi detail">${esc(b.text || '')}</textarea>`; break;
    case 'divider': body = '<small>Garis pemisah antar bagian pesan.</small>'; break;
  }
  return `<div class="block-card" data-id="${b.id}"><div class="block-head"><span>${i + 1}. ${b.type}</span><div><button data-up="${b.id}" title="Naik">↑</button> <button data-down="${b.id}" title="Turun">↓</button> <button data-dup="${b.id}" title="Duplikat">⧉</button> <button data-delete="${b.id}" title="Hapus">✕</button></div></div>${body}</div>`;
}

function render() {
  $('#blocks').innerHTML = blocks.length ? blocks.map(blockEditor).join('') : '<div class="empty">Belum ada blok. Pilih elemen di atas untuk mulai.</div>';
  $('#blockCount').textContent = `${blocks.length} BLOCK`;
  $('#statBlocks').textContent = blocks.length;
  $('#send').disabled = !(verified && blocks.length);
  $('#sendSummary').textContent = verified ? `${blocks.length} blok siap dikirim ke ${targetInfo?.title || $('#target').value}.` : 'Tambahkan blok dan verifikasi tujuan terlebih dahulu.';
  preview();
}

function preview() {
  let html = '';
  for (const b of blocks) {
    if (b.type === 'heading') html += `<h3>${esc(b.text || 'Judul pesan')}</h3>`;
    if (b.type === 'paragraph') html += `<p>${b.bold ? '<b>' : ''}${b.italic ? '<i>' : ''}${esc(b.text || 'Tulis isi pesan')}${b.italic ? '</i>' : ''}${b.bold ? '</b>' : ''}</p>`;
    if (b.type === 'list') {
      const arr = (b.text || '').split('\n').filter(Boolean);
      html += `<ul>${arr.map((x, i) => `<li>${b.listStyle === 'number' ? `${i + 1}. ` : '• '}${esc(x)}</li>`).join('')}</ul>`;
    }
    if (b.type === 'quote') html += `<blockquote>${esc(b.text || 'Kutipan')}${b.caption ? `<small> — ${esc(b.caption)}</small>` : ''}</blockquote>`;
    if (b.type === 'table') html += '<table>' + (b.rows || []).map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</table>';
    if (b.type === 'buttons') html += (b.buttons || []).map(x => `<a class="tgbtn">${esc(x.text || 'Button')}</a>`).join('');
    if (['photo', 'video', 'animation'].includes(b.type)) {
      html += b.type === 'photo' && /^https:\/\//i.test(b.url || '') ? `<img src="${esc(b.url)}" alt="Photo preview">` : `<p>▣ ${b.type.toUpperCase()}: ${esc(b.caption || b.url || 'Media')}</p>`;
    }
    if (b.type === 'map') html += `<p>📍 ${esc(b.title || 'Lokasi')} (${esc(b.latitude || '')}, ${esc(b.longitude || '')})</p>`;
    if (b.type === 'details') html += `<blockquote><b>${esc(b.summary || 'Detail')}</b><br>${esc(b.text || '')}</blockquote>`;
    if (b.type === 'divider') html += '<hr>';
  }
  const out = (html || '<div class="empty-preview">Pesan kamu akan tampil di sini.</div>') + '<div class="time">Sekarang ✓✓</div>';
  $('#previewMessage').innerHTML = out;
  $('#previewMessage2').innerHTML = out;
  const nm = targetInfo?.title || 'Telegram Preview';
  $('#previewChatName').textContent = nm;
  $('#previewChatName2').textContent = nm;
}

function renderDiag(t) {
  const box = $('#diagBox');
  box.className = `diag wide ${t.ok ? 'ok' : 'err'}`;
  box.innerHTML = `<b>${t.ok ? '✓ Token terbaca' : '✕ Token belum siap'}</b><span>${esc(t.message)}</span>`;
}

async function checkHealth() {
  try {
    const h = await api({ action: 'health' });
    renderDiag(h.token);
    if (h.token.ok) await loadBot();
    else {
      $('#statBot').textContent = 'Belum terhubung';
      $('#headerStatus').textContent = 'PERIKSA KONFIGURASI';
    }
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function loadBot() {
  try {
    botInfo = await api({ action: 'me' });
    $('#botUsername').value = '@' + botInfo.username;
    $('#addGroup').disabled = false;
    $('#addChannel').disabled = false;
    $('#statBot').textContent = 'Terhubung';
    $('#headerStatus').textContent = 'BOT TERHUBUNG';
    $('#verifyStatus').textContent = `✓ Bot aktif: @${botInfo.username}`;
  } catch (e) {
    botInfo = null;
    $('#statBot').textContent = 'Belum terhubung';
    $('#verifyStatus').textContent = '✕ ' + e.message;
    $('#headerStatus').textContent = 'PERIKSA KONFIGURASI';
    toast(e.message, 'err');
  }
}

function openAdd(type) {
  if (!botInfo) { toast('Periksa bot terlebih dahulu.', 'err'); return; }
  const rights = type === 'channel' ? 'post_messages+edit_messages+delete_messages' : 'delete_messages+invite_users';
  window.open(`https://t.me/${botInfo.username}?${type === 'channel' ? 'startchannel' : 'startgroup'}&admin=${rights}`, '_blank', 'noopener,noreferrer');
}

function renderHistory() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch {}
  $('#history').innerHTML = h.length
    ? h.map(x => `<div class="hist-row"><b>${esc(x.target)}</b><span>${esc(x.count)} blok · message ID ${esc(x.message_id)}</span><small>${new Date(x.at).toLocaleString('id-ID')}</small></div>`).join('')
    : '<div class="empty">Belum ada pesan yang dikirim dari perangkat ini.</div>';
}

// Event handlers
$$('[data-block]').forEach(btn => btn.addEventListener('click', () => addBlock(btn.dataset.block)));

$('#blocks').addEventListener('input', e => {
  const card = e.target.closest('[data-id]');
  if (!card) return;
  const b = blocks.find(x => x.id === card.dataset.id);
  if (!b) return;
  const key = e.target.dataset.key;
  if (key) {
    if (e.target.type === 'checkbox') b[key] = e.target.checked;
    else if (key === 'tableText') b.rows = e.target.value.split('\n').map(r => r.split('|').map(c => c.trim()));
    else b[key] = e.target.value;
    preview(); save();
  }
  if (e.target.dataset.btn !== undefined) {
    b.buttons[+e.target.dataset.btn][e.target.dataset.field] = e.target.value;
    preview(); save();
  }
});

$('#blocks').addEventListener('change', e => {
  const card = e.target.closest('[data-id]');
  if (!card) return;
  const b = blocks.find(x => x.id === card.dataset.id);
  if (!b) return;
  if (e.target.dataset.btn !== undefined) b.buttons[+e.target.dataset.btn][e.target.dataset.field] = e.target.value;
  if (e.target.dataset.key) b[e.target.dataset.key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  preview(); save();
});

$('#blocks').addEventListener('click', e => {
  const t = e.target;
  const card = t.closest('[data-id]');
  if (!card) return;
  const b = blocks.find(x => x.id === card.dataset.id);
  const i = blocks.indexOf(b);
  if (t.dataset.delete) { blocks.splice(i, 1); render(); save(); }
  if (t.dataset.up && i > 0) { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; render(); save(); }
  if (t.dataset.down && i < blocks.length - 1) { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; render(); save(); }
  if (t.dataset.dup) duplicateBlock(b.id);
  if (t.dataset.addBtn !== undefined) {
    if ((b.buttons || []).length >= 8) return toast('Maksimal 8 tombol.', 'err');
    b.buttons = [...(b.buttons || []), { text: 'Tombol baru', url: 'https://example.com', style: 'primary' }];
    render(); save();
  }
  if (t.dataset.removeBtn !== undefined) { b.buttons.splice(+t.dataset.removeBtn, 1); render(); save(); }
});

$$('[data-page]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.page); }));
$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

$$('[data-type]').forEach(b => b.onclick = () => {
  $$('[data-type]').forEach(x => x.classList.remove('selected'));
  b.classList.add('selected');
  targetType = b.dataset.type;
  verified = false; targetInfo = null;
  $('#verifyStatus').textContent = 'Jenis tujuan berubah — verifikasi ulang';
  $('#targetInfo').hidden = true;
  $('#statTarget').textContent = 'Belum diverifikasi';
  render(); save();
});

$('#loadBot').onclick = loadBot;
$('#addGroup').onclick = () => openAdd('group');
$('#addChannel').onclick = () => openAdd('channel');

$('#verify').onclick = async () => {
  try {
    const t = $('#target').value.trim();
    if (!t) throw Error('Masukkan username atau chat ID.');
    const info = await api({ action: 'verify', chat_id: t });
    if (info.type !== targetType && !(targetType === 'group' && ['group', 'supergroup'].includes(info.type))) throw Error(`Jenis chat terdeteksi ${info.type}, bukan ${targetType}.`);
    verified = ['administrator', 'creator', 'member'].includes(info.bot_status);
    targetInfo = info;
    $('#verifyStatus').textContent = `${verified ? '✓' : '!'} ${info.title || info.username || info.id} · ${info.type} · bot: ${info.bot_status}`;
    $('#targetInfo').hidden = false;
    $('#targetInfo').textContent = `Chat ID: ${info.id} · Nama: ${info.title || '-'} · Status bot: ${info.bot_status}`;
    $('#statTarget').textContent = verified ? 'Terverifikasi' : 'Perlu akses';
    if (!verified) throw Error('Bot belum menjadi anggota tujuan. Tambahkan bot melalui tombol di atas, lalu verifikasi ulang.');
    toast('Tujuan terverifikasi.');
    render(); save();
  } catch (e) {
    verified = false;
    $('#verifyStatus').textContent = '✕ ' + e.message;
    $('#statTarget').textContent = 'Belum diverifikasi';
    render();
  }
};

$('#clear').onclick = () => { if (!confirm('Hapus semua blok pesan?')) return; blocks = []; render(); save(); };

$('#exportDraft').onclick = () => {
  const blob = new Blob([JSON.stringify({ blocks, targetType, target: $('#target').value }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rich-draft.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('#importDraft').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.blocks)) throw Error('File tidak berisi daftar blok.');
    blocks = d.blocks.map(b => ({ ...b, id: uid() }));
    verified = false;
    render(); save();
    toast('Draft diimpor. Verifikasi ulang tujuan sebelum kirim.');
  } catch (err) {
    toast('Impor gagal: ' + err.message, 'err');
  } finally { e.target.value = ''; }
};

$('#send').onclick = async () => {
  try {
    if (!verified) throw Error('Verifikasi tujuan terlebih dahulu.');
    $('#send').disabled = true;
    $('#result').textContent = 'Mengirim pesan...';
    const result = await api({ action: 'send', chat_id: $('#target').value.trim(), blocks, disable_notification: $('#silent').checked, protect_content: $('#protect').checked });
    $('#result').textContent = `✓ Pesan berhasil dikirim. Message ID: ${result.message_id}`;
    toast('Pesan terkirim.');
    let h = [];
    try { h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch {}
    h.unshift({ target: targetInfo?.title || $('#target').value, count: blocks.length, message_id: result.message_id, at: Date.now() });
    localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 20)));
    renderHistory();
  } catch (e) {
    $('#result').textContent = '✕ ' + e.message;
    toast(e.message, 'err');
  } finally { render(); }
};

['target', 'silent', 'protect'].forEach(id => $('#' + id).addEventListener('change', () => {
  verified = false;
  if (id === 'target') $('#verifyStatus').textContent = 'Target berubah — verifikasi ulang';
  render(); save();
}));

restore();
render();
renderHistory();
const initial = location.hash.replace('#', '');
go(['destination', 'editor', 'preview', 'delivery'].includes(initial) ? initial : 'dashboard');
checkHealth();
