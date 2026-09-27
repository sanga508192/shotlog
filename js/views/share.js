// หน้าตัวอย่างรูปสกอร์การ์ดก่อนแชร์: เลือกแนวนอน 16:9 / แนวตั้ง ใส่รูปก๊วนได้ แอปจำแบบที่เลือกล่าสุด
import * as st from '../state.js';
import { esc, header, toast } from '../ui.js';
import { LAYOUTS, renderScorecard, shareBlob, saveBlob } from '../share.js';
import { scorecardData } from './group.js';

// รูปก๊วนเก็บไว้ในหน่วยความจำระหว่างเปิดแอปเท่านั้น ไม่บันทึกลงเครื่องหรือคลาวด์
const photos = new Map();

async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น');
  }
  return { img, url };
}

function dropPhoto(roundId) {
  const ph = photos.get(roundId);
  if (ph) URL.revokeObjectURL(ph.url);
  photos.delete(roundId);
}

export function shareView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  let layout = st.setting('share_layout', 'landscape');
  if (!LAYOUTS.some((o) => o.v === layout)) layout = 'landscape';
  const ph = photos.get(roundId) ?? null;
  let img = null;          // { blob, url }
  let root = null;
  let seq = 0;
  let alive = true;
  const fileName = () => `scorecard-${round.played_at}-${layout}.${img?.blob.type === 'image/jpeg' ? 'jpg' : 'png'}`;

  const setBusy = (busy) => {
    root.querySelectorAll('[data-act="share"], [data-act="save"]').forEach((b) => { b.disabled = busy; });
    root.querySelector('#share-preview').classList.toggle('loading', busy);
  };

  async function paint() {
    const my = ++seq;
    setBusy(true);
    const box = root.querySelector('#share-preview');
    box.className = `share-preview loading ${layout}`;
    try {
      const out = await renderScorecard(scorecardData(round), layout, { photo: photos.get(roundId)?.img ?? null });
      if (!alive || my !== seq) return;
      if (img) URL.revokeObjectURL(img.url);
      img = { blob: out.blob, url: URL.createObjectURL(out.blob) };
      box.innerHTML = `<img src="${img.url}" width="${out.width}" height="${out.height}" alt="ตัวอย่างรูปสกอร์การ์ด${layout === 'portrait' ? 'แนวตั้ง' : 'แนวนอน'}">`;
      root.querySelector('#share-size').textContent = `${out.width} × ${out.height} px`;
      setBusy(false);
    } catch (err) {
      if (!alive || my !== seq) return;
      box.innerHTML = `<p class="muted">สร้างรูปไม่สำเร็จ: ${esc(err.message || err)}</p>`;
    }
  }

  const ori = (v) => `<span class="ori ori-${v}" aria-hidden="true"></span>`;
  const fileInput = '<input type="file" accept="image/*" hidden data-change="photo">';
  return {
    html: `${header('แชร์สกอร์การ์ด', { back: `#/round/${roundId}/card`, sub: esc(round.course_name_snapshot) })}
    <div class="page">
      <div class="seg" role="radiogroup" aria-label="รูปแบบรูป">
        ${LAYOUTS.map((o) => `<button type="button" class="seg-btn${o.v === layout ? ' on' : ''}" role="radio" aria-checked="${o.v === layout}"
          data-act="layout" data-v="${o.v}">${ori(o.v)}${o.th}</button>`).join('')}
      </div>
      ${ph ? `<div class="card photo-pick">
          <img class="photo-thumb" src="${ph.url}" alt="รูปก๊วนที่เลือก">
          <div class="grow"><b>รูปก๊วน</b><span class="small muted">ใส่ในรูปสกอร์การ์ดเท่านั้น ไม่ได้เก็บไว้ในแอป</span></div>
          <label class="mini file-btn">เปลี่ยน${fileInput}</label>
          <button type="button" class="mini danger" data-act="photoDel">เอาออก</button>
        </div>`
    : `<label class="btn block file-btn">📷 ใส่รูปก๊วน (ไม่บังคับ)${fileInput}</label>`}
      <div id="share-preview" class="share-preview loading ${layout}"><span class="muted small">กำลังสร้างรูป…</span></div>
      <p class="note center"><span id="share-size"></span> · แนวนอน 16:9 เหมาะดูในแชตและโพสต์ แนวตั้งเหมาะกับสตอรี่</p>
      <div class="action-grid">
        <button type="button" class="btn primary" data-act="share" disabled>📤 แชร์รูปนี้</button>
        <button type="button" class="btn" data-act="save" disabled>💾 บันทึกรูป</button>
        <a class="btn" href="#/round/${roundId}/card">กลับสกอร์การ์ด</a>
      </div>
    </div>`,
    mount(el) { root = el; paint(); },
    unmount() { alive = false; if (img) URL.revokeObjectURL(img.url); },
    actions: {
      layout: async (el) => {
        if (el.dataset.v === layout) return;
        layout = el.dataset.v;
        root.querySelectorAll('.seg-btn').forEach((b) => {
          const on = b.dataset.v === layout;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', String(on));
        });
        paint();
        await st.setSetting('share_layout', layout);
      },
      photo: async (el) => {
        const file = el.files?.[0];
        if (!file) return;
        const loaded = await loadPhoto(file);
        dropPhoto(roundId);
        photos.set(roundId, loaded);
        ctx.rerender();
      },
      photoDel: () => {
        dropPhoto(roundId);
        ctx.rerender();
      },
      share: async () => {
        if (!img) return;
        const r = await shareBlob(img.blob, fileName(), `สกอร์การ์ด ${round.course_name_snapshot}`);
        if (r === 'downloaded') toast('บันทึกรูปแล้ว ส่งเข้า LINE ได้จากคลังรูป/ดาวน์โหลด');
      },
      save: () => {
        if (!img) return;
        saveBlob(img.blob, fileName());
        toast('บันทึกรูปแล้ว');
      },
    },
  };
}
