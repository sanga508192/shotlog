import * as st from '../state.js';
import * as cloud from '../cloud.js';
import * as sync from '../sync.js';
import { esc, header, toast, fmtDate } from '../ui.js';

const STORE_TH = {
  rounds: 'รอบ', holes: 'หลุม', shots: 'ช็อต', penalties: 'สโตรกปรับ', clubs: 'ไม้',
  practice: 'บันทึกซ้อม', userCourses: 'สนามที่เพิ่มเอง', favorites: 'สนามโปรด', settings: 'ค่าตั้ง',
};

// ---------- ป้ายสถานะซิงก์ (แสดงบนทุกหน้า) ----------

export function syncBadge(s) {
  if (!cloud.enabled()) return null;
  if (!cloud.session()) {
    return sync.linkedOwner() ? { text: '☁ เข้าสู่ระบบเพื่อซิงก์', cls: 'warn' } : null;
  }
  if (s.conflicts) return { text: `⚠ ข้อมูลชนกัน ${s.conflicts}`, cls: 'warn' };
  switch (s.phase) {
    case 'syncing': return { text: '⟳ กำลังซิงก์', cls: '' };
    case 'needs_plan': return { text: '☁ ต้องเป็นสมาชิก', cls: 'warn' };
    case 'offline': return { text: `📴 ออฟไลน์ · รอซิงก์ ${s.pending}`, cls: '' };
    case 'error': return { text: '⚠ ซิงก์ไม่สำเร็จ', cls: 'warn' };
    default:
      return s.pending ? { text: `⏳ รอซิงก์ ${s.pending}`, cls: '' } : { text: '☁ ซิงก์แล้ว', cls: 'ok' };
  }
}

export function paintSync(s = sync.status()) {
  const b = syncBadge(s);
  for (const el of document.querySelectorAll('[data-sync]')) {
    el.hidden = !b;
    if (!b) continue;
    el.textContent = b.text;
    el.className = `sync-pill ${b.cls}`;
  }
}

// ---------- อธิบายรายการที่ชนกัน ----------

function context(store, rec) {
  if (!rec) return '';
  if (store === 'shots' || store === 'penalties') {
    const h = st.S.holes.get(rec.hole_id);
    const r = st.S.rounds.get(rec.round_id);
    return [r && `${fmtDate(r.played_at)} ${r.course_name_snapshot}`, h && `หลุม ${h.number}`, rec.sequence && `ช็อต ${rec.sequence}`].filter(Boolean).join(' · ');
  }
  if (store === 'holes') {
    const r = st.S.rounds.get(rec.round_id);
    return [r && `${fmtDate(r.played_at)} ${r.course_name_snapshot}`, `หลุม ${rec.number}`].filter(Boolean).join(' · ');
  }
  if (store === 'rounds') return `${fmtDate(rec.played_at)} ${rec.course_name_snapshot}`;
  return rec.label || rec.display_name_th || rec.topic || rec.key || '';
}

const show = (v) => (v == null || v === '' ? 'ยังไม่ระบุ' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function conflictCard(c) {
  const local = st.S[c.store].get(c.id) ?? null;
  const server = c.server_deleted ? null : c.server_data;
  let diff;
  if (!local) diff = '<li>เครื่องนี้: ลบแล้ว</li>';
  else if (!server) diff = '<li>คลาวด์: ลบแล้ว</li>';
  else {
    const keys = [...new Set([...Object.keys(local), ...Object.keys(server)])]
      .filter((k) => k !== 'updated_at' && JSON.stringify(local[k] ?? null) !== JSON.stringify(server[k] ?? null));
    diff = keys.slice(0, 6).map((k) => `<li><code>${esc(k)}</code> เครื่องนี้: <b>${esc(show(local[k]))}</b> · คลาวด์: <b>${esc(show(server[k]))}</b></li>`).join('');
  }
  return `<div class="card">
    <strong>${esc(STORE_TH[c.store] || c.store)}</strong> <span class="small muted">${esc(context(c.store, local || server))}</span>
    <ul class="small diff">${diff}</ul>
    <div class="row gap">
      <button type="button" class="btn" data-act="resolve" data-key="${esc(c.key)}" data-v="local">ใช้ของเครื่องนี้</button>
      <button type="button" class="btn" data-act="resolve" data-key="${esc(c.key)}" data-v="server">ใช้ของคลาวด์</button>
    </div>
  </div>`;
}

// ---------- หน้าบัญชี ----------

const form = { step: 'email', email: '', consent: false, busy: false };

function signedOutHtml() {
  if (form.step === 'code') {
    return `<form class="card" data-submit="verify">
      <p>ส่งรหัสไปที่ <b>${esc(form.email)}</b> แล้ว กรอกรหัสจากอีเมล</p>
      <input class="input code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="รหัสจากอีเมล">
      <button class="btn primary big block" ${form.busy ? 'disabled' : ''}>ยืนยันและเข้าสู่ระบบ</button>
      <div class="row gap"><button type="button" class="mini" data-act="resend">ส่งรหัสใหม่</button><button type="button" class="mini" data-act="changeEmail">เปลี่ยนอีเมล</button></div>
    </form>`;
  }
  return `<div class="card small">
      <b>สำรองและซิงก์บนคลาวด์</b>
      <ul>
        <li>ข้อมูลไม่หายเมื่อเปลี่ยนหรือทำมือถือหาย</li>
        <li>ใช้บัญชีเดียวกันได้หลายเครื่อง</li>
        <li>ยังจดแบบออฟไลน์ได้เหมือนเดิม เมื่อมีสัญญาณจะซิงก์ให้เอง</li>
      </ul>
    </div>
    <form class="card" data-submit="sendCode">
      <label>อีเมล<input class="input" type="email" name="email" autocomplete="email" required value="${esc(form.email)}"></label>
      <label class="check consent"><input type="checkbox" name="consent" ${form.consent ? 'checked' : ''} required>
        <span>ยินยอมให้ ShotLog เก็บข้อมูลรอบ ช็อต และบันทึกซ้อมของฉันบนเซิร์ฟเวอร์ (Supabase) เพื่อสำรองและซิงก์ ข้อมูลใช้เพื่อให้บริการนี้เท่านั้น และลบบัญชีพร้อมข้อมูลได้ทุกเมื่อจากหน้านี้</span></label>
      <button class="btn primary big block" ${form.busy ? 'disabled' : ''}>ส่งรหัสเข้าอีเมล</button>
    </form>
    <p class="note">ไม่ต้องตั้งรหัสผ่าน ระบบส่งรหัสใช้ครั้งเดียวทางอีเมลทุกครั้งที่เข้าสู่ระบบ</p>`;
}

function signedInHtml(s) {
  const sess = cloud.session();
  const conflicts = [...st.S.conflicts.values()];
  const phaseText = {
    idle: 'ยังไม่ได้ซิงก์', syncing: 'กำลังซิงก์…', ok: 'ซิงก์แล้ว', offline: 'ออฟไลน์ — จะซิงก์เมื่อมีสัญญาณ',
    needs_plan: 'ต้องเป็นสมาชิกจึงจะซิงก์ได้ (ข้อมูลยังบันทึกในเครื่องตามปกติ)',
    signed_out: 'หมดเวลาเข้าสู่ระบบ', error: `ซิงก์ไม่สำเร็จ: ${s.error?.message || ''}`,
  }[s.phase] || s.phase;
  return `<div class="card">
      <div class="small muted">เข้าสู่ระบบเป็น</div><div><b>${esc(sess.user.email)}</b></div>
      <div class="small">${esc(phaseText)}</div>
      <div class="small muted">รอส่งขึ้นคลาวด์ ${s.pending} รายการ · ซิงก์ล่าสุด ${s.lastSync ? esc(new Date(s.lastSync).toLocaleString('th-TH')) : '–'}</div>
    </div>
    <button type="button" class="btn primary block" data-act="syncNow">ซิงก์ตอนนี้</button>
    ${conflicts.length ? `<h2>ข้อมูลที่แก้ชนกัน (${conflicts.length})</h2>
      <p class="note">รายการเหล่านี้ถูกแก้ทั้งในเครื่องนี้และจากอีกเครื่อง ระบบยังไม่เขียนทับฝั่งใด เลือกว่าจะใช้ฉบับไหน</p>
      ${conflicts.map(conflictCard).join('')}` : ''}
    <h2>ออกจากระบบ</h2>
    <button type="button" class="btn block" data-act="signOut">ออกจากระบบ (เก็บข้อมูลไว้ในเครื่อง)</button>
    <button type="button" class="btn block" data-act="signOutWipe">ออกจากระบบและลบข้อมูลในเครื่องนี้</button>
    <p class="note">ใช้แบบลบข้อมูลเมื่อเป็นเครื่องที่ใช้ร่วมกับคนอื่น ข้อมูลที่ซิงก์แล้วยังอยู่บนคลาวด์</p>
    <h2>ลบบัญชี</h2>
    <button type="button" class="btn danger block" data-act="deleteAccount">ลบบัญชีและข้อมูลทั้งหมดบนคลาวด์</button>
    <p class="note">ข้อมูลในเครื่องนี้ยังอยู่ และใช้แบบไม่มีบัญชีต่อได้</p>`;
}

export function accountView(_p, ctx) {
  const s = sync.status();
  let body;
  if (!cloud.enabled()) {
    body = '<div class="card">บริการสำรองบนคลาวด์ยังไม่เปิดในรุ่นนี้ ข้อมูลของคุณเก็บในเครื่องนี้ และส่งออกเป็นไฟล์สำรองได้ที่หน้าตั้งค่า</div>';
  } else {
    body = cloud.session() ? signedInHtml(s) : signedOutHtml();
  }

  const busy = async (fn) => {
    if (form.busy) return;
    form.busy = true;
    ctx.rerender();
    try { await fn(); } catch (err) { toast(thaiError(err)); } finally { form.busy = false; ctx.rerender(); }
  };

  const unsubscribe = sync.onStatus(() => { if (location.hash === '#/account') ctx.rerender(); });

  return {
    html: `${header('บัญชีและคลาวด์')}<div class="page">${body}</div>`,
    unmount: unsubscribe,
    actions: {
      sendCode: (f) => busy(async () => {
        form.email = f.email.value.trim().toLowerCase();
        form.consent = f.consent.checked;
        await cloud.sendCode(form.email);
        form.step = 'code';
        toast('ส่งรหัสแล้ว ตรวจดูอีเมล (รวมถึงโฟลเดอร์สแปม)');
      }),
      resend: () => busy(async () => { await cloud.sendCode(form.email); toast('ส่งรหัสใหม่แล้ว'); }),
      changeEmail: () => { form.step = 'email'; ctx.rerender(); },
      verify: (f) => busy(async () => {
        const sess = await cloud.verifyCode(form.email, f.code.value.trim());
        const owner = sync.linkedOwner();
        if (owner && owner !== sess.user.id) {
          const pending = st.S.outbox.size;
          const ok = confirm(`ข้อมูลในเครื่องนี้เป็นของบัญชีอื่น${pending ? ` (มี ${pending} รายการที่ยังไม่ได้ซิงก์ และจะหายไป)` : ''}\nต้องลบข้อมูลในเครื่องก่อนเข้าสู่ระบบบัญชีนี้ ดำเนินการต่อ?`);
          if (!ok) return;
          await sync.wipeLocal();
        }
        await cloud.saveSession(sess);
        form.step = 'email';
        toast('เข้าสู่ระบบแล้ว กำลังซิงก์…');
        await sync.link(sess.user.id).catch(() => {});
      }),
      syncNow: async () => {
        try { await sync.syncNow(); toast('ซิงก์แล้ว'); } catch (err) { toast(thaiError(err)); }
      },
      resolve: async (el) => { await sync.resolveConflict(el.dataset.key, el.dataset.v); ctx.rerender(); },
      signOut: async () => {
        const n = st.S.outbox.size;
        if (n && !confirm(`ยังมี ${n} รายการที่ยังไม่ขึ้นคลาวด์ จะเก็บไว้ในเครื่อง และส่งขึ้นเมื่อเข้าสู่ระบบบัญชีนี้อีกครั้ง ออกจากระบบ?`)) return;
        await cloud.signOut();
        toast('ออกจากระบบแล้ว ข้อมูลยังอยู่ในเครื่อง');
        ctx.rerender();
      },
      signOutWipe: async () => {
        const n = st.S.outbox.size;
        if (!confirm(`ลบข้อมูลทั้งหมดในเครื่องนี้และออกจากระบบ?${n ? `\nมี ${n} รายการที่ยังไม่ขึ้นคลาวด์ จะหายไป` : ''}`)) return;
        await cloud.signOut();
        await sync.wipeLocal();
        toast('ลบข้อมูลในเครื่องและออกจากระบบแล้ว');
        ctx.go('#/');
      },
      deleteAccount: async () => {
        const typed = prompt('ลบบัญชีและข้อมูลบนคลาวด์ถาวร กู้คืนไม่ได้\nพิมพ์คำว่า ลบบัญชี เพื่อยืนยัน');
        if (typed?.trim() !== 'ลบบัญชี') return;
        try {
          await cloud.deleteAccount();
        } catch (err) {
          toast(thaiError(err));
          return;
        }
        await sync.detachKeepData();
        toast('ลบบัญชีแล้ว ข้อมูลในเครื่องยังอยู่');
        ctx.rerender();
      },
    },
  };
}

export function thaiError(err) {
  const m = String(err?.message || err);
  if (err instanceof TypeError || /fetch|network/i.test(m)) return 'เชื่อมต่อไม่ได้ ตรวจสอบสัญญาณแล้วลองใหม่';
  if (/token.*(expired|invalid)|otp_expired|invalid.*otp/i.test(m + (err?.code || ''))) return 'รหัสไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่';
  if (err?.status === 429 || /rate limit|security purposes/i.test(m)) return 'ขอรหัสถี่เกินไป รอสักครู่แล้วลองใหม่';
  if (err?.status === 403) return 'ต้องเป็นสมาชิกจึงจะใช้บริการคลาวด์ได้';
  return `ไม่สำเร็จ: ${m}`;
}
