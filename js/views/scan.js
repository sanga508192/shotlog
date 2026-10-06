// เพิ่มสนาม / สกอร์การ์ดจากรูปถ่าย: ถ่ายรูป → อ่านด้วย OCR ในเครื่อง → ผู้ใช้ตรวจแก้ในตาราง → กดบันทึก
// OCR (Tesseract.js) ฟรี ทำงานในเบราว์เซอร์ รูปไม่ถูกส่งไปไหน แต่ครั้งแรกต้องมีสัญญาณเพื่อโหลดตัวอ่าน
import * as st from '../state.js';
import { esc, header, toast } from '../ui.js';
import { ISAN_PROVINCES, findDuplicateCourse } from '../courses.js';
import { preprocess, wordsFromTsv, gridFromWords } from '../scorecard-ocr.js';
import { cardFromGrid, parseScorecardText, validateCard, filledCount, mergeCards } from '../scorecard-parse.js';
import { getPosition } from '../geo.js';
import { courseSize, setCourseSize } from './group.js';

// ล็อกรุ่นและตรวจความถูกต้องของไฟล์ (SRI) ไฟล์นี้เหมือนกับในแพ็กเกจ npm tesseract.js@7.0.0 ทุกไบต์
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const TESS_SRI = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM';

const TEE_OPTIONS = [
  ['ดำ', '#1b1b1b'], ['ทอง', '#c9a227'], ['น้ำเงิน', '#1d4ed8'], ['ขาว', '#ffffff'],
  ['เหลือง', '#f2c200'], ['เขียว', '#1f8a55'], ['แดง', '#d7263d'],
];

let sc = null;   // สถานะหน้าจอ

function blankCard(holes = 18) {
  return { holes, unit: 'yd', par: Array(holes).fill(null), hc: Array(holes).fill(null), tees: [{ name: 'ขาว', color: '#ffffff', yards: Array(holes).fill(null) }], flags: {}, warnings: [] };
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESS_URL;
    s.integrity = TESS_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('โหลดตัวอ่านรูปไม่สำเร็จ ต้องมีสัญญาณอินเทอร์เน็ตในครั้งแรก'));
    document.head.appendChild(s);
  });
}

async function fileToCanvas(file) {
  let img = null;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* ใช้ <img> แทน */ }
  if (!img) {
    img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('เปิดรูปไม่ได้'));
      i.src = URL.createObjectURL(file);
    });
  }
  const w0 = img.width, h0 = img.height;
  // รูปจากมือถือใหญ่มาก ย่อให้ด้านยาวไม่เกิน 2200px (เร็วขึ้นและพอสำหรับตัวเลขบนการ์ด)
  const scale = Math.min(2200 / Math.max(w0, h0), Math.max(1, 1400 / w0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function readCard(file, onProgress) {
  const T = await loadTesseract();
  const canvas = await fileToCanvas(file);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const img = g.getImageData(0, 0, w, h);
  const gray = preprocess(img.data, w, h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = gray[i]; img.data[j + 3] = 255; }
  g.putImageData(img, 0, 0);
  const worker = await T.createWorker('eng', 1, { logger: (m) => onProgress?.(m) });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const { data } = await worker.recognize(canvas, {}, { text: true, tsv: true });
    const byText = parseScorecardText(data.text);
    const byGrid = cardFromGrid(gridFromWords(wordsFromTsv(data.tsv)), { unit: byText.unit });
    return filledCount(byGrid) >= filledCount(byText) ? byGrid : { ...byText, flags: {} };
  } finally {
    await worker.terminate();
  }
}

const cellVal = (card, key) => {
  const [field, i] = key.split(':');
  if (field === 'par' || field === 'hc') return card[field][+i];
  return card.tees[+field.slice(3)].yards[+i];
};
const setCell = (card, key, v) => {
  const [field, i] = key.split(':');
  if (field === 'par' || field === 'hc') card[field][+i] = v;
  else card.tees[+field.slice(3)].yards[+i] = v;
  delete card.flags[key];   // ผู้ใช้แก้แล้ว → ไม่ต้องเตือนว่า OCR ไม่มั่นใจ
};

function cellHtml(card, key, v, issues) {
  const cls = [issues[key] ? 'bad' : '', card.flags[key] || ''].filter(Boolean).join(' ');
  const title = issues[key] || { low: 'OCR ไม่มั่นใจ', derived: 'คำนวณจากยอดรวมบนการ์ด', sum: 'ผลรวมไม่ตรงกับยอดบนการ์ด' }[card.flags[key]] || '';
  return `<td><input class="cell ${cls}" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${v ?? ''}" data-input="cell" data-k="${key}" title="${esc(title)}" aria-label="${key}"></td>`;
}

function summaryHtml(card) {
  const v = validateCard(card);
  const flagged = Object.keys(card.flags).length;
  const blanks = card.par.filter((x) => x == null).length;
  return `<div class="scan-sum">
    <span class="${(card.holes === 18 ? v.parTotal === 72 : card.holes === 9 ? v.parTotal === 36 : v.parTotal > 0) ? 'ok' : 'warn'}">พาร์รวม ${v.parTotal || '–'}${card.holes === 18 ? ` (${v.parFront}/${v.parBack})` : ''}</span>
    <span class="${v.hcMissing ? 'warn' : 'ok'}">HC ${card.hc.length - v.hcMissing}/${card.hc.length}</span>
    ${card.tees.map((t, i) => `<span>${esc(t.name)} ${v.teeTotals[i] ? v.teeTotals[i].toLocaleString('th-TH') : '–'}</span>`).join('')}
    ${v.count || flagged || blanks ? `<span class="warn">ควรตรวจ ${v.count + flagged} จุด${blanks ? ` · พาร์ว่าง ${blanks}` : ''}</span>` : '<span class="ok">✓ ไม่พบจุดผิดปกติ</span>'}
  </div>`;
}

function gridHtml(card) {
  const { issues } = validateCard(card);
  const rows = Array.from({ length: card.holes }, (_, i) => `<tr><th>${i + 1}</th>
    ${cellHtml(card, `par:${i}`, card.par[i], issues)}${cellHtml(card, `hc:${i}`, card.hc[i], issues)}
    ${card.tees.map((t, ti) => cellHtml(card, `tee${ti}:${i}`, t.yards[i], issues)).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="sc-grid">
    <thead><tr><th>หลุม</th><th>พาร์</th><th>HC</th>
      ${card.tees.map((t, ti) => `<th><select class="tee-sel" data-change="teeName" data-t="${ti}" aria-label="ชื่อแท่นที">
        ${[...TEE_OPTIONS.map(([n]) => n), ...(TEE_OPTIONS.some(([n]) => n === t.name) ? [] : [t.name])].map((n) => `<option${n === t.name ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select><button type="button" class="mini danger" data-act="teeDel" data-t="${ti}" aria-label="ลบแท่นนี้">✕</button></th>`).join('')}
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function scanView([courseId], ctx) {
  const existing = courseId ? st.course(courseId) : null;
  if (courseId && !existing) return { html: `${header('ไม่พบสนาม', { back: '#/courses' })}` };
  if (!sc || sc.courseId !== (courseId ?? null)) {
    const prev = courseId ? st.scorecard(courseId) : null;
    sc = {
      courseId: courseId ?? null, name: '', name_en: '', province: '', here: false,
      photos: [], busy: false, status: '', viewing: null,
      card: prev ? { holes: prev.par.length, unit: prev.unit || 'yd', par: [...prev.par], hc: [...prev.hc], tees: prev.tees.map((t) => ({ name: t.name, color: t.color, yards: [...t.yards] })), flags: {}, warnings: [] } : null,
    };
  }
  const card = sc.card;
  const refreshChecks = () => {
    const el = document.getElementById('scan-sum');
    if (el) el.innerHTML = summaryHtml(card);
    const { issues } = validateCard(card);
    document.querySelectorAll('input.cell').forEach((inp) => {
      inp.classList.toggle('bad', !!issues[inp.dataset.k]);
      ['low', 'derived', 'sum'].forEach((f) => inp.classList.toggle(f, card.flags[inp.dataset.k] === f));
    });
  };

  const html = `${header(existing ? 'สกอร์การ์ดของสนาม' : 'เพิ่มสนามจากสกอร์การ์ด', { back: existing ? `#/new/${encodeURIComponent(courseId)}` : '#/courses', sub: existing ? esc(existing.display_name_th) : '' })}
  <div class="page">
    ${existing ? '' : `<div class="card">
      <h3>1. ข้อมูลสนาม</h3>
      <label>ชื่อสนาม<input class="input" value="${esc(sc.name)}" data-input="f" data-f="name" placeholder="เช่น ... กอล์ฟคลับ"></label>
      <label>ชื่ออังกฤษ (ถ้ามี)<input class="input" value="${esc(sc.name_en)}" data-input="f" data-f="name_en"></label>
      <label>จังหวัด<input class="input" list="prov2" value="${esc(sc.province)}" data-input="f" data-f="province"></label>
      <datalist id="prov2">${ISAN_PROVINCES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="check"><input type="checkbox" data-change="here" ${sc.here ? 'checked' : ''}> 📍 ใช้ตำแหน่งปัจจุบันเป็นตำแหน่งสนาม (เมื่ออยู่ที่สนาม)</label>
    </div>`}

    <div class="card">
      <h3>${existing ? '' : '2. '}ถ่ายรูปสกอร์การ์ด</h3>
      <p class="note">ถ่ายตรง ๆ ให้เห็นตารางเต็มใบ แสงสม่ำเสมอ ไม่มีเงาหรือแสงสะท้อน ถ้าการ์ดมี 2 ด้าน (เก้าหน้า/เก้าหลัง) ถ่ายทีละด้าน แอปจะรวมให้</p>
      <div class="row gap wrap">
        <label class="btn primary file-btn">📷 ถ่ายรูป<input type="file" accept="image/*" capture="environment" hidden data-change="photos" ${sc.busy ? 'disabled' : ''}></label>
        <label class="btn file-btn">🖼 เลือกรูป<input type="file" accept="image/*" multiple hidden data-change="photos" ${sc.busy ? 'disabled' : ''}></label>
        ${card ? '' : '<button type="button" class="btn" data-act="manual">✍️ กรอกเอง</button>'}
      </div>
      ${sc.photos.length ? `<div class="thumbs">${sc.photos.map((p, i) => `<button type="button" class="thumb" data-act="view" data-i="${i}"><img src="${p.url}" alt="รูปสกอร์การ์ด ${i + 1}"></button>`).join('')}</div>` : ''}
      ${sc.status ? `<p class="scan-status">${esc(sc.status)}</p>` : ''}
      <p class="note">อ่านรูปในเครื่องด้วย Tesseract (โอเพนซอร์ส ฟรี) รูปไม่ถูกส่งหรือเก็บไว้ ครั้งแรกต้องมีสัญญาณเพื่อโหลดตัวอ่าน (ประมาณ 5–10 MB)</p>
    </div>

    ${card ? `<div class="card">
      <h3>${existing ? '' : '3. '}ตรวจและแก้ก่อนบันทึก</h3>
      <p class="note">เทียบกับรูปทีละแถว แตะช่องเพื่อแก้ · <span class="legend low">เหลือง</span> OCR ไม่มั่นใจ · <span class="legend derived">ฟ้า</span> คำนวณจากยอดรวมบนการ์ด · <span class="legend bad">แดง</span> ค่าผิดปกติ</p>
      ${card.warnings.length ? `<ul class="note warn">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div id="scan-sum">${summaryHtml(card)}</div>
      <div class="row gap wrap">
        <span class="small muted">จำนวนหลุม</span>${[8, 9, 18].map((n) => `<button type="button" class="mini${card.holes === n ? ' primary' : ''}" data-act="holes" data-v="${n}" aria-pressed="${card.holes === n}">${n}</button>`).join('')}
        <button type="button" class="mini" data-act="unit">หน่วย: ${card.unit === 'm' ? 'เมตร' : 'หลา'}</button>
        ${card.tees.length < 6 ? '<button type="button" class="mini" data-act="teeAdd">＋ แท่นที</button>' : ''}
      </div>
      ${gridHtml(card)}
    </div>
    <button type="button" class="btn primary big block" data-act="save" ${sc.busy ? 'disabled' : ''}>💾 ตรวจแล้ว บันทึก${existing ? 'สกอร์การ์ด' : 'สนาม'}</button>` : ''}
  </div>
  ${sc.viewing != null ? `<div class="photo-view" data-act="closeView"><div class="pv-scroll"><img src="${sc.photos[sc.viewing].url}" class="${sc.zoom ? 'zoom' : ''}" data-act="zoom" alt="รูปสกอร์การ์ด"></div><button type="button" class="btn" data-act="closeView">ปิด</button></div>` : ''}`;

  return {
    html,
    actions: {
      f: (el) => { sc[el.dataset.f] = el.value; },
      here: (el) => { sc.here = el.checked; },
      manual: () => { sc.card = blankCard(courseId ? courseSize(courseId) : 18); ctx.rerender(); },
      photos: async (el) => {
        const files = [...(el.files || [])];
        el.value = '';
        if (!files.length || sc.busy) return;
        sc.busy = true;
        let merged = sc.card && filledCount(sc.card) > 0 ? sc.card : null;
        try {
          for (const [n, file] of files.entries()) {
            sc.photos.push({ url: URL.createObjectURL(file) });
            sc.status = `กำลังอ่านรูป ${n + 1}/${files.length}…`;
            ctx.rerender();
            const got = await readCard(file, (m) => {
              if (m.status && typeof m.progress === 'number') {
                const label = m.status.includes('recogniz') ? 'กำลังอ่านตัวเลข' : 'กำลังเตรียมตัวอ่าน';
                const s = document.querySelector('.scan-status');
                if (s) s.textContent = `${label} ${Math.round(m.progress * 100)}% (รูป ${n + 1}/${files.length})`;
              }
            });
            merged = mergeCards(merged, got);
          }
          const filled = filledCount(merged);
          sc.card = filled ? merged : (sc.card ?? blankCard(18));
          sc.status = filled ? 'อ่านเสร็จ — ตรวจตัวเลขในตารางด้านล่างเทียบกับรูปก่อนบันทึก' : 'อ่านตัวเลขจากรูปไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น หรือกรอกเองในตาราง';
        } catch (err) {
          console.error(err);
          sc.status = `${err.message || err} — กรอกเองในตารางได้`;
          sc.card = sc.card ?? blankCard(18);
        } finally {
          sc.busy = false;
          ctx.rerender();
        }
      },
      view: (el) => { sc.viewing = Number(el.dataset.i); sc.zoom = false; ctx.rerender(); },
      zoom: (el, ev) => { ev.stopPropagation(); sc.zoom = !sc.zoom; el.classList.toggle('zoom', sc.zoom); },
      closeView: (el, ev) => { if (ev.target.closest('img')) return; sc.viewing = null; ctx.rerender(); },
      cell: (el) => {
        const raw = el.value.replace(/[^\d]/g, '');
        if (raw !== el.value) el.value = raw;
        setCell(card, el.dataset.k, raw === '' ? null : Number(raw));
        refreshChecks();
      },
      teeName: (el) => {
        const t = card.tees[+el.dataset.t];
        t.name = el.value;
        t.color = TEE_OPTIONS.find(([n]) => n === el.value)?.[1] ?? t.color;
      },
      teeDel: (el) => {
        const i = +el.dataset.t;
        if (card.tees[i].yards.some((y) => y != null) && !confirm(`ลบแถวระยะแท่น${card.tees[i].name}?`)) return;
        card.tees.splice(i, 1);
        card.flags = Object.fromEntries(Object.entries(card.flags).filter(([k]) => !k.startsWith('tee')));
        ctx.rerender();
      },
      teeAdd: () => {
        const used = new Set(card.tees.map((t) => t.name));
        const [name, color] = TEE_OPTIONS.find(([n]) => !used.has(n)) ?? ['แท่นใหม่', '#9aa4ad'];
        card.tees.push({ name, color, yards: Array(card.holes).fill(null) });
        ctx.rerender();
      },
      holes: (el) => {
        const n = Number(el.dataset.v);
        const fit = (a) => (a.length >= n ? a.slice(0, n) : [...a, ...Array(n - a.length).fill(null)]);
        if (n < card.holes && [card.par, card.hc, ...card.tees.map((t) => t.yards)].some((a) => a.slice(n).some((v) => v != null))
          && !confirm(`ข้อมูลหลุม ${n + 1}–${card.holes} จะถูกตัดออก ดำเนินการต่อ?`)) return;
        card.holes = n;
        card.par = fit(card.par); card.hc = fit(card.hc);
        card.tees.forEach((t) => { t.yards = fit(t.yards); });
        ctx.rerender();
      },
      unit: () => { card.unit = card.unit === 'm' ? 'yd' : 'm'; ctx.rerender(); },
      save: async (el) => {
        if (el.disabled) return;
        const v = validateCard(card);
        const pending = v.count + Object.keys(card.flags).length;
        if (!existing && (!sc.name.trim() || !sc.province.trim())) { toast('กรอกชื่อสนามและจังหวัดก่อน'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (!v.complete && !confirm('ยังมีหลุมที่ไม่มีพาร์ บันทึกไปก่อนแล้วค่อยเติมระหว่างเล่นได้ บันทึกเลย?')) return;
        if (pending && !confirm(`ยังมี ${pending} จุดที่ควรตรวจ (สีเหลือง/แดง) ตรวจกับรูปแล้วใช่ไหม? บันทึกเลย?`)) return;
        el.disabled = true;
        const data = {
          checked_at: st.todayLocal(), unit: card.unit, par: card.par, hc: card.hc,
          tees: card.tees.map((t, i) => ({ id: `t${i + 1}`, name: t.name, color: t.color, yards: t.yards })),
          sources: ['ผู้ใช้ถ่ายจากสกอร์การ์ดและตรวจเอง'], origin: 'user',
        };
        let id = courseId;
        if (existing) {
          if (existing.origin === 'user') await st.put('userCourses', { ...st.S.userCourses.get(id), scorecard: data });
          else await st.setSetting(`course_scorecard:${id}`, data);
        } else {
          let geo = null;
          if (sc.here) {
            try { const p = await getPosition(); geo = { lat: p.lat, lon: p.lon, source: 'ตำแหน่งที่ผู้ใช้บันทึก' }; } catch (err) { toast(`${err.message} — บันทึกโดยไม่มีตำแหน่ง`); }
          }
          const dup = findDuplicateCourse(st.allCourses(), sc.name.trim(), sc.province.trim());
          if (dup) {
            id = dup.id;
            if (dup.origin === 'user') await st.put('userCourses', { ...st.S.userCourses.get(id), scorecard: data, ...(geo ? { geo } : {}) });
            else await st.setSetting(`course_scorecard:${id}`, data);
            toast('มีสนามนี้อยู่แล้ว บันทึกสกอร์การ์ดให้สนามเดิม');
          } else {
            id = `user-${st.uid()}`;
            await st.put('userCourses', {
              id, display_name_th: sc.name.trim(), name_en: sc.name_en.trim(), aliases: [], province: sc.province.trim(),
              region: ISAN_PROVINCES.includes(sc.province.trim()) ? 'northeast' : 'other',
              source_urls: [], checked_at: null, origin: 'user', scorecard_status: 'user', created_at: st.nowIso(), geo, scorecard: data,
            });
          }
        }
        // การ์ดสั้นกว่า 18 หลุม = จำนวนหลุมของสนาม (ใช้ตอนเริ่มรอบ)
        if (card.holes < 18) await setCourseSize(id, card.holes);
        sc.photos.forEach((p) => URL.revokeObjectURL(p.url));
        sc = null;
        toast('บันทึกสกอร์การ์ดแล้ว');
        ctx.go(`#/new/${encodeURIComponent(id)}`);
      },
    },
  };
}
