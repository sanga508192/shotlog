// สกอร์บอร์ดสด: ส่งสรุปสกอร์ของรอบขึ้นเซิร์ฟเวอร์ เพื่อนเปิดลิงก์ดูได้โดยไม่ต้องลงแอป
// ลิงก์มีรหัสสุ่มยาว (เดาไม่ได้) หมดอายุ 2 วันหลังอัปเดตล่าสุด · อัปเดตเองทุกครั้งที่จดสกอร์ของรอบนั้น
import * as st from '../state.js';
import * as cloud from '../cloud.js';
import { esc, toast } from '../ui.js';
import { scorecardData } from './group.js';
import { logError } from '../errors.js';

const DEBOUNCE_MS = 4000;

export function newToken() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const liveUrl = (token) => {
  const base = globalThis.location ? location.origin + location.pathname.replace(/[^/]*$/, '') : '';
  return `${base}live.html#${token}`;
};

// สรุปสกอร์ที่ส่งขึ้นไป: ชื่อผู้เล่น สกอร์รายหลุม ผลเกม (ไม่มีข้อมูลรายช็อตหรือตำแหน่ง)
export function boardData(round) {
  const { grid, games } = scorecardData(round);
  return {
    v: 1,
    course: round.course_name_snapshot || '',
    date: round.played_at || '',
    tee: round.tee_name || '',
    holes: grid.rows.map((r) => ({ n: r.number, par: r.par })),
    players: grid.players.map((p) => {
      const t = grid.total.byPlayer[p.id];
      return {
        name: p.name,
        scores: grid.rows.map((r) => (r.cells[p.id]?.final ? r.cells[p.id].strokes : null)),
        total: t.strokes, thru: t.count, over: t.over,
      };
    }),
    games: games.map((g) => ({ title: g.title, items: g.items.map(({ name, value }) => ({ name, value })) })),
    at: st.nowIso(),
  };
}

const live = (round) => round?.live_token && (!round.live_until || Date.parse(round.live_until) > Date.now());

function friendly(err) {
  if (err?.status === 404) return 'เซิร์ฟเวอร์ยังไม่เปิดใช้สกอร์สด (ผู้ดูแลต้องอัปเดตฐานข้อมูล)';
  if (err?.status === 403 || err?.code === '42501') return 'ต้องเป็นสมาชิกจึงแชร์สกอร์สดได้';
  if (err?.status === 401) return 'เข้าสู่ระบบใหม่ก่อน';
  return err?.message || 'ส่งไม่สำเร็จ';
}

// ไม่เขียนกลับลงรอบ (กันวนส่งซ้ำ) · live_until ตั้งครั้งเดียวตอนเริ่ม = เลิกส่งเองหลัง 2 วัน
export async function publish(roundId) {
  const round = st.S.rounds.get(roundId);
  if (!live(round)) return;
  await cloud.publishBoard(round.live_token, boardData(round));
}

// จดสกอร์แล้วส่งให้เองเมื่อหยุดจดสักครู่ (เฉพาะการแก้ในเครื่องนี้ ไม่ส่งซ้ำตอนรับข้อมูลจากอีกเครื่อง)
const timers = new Map();
export function watchLive() {
  st.onCommit((ops, raw) => {
    if (raw || !cloud.enabled() || !cloud.session()) return;
    const ids = new Set();
    for (const op of ops) {
      if (!['rounds', 'holes', 'shots', 'penalties'].includes(op.store)) continue;
      if ('put' in op) {
        ids.add(op.store === 'rounds' ? op.put.id : op.put.round_id);
      } else {
        for (const r of st.S.rounds.values()) if (live(r)) ids.add(r.id);   // ลบรายการ: ไม่รู้ว่าของรอบไหน ส่งทุกรอบที่แชร์อยู่
      }
    }
    for (const id of ids) {
      if (!live(st.S.rounds.get(id))) continue;
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => {
        timers.delete(id);
        publish(id).catch((err) => logError('live board', err));
      }, DEBOUNCE_MS));
    }
  });
}

// การ์ดในหน้าสกอร์การ์ด/แชร์
export function liveCardHtml(round) {
  if (!cloud.enabled()) return '';
  const head = '<b>📡 สกอร์สดให้เพื่อนดู</b>';
  if (!cloud.session()) {
    return `<div class="card live-card">${head}<p class="small">ส่งลิงก์ให้เพื่อนหรือคนที่บ้านดูสกอร์ระหว่างเล่นได้ทันที ไม่ต้องลงแอป</p>
      <a class="mini" href="#/account">เข้าสู่ระบบเพื่อใช้ ›</a></div>`;
  }
  if (!live(round)) {
    return `<div class="card live-card">${head}<p class="small">สร้างลิงก์ให้เพื่อนดูสกอร์ทุกหลุมแบบสด อัปเดตเองทุกครั้งที่จด ลิงก์หมดอายุ 2 วันหลังจดครั้งสุดท้าย</p>
      <button type="button" class="btn primary" data-act="liveStart">เริ่มแชร์สกอร์สด</button></div>`;
  }
  const url = liveUrl(round.live_token);
  return `<div class="card live-card on">${head} <span class="badge ok">กำลังแชร์</span>
    <input class="input" readonly value="${esc(url)}" aria-label="ลิงก์สกอร์สด" data-act="liveSelect">
    <div class="row gap">
      <button type="button" class="mini primary" data-act="liveSend">ส่งให้เพื่อน</button>
      <button type="button" class="mini" data-act="liveCopy">คัดลอกลิงก์</button>
      <button type="button" class="mini danger" data-act="liveStop">หยุดแชร์</button>
    </div>
    <p class="note">ชื่อผู้เล่นและสกอร์รายหลุมเท่านั้น ไม่มีข้อมูลรายช็อตหรือตำแหน่ง</p></div>`;
}

export function liveActions(ctx, roundId) {
  const url = () => liveUrl(st.S.rounds.get(roundId)?.live_token);
  return {
    liveStart: async (el) => {
      el.disabled = true;
      try {
        await st.patch('rounds', roundId, { live_token: newToken(), live_until: new Date(Date.now() + 2 * 86400000).toISOString() });
        await publish(roundId);
        toast('เริ่มแชร์แล้ว ส่งลิงก์ให้เพื่อนได้เลย');
      } catch (err) {
        await st.patch('rounds', roundId, { live_token: null, live_until: null });
        toast(friendly(err));
      }
      ctx.rerender();
    },
    liveSelect: (el) => el.select(),
    liveCopy: async () => {
      try { await navigator.clipboard.writeText(url()); toast('คัดลอกลิงก์แล้ว'); } catch { toast('คัดลอกไม่ได้ กดค้างที่ลิงก์แล้วเลือกคัดลอก'); }
    },
    liveSend: async () => {
      const r = st.S.rounds.get(roundId);
      if (navigator.share) {
        try { await navigator.share({ title: 'สกอร์สด', text: `ดูสกอร์สด ${r?.course_name_snapshot || ''}`, url: url() }); } catch { /* ผู้ใช้ปิดหน้าต่างแชร์ */ }
      } else {
        try { await navigator.clipboard.writeText(url()); toast('คัดลอกลิงก์แล้ว วางในแชทได้เลย'); } catch { toast('กดค้างที่ลิงก์แล้วเลือกคัดลอก'); }
      }
    },
    liveStop: async () => {
      const token = st.S.rounds.get(roundId)?.live_token;
      try { if (token) await cloud.unpublishBoard(token); } catch (err) { toast(friendly(err)); return; }
      await st.patch('rounds', roundId, { live_token: null, live_until: null });
      toast('หยุดแชร์แล้ว ลิงก์เดิมใช้ไม่ได้อีก');
      ctx.rerender();
    },
  };
}
