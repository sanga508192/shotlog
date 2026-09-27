import * as st from './state.js';
import * as db from './db.js';
import { toast } from './ui.js';
import { homeView, historyView, coursesView, newRoundView } from './views/main.js';
import { holeView, scorecardView } from './views/round.js';
import { summaryView, practiceView, practiceNewView } from './views/insights.js';
import { settingsView } from './views/settings.js';
import { accountView, paintSync } from './views/account.js';
import { setupView, gamesView, parsView } from './views/group.js';
import { scanView } from './views/scan.js';
import { resumeHref } from './views/main.js';
import * as sync from './sync.js';
import * as cloud from './cloud.js';

const routes = [
  [/^#?\/?$/, homeView],
  [/^#\/history$/, historyView],
  [/^#\/courses$/, coursesView],
  [/^#\/new\/([^/?]+)$/, newRoundView],
  [/^#\/round\/([^/]+)\/hole\/(\d+)$/, holeView],
  [/^#\/round\/([^/]+)\/card$/, scorecardView],
  [/^#\/round\/([^/]+)\/setup$/, setupView],
  [/^#\/round\/([^/]+)\/games$/, gamesView],
  [/^#\/round\/([^/]+)\/pars$/, parsView],
  [/^#\/round\/([^/]+)\/summary$/, summaryView],
  [/^#\/summary$/, summaryView],
  [/^#\/practice$/, practiceView],
  [/^#\/practice\/new(?:\?(.*))?$/, practiceNewView],
  [/^#\/settings$/, settingsView],
  [/^#\/scan(?:\/([^/?]+))?$/, scanView],
  [/^#\/account(?:\?(.*))?$/, accountView],
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
  current?.unmount?.();
  current = view(params, ctx);
  root.innerHTML = current.html;
  current.mount?.(root);
  paintSync();
  updateNav(hash);
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
root.addEventListener('keydown', (ev) => {
  const el = ev.target.closest('[data-enter]');
  if (el && ev.key === 'Enter') { ev.preventDefault(); dispatch(el.dataset.enter, el, ev); }
});
root.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-submit]');
  if (!form) return;
  ev.preventDefault();
  dispatch(form.dataset.submit, form, ev);
});

window.addEventListener('hashchange', () => render(true));

// แถบเมนูล่าง: ปุ่มกลางพาไปรอบที่กำลังเล่น ถ้าไม่มีก็เริ่มรอบใหม่
function updateNav(hash) {
  const tab = hash === '#/' || hash === '' || hash.startsWith('#/history') ? 'home'
    : hash.startsWith('#/summary') || /\/summary$/.test(hash) ? 'summary'
      : hash.startsWith('#/practice') ? 'practice'
        : hash.startsWith('#/settings') || hash.startsWith('#/account') ? 'me'
          : 'play';
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const playing = st.rounds().find((r) => r.status === 'playing');
  const fab = document.querySelector('#tabbar [data-tab="play"]');
  fab.href = playing ? resumeHref(playing) : '#/courses';
  document.getElementById('fab-label').textContent = playing ? 'จดต่อ' : 'เริ่มรอบ';
  document.body.dataset.screen = /^#\/round\/[^/]+\/hole\//.test(hash) ? 'hole' : '';
}

function updateOnline() {
  document.getElementById('net').hidden = navigator.onLine;
}
window.addEventListener('online', () => { updateOnline(); sync.schedule(500); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.schedule(500); });
setInterval(() => { if (st.S.outbox.size) sync.schedule(0); }, 5 * 60 * 1000);
sync.onStatus(paintSync);
window.addEventListener('offline', updateOnline);

async function start() {
  db.events.blocked = () => {
    root.innerHTML = '<div class="page"><div class="card warn">กำลังอัปเดตแอป — ShotLog รุ่นเก่ายังเปิดอยู่ในแท็บหรือหน้าต่างอื่น ปิดหน้านั้นแล้วแอปจะเปิดต่อเอง ข้อมูลไม่หาย</div></div>';
  };
  try {
    await st.load();
  } catch (err) {
    root.innerHTML = `<div class="page"><div class="card warn">เปิดฐานข้อมูลในเครื่องไม่ได้: ${String(err.message || err)}<br>ลองปิดแท็บอื่นของแอปแล้วเปิดใหม่ หรือปิดโหมดไม่ระบุตัวตน</div></div>`;
    return;
  }
  updateOnline();
  render(true);
  if (cloud.enabled() && cloud.session() && sync.linkedOwner()) sync.syncNow().catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
}

start();
