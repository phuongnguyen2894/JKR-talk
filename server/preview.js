// Xem trước liên kết (link preview): lấy Open Graph của trang, có chống SSRF.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_HTML = 512 * 1024;
const MAX_IMG = 2 * 1024 * 1024;
const TIMEOUT = 5000;
const UA = 'Mozilla/5.0 (compatible; Twitterbot/1.0; JKRtalksPreview)';

const URL_RE = /https?:\/\/[^\s<>"']+/i;
export const firstUrl = (text) => {
  const m = URL_RE.exec(text || '');
  return m ? m[0].replace(/[.,;:!?)\]]+$/, '') : null;
};

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

// lookup chỉ cho phép IP công cộng (kiểm tra đúng IP sẽ được kết nối, tránh DNS rebinding)
const safeLookup = (host, opts, cb) => {
  dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateIp(a.address));
    if (!ok.length) return cb(new Error('Địa chỉ không được phép'));
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
};

function get(url, { maxBytes, accept, redirects = 3 }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('URL sai')); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return reject(new Error('URL không hợp lệ'));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ''))) return reject(new Error('Địa chỉ không được phép'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { lookup: safeLookup, timeout: TIMEOUT, headers: { 'user-agent': UA, accept, 'accept-language': 'vi,en;q=0.8' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Quá nhiều chuyển hướng'));
        return resolve(get(new URL(res.headers.location, u).href, { maxBytes, accept, redirects: redirects - 1 }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      let n = 0;
      res.on('data', (c) => {
        n += c.length;
        if (n > maxBytes) { res.destroy(); return resolve({ buf: Buffer.concat(chunks), type: res.headers['content-type'] || '', url: u.href, truncated: true }); }
        chunks.push(c);
      });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: res.headers['content-type'] || '', url: u.href }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Hết thời gian chờ')));
    req.on('error', reject);
  });
}

const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>';
    if (k === 'quot') return '"'; if (k === 'apos') return "'"; if (k === 'nbsp') return ' ';
    const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });

function parseMeta(html) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    if (key && val && meta[key] === undefined) meta[key] = decode(val[1] ?? val[2]).trim();
  }
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  return {
    title: meta['og:title'] || meta['twitter:title'] || (title ? decode(title).trim() : ''),
    description: meta['og:description'] || meta['twitter:description'] || meta.description || '',
    image: meta['og:image'] || meta['twitter:image'] || '',
    site: meta['og:site_name'] || '',
  };
}

const IMG = [
  ['png', [0x89, 0x50, 0x4e, 0x47]], ['jpg', [0xff, 0xd8, 0xff]], ['gif', [0x47, 0x49, 0x46]], ['webp', [0x52, 0x49, 0x46, 0x46]],
];
async function saveImage(src, uploadDir) {
  try {
    const r = await get(src, { maxBytes: MAX_IMG, accept: 'image/*' });
    if (r.truncated) return null;
    const ext = IMG.find(([, magic]) => magic.every((b, i) => r.buf[i] === b))?.[0];
    if (!ext) return null;
    const name = `${crypto.randomBytes(12).toString('base64url')}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, name), r.buf);
    return `/uploads/${name}`;
  } catch { return null; }
}

// Tweet/bài đăng X: x.com chặn bot nên dùng dịch vụ công khai fxtwitter cho nội dung bài
async function xPreview(u) {
  const m = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/.exec(u.pathname);
  if (!m) return null;
  try {
    const r = await get(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, { maxBytes: MAX_HTML, accept: 'application/json' });
    const t = JSON.parse(r.buf.toString('utf8')).tweet;
    if (!t) return null;
    const photo = t.media?.photos?.[0]?.url || t.media?.videos?.[0]?.thumbnail_url || t.media?.all?.[0]?.thumbnail_url || '';
    return { title: `${t.author?.name || m[1]} (@${t.author?.screen_name || m[1]})`, description: t.text || '', image: photo, site: 'X' };
  } catch { return null; }
}

export async function buildPreview(url, uploadDir) {
  let u;
  try { u = new URL(url); } catch { return null; }
  let meta = null;
  if (/^(www\.|mobile\.)?(x|twitter)\.com$/i.test(u.hostname)) meta = await xPreview(u);
  if (!meta) {
    try {
      const r = await get(url, { maxBytes: MAX_HTML, accept: 'text/html,application/xhtml+xml' });
      if (!/html/i.test(r.type)) return null;
      meta = parseMeta(r.buf.toString('utf8'));
      u = new URL(r.url);
    } catch { return null; }
  }
  if (!meta.title && !meta.description) return null;
  let image = null;
  if (meta.image) {
    try { image = await saveImage(new URL(meta.image, u).href, uploadDir); } catch { /* bỏ ảnh */ }
  }
  return {
    url,
    site: (meta.site || u.hostname.replace(/^www\./, '')).slice(0, 80),
    title: meta.title.slice(0, 160),
    description: meta.description.slice(0, 280),
    image,
  };
}
