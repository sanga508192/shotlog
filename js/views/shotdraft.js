// ร่างช็อตของหน้าจดช็อต (อยู่ข้ามการ render): สถานะ การสร้างร่างใหม่ และไม้ที่ใช้บ่อย
import * as st from '../state.js';
import { PENALTY_ENDS } from '../constants.js';
import { suggestShotType } from '../logic.js';

// ---------- สถานะฟอร์มจดช็อต ----------
export const d = {
  F: null,   // ร่างช็อต
  mode: 'new',   // new | edit | insert
  typeTouched: false,
  details: false,
  saving: false,
  pen: null,   // ร่างสโตรกปรับ
  relief: null,   // ช็อตที่ลูกลงน้ำ/OB/หาย/เล่นไม่ได้: ตีต่อแบบไหน (RELIEFS)
  hint: '',   // เหตุผลของไม้ที่แนะนำ (แสดงอย่างเดียว ไม่บันทึก)
  suggestedFor: null,   // ร่างที่แนะนำไม้ไปแล้ว
  suggestedAt: null,   // ตำแหน่งตอนแนะนำ (เดินไปที่ลูกแล้ว → แนะนำใหม่ ถ้าผู้ใช้ยังไม่ได้เลือกเอง)
  clubTouched: false,   // ผู้ใช้เลือกไม้เอง → ไม่แนะนำทับ
  draftType: null,   // ประเภทช็อตที่ระบบเสนอตอนสร้างร่าง (ใช้คืนค่าเมื่อไม่มีไม้แนะนำ)
  puttDist: null,
  noteOpen: false,   // เปิดช่องหมายเหตุ (ปิดไว้ให้ฟอร์มสั้นลง)   // ระยะพัตแรกของปุ่มจบหลุมด้วยพัต
};

// ไม้ที่ใช้บ่อยที่สุดในช็อตแบบนี้ (รอบที่จดรายช็อต 15 รอบล่าสุด) เฉพาะไม้ที่ยังอยู่ในกระเป๋า
export function usualClub(pick) {
  const inBag = new Set(st.bagClubs().map((c) => c.id));
  const count = new Map();
  for (const r of st.rounds().filter((x) => x.shot_logging !== false).slice(0, 15)) {
    for (const h of st.holesOf(r.id)) {
      for (const s of st.shotsOf(h.id)) {
        if (s.club_id && inBag.has(s.club_id) && pick(s, h)) count.set(s.club_id, (count.get(s.club_id) || 0) + 1);
      }
    }
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// วิธีตีต่อที่เก็บไว้กับสโตรกปรับอัตโนมัติของช็อตนั้น
export const reliefOf = (holeId, shotId) => st.penaltiesOf(holeId).find((p) => p.related_shot_id_optional === shotId && p.auto)?.relief ?? null;
export const rehitAfter = (holeId, prev) => !!prev && !!PENALTY_ENDS[prev.end_lie] && reliefOf(holeId, prev.id) === 'rehit';

// ช็อตถัดไปตีจากไหน: ตีใหม่จากจุดเดิม = จุดเริ่มเดิม · ดรอปหลังลงน้ำ/OB = ยังไม่รู้ (เลือกเองในรายละเอียด)
function nextStart(prev, rehit) {
  if (!prev || prev.end_lie === 'holed') return null;
  if (PENALTY_ENDS[prev.end_lie]) return rehit ? prev.start_lie ?? null : null;
  return prev.end_lie ?? null;
}

export function blankShot(round, hole, seq, prev) {
  const rehit = rehitAfter(hole.id, prev);
  const sug = suggestShotType({ seq, prev, clubCategory: null, rehit });
  return {
    id: st.uid(), round_id: round.id, hole_id: hole.id, sequence: seq,
    // พัต = พัตเตอร์ให้เลย (ไม่ต้องแตะเลือกไม้ทุกพัต)
    club_id: rehit ? prev.club_id ?? null : sug === 'putt' ? st.bagClubs().find((c) => c.category === 'putter')?.id ?? null : null,
    shot_type: sug, assessment: null,
    contact: null, direction: null, distance_result: null, target_result: null,
    start_lie: seq === 1 ? 'tee' : nextStart(prev, rehit),
    end_lie: null, distance_before: null, distance_after: null,
    distance_unit: round.distance_unit, measurement_method: null, raw_distance_text: '',
    target: null, target_text: '', note: '', holed: false, counted: true, not_counted_reason: '',
  };
}

export function resetDraft(round, hole, at = null) {
  const shots = st.shotsOf(hole.id);
  const seq = at ?? shots.length + 1;
  const prev = shots.filter((s) => s.sequence < seq).at(-1) ?? null;
  d.F = blankShot(round, hole, seq, prev);
  d.mode = at ? 'insert' : 'new';
  d.typeTouched = false;
  d.details = false;
  d.relief = null;
  d.hint = '';
  d.suggestedFor = null;
  d.suggestedAt = null;
  d.clubTouched = false;
  d.draftType = d.F.shot_type;
  d.puttDist = null;
  d.noteOpen = false;
}
