// สร้างหน้าแชร์สำหรับ Facebook / LINE  (Facebook / LINE อ่านแท็ก og: จากหน้าเหล่านี้)
//   share/<รหัสอัลบั้ม>.html   อัลบั้มกิจกรรม (แท็บ ข่าวสาร, 5ส-กิจกรรม) → ขึ้นชื่อกิจกรรม + รูปปก
//   share/g<รหัส>.html         คำแนะนำรายโรค (แท็บ รายโรค)    → ขึ้นรูปกรอบงานห้องผ่าตัด
//   share/v<รหัส>.html         วิดีโอแนะนำ (แท็บ วิดีโอแนะนำ)  → ขึ้นรูปกรอบงานห้องผ่าตัด + ภาพจากวิดีโอ
//   share/img/<รหัส>.jpg       รูปกรอบ 1200×630 ของคำแนะนำ/วิดีโอ (สร้างใหม่เฉพาะเมื่อข้อมูลเปลี่ยน)
// คนที่กดลิงก์จะถูกพาไปยังเรื่องนั้นบนเว็บทันที
// ทำงานอัตโนมัติผ่าน GitHub Actions (.github/workflows/share-pages.yml) ไม่ต้องแก้ไฟล์นี้
//
// อ่านข้อมูลจากชีตเนื้อหา (ชีตเดียวกับที่เว็บใช้) ใช้วิธีคิดรหัสแบบเดียวกับ index.html
// รูปกรอบต้องใช้ @napi-rs/canvas + ฟอนต์ Kanit (@expo-google-fonts/kanit) ที่ workflow ติดตั้งให้
// ถ้าติดตั้งไม่ได้ หน้าแชร์ยังสร้างได้ แต่ใช้ภาพจากวิดีโอ/รูปปกเว็บแทนรูปกรอบ

import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';

const SHEET_ID = '1BOz9uPOJTnbdfs0JJFXx5noSZBoh3pV5bBQ75nmyhow';
const TAB = 'ข่าวสาร';
const TAB_5S = '5ส-กิจกรรม';
const TAB_GUIDE = 'รายโรค';
const TAB_VIDEO = 'วิดีโอแนะนำ';
const OUT = 'share';
const IMG = OUT + '/img';
const ORG = 'งานห้องผ่าตัด โรงพยาบาลยางตลาด';
const DESIGN = 'frame-1'; // เปลี่ยนค่านี้เมื่อแก้หน้าตารูปกรอบ จะสร้างรูปใหม่ทั้งหมด
const repo = process.env.GITHUB_REPOSITORY || 'OR-YTH/OR-Yangtalad';
const [owner, name] = repo.split('/');
const SITE = process.env.SITE_URL || `https://${owner.toLowerCase()}.github.io/${name}/`;

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/* ---------- เหมือนใน index.html ---------- */
const headKey = l => String(l || '').replace(/\s*\(.*$/, '').trim();
const val = (row, key) => { const v = row && row[key]; return v == null ? '' : String(v).trim(); };
const isShown = v => v === true || /^(true|1|y|yes|ใช่|แสดง|✓|✔)$/i.test(String(v == null ? '' : v).trim());
const visible = (rows, key) => (rows || []).filter(r => isShown(r['แสดง']) && val(r, key));
const safeUrl = u => { u = String(u || '').trim(); return /^https:\/\/[^\s"'<>`]+$/i.test(u) ? u : ''; };
const sameText = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
function hashId(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0; return h.toString(36); }
function parseThaiDate(text) {
  const s = String(text || '').trim();
  let m, mi;
  const ymd = (y, mo, d) => {
    if (y < 100) y += 2500; else if (y < 2400) y += 543;
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { y, m: mo, d } : null;
  };
  if ((m = s.match(/^(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{2,4})$/))) return ymd(+m[3], +m[2], +m[1]);
  if ((m = s.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})/))) {
    const nm = m[2].replace(/\s/g, '');
    mi = TH_MONTHS.indexOf(nm);
    if (mi < 0) mi = TH_MONTHS_SHORT.indexOf(nm);
    if (mi < 0) mi = TH_MONTHS_SHORT.map(x => x.replace(/\./g, '')).indexOf(nm.replace(/\./g, ''));
    if (mi >= 0) return ymd(+m[3], mi + 1, +m[1]);
  }
  return null;
}
function photoFrom(s) {
  s = String(s || '').trim();
  if (!s) return null;
  const m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{20,})/) ||
    s.match(/docs\.google\.com\/[a-z]+\/d\/([\w-]{20,})/) || s.match(/^([\w-]{25,})$/);
  if (m) return 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1200';
  if (/^[\w-]+(?:\/[\w-]+)*\.(?:jpe?g|png|webp|gif)$/i.test(s)) return SITE + s; // รูปที่อยู่ในเว็บนี้ เช่น 5s-act/a01-1.jpg
  return safeUrl(s) || null;
}
function buildAlbums(rows, prefix = 'a') {
  let list = visible(rows, 'หัวข้อ').map((r, i) => {
    const title = val(r, 'หัวข้อ'), date = val(r, 'วันที่');
    let photos = val(r, 'รูปทั้งหมด').split(/[\r\n,]+/).map(photoFrom).filter(Boolean);
    const cover = photoFrom(val(r, 'ลิงก์รูปปก') || val(r, 'ลิงก์รูป'));
    if (!photos.length && cover) photos = [cover];
    const d = parseThaiDate(date);
    return { id: prefix + hashId(date + '|' + title), title, date, desc: val(r, 'รายละเอียด'), photos,
      cover: cover || photos[0] || null, ymd: d ? d.y * 10000 + d.m * 100 + d.d : 0, order: i };
  });
  if (prefix === 'a') list.sort((a, b) => (b.ymd - a.ymd) || (a.order - b.order)); // ข่าวสาร: ใหม่สุดก่อน
  else list = list.filter(a => a.photos.length || a.desc);                         // 5ส.: ตามลำดับแถว (เหมือนบนเว็บ)
  const seen = {};
  list.forEach(a => { while (seen[a.id]) a.id += 'b'; seen[a.id] = 1; });
  return list;
}

// ลิงก์สื่อ: เหมือน parseMedia ใน index.html (เอาเฉพาะที่ใช้ทำรูป)
function parseMedia(text) {
  return String(text || '').split(/\r?\n/).map(line => {
    const m = line.match(/https:\/\/[^\s"'<>`]+/i);
    if (!m) return null;
    const url = safeUrl(m[0].replace(/[),.;]+$/, ''));
    if (!url) return null;
    let x;
    if ((x = url.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i))) {
      return { type: 'youtube', id: x[1], tall: /\/shorts\//i.test(url),
        thumbs: [`https://i.ytimg.com/vi/${x[1]}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${x[1]}/hqdefault.jpg`] };
    }
    if ((x = url.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/))) {
      return { type: 'drive', id: x[1],
        thumbs: [`https://drive.google.com/thumbnail?id=${x[1]}&sz=w1000`, `https://lh3.googleusercontent.com/d/${x[1]}=w1000`] };
    }
    if (/\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i.test(url)) return { type: 'image', id: url, thumbs: [url] };
    return { type: 'link', id: url, thumbs: [] };
  }).filter(Boolean);
}

// คำแนะนำรายโรค: รหัส g + hashId(ชื่อเรื่อง) เหมือน renderGuide ใน index.html
function buildGuides(rows, videos) {
  const ids = [];
  return visible(rows, 'ชื่อเรื่อง').map(r => {
    const title = val(r, 'ชื่อเรื่อง');
    let id = 'g' + hashId(title);
    while (ids.includes(id)) id += 'b';
    ids.push(id);
    const points = val(r, 'ข้อปฏิบัติ').split(/\r?\n/).map(s => s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    const media = videos.filter(v => sameText(v.cat, title)).map(v => v.media).concat(parseMedia(val(r, 'สื่อความรู้')));
    return { kind: 'guide', id, title, dept: val(r, 'แผนก'), desc: val(r, 'คำอธิบายสั้น'), points, by: val(r, 'ผู้จัดทำ'),
      media: media.find(m => m.thumbs.length) || null };
  });
}
// วิดีโอแนะนำ: รหัส v + hashId(รหัสไฟล์วิดีโอ) เหมือน videoList ใน index.html
function buildVideos(rows) {
  const out = [];
  visible(rows, 'หัวข้อ').forEach(r => {
    const media = parseMedia(val(r, 'ลิงก์วิดีโอ'))[0];
    if (!media || (media.type !== 'youtube' && media.type !== 'drive')) return;
    let id = 'v' + hashId(media.id);
    while (out.some(o => o.id === id)) id += 'b';
    out.push({ kind: 'video', id, title: val(r, 'หัวข้อ'), cat: val(r, 'หมวด'), desc: val(r, 'คำอธิบายสั้น'),
      dur: val(r, 'ความยาว'), by: val(r, 'ผู้จัดทำ'), media });
  });
  return out;
}

/* ---------- อ่านชีต ---------- */
async function loadRows(tab = TAB, file = process.env.GVIZ_FILE, keyCol = 'หัวข้อ') {
  let text;
  if (!file && process.env.GVIZ_DIR) file = `${process.env.GVIZ_DIR}/${tab}.json`; // ใช้ตอนทดสอบ
  if (file) text = await readFile(file, 'utf8');
  else {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(tab)}`;
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
  }
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!j || j.status === 'error' || !j.table) throw new Error('gviz error');
  const cols = j.table.cols.map((c, i) => headKey(c.label) || ('_' + i));
  if (cols.indexOf(keyCol) < 0 || cols.indexOf('แสดง') < 0) throw new Error('ไม่พบหัวคอลัมน์ของแท็บ ' + tab);
  return (j.table.rows || []).map(r => {
    const o = {};
    let any = false;
    cols.forEach((h, i) => {
      const c = r.c && r.c[i];
      let v = null;
      if (c) v = typeof c.v === 'boolean' ? c.v : (c.f != null ? c.f : c.v);
      if (v !== null && v !== '' && typeof v !== 'boolean') any = true;
      o[h] = v;
    });
    return any ? o : null;
  }).filter(Boolean);
}

/* ---------- สร้างหน้า ---------- */
const attr = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
const names = s => String(s || '').split(/\s*[,;\/\n\r]+\s*/).map(n => n.replace(/\s+/g, ' ').trim()).filter(Boolean);

function page({ title, desc, image, url, target, imageAlt, imageSize }) {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(title)}</title>
<meta name="robots" content="noindex">
<meta name="description" content="${attr(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${attr(ORG)}">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${attr(url)}">
<meta property="og:image" content="${attr(image)}">
${imageSize ? `<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${imageSize[0]}">
<meta property="og:image:height" content="${imageSize[1]}">
` : ''}<meta property="og:image:alt" content="${attr(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${attr(url)}">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#EEF6FC;color:#0A3D62}a{color:#0A3D62;font-weight:600}</style>
</head>
<body>
<p><a href="${attr(target)}">${attr(title)} →</a></p>
</body>
</html>
`;
}

function albumPage(a) {
  const url = SITE + OUT + '/' + a.id + '.html';
  const descParts = [a.date, clip(a.desc, 180)].filter(Boolean);
  return page({
    title: a.title + ' | ' + ORG,
    desc: descParts.join(' · ') || ORG,
    image: a.cover || SITE + 'og-cover.jpg',
    imageAlt: a.title,
    url,
    target: '../#album-' + a.id
  });
}

// คำแนะนำรายโรค / วิดีโอแนะนำ
function itemPage(it, img) {
  const video = it.kind === 'video';
  const by = names(it.by).join(', ');
  const parts = video ? [it.desc] : [it.desc, it.points.slice(0, 2).join(' · ')];
  if (by) parts.push('ผู้จัดทำ ' + by);
  let image = SITE + 'og-cover.jpg', size = null;
  if (img) { image = SITE + IMG + '/' + it.id + '.jpg?v=' + img; size = [1200, 630]; }
  else if (it.media && it.media.thumbs.length) image = it.media.thumbs[it.media.type === 'drive' ? 1 : 0];
  return page({
    title: (video ? 'วิดีโอแนะนำ: ' : 'คำแนะนำ: ') + it.title + ' | ' + ORG,
    desc: clip(parts.filter(Boolean).join(' · '), 200) || ORG,
    image, imageSize: size,
    imageAlt: (video ? 'วิดีโอแนะนำ ' : 'คำแนะนำการปฏิบัติตัว ') + it.title + ' — ' + ORG,
    url: SITE + OUT + '/' + it.id + '.html',
    target: '../#' + (video ? 'video-' : 'guide-') + it.id
  });
}

// อัลบั้ม/คำแนะนำที่ถูกซ่อนหรือเปลี่ยนชื่อ: เหลือแค่หน้าพาไปส่วนนั้น ไม่มีชื่อหรือรูปเดิมค้างอยู่
function retiredPage(id) {
  const k = id[0];
  const t = k === 's' ? ['กิจกรรม 5ส.', 'กิจกรรม 5ส. ห้องผ่าตัด ชั้น 5 ของ' + ORG, '../#fives']
    : k === 'a' ? ['กิจกรรม', 'ข่าวสารและภาพกิจกรรมของ' + ORG, '../#news']
      : ['คำแนะนำการปฏิบัติตัว', 'คำแนะนำและวิดีโอสำหรับผู้รับบริการ ' + ORG, '../#patient-guide'];
  return page({
    title: t[0] + ' | ' + ORG,
    desc: t[1],
    image: SITE + 'og-cover.jpg',
    imageAlt: ORG,
    url: SITE + OUT + '/' + id + '.html',
    target: t[2]
  });
}

async function writeIfChanged(path, data) {
  let old = null;
  try { old = await readFile(path); } catch { /* ยังไม่มีไฟล์ */ }
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (old && old.equals(buf)) return false;
  await writeFile(path, buf);
  return true;
}

/* ==================== รูปกรอบงานห้องผ่าตัด 1200×630 ==================== */
const W = 1200, H = 630;
const COL = { navy: '#0A3D62', deep: '#062A45', blue: '#3E92CC', bright: '#2E9CE2', pale: '#BFE4FF', yellow: '#FFC800', red: '#E0262E' };
let C = null, LOGO = null;

async function loadCanvas() {
  try {
    C = await import('@napi-rs/canvas');
    const req = createRequire(import.meta.url);
    for (const w of ['400Regular', '600SemiBold']) C.GlobalFonts.registerFromPath(req.resolve(`@expo-google-fonts/kanit/${w}/Kanit_${w}.ttf`), 'Kanit');
    try { // โลโก้โรงพยาบาลที่ฝังอยู่ใน index.html
      const html = await readFile('index.html', 'utf8');
      const m = html.match(/\.logo-img\{[^}]*url\("data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)"/);
      if (m) LOGO = await C.loadImage(Buffer.from(m[1], 'base64'));
    } catch { /* ไม่มีโลโก้ก็ได้ */ }
    return true;
  } catch (e) {
    console.log('ข้ามรูปกรอบ (ไม่มีตัวสร้างรูป): ' + e.message);
    C = null;
    return false;
  }
}

async function fetchImage(urls) {
  for (const u of urls || []) {
    try {
      const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; or-share-bot)' } });
      if (!res.ok || !/^image\//.test(res.headers.get('content-type') || '')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue;
      const img = await C.loadImage(buf);
      if (img.width >= 120 && img.height >= 120) return img;
    } catch { /* ลองลิงก์ถัดไป */ }
  }
  return null;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ตัดบรรทัดภาษาไทยตามคำ (Intl.Segmenter) ไม่เกิน maxLines บรรทัด เกินแล้วใส่ …
const SEG_W = new Intl.Segmenter('th', { granularity: 'word' });
const SEG_G = new Intl.Segmenter('th', { granularity: 'grapheme' });
const KEEP = ['อย่างน้อย', 'คำแนะนำ', 'ห้องผ่าตัด', 'ก่อนผ่าตัด', 'หลังผ่าตัด', 'โรงพยาบาล', 'ผู้รับบริการ', 'วันเดียวกลับ', 'ปฏิบัติตัว'];
function words(text) {
  const raw = [...SEG_W.segment(String(text || '').replace(/\s+/g, ' ').trim())].map(s => s.segment);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i], hit = 0;
    for (let j = i + 1; j < Math.min(raw.length, i + 4) && !hit; j++) { // คำที่ไม่ควรตัดกลาง เช่น อย่าง|น้อย
      const joined = raw.slice(i, j + 1).join('');
      if (KEEP.includes(joined)) hit = j;
    }
    if (hit) { t = raw.slice(i, hit + 1).join(''); i = hit; }
    const prev = out[out.length - 1];
    // คำภาษาอังกฤษ/ตัวเลขที่ติดกัน เช่น (C-Section) หรือ 2-4 ไม่ตัดกลาง
    if (prev && !/\s/.test(prev + t) && !/[\u0E00-\u0E7F]/.test(prev.slice(-1) + t.charAt(0))) out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}
function wrap(ctx, text, maxW, maxLines) {
  const fit = s => ctx.measureText(s).width <= maxW;
  const tokens = [];
  for (const segment of words(text)) {
    if (fit(segment)) tokens.push(segment);
    else for (const g of SEG_G.segment(segment)) tokens.push(g.segment);
  }
  const lines = [];
  let cur = '';
  for (const t of tokens) {
    if (fit(cur + t)) { cur += t; continue; }
    if (cur.trim()) lines.push(cur.trim());
    cur = t === ' ' ? '' : t;
  }
  if (cur.trim()) lines.push(cur.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = [...SEG_G.segment(lines[maxLines - 1])].map(g => g.segment);
    while (last.length && !fit(last.join('').trim() + '…')) last.pop();
    lines[maxLines - 1] = last.join('').trim() + '…';
  }
  return lines;
}

function pill(ctx, x, y, text, bg, fg, opts = {}) {
  ctx.font = '600 22px Kanit';
  const pad = 18, icon = opts.play ? 22 : 0, w = ctx.measureText(text).width + pad * 2 + icon, h = 40;
  rrect(ctx, x, y, w, h, h / 2);
  if (bg) { ctx.fillStyle = bg; ctx.fill(); }
  if (opts.stroke) { ctx.strokeStyle = opts.stroke; ctx.lineWidth = 2; ctx.stroke(); }
  if (opts.play) {
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(x + pad, y + 12); ctx.lineTo(x + pad + 13, y + 20); ctx.lineTo(x + pad, y + 28); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad + icon, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function coverDraw(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function playButton(ctx, cx, cy, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(224,38,46,.95)'; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(cx - r * 0.3, cy - r * 0.42); ctx.lineTo(cx + r * 0.45, cy); ctx.lineTo(cx - r * 0.3, cy + r * 0.42); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
}

function ecg(ctx, x0, x1, y, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y);
  const beat = [[0, 0], [14, 0], [20, -10], [26, 0], [34, 0], [40, 14], [48, -46], [56, 22], [62, 0], [76, 0], [84, -12], [94, 0]];
  for (let bx = x0 + 40; bx + 96 < x1; bx += 220) for (const [dx, dy] of beat) ctx.lineTo(bx + dx, y + dy);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

// ส่วนขวาของรูป: ภาพจากวิดีโอ / รายการข้อปฏิบัติ / ไอคอน  คืนค่าตำแหน่งขอบซ้ายของส่วนนี้
function drawRight(ctx, it, photo) {
  const R = 1136, top = 56, bottom = 574;
  if (it.kind === 'guide' && it.points.length) {
    const w = 448, x = R - w, pts = it.points.slice(0, 4);
    ctx.font = '400 23px Kanit';
    const items = [];
    let used = 0;
    for (const p of pts) {
      const ls = wrap(ctx, p, w - 104, 2);
      if (used + ls.length > 6) break;
      items.push(ls); used += ls.length;
    }
    const h = 92 + used * 33 + items.length * 14 + 14, y = Math.max(top + 24, (H - h) / 2);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
    rrect(ctx, x, y, w, h, 26); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); rrect(ctx, x, y, w, h, 26); ctx.clip(); ctx.fillStyle = COL.yellow; ctx.fillRect(x, y, w, 8); ctx.restore();
    ctx.fillStyle = COL.deep; ctx.font = '600 26px Kanit'; ctx.fillText('ข้อควรปฏิบัติ', x + 30, y + 60);
    let cy = y + 100;
    for (const ls of items) {
      ctx.beginPath(); ctx.arc(x + 44, cy - 8, 13, 0, Math.PI * 2); ctx.fillStyle = '#E3F2FC'; ctx.fill();
      ctx.strokeStyle = COL.bright; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x + 37, cy - 8); ctx.lineTo(x + 42, cy - 3); ctx.lineTo(x + 51, cy - 14); ctx.stroke();
      ctx.fillStyle = '#23415A'; ctx.font = '400 23px Kanit';
      ls.forEach((l, i) => ctx.fillText(l, x + 72, cy + i * 33));
      cy += ls.length * 33 + 14;
    }
    return x;
  }
  if (photo) {
    const tall = it.media.tall || photo.height > photo.width * 1.05;
    let w, h;
    if (tall) { h = bottom - top; w = Math.round(h * 9 / 16); }
    else { w = 470; h = Math.round(w * 9 / 16); }
    const x = R - w, y = Math.round((H - h) / 2);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16;
    rrect(ctx, x - 5, y - 5, w + 10, h + 10, 26); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); rrect(ctx, x, y, w, h, 22); ctx.clip(); coverDraw(ctx, photo, x, y, w, h); ctx.restore();
    if (it.kind === 'video') playButton(ctx, x + w / 2, y + h / 2, 44);
    return x - 5;
  }
  // ไม่มีภาพ: วงกลมไอคอน
  const cx = R - 170, cy = H / 2, r = 150;
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
  g.addColorStop(0, 'rgba(46,156,226,.55)'); g.addColorStop(1, 'rgba(46,156,226,.08)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(191,228,255,.35)'; ctx.stroke();
  if (it.kind === 'video') playButton(ctx, cx, cy, 62);
  else { // กากบาทการแพทย์
    ctx.fillStyle = '#fff';
    rrect(ctx, cx - 22, cy - 66, 44, 132, 10); ctx.fill();
    rrect(ctx, cx - 66, cy - 22, 132, 44, 10); ctx.fill();
  }
  return cx - r;
}

async function renderFrame(it, photo) {
  const cv = C.createCanvas(W, H), ctx = cv.getContext('2d');
  // พื้นหลังกรมท่า + แสงฟ้า
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, COL.navy); bg.addColorStop(1, COL.deep);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(980, 60, 20, 980, 60, 620);
  glow.addColorStop(0, 'rgba(46,156,226,.40)'); glow.addColorStop(1, 'rgba(46,156,226,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ecg(ctx, 0, W, 520, 'rgba(191,228,255,.10)');

  const leftEdge = drawRight(ctx, it, photo);
  const X = 64, maxW = leftEdge - 48 - X;

  // หัว: โลโก้ + ชื่อหน่วยงาน
  ctx.beginPath(); ctx.arc(X + 36, 96, 36, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  if (LOGO) ctx.drawImage(LOGO, X + 6, 66, 60, 60);
  ctx.fillStyle = '#fff'; ctx.font = '600 32px Kanit'; ctx.fillText('งานห้องผ่าตัด', X + 88, 92);
  ctx.fillStyle = COL.pale; ctx.font = '400 21px Kanit'; ctx.fillText('โรงพยาบาลยางตลาด', X + 88, 122);

  // ป้ายประเภท
  let px = X;
  if (it.kind === 'video') px += pill(ctx, px, 168, 'วิดีโอแนะนำ', COL.red, '#fff', { play: true }) + 10;
  else px += pill(ctx, px, 168, 'คำแนะนำการปฏิบัติตัว', COL.yellow, COL.deep) + 10;
  const tag = it.kind === 'guide' ? it.dept : (it.cat && !/^(ทั่วไป)$/.test(it.cat) ? it.cat : '');
  if (tag) { ctx.font = '600 22px Kanit'; if (px + ctx.measureText(tag).width + 36 <= X + maxW) pill(ctx, px, 168, tag, null, '#DCEBF7', { stroke: 'rgba(191,228,255,.55)' }); }

  // ชื่อเรื่อง (ย่อขนาดเมื่อยาว)
  let size = 64, lines;
  for (;;) {
    ctx.font = `600 ${size}px Kanit`;
    lines = wrap(ctx, it.title, maxW, size > 50 ? 2 : 3);
    if (!lines.some(l => l.endsWith('…')) || size <= 46) break;
    size -= 6;
  }
  for (const s2 of [58, 54]) { // ถ้าย่อเล็กน้อยแล้วใช้บรรทัดน้อยลง (ไม่เหลือคำเดียวค้างบรรทัดล่าง) ใช้ขนาดนั้น
    if (s2 >= size) {
      ctx.font = `600 ${s2}px Kanit`;
      const l2 = wrap(ctx, it.title, maxW, 2);
      if (l2.length < lines.length && !l2.some(l => l.endsWith('…'))) { size = s2; lines = l2; break; }
    }
  }
  let y = 252 + size * 0.75;
  ctx.fillStyle = '#fff';
  for (const l of lines) { ctx.fillText(l, X, y); y += size * 1.28; }

  // คำอธิบาย
  const room = Math.max(0, Math.floor((500 - y + 10) / 38));
  if (it.desc && room) {
    ctx.font = '400 27px Kanit'; ctx.fillStyle = '#D3E7F5';
    y += 4;
    for (const l of wrap(ctx, it.desc, maxW, Math.min(2, room))) { ctx.fillText(l, X, y); y += 38; }
  }

  // ผู้จัดทำ + เว็บไซต์
  const by = names(it.by).join(', ');
  if (by) {
    ctx.font = '600 22px Kanit'; ctx.fillStyle = COL.yellow; ctx.fillText('ผู้จัดทำ', X, 552);
    const lw = ctx.measureText('ผู้จัดทำ').width + 12;
    ctx.font = '400 22px Kanit'; ctx.fillStyle = '#fff';
    ctx.fillText(wrap(ctx, by, maxW - lw, 1)[0] || '', X + lw, 552);
  }
  ctx.font = '400 18px Kanit'; ctx.fillStyle = 'rgba(191,228,255,.75)';
  ctx.fillText(SITE.replace(/^https?:\/\//, '').replace(/\/$/, ''), X, 588);

  // กรอบ
  rrect(ctx, 16, 16, W - 32, H - 32, 26); ctx.strokeStyle = 'rgba(255,200,0,.9)'; ctx.lineWidth = 3; ctx.stroke();
  return cv.encode('jpeg', 88);
}

/* ---------- ทำงาน ---------- */
await mkdir(OUT, { recursive: true });
let changed = 0;

// 1) อัลบั้มกิจกรรม (เหมือนเดิม)
const rows = await loadRows();
let albums = buildAlbums(rows);
try { // แท็บ 5ส. ไม่บังคับ: โหลดไม่ได้ก็สร้างเฉพาะข่าวสาร (และไม่ลบหน้า 5ส. เดิม)
  albums = albums.concat(buildAlbums(await loadRows(TAB_5S, process.env.GVIZ_FILE_5S), 's'));
} catch (e) {
  console.log('ข้าม 5ส.: ' + e.message);
  for (const f of await readdir(OUT).catch(() => [])) if (/^s[a-z0-9]+\.html$/.test(f)) albums.push({ keep: f });
}
const keep = new Set();
for (const a of albums) {
  if (a.keep) { keep.add(a.keep); continue; }
  keep.add(a.id + '.html');
  if (await writeIfChanged(`${OUT}/${a.id}.html`, albumPage(a))) changed++;
}
for (const f of await readdir(OUT)) {
  if (!/^[as][a-z0-9]+\.html$/.test(f) || keep.has(f)) continue;
  if (await writeIfChanged(`${OUT}/${f}`, retiredPage(f.replace(/\.html$/, '')))) changed++;
}
await writeIfChanged(`${OUT}/index.html`, page({
  title: 'กิจกรรม | ' + ORG, desc: 'ข่าวสารและภาพกิจกรรมของ' + ORG, image: SITE + 'og-cover.jpg',
  imageAlt: ORG, url: SITE + OUT + '/', target: '../#news'
}));

// 2) คำแนะนำรายโรค + วิดีโอแนะนำ (โหลดแท็บไม่ได้ = ข้าม และไม่แตะหน้าเดิม)
let items = null;
try {
  const videos = buildVideos(await loadRows(TAB_VIDEO, undefined, 'หัวข้อ'));
  const guides = buildGuides(await loadRows(TAB_GUIDE, undefined, 'ชื่อเรื่อง'), videos);
  items = guides.concat(videos);
} catch (e) {
  console.log('ข้ามคำแนะนำ/วิดีโอ: ' + e.message);
}
let nImg = 0;
if (items) {
  await mkdir(IMG, { recursive: true });
  let man = {};
  try { man = JSON.parse(await readFile(`${IMG}/index.json`, 'utf8')); } catch { /* ยังไม่มี */ }
  const hasCanvas = await loadCanvas();
  const imgFiles = new Set(await readdir(IMG).catch(() => []));
  const newMan = {};
  for (const it of items) {
    // ลายเซ็นข้อมูลที่ใช้วาดรูป: เปลี่ยนเมื่อไหร่ค่อยวาดใหม่ (และลิงก์รูปเปลี่ยน ให้ Facebook/LINE ดึงรูปใหม่)
    const sig = hashId(JSON.stringify([DESIGN, it.kind, it.title, it.desc, it.dept || it.cat, it.points || '', it.by, it.media && it.media.id, SITE]));
    let img = '';
    if (hasCanvas) {
      const prev = man[it.id], file = `${IMG}/${it.id}.jpg`, needPhoto = !!(it.media && (it.kind === 'video' || !it.points.length));
      if (prev && prev.split(':')[0] === sig && !prev.endsWith(':retry') && imgFiles.has(it.id + '.jpg')) img = sig;
      else {
        const photo = needPhoto ? await fetchImage(it.media.thumbs) : null;
        if (needPhoto && !photo && prev && prev.split(':')[0] === sig && imgFiles.has(it.id + '.jpg')) {
          img = sig; // ดึงภาพไม่ได้รอบนี้ ใช้รูปเดิมไปก่อน
        } else {
          if (await writeIfChanged(file, await renderFrame(it, photo))) changed++;
          img = sig; nImg++;
        }
        if (needPhoto && !photo) newMan[it.id] = sig + ':retry'; // ได้รูปไม่มีภาพ ลองดึงภาพใหม่รอบหน้า
      }
      if (!newMan[it.id]) newMan[it.id] = sig;
    }
    if (await writeIfChanged(`${OUT}/${it.id}.html`, itemPage(it, img))) changed++;
  }
  // เรื่องที่ถูกซ่อน/ลบ: หน้าแชร์เหลือแค่ลิงก์ไปส่วนคำแนะนำ และลบรูปเดิม
  const live = new Set(items.map(it => it.id));
  for (const f of await readdir(OUT)) {
    const m = f.match(/^([gv][a-z0-9]+)\.html$/);
    if (!m || live.has(m[1])) continue;
    if (await writeIfChanged(`${OUT}/${f}`, retiredPage(m[1]))) changed++;
  }
  for (const f of await readdir(IMG)) {
    const m = f.match(/^([gv][a-z0-9]+)\.jpg$/);
    if (m && !live.has(m[1])) { await rm(`${IMG}/${f}`); changed++; }
  }
  if (hasCanvas && await writeIfChanged(`${IMG}/index.json`, JSON.stringify(newMan, null, 1) + '\n')) changed++;
}

console.log(`อัลบั้ม ${albums.filter(a => !a.keep).length} · คำแนะนำ/วิดีโอ ${items ? items.length : '-'} · วาดรูปใหม่ ${nImg} · ไฟล์ที่เปลี่ยน ${changed}`);
