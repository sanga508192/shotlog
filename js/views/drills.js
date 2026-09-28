// แบบฝึกทั้งหมดพร้อมคลิปสอน · การ์ดแบบฝึกใช้ร่วมกับหน้าโค้ชและหน้าบันทึกซ้อม
// คลิป YouTube เปิดดูในแอปด้วยตัวเล่นของ YouTube (youtube-nocookie) ลิงก์อื่นเปิดนอกแอป
import * as st from '../state.js';
import { esc, header, fmtDate, toast } from '../ui.js';
import { DRILLS, drill, drillHistory } from '../coach.js';
import { clipsOf, addClip, removeClip, parseClip, fetchMeta, searchUrl, embedUrl, thumbUrl, MAX_CLIPS } from '../clips.js';

const ext = (href) => `href="${esc(href)}" target="_blank" rel="noopener noreferrer"`;

function clipRow(drillId, c) {
  const title = c.title || (c.kind === 'youtube' ? 'คลิป YouTube' : c.host);
  const inApp = c.kind === 'youtube' && c.embed;
  const thumb = c.kind === 'youtube'
    ? `<span class="clip-thumb"><img src="${esc(thumbUrl(c.id))}" alt="" loading="lazy" referrerpolicy="no-referrer"><i aria-hidden="true">▶</i></span>`
    : '<span class="clip-thumb link" aria-hidden="true">🔗</span>';
  const body = `${thumb}<span class="clip-name"><b>${esc(title)}</b><small>${esc(inApp ? 'แตะเพื่อดูในแอป' : `เปิดใน ${c.host}`)}${c.start ? ` · เริ่มที่ ${Math.floor(c.start / 60)}:${String(c.start % 60).padStart(2, '0')}` : ''}</small></span>`;
  return `<div class="clip">
    ${inApp
    ? `<button type="button" class="clip-open" data-act="clipplay" data-drill="${esc(drillId)}" data-url="${esc(c.url)}">${body}</button>`
    : `<a class="clip-open" ${ext(c.url)}>${body}</a>`}
    <button type="button" class="clip-del" data-act="clipdel" data-drill="${esc(drillId)}" data-url="${esc(c.url)}" aria-label="ลบคลิป ${esc(title)}">✕</button>
  </div>`;
}

export function clipsHtml(d) {
  if (!d?.video) return '';
  const clips = clipsOf(d.id);
  return `<div class="clips" data-drill="${esc(d.id)}">
    <div class="clip-search">
      <span>🎬 คลิปสอน</span>
      <a class="mini" ${ext(searchUrl(d.video.th))}>ค้นใน YouTube ↗</a>
      <a class="mini" ${ext(searchUrl(d.video.en))} aria-label="ค้นคลิปภาษาอังกฤษ">EN ↗</a>
    </div>
    ${clips.map((c) => clipRow(d.id, c)).join('')}
    ${clips.length < MAX_CLIPS ? `<details class="clip-add">
      <summary>📌 เก็บคลิปที่ชอบไว้ดูซ้ำ</summary>
      <form class="clip-form" data-submit="clipadd" data-drill="${esc(d.id)}">
        <input class="input" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="วางลิงก์คลิป" required>
        <button class="mini primary">เก็บ</button>
      </form>
      <p class="note">ในแอป YouTube กด แชร์ → คัดลอกลิงก์ แล้ววางที่นี่ · ลิงก์ TikTok หรือ Facebook ก็เก็บได้ (เปิดนอกแอป) · เก็บได้ ${MAX_CLIPS} คลิปต่อแบบฝึก</p>
    </details>` : ''}
  </div>`;
}

// ตัวเล่นคลิปลอยเหนือหน้า อยู่นอก #app จึงไม่หายตอนหน้าวาดใหม่ (เช่นซิงก์ข้อมูลเข้ามา)
export function openPlayer(c) {
  document.getElementById('clip-player')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'clip-player';
  wrap.className = 'clip-modal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', c.title || 'คลิปสอน');
  wrap.innerHTML = `<div class="clip-panel">
      <div class="clip-frame"><iframe src="${esc(embedUrl(c))}" title="${esc(c.title || 'คลิปสอน')}"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="clip-bar">
        <span class="clip-title">${esc(c.title || 'คลิป YouTube')}</span>
        <a class="mini" ${ext(c.url)}>เปิดใน YouTube ↗</a>
        <button type="button" class="btn" data-close>ปิด</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const close = () => {
    wrap.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.querySelector('[data-close]').focus();
}

// วาดเฉพาะส่วนคลิปใหม่ ไม่วาดทั้งหน้า (ฟอร์มบันทึกซ้อมที่กรอกค้างไว้ไม่หาย)
function repaint(el, drillId) {
  const box = el.closest('.clips');
  const d = drill(drillId);
  if (box && d) box.outerHTML = clipsHtml(d);
}

export function clipActions() {
  return {
    clipadd: async (form) => {
      const id = form.dataset.drill;
      const c = parseClip(form.url.value);
      if (!c) { toast('ลิงก์ไม่ถูกต้อง วางลิงก์ที่ขึ้นต้นด้วย https://'); return; }
      if (clipsOf(id).some((x) => x.url === c.url)) { toast('มีคลิปนี้แล้ว'); return; }
      const btn = form.querySelector('button');
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'กำลังเก็บ…';
      try {
        const res = await addClip(id, c, await fetchMeta(c));
        if (res === 'full') toast(`เก็บได้สูงสุด ${MAX_CLIPS} คลิปต่อแบบฝึก ลบคลิปเก่าก่อน`);
        else toast('เก็บคลิปแล้ว');
      } finally {
        repaint(form, id);
      }
    },
    clipplay: (el) => {
      const c = clipsOf(el.dataset.drill).find((x) => x.url === el.dataset.url);
      if (c) openPlayer(c);
    },
    clipdel: async (el) => {
      const id = el.dataset.drill;
      const c = clipsOf(id).find((x) => x.url === el.dataset.url);
      if (!c) return;
      const box = el.closest('.clips');
      await removeClip(id, c.url);
      repaint(el, id);
      toast('ลบคลิปแล้ว', {
        label: 'เลิกทำ',
        run: async () => {
          await addClip(id, c, c);
          const cur = [...document.querySelectorAll('.clips')].find((x) => x.dataset.drill === id) ?? box;
          if (cur?.isConnected) cur.outerHTML = clipsHtml(drill(id));
        },
      });
    },
  };
}

export function drillCard(d, { history = [], record = true } = {}) {
  const hist = history.length
    ? `<div class="drill-hist">${history.map((h) => `<span>${esc(fmtDate(h.date))} <b>${h.successes ?? '–'}/${h.attempts}</b></span>`).join('')}</div>` : '';
  return `<div class="drill" id="drill-${esc(d.id)}">
    <div class="row between"><span class="tag">${esc(d.area)}</span><span class="small muted">~${d.minutes} นาที · ${d.attempts} ลูก</span></div>
    <h3>${esc(d.name)}</h3>
    <p class="small">${esc(d.why)}</p>
    <details><summary>วิธีซ้อม</summary><ol>${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p class="small"><b>เกณฑ์:</b> ${esc(d.pass)}</p></details>
    ${hist}
    ${clipsHtml(d)}
    ${record ? `<a class="mini primary" href="#/practice/new?d=${encodeURIComponent(d.id)}">บันทึกผลซ้อม</a>` : ''}
  </div>`;
}

export function drillsView() {
  const practice = [...st.S.practice.values()];
  const areas = [...new Set(DRILLS.map((d) => d.area))];
  const saved = DRILLS.reduce((a, d) => a + clipsOf(d.id).length, 0);
  return {
    html: `${header('แบบฝึกและคลิปสอน', { back: '#/practice', sub: `${DRILLS.length} แบบฝึก${saved ? ` · เก็บคลิปไว้ ${saved} คลิป` : ''}` })}
    <div class="page">
      <p class="note">กด <b>ค้นใน YouTube</b> เพื่อหาคลิปสอนเรื่องนั้น เจอคลิปที่ชอบให้คัดลอกลิงก์มาเก็บไว้ ครั้งหน้าเปิดดูในแอปได้ทันที · แผนซ้อมที่เลือกให้คุณอยู่ในหน้า <a href="#/coach">พัฒนาเกม</a></p>
      <div class="chips drill-areas">${areas.map((a) => `<a class="chip" href="#/drills" data-act="jump" data-area="${esc(a)}">${esc(a)}</a>`).join('')}</div>
      ${areas.map((a) => `<h2 data-area-head="${esc(a)}">${esc(a)}</h2>
        <div class="drills">${DRILLS.filter((d) => d.area === a).map((d) => drillCard(d, { history: drillHistory(practice, d.id) })).join('')}</div>`).join('')}
    </div>`,
    actions: {
      ...clipActions(),
      jump: (el) => {
        const h = [...document.querySelectorAll('[data-area-head]')].find((x) => x.dataset.areaHead === el.dataset.area);
        h?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
  };
}
