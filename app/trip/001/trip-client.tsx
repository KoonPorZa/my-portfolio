"use client";

import styles from "./trip.module.css";

type Stop = {
  legKm: number;
  speedKmh: number;
  restMin: number;
  name: string;
  place: string;
  coords: [number, number];
  role: string;
  note: string;
  food: string | null;
  tags: string[];
};

type TimedStop = Stop & {
  rideMin: number;
  arrive: string;
  cumulativeKm: number;
  depart: string;
  restLabel: string;
};

const START_MINUTES = 4 * 60;

const stops: Stop[] = [
  {
    legKm: 5.8,
    speedKmh: 50,
    restMin: 10,
    name: "PTT บ้านเขาแดง / สิงหนคร",
    place: "เทศบาลเมืองสิงหนคร, สงขลา",
    coords: [7.2061568, 100.5547474],
    role: "ตั้ง Trip + เติมเต็มถัง",
    note: "ออกโรงเรียน 04:00 เติมเต็มถังก่อนขึ้นเส้นหลัก 408 และรีเซ็ต Trip A/B = 0",
    food: "น้ำเปล่า + นมจืด/นมถั่วเหลือง 1 กล่อง · 20–35฿",
    tags: ["Start", "เติมเต็มถัง"],
  },
  {
    legKm: 158.6,
    speedKmh: 85,
    restMin: 20,
    name: "PTT อ.พระพรหม",
    place: "นครศรีธรรมราช",
    coords: [8.3378608, 99.9256754],
    role: "พักเช้า 20 นาที",
    note: "จังหวะแรกหลังขี่ยาว เติมน้ำมัน ยืดหลัง/ข้อมือ และเช็กสัมภาระ",
    food: "โจ๊ก/ข้าวต้มถ้วย + โยเกิร์ต · 35–55฿",
    tags: ["Day run", "พักคน"],
  },
  {
    legKm: 147.1,
    speedKmh: 90,
    restMin: 30,
    name: "PTT เมืองสุราษฎร์ธานี / วัดประดู่",
    place: "สุราษฎร์ธานี",
    coords: [9.14055, 99.3647639],
    role: "มื้อเช้าจริงจัง 30 นาที",
    note: "ออก 04:00 จึงถึงเร็วกว่าแผนเดิม ใช้เป็นมื้อเช้าก่อนช่วงชุมพร",
    food: "โยเกิร์ตพร้อมดื่ม/นมถั่วเหลือง + น้ำเปล่า · 25–45฿",
    tags: ["Day run", "Breakfast"],
  },
  {
    legKm: 118.9,
    speedKmh: 90,
    restMin: 20,
    name: "ปตท. จิงโจ้ หลังสวน",
    place: "อ.หลังสวน, ชุมพร",
    coords: [9.9137335, 99.0604903],
    role: "จุดประเมินความล้า 20 นาที",
    note: "ถ้าเริ่มปวดหลัง ปวดข้อมือ หรือง่วง ให้ลดแผนและหาที่พักแถวหลังสวน–ชุมพร",
    food: "ข้าวต้ม/โจ๊กถ้วย + น้ำเปล่า · 30–50฿",
    tags: ["Decision", "พักคน"],
  },
  {
    legKm: 77.7,
    speedKmh: 90,
    restMin: 20,
    name: "PTT 24/7 บ้านเขาพาง / ท่าแซะ",
    place: "ชุมพร",
    coords: [10.5692017, 99.116111],
    role: "เติม + พัก 20 นาที (24 ชม.)",
    note: "จุดตัดสินใจ: ไปต่อแบบวันเดียว หรือเปลี่ยนเป็นแผนค้างคืน",
    food: "เกลือแร่/น้ำเปล่า + เจลลี่หรือโยเกิร์ต · 30–55฿",
    tags: ["24/7", "Decision"],
  },
  {
    legKm: 139.4,
    speedKmh: 90,
    restMin: 30,
    name: "PTT ทับสะแก",
    place: "ประจวบคีรีขันธ์",
    coords: [11.527931, 99.6206976],
    role: "พักกลางวัน 30 นาที",
    note: "ผ่านชุมพรแล้วควรกินจริงจัง ไม่ใช่แค่กาแฟ กันหมดแรงช่วงบ่าย",
    food: "มื้อหลัก: โจ๊ก/ข้าวต้ม 1–2 ถ้วย หรือไข่ตุ๋น + นม/น้ำ · 60–100฿",
    tags: ["Lunch", "พักรถ"],
  },
  {
    legKm: 75.1,
    speedKmh: 85,
    restMin: 15,
    name: "PTT กุยบุรี",
    place: "ประจวบคีรีขันธ์",
    coords: [12.1025771, 99.8530734],
    role: "พักสั้น 15 นาที (สำรอง)",
    note: "ยังสดให้ใช้พักสั้น แต่ถ้าเริ่มล้าให้พักเต็มและลดความเร็ว",
    food: "โยเกิร์ตหรือนมถั่วเหลือง · 20–35฿",
    tags: ["Optional", "พักสั้น"],
  },
  {
    legKm: 99.9,
    speedKmh: 90,
    restMin: 20,
    name: "PTT ชะอำ / นายาง",
    place: "เพชรบุรี",
    coords: [12.884446, 99.912716],
    role: "พัก 20 นาที ก่อนโซนรถมาก",
    note: "เติมให้พร้อมก่อนเพชรบุรี–พระราม 2 ที่รถหนาแน่นและต้องใช้สมาธิสูง",
    food: "เจลลี่/โยเกิร์ต + น้ำเปล่า เติมพลังนิ่ม ๆ · 30–55฿",
    tags: ["Day run", "สำคัญ"],
  },
  {
    legKm: 117.5,
    speedKmh: 85,
    restMin: 20,
    name: "PTT พระราม 2 / ท่าทราย",
    place: "สมุทรสาคร",
    coords: [13.5361776, 100.2209807],
    role: "เติมก่อนเข้าเมือง + พัก 20 นาที",
    note: "จุดสำคัญที่สุดช่วงท้าย เติมแม้เหลือครึ่งถัง เพราะเข้าเมืองรถติด/วนทางง่าย",
    food: "โจ๊ก/ข้าวต้มเล็ก + น้ำเปล่า ก่อนฝ่ารถติด · 35–60฿",
    tags: ["สำคัญ", "ก่อนเข้าเมือง"],
  },
  {
    legKm: 74.2,
    speedKmh: 70,
    restMin: 0,
    name: "ปตท. สาขารามคำแหง (ขาเข้า)",
    place: "แขวงหัวหมาก, เขตบางกะปิ",
    coords: [13.7698852, 100.6623291],
    role: "เติมปิดทริป / จุดนัดพบ",
    note: "ใกล้ซอยรามคำแหง 68 — ถ้ารถติดหนักให้บวกเวลาเพิ่ม 45–90 นาที",
    food: null,
    tags: ["Finish", "ใกล้ปลายทาง"],
  },
];

const principles = [
  [
    "ออก 04:00 = ถึงเย็น",
    "รักษา 80–100 กม./ชม. + พักตามแผน → ถึง PTT รามคำแหงราว 18:50 (เผื่อรถติดเป็น 19:30–20:00)",
  ],
  [
    "เติมทุกครั้งที่พัก",
    "ไม่ใช่เพราะน้ำมันใกล้หมด แต่กันต้องลุ้นปั๊มถัดไป และเผื่อฝน หลงทาง หรือรถติด",
  ],
  [
    "เข้าเมืองโหมดมอเตอร์ไซค์",
    "ตั้ง Google Maps เป็นมอเตอร์ไซค์/เลี่ยงทางด่วน เช็กคำว่า ทางพิเศษ/มอเตอร์เวย์ ทุกครั้ง",
  ],
] as const;

const budgetItems = [
  ["น้ำมัน Gasohol 95 (40 กม./ลิตร + เผื่อ 10%)", "≈1,075฿"],
  ["อาหาร/น้ำ 7‑Eleven แบบกินนิ่มทั้งวัน", "≈450–650฿"],
  ["เงินเผื่อฉุกเฉินเล็กน้อย", "≈300–500฿"],
  ["รวมแนะนำสำหรับวันเดียว", "≈1,825–2,225฿"],
] as const;

const fuelRows = [
  ["กินมาก 35 กม./ลิตร", "≈29.0 ลิตร", "≈1,115฿", "≈1,225฿", "worst case: 80–100 กม./ชม. + ลมต้าน + สัมภาระ"],
  ["ค่ากลาง 40 กม./ลิตร", "≈25.4 ลิตร", "≈976฿", "≈1,075฿", "ใช้เป็นงบหลักของแผนนี้"],
  ["ประหยัด 45 กม./ลิตร", "≈22.5 ลิตร", "≈867฿", "≈954฿", "ขี่นิ่ง รถเบา ถนนโล่ง"],
  ["E20 @ 33.48 (ถ้าใช้ได้จริง)", "≈25.4 ลิตร", "≈849฿", "≈934฿", "เฉพาะถ้ารถรองรับและใช้ประจำ"],
] as const;

const checklist = [
  "เติมเต็มถัง + ตั้ง Trip A/B เป็น 0 ที่ PTT แรก",
  "ลมยางตามคู่มือเมื่อบรรทุกสัมภาระ ตรวจสภาพยาง ไม่มีบวม/แตก",
  "โซ่ตึงพอดี หล่อลื่นก่อนออก และพกสเปรย์โซ่ขนาดเล็ก",
  "พาวเวอร์แบงก์ + สายชาร์จ + กันฝนมือถือ/ที่ยึดมือถือแน่น",
  "เสื้อกันฝน ถุงมือ แว่นใสสำหรับกลางคืน และน้ำดื่มอย่างน้อย 1 ลิตร",
  "ตั้ง Google Maps เป็นมอเตอร์ไซค์/เลี่ยงทางด่วนก่อนเข้ากรุงเทพฯ",
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toHHMM(totalMinutes: number) {
  const mins = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function duration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (!h) return `${m} นาที`;
  return `${h}ชม.${String(m).padStart(2, "0")}น.`;
}

function mapsLink([lat, lon]: [number, number]) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function buildTimedStops(): TimedStop[] {
  let clock = START_MINUTES;
  let cumulative = 0;

  return stops.map((stop) => {
    const rideMin = Math.round((stop.legKm / stop.speedKmh) * 60);
    const arriveMinutes = clock + rideMin;
    const cumulativeKm = cumulative + stop.legKm;
    const depart = stop.restMin ? toHHMM(arriveMinutes + stop.restMin) : "จบทริป";

    clock = arriveMinutes + stop.restMin;
    cumulative = cumulativeKm;

    return {
      ...stop,
      rideMin,
      arrive: toHHMM(arriveMinutes),
      cumulativeKm,
      depart,
      restLabel: stop.restMin ? `${stop.restMin} นาที` : "ไม่พักต่อ",
    };
  });
}

const TIMED_STOPS = buildTimedStops();

const TAG_ACCENT = new Set(["Start", "เติมเต็มถัง", "สำคัญ", "ก่อนเข้าเมือง", "Finish"]);
const TAG_REST = new Set(["Day run", "พักคน", "พักรถ", "พักสั้น", "Breakfast", "Lunch"]);
const TAG_DANGER = new Set(["Decision"]);

function Tag({ label }: { label: string }) {
  const tone = TAG_ACCENT.has(label)
    ? styles.tagAccent
    : TAG_DANGER.has(label)
      ? styles.tagDanger
      : TAG_REST.has(label)
        ? styles.tagRest
        : styles.tagNeutral;

  return <span className={cx(styles.tag, tone)}>{label}</span>;
}

function SectionHead({
  index,
  eyebrow,
  title,
  lead,
}: {
  index: string;
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className={styles.head}>
      <div className={styles.headTop}>
        <span className={styles.headNo}>{index}</span>
        <span className={styles.eyebrow}>{eyebrow}</span>
      </div>
      <h2>{title}</h2>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
    </header>
  );
}

function StopRow({ stop, index }: { stop: TimedStop; index: number }) {
  return (
    <li className={styles.stop}>
      <div className={styles.node}>{String(index + 1).padStart(2, "0")}</div>

      <article className={styles.stopCard}>
        <p className={styles.legInfo}>
          <span className={styles.legArrow}>▼</span>
          {stop.legKm.toFixed(1)} กม. · {stop.speedKmh} กม./ชม. · ขี่ {duration(stop.rideMin)}
        </p>

        <div className={styles.stopTime}>
          <span className={styles.arrive}>{stop.arrive}</span>
          <span className={styles.timeArrow}>→</span>
          <span className={styles.depart}>{stop.depart}</span>
          <span className={styles.cum}>~{Math.round(stop.cumulativeKm)} กม.</span>
        </div>

        <h3 className={styles.stopName}>{stop.name}</h3>
        <p className={styles.stopPlace}>{stop.place}</p>
        <p className={styles.stopRole}>{stop.role}</p>
        <p className={styles.stopNote}>{stop.note}</p>

        {stop.food ? (
          <p className={styles.stopFood}>
            <span className={styles.foodTag}>กินนิ่ม</span>
            {stop.food}
          </p>
        ) : null}

        <div className={styles.stopFoot}>
          <span className={cx(styles.tag, styles.tagRest)}>พัก {stop.restLabel}</span>
          {stop.tags.map((tag) => (
            <Tag key={`${stop.name}-${tag}`} label={tag} />
          ))}
        </div>

        <div className={styles.stopGeo}>
          <span className={styles.coords}>
            {stop.coords[0].toFixed(6)}, {stop.coords[1].toFixed(6)}
          </span>
          <a href={mapsLink(stop.coords)} target="_blank" rel="noreferrer" className={styles.mapLink}>
            เปิด Maps ↗
          </a>
        </div>
      </article>
    </li>
  );
}

export function Trip01Client({ fontClassName }: { fontClassName: string }) {
  return (
    <main className={cx(styles.tripRoot, fontClassName)}>
      <div className={styles.tripPage}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <span className={styles.kicker}>Trip 01 · Roadbook</span>
            <span className={styles.heroId}>R15v3</span>
          </div>

          <h1 className={styles.heroTitle}>
            สงขลา<span className={styles.heroArrow}>→</span>กรุงเทพฯ
          </h1>

          <p className={styles.heroLead}>
            แผนขี่วันเดียวแบบมือถืออ่านง่าย โทนสว่างสำหรับเปิดกลางวัน — เน้นจุดเติม PTT, เวลาพัก,
            งบประมาณ และเช็กลิสต์สำคัญก่อนออก
          </p>

          <dl className={styles.cluster}>
            <div className={styles.clusterCell}>
              <dt>ระยะรวม</dt>
              <dd>
                ~1,014 <span>กม.</span>
              </dd>
            </div>
            <div className={styles.clusterCell}>
              <dt>ออกตัว</dt>
              <dd>04:00</dd>
            </div>
            <div className={styles.clusterCell}>
              <dt>ถึงโดยประมาณ</dt>
              <dd>
                18:53 <span>–20:00</span>
              </dd>
            </div>
            <div className={styles.clusterCell}>
              <dt>งบแนะนำ</dt>
              <dd>
                2,000 <span>–2,300฿</span>
              </dd>
            </div>
          </dl>

          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#stops">
              ไปที่ไทม์ไลน์ ↓
            </a>
            <button className={styles.ghostButton} type="button" onClick={() => window.print()}>
              พิมพ์ / บันทึก
            </button>
          </div>
        </header>

        <section className={styles.block}>
          <SectionHead index="01" eyebrow="Route rules" title="กฎ 3 ข้อของทริปนี้" />
          <div className={styles.ruleGrid}>
            {principles.map(([title, text], i) => (
              <article key={title} className={styles.rule}>
                <span className={styles.ruleNo}>{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <div className={styles.planGrid}>
            <article className={styles.planCard}>
              <span className={styles.planTag}>แผน A · วันเดียว</span>
              <p>
                ออก 04:00 → ถึง PTT รามคำแหงราว <strong>18:53</strong> ถ้าพักตามแผนและถนนไม่ติดหนัก
              </p>
            </article>
            <article className={cx(styles.planCard, styles.planCardWarn)}>
              <span className={styles.planTag}>แผน B · ค้างคืน (ปลอดภัยกว่า)</span>
              <p>
                ถ้าล้า ให้ค้างทับสะแก/กุยบุรี/หัวหิน (มาถึงช่วงบ่าย) แล้วเข้ากรุงเทพฯ วันถัดไป เหลือ ~300 กม.
                — เติมที่สมุทรสาครก่อนเข้าเมืองเสมอ
              </p>
              <p className={styles.planBail}>
                หลุดแผนเกิน 60–90 นาทีตั้งแต่ก่อนถึงชุมพร → เปลี่ยนเป็นค้างคืนทันที
              </p>
            </article>
          </div>
        </section>

        <section className={styles.block} id="stops">
          <SectionHead
            index="02"
            eyebrow="PTT stops"
            title="ไทม์ไลน์จุดเติม + พัก"
            lead="ระยะและ ETA คำนวณจากเวลาออก 04:00, ระยะระหว่าง waypoint และสปีดขี่จริงต่อช่วงทาง — ตัวเลขทุกค่าเป็นชุดเดิม"
          />
          <ol className={styles.timeline}>
            {TIMED_STOPS.map((stop, index) => (
              <StopRow key={stop.name} stop={stop} index={index} />
            ))}
          </ol>
        </section>

        <section className={styles.block} id="budget">
          <SectionHead
            index="03"
            eyebrow="Trip budget"
            title="งบน้ำมัน + 7‑Eleven"
            lead="คำนวณจากระยะผ่าน waypoint ~1,014 กม. และสมมติฐาน R15v3 วิ่งจริง 35–45 กม./ลิตร"
          />
          <div className={styles.budgetWrap}>
            <article className={styles.budgetHero}>
              <p className={styles.budgetLabel}>พกอย่างน้อย</p>
              <p className={styles.budgetFigure}>2,000–2,300฿</p>
              <p className={styles.budgetSub}>
                Gasohol 95 แบบมี buffer + อาหาร/น้ำ 7‑Eleven ทั้งวัน + เงินเผื่อฉุกเฉิน · ยังไม่รวมค่าที่พักถ้าค้างคืน
              </p>
              <dl className={styles.budgetList}>
                {budgetItems.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>

            <div className={styles.fuel}>
              <h3 className={styles.fuelHead}>สถานการณ์น้ำมัน (Gasohol 95)</h3>
              <ul className={styles.fuelRows}>
                {fuelRows.map((row) => (
                  <li key={row[0]} className={styles.fuelRow}>
                    <div className={styles.fuelTop}>
                      <span className={styles.fuelName}>{row[0]}</span>
                      <span className={styles.fuelCost}>{row[3]}</span>
                    </div>
                    <p className={styles.fuelMeta}>
                      {row[1]} · ฐาน {row[2]} · {row[4]}
                    </p>
                  </li>
                ))}
              </ul>
              <p className={styles.fuelNote}>
                ราคา OR/PTT: G95 38.48 · G91 38.11 · E20 33.48 · เบนซิน 48.07 ฿/ลิตร — ถ้าไม่ชัวร์
                ใช้ชนิดที่รถใช้ประจำ อย่าเปลี่ยนกลางทริปเพื่อประหยัดไม่กี่ร้อยบาท
              </p>
            </div>
          </div>
        </section>

        <section className={styles.block} id="checklist">
          <SectionHead
            index="04"
            eyebrow="R15v3 prep"
            title="เช็กลิสต์ก่อนออก"
            lead="เลือกชนิดน้ำมันตามคู่มือ/สติกเกอร์ฝาถัง ถ้าไม่แน่ใจให้เลือก Gasohol 95 และเลี่ยงการทดลองน้ำมันใหม่กลางทริป"
          />
          <div className={styles.checkGrid}>
            {checklist.map((item) => (
              <label key={item} className={styles.check}>
                <input type="checkbox" />
                <span className={styles.checkBox} aria-hidden="true" />
                <span className={styles.checkText}>{item}</span>
              </label>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <p className={styles.footerNote}>
            ใช้แผนนี้เป็น roadbook ส่วนตัว ไม่ใช่คำสั่งให้ฝืนขี่วันเดียว — ถ้าเริ่มง่วง ตาล้า ปวดข้อมือ
            หรือฝนหนัก ให้เปลี่ยนเป็นแผนค้างคืนทันที
          </p>
          <p className={styles.footerMeta}>
            ETA: ออก 04:00 · ทางท้องถิ่น 50 · ทางหลัก 85–90 · สมุทรสาคร–รามคำแหง 70 กม./ชม. · ขี่รวม ~11ชม.48น.
            + พัก ~3ชม.05น.
          </p>
        </footer>
      </div>
    </main>
  );
}
