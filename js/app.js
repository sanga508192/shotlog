import * as st from './state.js';
import * as db from './db.js';
import { toast, esc } from './ui.js';
import { logError } from './errors.js';
import { initReports } from './reports.js';
import { homeView, historyView, coursesView, newRoundView } from './views/main.js';
import { holeView, scorecardView } from './views/round.js';
import { summaryView, practiceView, practiceNewView } from './views/insights.js';
import { settingsView } from './views/settings.js';
import { accountView, paintSync } from './views/account.js';
import { setupView, gamesView, parsView } from './views/group.js';
import { scanView } from './views/scan.js';
import { shareView } from './views/share.js';
import { coachView } from './views/coach.js';
import { mapView } from './views/map.js';
import { watchLive } from './views/live.js';
import { drillsView } from './views/drills.js';
import { launchView } from './views/launch.js';
import { simGameView } from './views/simgame.js';
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
  [/^#\/round\/([^/]+)\/share$/, shareView],
  [/^#\/round\/([^/]+)\/summary$/, summaryView],
  [/^#\/summary$/, summaryView],
  [/^#\/coach$/, coachView],
  [/^#\/map\/([^/?]+)\/(\d+)(?:\?(.*))?$/, mapView],
  [/^#\/practice$/, practiceView],
  [/^#\/drills$/, drillsView],
  [/^#\/launch$/, launchView],
  [/^#\/sim-game$/, simGameView],
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

const decode = (p) => {
  if (p == null) return p;
  try { return decodeURIComponent(p); } catch { return p; }   // ลิงก์ที่เข้ารหัสผิดไม่ทำให้แอปพัง
};

// หน้าไหนพังจะแสดงหน้านี้แทนหน้าจอว่าง ข้อมูลในเครื่องไม่ได้รับผลกระทบ
function crashView(err) {
  return {
    html: `<div class="page"><div class="card warn">
      <b>เปิดหน้านี้ไม่ได้</b>
      <p class="small">ข้อมูลของคุณยังอยู่ครบในเครื่อง ลองกลับหน้าแรก หรือส่งออกไฟล์สำรองไว้ก่อนแล้วแจ้งปัญหา</p>
      <p class="small muted">${esc(err?.message || err)}</p>
      <div class="row gap"><a class="btn" href="#/">กลับหน้าแรก</a><a class="btn" href="#/settings">สำรองข้อมูล / แจ้งปัญหา</a></div>
    </div></div>`,
  };
}

function render(scrollTop) {
  const hash = location.hash || '#/';
  let view = null, params = [];
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) { view = fn; params = m.slice(1).map(decode); break; }
  }
  if (!view) { location.hash = '#/'; return; }
  const y = window.scrollY;
  try { current?.unmount?.(); } catch (err) { logError('unmount', err); }
  try {
    current = view(params, ctx);
    root.innerHTML = current.html;
    current.mount?.(root);
  } catch (err) {
    logError(`render ${hash}`, err);
    current = crashView(err);
    root.innerHTML = current.html;
  }
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
    logError(`action ${name}`, err);
    toast(`เกิดข้อผิดพลาด: ${err.message || err}`);
  }
}

window.addEventListener('error', (ev) => logError('window', ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => logError('promise', ev.reason));

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

// ซิงก์ได้ข้อมูลจากอีกเครื่อง → วาดหน้าใหม่ แต่ถ้ากำลังพิมพ์อยู่ให้รอพิมพ์เสร็จก่อน
let remotePending = false;
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
sync.onRemoteChange(() => {
  if (typing()) { remotePending = true; return; }
  render(false);
});
root.addEventListener('focusout', () => {
  if (!remotePending) return;
  setTimeout(() => { if (remotePending && !typing()) { remotePending = false; render(false); } }, 300);
});

// แถบเมนูล่าง: ปุ่มกลางพาไปรอบที่กำลังเล่น ถ้าไม่มีก็เริ่มรอบใหม่
function updateNav(hash) {
  const tab = hash === '#/' || hash === '' || hash.startsWith('#/history') ? 'home'
    : hash.startsWith('#/summary') || hash.startsWith('#/coach') || /\/summary$/.test(hash) ? 'summary'
      : hash.startsWith('#/practice') || hash.startsWith('#/drills') || hash.startsWith('#/launch') ? 'practice'
        : hash.startsWith('#/settings') || hash.startsWith('#/account') ? 'me'
          : 'play';
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const playing = st.rounds().find((r) => r.status === 'playing');
  const fab = document.querySelector('#tabbar [data-tab="play"]');
  fab.href = playing ? resumeHref(playing) : '#/courses';
  document.getElementById('fab-label').textContent = playing ? 'จดต่อ' : 'เริ่มรอบ';
  document.body.dataset.screen = /^#\/round\/[^/]+\/hole\//.test(hash) ? 'hole' : /^#\/map\//.test(hash) ? 'map' : '';
}

function updateOnline() {
  document.getElementById('net').hidden = navigator.onLine;
}
window.addEventListener('online', () => { updateOnline(); sync.schedule(500); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.schedule(500); });
setInterval(() => { if (st.S.outbox.size) sync.schedule(0); }, 5 * 60 * 1000);
sync.onStatus(paintSync);
window.addEventListener('offline', updateOnline);

// ---------- อัปเดตแอป ----------
// แอปเปิดจากไฟล์ในเครื่องก่อนเสมอ (ใช้ออฟไลน์ได้) เมื่อโหลดรุ่นใหม่เสร็จจะขึ้นแถบให้กดอัปเดต
// ไม่รีโหลดเอง เพื่อไม่ให้ช็อตที่กำลังกรอกค้างอยู่หาย
function watchUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // ติดตั้งครั้งแรก ไม่ต้องแจ้ง
    const bar = document.getElementById('update');
    if (bar) bar.hidden = false;
  });
  document.getElementById('update-btn')?.addEventListener('click', () => location.reload());
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // แอปที่ติดตั้งบน iPhone ไม่ค่อยเช็กรุ่นใหม่เอง → เช็กเมื่อกลับมาเปิดแอป (ห่างกันอย่างน้อย 30 นาที)
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 30 * 60 * 1000) return;
      last = Date.now();
      reg.update().catch(() => {});
    });
  }).catch((e) => logError('sw register', e));
}

// ---------- หลายหน้าต่าง ----------
// เปิดแอปมากกว่าหนึ่งหน้าต่าง: เมื่ออีกหน้าต่างบันทึก ให้โหลดข้อมูลใหม่ ไม่เขียนทับกันด้วยข้อมูลเก่า
function watchOtherTabs() {
  if (!('BroadcastChannel' in window)) return;
  const me = st.uid();
  const bc = new BroadcastChannel('shotlog');
  let stale = false;
  let timer = null;
  st.hooks.changed = () => bc.postMessage({ from: me });
  const refresh = async () => {
    if (!stale) return;
    stale = false;
    try { await st.load(); render(false); } catch (err) { logError('reload from other tab', err); }
  };
  bc.onmessage = (ev) => {
    if (ev.data?.from === me) return;
    stale = true;
    clearTimeout(timer);
    if (document.visibilityState === 'visible') timer = setTimeout(refresh, 400);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}

async function start() {
  // ลงทะเบียนตัวอัปเดตก่อน: ถ้ารุ่นนี้มีปัญหาตอนเปิด ก็ยังรับรุ่นแก้ไขได้
  watchUpdates();
  db.events.blocked = () => {
    root.innerHTML = '<div class="page"><div class="card warn">กำลังอัปเดตแอป — ShotLog รุ่นเก่ายังเปิดอยู่ในแท็บหรือหน้าต่างอื่น ปิดหน้านั้นแล้วแอปจะเปิดต่อเอง ข้อมูลไม่หาย</div></div>';
  };
  try {
    await st.load();
    initReports();
  } catch (err) {
    logError('load', err);
    root.innerHTML = `<div class="page"><div class="card warn">เปิดฐานข้อมูลในเครื่องไม่ได้: ${esc(err.message || err)}<br>ลองปิดแท็บอื่นของแอปแล้วเปิดใหม่ หรือปิดโหมดไม่ระบุตัวตน
      <div class="row gap"><button type="button" class="btn" id="retry-open">ลองอีกครั้ง</button></div></div></div>`;
    document.getElementById('retry-open')?.addEventListener('click', () => location.reload());
    return;
  }
  watchOtherTabs();
  watchLive();
  updateOnline();
  render(true);
  if (cloud.enabled() && cloud.session() && sync.linkedOwner()) sync.syncNow().catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

start();
