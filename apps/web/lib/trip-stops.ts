export type Stop = {
  legKm: number;
  speedKmh: number;
  restMin: number;
  name: string;
  place: string;
  coords: [number, number];
  role: string;
  note: string;
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
    legKm: 0,
    speedKmh: 50,
    restMin: 10,
    name: "PTT ม่วงงาม",
    place: "อ.สิงหนคร, สงขลา",
    coords: [7.261231, 100.52323],
    role: "ตั้ง Trip + เติมเต็มถัง",
    note: "ใช้จุดนี้เป็น 0 กม. ของทริป เติมเต็มถังและรีเซ็ต Trip A/B = 0 ก่อนออกเส้นหลัก",
    tags: ["Start", "เติมเต็มถัง"],
  },
  {
    legKm: 150.2,
    speedKmh: 85,
    restMin: 20,
    name: "PTT อ.พระพรหม",
    place: "นครศรีธรรมราช",
    coords: [8.3378608, 99.9256754],
    role: "แวะพัก 20 นาที",
    note: "จังหวะแรกหลังขี่ยาว เติมน้ำมัน ยืดหลัง/ข้อมือ และเช็กสัมภาระ",
    tags: ["Day run", "พักคน"],
  },
  {
    legKm: 147.1,
    speedKmh: 90,
    restMin: 30,
    name: "PTT เมืองสุราษฎร์ธานี / วัดประดู่",
    place: "สุราษฎร์ธานี",
    coords: [9.14055, 99.3647639],
    role: "มื้อเย็น 30 นาที",
    note: "ถึงช่วงเย็น ใช้เป็นมื้อเย็นก่อนช่วงชุมพร เติมน้ำมันและยืดตัว เพราะช่วงต่อไปถึงจิงโจ้จะเริ่มพลบค่ำ",
    tags: ["Day run", "Dinner"],
  },
  {
    legKm: 118.9,
    speedKmh: 90,
    restMin: 20,
    name: "ปตท. จิงโจ้ หลังสวน",
    place: "อ.หลังสวน, ชุมพร",
    coords: [9.9137335, 99.0604903],
    role: "จุดประเมินความล้า 20 นาที",
    note: "ถ้าเริ่มปวดหลัง ปวดข้อมือ หรือง่วง ให้ลดแผนและหาที่พักแถวหลังสวน–ชุมพร เติมน้ำมันให้เต็มก่อนเข้าโรงแรม เพื่อพร้อมออก 05:00",
    tags: ["Decision", "พักคน"],
  },
  {
    legKm: 6.1,
    speedKmh: 73,
    restMin: 0,
    name: "โรงแรมหลังสวนเพลส",
    place: "อ.หลังสวน, ชุมพร",
    coords: [9.9633216, 99.0684246],
    role: "ค้างคืน โรงแรมหลังสวนเพลส",
    note: "ห่างจากปั๊มจิงโจ้ หลังสวน ~6.1 กม. / 5 นาที เช็กอิน พักเต็มคืน ก่อนออกเช้าวันที่ 13 · 40/4 ต.วังตะกอ อ.หลังสวน ชุมพร 86110 · โทร 082-183-8365 · โรงแรม 2 ดาว ห้องแอร์ + WiFi ฟรี",
    tags: ["พักค้างคืน", "พักรถ"],
  },
  {
    legKm: 71.6,
    speedKmh: 90,
    restMin: 20,
    name: "PTT 24/7 บ้านเขาพาง / ท่าแซะ",
    place: "ชุมพร",
    coords: [10.5692017, 99.116111],
    role: "เติม + พัก 20 นาที (24 ชม.)",
    note: "ปั๊ม 24 ชม. จุดแรกของเช้าวันที่สอง เติมน้ำมันและเช็กสภาพร่างกาย/รถก่อนขี่ยาวเข้าประจวบ",
    tags: ["24/7", "พักคน"],
  },
  {
    legKm: 139.4,
    speedKmh: 90,
    restMin: 30,
    name: "PTT ทับสะแก",
    place: "ประจวบคีรีขันธ์",
    coords: [11.527931, 99.6206976],
    role: "มื้อเช้าวันที่สอง 30 นาที",
    note: "เช้าวันที่สองผ่านชุมพรแล้วควรกินจริงจังก่อนออกยาว ไม่ใช่แค่กาแฟ กันหมดแรงระหว่างวัน",
    tags: ["Breakfast", "พักรถ"],
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
    tags: ["Finish", "ใกล้ปลายทาง"],
  },
];

export const TRIP_STOP_COUNT = stops.length;
export const TRIP_DIRECTIONS_URL = buildTripDirectionsUrl(stops);

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

function buildTripDirectionsUrl(routeStops: Stop[]): string {
  const origin = routeStops[0];
  const destination = routeStops.at(-1);

  if (!origin || !destination) {
    return "https://www.google.com/maps";
  }

  const waypoints = routeStops.slice(1, -1).map((stop) => latLng(stop.coords));
  const params = new URLSearchParams({
    api: "1",
    origin: latLng(origin.coords),
    destination: latLng(destination.coords),
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function latLng([lat, lng]: [number, number]): string {
  return `${lat},${lng}`;
}
