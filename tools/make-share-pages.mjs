// สร้างหน้าแชร์ของแต่ละอัลบั้มกิจกรรม: share/<รหัสอัลบั้ม>.html
// Facebook / LINE อ่านแท็ก og: จากหน้านี้ จึงขึ้นชื่อกิจกรรม + รูปปกของอัลบั้มนั้น
// คนที่กดลิงก์จะถูกพาไปยังอัลบั้มบนเว็บทันที
// ทำงานอัตโนมัติผ่าน GitHub Actions (.github/workflows/share-pages.yml) ไม่ต้องแก้ไฟล์นี้
//
// อ่านข้อมูลจากชีตเนื้อหาแท็บ "ข่าวสาร" และ "5ส-กิจกรรม" (ชีตเดียวกับที่เว็บใช้) ใช้วิธีคิดรหัสอัลบั้มแบบเดียวกับ index.html

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const SHEET_ID = '1BOz9uPOJTnbdfs0JJFXx5noSZBoh3pV5bBQ75nmyhow';
const TAB = 'ข่าวสาร';
const TAB_5S = '5ส-กิจกรรม';
const OUT = 'share';
const ORG = 'งานห้องผ่าตัด โรงพยาบาลยางตลาด';
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

/* ---------- อ่านชีต ---------- */
async function loadRows(tab = TAB, file = process.env.GVIZ_FILE) {
  let text;
  if (file) text = await readFile(file, 'utf8'); // ใช้ตอนทดสอบ
  else {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(tab)}`;
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
  }
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!j || j.status === 'error' || !j.table) throw new Error('gviz error');
  const cols = j.table.cols.map((c, i) => headKey(c.label) || ('_' + i));
  if (cols.indexOf('หัวข้อ') < 0 || cols.indexOf('แสดง') < 0) throw new Error('ไม่พบหัวคอลัมน์ของแท็บ ' + tab);
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

function page({ title, desc, image, url, target, imageAlt }) {
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
<meta property="og:image:alt" content="${attr(imageAlt)}">
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

// อัลบั้มที่ถูกซ่อน/เปลี่ยนชื่อ: เหลือแค่หน้าพาไปส่วนกิจกรรม ไม่มีชื่อหรือรูปเดิมค้างอยู่
function retiredPage(id) {
  const fives = id[0] === 's';
  return page({
    title: (fives ? 'กิจกรรม 5ส.' : 'กิจกรรม') + ' | ' + ORG,
    desc: (fives ? 'กิจกรรม 5ส. ห้องผ่าตัด ชั้น 5 ของ' : 'ข่าวสารและภาพกิจกรรมของ') + ORG,
    image: SITE + 'og-cover.jpg',
    imageAlt: ORG,
    url: SITE + OUT + '/' + id + '.html',
    target: fives ? '../#fives' : '../#news'
  });
}

async function writeIfChanged(path, html) {
  let old = null;
  try { old = await readFile(path, 'utf8'); } catch { /* ยังไม่มีไฟล์ */ }
  if (old === html) return false;
  await writeFile(path, html);
  return true;
}

const rows = await loadRows();
let albums = buildAlbums(rows);
try { // แท็บ 5ส. ไม่บังคับ: โหลดไม่ได้ก็สร้างเฉพาะข่าวสาร (และไม่ลบหน้า 5ส. เดิม)
  albums = albums.concat(buildAlbums(await loadRows(TAB_5S, process.env.GVIZ_FILE_5S), 's'));
} catch (e) {
  console.log('ข้าม 5ส.: ' + e.message);
  for (const f of await readdir(OUT).catch(() => [])) if (/^s[a-z0-9]+\.html$/.test(f)) albums.push({ keep: f });
}
await mkdir(OUT, { recursive: true });
let changed = 0;
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
console.log(`อัลบั้มบนเว็บ ${albums.filter(a => !a.keep).length} อัลบั้ม · ไฟล์ที่เปลี่ยน ${changed} ไฟล์`);
