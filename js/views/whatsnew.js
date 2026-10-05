// หน้ามีอะไรใหม่ และการ์ดบนหน้าแรกหลังอัปเดต
import * as st from '../state.js';
import { esc, header, fmtDate } from '../ui.js';
import { NEWS, LATEST, unseen } from '../whatsnew.js';

const itemHtml = (it) => {
  const body = `<span class="wn-icon" aria-hidden="true">${it.icon}</span><span class="wn-text"><b>${esc(it.th)}</b><small>${esc(it.sub)}</small></span>`;
  return it.href ? `<a class="wn-item" href="${it.href}">${body}<span class="wn-go" aria-hidden="true">›</span></a>` : `<div class="wn-item">${body}</div>`;
};

export function whatsNewView() {
  const seen = st.setting('news_seen', null);
  const fresh = new Set(unseen(seen).map((n) => n.v));
  return {
    html: `${header('มีอะไรใหม่', { back: '#/settings' })}
    <div class="page whats-new">
      ${NEWS.map((n) => `<section class="card wn-ver">
        <div class="row between"><b>รุ่น ${esc(n.v)}</b><span class="small muted">${esc(fmtDate(n.date))}${fresh.has(n.v) ? ' <span class="badge good">ใหม่</span>' : ''}</span></div>
        ${n.items.map(itemHtml).join('')}
      </section>`).join('')}
    </div>`,
    // เปิดหน้านี้แล้ว = เห็นครบแล้ว
    mount() { if (seen !== LATEST) st.setSetting('news_seen', LATEST); },
  };
}

// การ์ดหน้าแรก: เฉพาะคนที่ใช้แอปมาก่อน (มีรอบหรือการซ้อม) และยังไม่เห็นรุ่นล่าสุด
export function whatsNewCard() {
  const list = unseen(st.setting('news_seen', null));
  if (!list.length || (!st.S.rounds.size && !st.S.practice.size)) return '';
  const items = list.flatMap((n) => n.items).slice(0, 3);
  const more = list.flatMap((n) => n.items).length - items.length;
  return `<section class="card wn-card">
    <div class="row between"><b>✨ มีอะไรใหม่ในรุ่น ${esc(LATEST)}</b><button type="button" class="mini" data-act="newsSeen">รับทราบ</button></div>
    ${items.map(itemHtml).join('')}
    <a class="linklike" href="#/whats-new">ดูทั้งหมด${more > 0 ? ` (อีก ${more} อย่าง)` : ''} ›</a>
  </section>`;
}

export const markNewsSeen = () => st.setSetting('news_seen', LATEST);
