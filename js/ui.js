// ตัวช่วยสร้าง HTML และแจ้งเตือน

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ปุ่มตัวเลือกแบบชิป แตะซ้ำเพื่อล้างค่า (กลับเป็น "ยังไม่ระบุ")
export function chips(act, field, options, current, { cls = '' } = {}) {
  return `<div class="chips ${cls}">${options.map((o) =>
    `<button type="button" class="chip${o.v === current ? ' on' : ''}" data-act="${act}" data-field="${esc(field)}" data-v="${esc(o.v)}" aria-pressed="${o.v === current}">${esc(o.th)}</button>`,
  ).join('')}</div>`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

let toastTimer;
export function toast(msg, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" id="toast-act">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) document.getElementById('toast-act').onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2200);
}

export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function header(title, { back = '#/', sub = '' } = {}) {
  return `<header class="bar">
    <a class="back" href="${esc(back)}" aria-label="กลับ">‹</a>
    <div class="bar-title"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <a href="#/account" class="sync-pill" data-sync hidden></a>
  </header>`;
}
