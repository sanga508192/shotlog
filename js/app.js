import * as st from './state.js';
import { toast } from './ui.js';
import { homeView, historyView, coursesView, newRoundView } from './views/main.js';
import { holeView, scorecardView } from './views/round.js';
import { summaryView, practiceView, practiceNewView } from './views/insights.js';
import { settingsView } from './views/settings.js';

const routes = [
  [/^#?\/?$/, homeView],
  [/^#\/history$/, historyView],
  [/^#\/courses$/, coursesView],
  [/^#\/new\/([^/?]+)$/, newRoundView],
  [/^#\/round\/([^/]+)\/hole\/(\d+)$/, holeView],
  [/^#\/round\/([^/]+)\/card$/, scorecardView],
  [/^#\/round\/([^/]+)\/summary$/, summaryView],
  [/^#\/summary$/, summaryView],
  [/^#\/practice$/, practiceView],
  [/^#\/practice\/new(?:\?(.*))?$/, practiceNewView],
  [/^#\/settings$/, settingsView],
];

const root = document.getElementById('app');
let current = null;
let lastHash = null;

export const ctx = {
  rerender: () => render(false),
  go: (hash) => {
    if (location.hash === hash) render(true);
    else location.hash = hash;
  },
};

function render(scrollTop) {
  const hash = location.hash || '#/';
  let view = null, params = [];
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) { view = fn; params = m.slice(1).map((p) => (p == null ? p : decodeURIComponent(p))); break; }
  }
  if (!view) { location.hash = '#/'; return; }
  const y = window.scrollY;
  current = view(params, ctx);
  root.innerHTML = current.html;
  current.mount?.(root);
  if (scrollTop || hash !== lastHash) window.scrollTo(0, 0);
  else window.scrollTo(0, y);
  lastHash = hash;
}

async function dispatch(name, el, ev) {
  const fn = current?.actions?.[name];
  if (!fn) return;
  try {
    await fn(el, ev);
  } catch (err) {
    console.error(err);
    toast(`เกิดข้อผิดพลาด: ${err.message || err}`);
  }
}

root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  ev.preventDefault();
  dispatch(el.dataset.act, el, ev);
});
for (const type of ['input', 'change']) {
  root.addEventListener(type, (ev) => {
    const el = ev.target.closest(`[data-${type}]`);
    if (el) dispatch(el.dataset[type], el, ev);
  });
}
root.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-submit]');
  if (!form) return;
  ev.preventDefault();
  dispatch(form.dataset.submit, form, ev);
});

window.addEventListener('hashchange', () => render(true));

function updateOnline() {
  document.getElementById('net').hidden = navigator.onLine;
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

async function start() {
  try {
    await st.load();
  } catch (err) {
    root.innerHTML = `<div class="page"><div class="card warn">เปิดฐานข้อมูลในเครื่องไม่ได้: ${String(err.message || err)}<br>ลองปิดแท็บอื่นของแอปแล้วเปิดใหม่ หรือปิดโหมดไม่ระบุตัวตน</div></div>`;
    return;
  }
  updateOnline();
  render(true);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
}

start();
