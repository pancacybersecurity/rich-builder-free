const API = 'https://api.telegram.org';
// Format token BotFather: angka:kode (contoh 123456789:AAH...)
const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

// Baca token dari Environment Variables. Spasi/baris baru/tanda kutip yang ikut tersalin dibersihkan.
function readToken() {
  const raw = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  return String(raw).replace(/[\r\n\t]/g, '').trim().replace(/^["']+|["']+$/g, '').trim();
}

function tokenStatus() {
  const t = readToken();
  if (!t) return { ok: false, code: 'missing', message: 'BOT_TOKEN tidak terbaca di server. Pasang di Vercel → Project Settings → Environment Variables dengan nama persis BOT_TOKEN, lalu Redeploy.' };
  if (!TOKEN_RE.test(t)) return { ok: false, code: 'format', message: 'BOT_TOKEN terbaca tetapi formatnya tidak valid. Salin ulang token dari BotFather (format: angka:kode).' };
  return { ok: true, code: 'ok', message: 'BOT_TOKEN terbaca dan formatnya valid.' };
}

// Jika ACCESS_KEY dipasang di Vercel, dashboard hanya bisa dipakai dengan kunci itu.
function authorized(req) {
  const need = process.env.ACCESS_KEY;
  if (!need) return true;
  return req.headers['x-access-key'] === need;
}

async function call(method, payload = {}) {
  const st = tokenStatus();
  if (!st.ok) throw new Error(st.message);
  let r;
  try {
    r = await fetch(`${API}/bot${readToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error('Gagal menghubungi Telegram: ' + e.message);
  }
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok || !data.ok) {
    if (r.status === 401) throw new Error('Token ditolak Telegram (401). Pastikan token masih aktif; jika pernah bocor, buat ulang lewat BotFather.');
    throw new Error(data.description || `Telegram API error (${r.status})`);
  }
  return data.result;
}

const T = s => (s && String(s).trim() ? String(s) : ' ');

// Teks inline: tebal/miring. Jika keduanya aktif, dibungkus bersarang.
function inline(text, bold, italic) {
  const t = T(text);
  if (bold && italic) return [{ type: 'bold', text: [{ type: 'italic', text: t }] }];
  if (bold) return [{ type: 'bold', text: t }];
  if (italic) return [{ type: 'italic', text: t }];
  return t;
}

function richBlock(b) {
  switch (b.type) {
    case 'heading': return { type: 'heading', size: 2, text: T(b.text) };
    case 'paragraph': return { type: 'paragraph', text: inline(b.text, b.bold, b.italic) };
    case 'list': {
      const lines = String(b.text || '').split('\n').map(x => x.trim()).filter(Boolean);
      if (!lines.length) throw new Error('Blok list harus memiliki minimal satu poin.');
      return { type: 'paragraph', text: lines.map((x, i) => `${b.listStyle === 'number' ? `${i + 1}.` : '•'} ${x}`).join('\n') };
    }
    case 'quote': return { type: 'blockquote', blocks: [{ type: 'paragraph', text: T(b.text) }], credit: b.caption || undefined };
    case 'divider': return { type: 'divider' };
    case 'table': {
      const rows = (b.rows || []).filter(r => Array.isArray(r) && r.some(c => String(c || '').trim()));
      if (!rows.length) throw new Error('Tabel harus memiliki isi.');
      return { type: 'table', cells: rows.map(r => r.map(c => ({ text: String(c || ' ') }))), is_bordered: b.bordered !== false, is_striped: !!b.striped };
    }
    case 'buttons': {
      const buttons = (b.buttons || []).filter(x => String(x.text || '').trim());
      if (!buttons.length) throw new Error('Tambahkan minimal satu tombol.');
      if (buttons.length > 8) throw new Error('Maksimal 8 tombol pada satu blok.');
      return {
        type: 'buttons', align: 'left',
        buttons: buttons.map(x => {
          if (!/^https:\/\/\S+$/i.test(x.url || '')) throw new Error(`Tombol "${x.text}" wajib memakai URL HTTPS yang valid.`);
          return { text: x.text, style: ['primary', 'success', 'danger', 'link'].includes(x.style) ? x.style : 'primary', url: x.url };
        }),
      };
    }
    case 'details': return { type: 'details', summary: b.summary || 'Detail', blocks: [{ type: 'paragraph', text: T(b.text) }] };
    case 'photo':
    case 'video':
    case 'animation': {
      const u = String(b.url || '');
      if (!/^https:\/\/\S+/i.test(u)) throw new Error('URL media harus HTTPS dan dapat diakses publik.');
      const caption = b.caption ? { text: b.caption } : undefined;
      if (b.type === 'photo') return { type: 'photo', photo: { type: 'photo', media: u }, caption };
      if (b.type === 'video') return { type: 'video', video: { type: 'video', media: u }, caption };
      return { type: 'animation', animation: { type: 'animation', media: u }, caption };
    }
    case 'map': {
      const latitude = Number(b.latitude), longitude = Number(b.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Koordinat map tidak valid.');
      return { type: 'map', location: { latitude, longitude }, caption: b.title ? { text: b.title } : undefined };
    }
    default: throw new Error('Jenis blok belum didukung: ' + b.type);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ ok: false, code: 'locked', error: 'Access key diperlukan.' });
  const body = req.body || {};
  try {
    if (body.action === 'health') {
      return res.status(200).json({ ok: true, result: { token: tokenStatus(), access_key: !!process.env.ACCESS_KEY } });
    }
    if (body.action === 'me') {
      const me = await call('getMe');
      return res.status(200).json({ ok: true, result: me });
    }
    if (body.action === 'verify') {
      if (!body.chat_id) throw new Error('chat_id wajib diisi.');
      const chat = await call('getChat', { chat_id: body.chat_id });
      const me = await call('getMe');
      let member;
      try { member = await call('getChatMember', { chat_id: chat.id, user_id: me.id }); }
      catch { member = { status: 'tidak dapat diperiksa' }; }
      return res.status(200).json({ ok: true, result: { id: chat.id, title: chat.title, username: chat.username, type: chat.type, bot_status: member.status, can_post_messages: member.can_post_messages ?? null } });
    }
    if (body.action === 'send') {
      const { chat_id, blocks } = body;
      if (!chat_id || !Array.isArray(blocks) || !blocks.length) throw new Error('Tujuan dan minimal satu blok wajib diisi.');
      if (blocks.length > 50) throw new Error('Maksimal 50 blok per pesan.');
      const me = await call('getMe');
      const member = await call('getChatMember', { chat_id, user_id: me.id });
      if (!['administrator', 'creator', 'member'].includes(member.status)) throw new Error('Bot belum menjadi anggota tujuan. Tambahkan bot terlebih dahulu.');
      const chat = await call('getChat', { chat_id });
      if (chat.type === 'channel' && member.status !== 'creator' && !member.can_post_messages) throw new Error('Bot sudah admin, tetapi belum memiliki izin Post Messages di channel.');
      if (chat.type === 'supergroup' && member.status === 'restricted' && !member.can_send_messages) throw new Error('Bot tidak memiliki izin mengirim pesan di grup.');
      const payload = {
        chat_id,
        rich_message: { blocks: blocks.map(richBlock) },
        disable_notification: !!body.disable_notification,
        protect_content: !!body.protect_content,
      };
      const sent = await call('sendRichMessage', payload);
      return res.status(200).json({ ok: true, result: { message_id: sent.message_id, chat: sent.chat } });
    }
    return res.status(400).json({ ok: false, description: 'Action tidak dikenal.' });
  } catch (e) {
    return res.status(400).json({ ok: false, description: e.message });
  }
};
