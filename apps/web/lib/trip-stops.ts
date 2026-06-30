export type Stop = {
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

export type TimedStop = Stop & {
  rideMin: number;
  arrive: string;
  arriveMinutes: number;
  cumulativeKm: number;
  depart: string;
  restLabel: string;
};

export const TRIP_START_MINUTES = 4 * 60;

export const stops: Stop[] = [
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

export const TRIP_STOP_COUNT = stops.length;

export function toHHMM(totalMinutes: number): string {
  const mins = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");

  return `${h}:${m}`;
}

export function duration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);

  if (!h) {
    return `${m} นาที`;
  }

  return `${h}ชม.${String(m).padStart(2, "0")}น.`;
}

export function buildTimedStops(): TimedStop[] {
  let clock = TRIP_START_MINUTES;
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
      arriveMinutes,
      cumulativeKm,
      depart,
      restLabel: stop.restMin ? `${stop.restMin} นาที` : "ไม่พักต่อ",
    };
  });
}
