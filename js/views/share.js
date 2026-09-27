// หน้าตัวอย่างรูปสกอร์การ์ดก่อนแชร์: เลือกแนวนอน/แนวตั้ง แอปจำแบบที่เลือกล่าสุด
import * as st from '../state.js';
import { esc, header, toast } from '../ui.js';
import { LAYOUTS, renderScorecard, shareBlob, saveBlob } from '../share.js';
import { scorecardData } from './group.js';

export function shareView([roundId]) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  let layout = st.setting('share_layout', 'landscape');
  if (!LAYOUTS.some((o) => o.v === layout)) layout = 'landscape';
  let img = null;          // { blob, url }
  let root = null;
  let seq = 0;
  let alive = true;
  const fileName = () => `scorecard-${round.played_at}-${layout === 'portrait' ? 'portrait' : 'landscape'}.png`;

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
      const out = await renderScorecard(scorecardData(round), layout);
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
  return {
    html: `${header('แชร์สกอร์การ์ด', { back: `#/round/${roundId}/card`, sub: esc(round.course_name_snapshot) })}
    <div class="page">
      <div class="seg" role="radiogroup" aria-label="รูปแบบรูป">
        ${LAYOUTS.map((o) => `<button type="button" class="seg-btn${o.v === layout ? ' on' : ''}" role="radio" aria-checked="${o.v === layout}"
          data-act="layout" data-v="${o.v}">${ori(o.v)}${o.th}</button>`).join('')}
      </div>
      <div id="share-preview" class="share-preview loading ${layout}"><span class="muted small">กำลังสร้างรูป…</span></div>
      <p class="note center"><span id="share-size"></span> · แนวนอนเหมาะดูในแชต แนวตั้งเหมาะกับสตอรี่</p>
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
