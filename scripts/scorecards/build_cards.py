# สร้าง js/scorecards.js จากข้อมูลดิบใน cards_raw.py พร้อมตรวจ (พาร์ 72, HC ไม่ซ้ำ, ยอดรวมตรงกับการ์ด)
# ใช้: python scripts/scorecards/build_cards.py
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from cards_raw import RAW

TEE_TH = {'Men': 'ชาย (M)', 'Ladies': 'หญิง (L)', 'BlueWhite': 'น้ำเงิน/ขาว', 'Kato': 'Kato', 'Black': 'ดำ', 'Gold': 'ทอง', 'Blue': 'น้ำเงิน', 'White': 'ขาว', 'Red': 'แดง', 'Yellow': 'เหลือง'}
TEE_COLOR = {'Men': '#1e3a8a', 'Ladies': '#3b82f6', 'BlueWhite': '#1d4ed8', 'Kato': '#8e24aa', 'Black': '#1b1b1b', 'Gold': '#c9a227', 'Blue': '#1d4ed8', 'White': '#ffffff', 'Red': '#d7263d', 'Yellow': '#f2c200'}

HC = {
    'kirimaya': [9, 13, 1, 17, 7, 3, 15, 5, 11, 10, 14, 16, 12, 4, 18, 6, 8, 2],
    'singha-park-khon-kaen': [7, 15, 3, 11, 17, 9, 1, 13, 5, 10, 6, 12, 16, 8, 18, 2, 14, 4],
    'rancho-charnvee': [11, 17, 1, 7, 15, 3, 13, 5, 9, 14, 8, 6, 16, 2, 12, 4, 18, 10],
    'panorama': [5, 17, 1, 15, 3, 9, 13, 11, 7, 6, 18, 2, 4, 16, 12, 10, 14, 8],
    'dancoon': [13, 17, 12, 18, 14, 16, 8, 3, 9, 5, 2, 7, 11, 6, 1, 4, 10, 15],   # HS จากสกอร์การ์ดของสนาม
    'ubonrat-dam': [10, 2, 14, 17, 11, 8, 4, 6, 15, 7, 1, 18, 5, 16, 12, 9, 13, 3],
    'kabinburi-sport-club': [6, 2, 8, 14, 16, 12, 4, 18, 10, 9, 11, 7, 5, 13, 3, 17, 15, 1],
    # การ์ดให้ HCP 1–9 ต่อ 9 หลุม (หลุม 1–9: 7,9,2,4,6,1,3,6,5 — หลุม 5 และ 8 พิมพ์ 6 ซ้ำกัน ไม่มี 8) แปลงเป็น 1–18 ตามหลักทั่วไป
    # ของสนาม 9 หลุมที่เล่น 2 รอบ: 9 แรกเป็นเลขคี่ (2r−1) 9 หลังเป็นเลขคู่ (2r) · หลุม 5/8/14/17 เว้นว่างเพราะการ์ดพิมพ์ซ้ำ
    'tiger-golf': [13, 17, 3, 7, None, 1, 5, None, 9, 14, 18, 4, 8, None, 2, 6, None, 10],
    # การ์ดให้ H.S. 1–9 (8,7,2,1,5,9,3,4,6) แปลงแบบเดียวกับไทเกอร์: 9 แรกเลขคี่ 9 หลังเลขคู่
    'chulabhorn-dam': [15, 13, 3, 1, 9, 17, 5, 7, 11, 16, 14, 4, 2, 10, 18, 6, 8, 12],
}
HC_LADIES = {'singha-park-khon-kaen': [9, 13, 3, 7, 17, 11, 1, 15, 5, 12, 6, 10, 16, 8, 14, 2, 18, 4]}

SOURCES = {
    'kirimaya': ['ระยะและพาร์: mScorecard', 'HC: Hole19'],
    'singha-park-khon-kaen': ['ระยะ: mScorecard (ยอดรวมแท่นดำ 7,502 หลาตรงกับเว็บไซต์สนาม)', 'พาร์และ HC ชาย/หญิง: Yardage Book บนเว็บไซต์สนาม'],
    'rancho-charnvee': ['ระยะและพาร์: mScorecard', 'HC: Hole19 (พาร์ตรงกันทุกหลุม)'],
    'panorama': ['ระยะและพาร์: mScorecard (2 ชุดข้อมูล ใช้เฉพาะค่าที่ตรงกัน)', 'HC: Hole19 (พาร์ตรงกันทุกหลุม)'],
    'dancoon': ['สกอร์การ์ดของสนาม (รูปถ่ายจากผู้ใช้ 28 ก.ย. 2569) ยอด OUT/IN ตรงทุกแท่น (ยอดรวมแท่นเหลืองบนการ์ดพิมพ์ผิดเป็น 6,467 ค่ารายหลุมรวมได้ 6,473)', 'ระยะตรงกับ mScorecard ยกเว้นแท่นขาวหลุม 16 (การ์ด 382)'],
    'ubonrat-dam': ['ระยะและพาร์: mScorecard', 'HC: Hole19 (พาร์ตรงกันทุกหลุม)'],
    'kabinburi-sport-club': ['สกอร์การ์ดของสนาม (รูปถ่ายจากผู้ใช้ 28 ก.ย. 2569) ยอดรวม OUT/IN/TOTAL ตรงทุกแท่น'],
    'chulabhorn-dam': ['สกอร์การ์ดของสนาม (รูปถ่ายจากผู้ใช้ 28 ก.ย. 2569) ยอด OUT/IN แท่นชายตรง 3,352', 'HC บนการ์ดเป็น 1–9 แปลงเป็น 1–18: 9 แรกเลขคี่ 9 หลังเลขคู่'],
    'tiger-golf': ['สกอร์การ์ดของสนาม (รูปถ่ายจากผู้ใช้ 28 ก.ย. 2569) ยอด OUT/IN/TOTAL ตรงทุกแท่น', 'Course/Slope Rating 9 หลุมจากการ์ด (น้ำเงินชาย 36.1/135, ขาวชาย 35/125, แดงหญิง 35.8/122) รวมเป็น 18 หลุมตามหลัก WHS: Rating บวกกัน Slope เฉลี่ย'],
}
NOTES = {
    'kirimaya': 'หลุม 6 แท่นดำ: แหล่งข้อมูลระบุ 565 หลาซึ่งผิดปกติสำหรับพาร์ 4 จึงเว้นไว้',
    'singha-park-khon-kaen': 'หลุม 1: Yardage Book ระบุพาร์ 5 แต่สกอร์การ์ดออนไลน์ทุกแหล่งและพาร์รวม 72 ระบุพาร์ 4 จึงใช้พาร์ 4',
    'panorama': 'หลุม 3 แท่นน้ำเงิน/ขาว/แดง: ข้อมูล 2 ชุดไม่ตรงกัน จึงเว้นไว้',
    'dancoon': 'มีหลุม 5A (พาร์ 3 ระยะ 130/120/105/95 หลา) เป็นหลุมสำรอง ไม่นับใน 18 หลุมและยอดรวม',
    'chulabhorn-dam': 'สนาม 9 หลุมเล่น 2 รอบ · แท่นหญิงหลุม 4/13 เว้นว่าง: การ์ดพิมพ์ 224 หลา แต่ยอดรวมที่พิมพ์ 2,851 ต่างจากผลรวมรายหลุม 2,739 อยู่ 112 หลา',
    'tiger-golf': 'สนาม 9 หลุมเล่น 2 รอบ (9 แรกแท่นน้ำเงิน 9 หลังแท่นขาว) · HC หลุม 5/8/14/17 เว้นว่างเพราะการ์ดพิมพ์ HCP 6 ซ้ำ 2 หลุม · มีหลุมพิเศษ Snoopy (พาร์ 3 103 หลา) Stomper (พาร์ 4 341/331/291) และ Boar (พาร์ 4 358/348/298) ไม่นับในยอดรวม',
}

# Course Rating / Slope ของแท่น (มีเฉพาะที่พิมพ์บนสกอร์การ์ด) ใช้เป็นค่าเริ่มต้นของแฮนดิแคปโดยประมาณ
RATINGS = {
    'tiger-golf': {'BlueWhite': (71.1, 130), 'Red': (71.6, 122)},
}

def check(cid, par, hc, tees):
    assert len(par) == 18 and sum(par) == 72, (cid, 'par')
    known = [v for v in hc if v is not None]
    assert len(hc) == 18 and len(set(known)) == len(known) and all(1 <= v <= 18 for v in known), (cid, 'hc', hc)
    for t in tees:
        assert len(t['yards']) == 18, (cid, t['name'])

cards = {}
for cid in ['kirimaya', 'singha-park-khon-kaen', 'rancho-charnvee', 'panorama', 'dancoon', 'ubonrat-dam', 'kabinburi-sport-club', 'tiger-golf', 'chulabhorn-dam']:
    raw = RAW[cid]
    tees = []
    for name, (_tot, yards) in raw['tees'].items():
        y = list(yards)
        blank = raw.get('blank', {}).get(name, [])
        if 'front_back' in raw:   # ข้อมูลจากรูปสกอร์การ์ด: ตรวจยอด OUT/IN/TOTAL ที่พิมพ์บนการ์ดทุกแท่น
            fo, bi = raw['front_back'][name]
            ok = sum(y) == _tot and sum(y[:9]) == fo and sum(y[9:]) == bi
            # ยอดไม่ตรงได้เฉพาะแท่นที่ระบุหลุมที่ขัดกันไว้ใน blank เท่านั้น
            assert ok or blank, (cid, name, sum(y), _tot)
        for n in blank:
            y[n - 1] = None
        if cid == 'kirimaya' and name == 'Black': y[5] = None
        if cid == 'panorama' and name != 'Black': y[2] = None
        tee = {'id': name.lower(), 'name': TEE_TH[name], 'color': TEE_COLOR[name], 'yards': y}
        if name in RATINGS.get(cid, {}):
            cr, slope = RATINGS[cid][name]
            assert 50 <= cr <= 90 and 55 <= slope <= 155
            tee['rating'] = {'cr': cr, 'slope': slope}
        tees.append(tee)
    check(cid, raw['par'], HC[cid], tees)
    card = {'checked_at': raw.get('checked_at', '2026-09-28' if cid == 'kabinburi-sport-club' else '2026-09-27'), 'unit': 'yd', 'par': raw['par'], 'hc': HC[cid], 'tees': tees, 'sources': SOURCES[cid]}
    if cid in HC_LADIES:
        assert sorted(HC_LADIES[cid]) == list(range(1, 19))
        card['hc_ladies'] = HC_LADIES[cid]
    if cid in NOTES: card['note'] = NOTES[cid]
    cards[cid] = card

js = '// สกอร์การ์ดที่รวบรวมและตรวจแล้ว (สร้างจากข้อมูลดิบด้วยสคริปต์ ห้ามแก้ตัวเลขด้วยมือ)\n'
js += '// ตรวจ: 18 หลุม, พาร์รวม 72, HC เป็น 1–18 ไม่ซ้ำ (null = การ์ดไม่ชัด), ระยะรวมแต่ละแท่นตรงกับยอดรวมของแหล่งข้อมูล\n'
def arr(a):
    return '[' + ', '.join('null' if v is None else str(v) for v in a) + ']'

lines = ['export const SCORECARDS = {']
for cid, c in cards.items():
    lines.append(f"  '{cid}': {{")
    lines.append(f"    checked_at: '{c['checked_at']}', unit: '{c['unit']}',")
    lines.append(f"    par: {arr(c['par'])},")
    lines.append(f"    hc: {arr(c['hc'])},")
    if 'hc_ladies' in c:
        lines.append(f"    hc_ladies: {arr(c['hc_ladies'])},")
    lines.append('    tees: [')
    for t in c['tees']:
        rating = f", rating: {{ cr: {t['rating']['cr']}, slope: {t['rating']['slope']} }}" if 'rating' in t else ''
        lines.append(f"      {{ id: '{t['id']}', name: '{t['name']}', color: '{t['color']}', yards: {arr(t['yards'])}{rating} }},")
    lines.append('    ],')
    lines.append('    sources: [' + ', '.join(f"'{x}'" for x in c['sources']) + '],')
    if 'note' in c:
        lines.append(f"    note: '{c['note']}',")
    lines.append('  },')
lines.append('};')
js += '\n'.join(lines) + '\n'
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'js', 'scorecards.js'), 'w', encoding='utf8').write(js)
print('wrote', len(cards), 'scorecards;', sum(len(c['tees']) for c in cards.values()), 'tees')
