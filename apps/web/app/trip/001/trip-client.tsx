"use client";

import { useEffect, useMemo, useState } from "react";

import {
  WEATHER_FORECAST_DATE,
  WEATHER_FORECAST_MAX_DAYS,
  describeWeather,
  fetchStopsForecast,
  pickForecastAtHour,
  type ForecastWeather,
  type HourlySeries,
  type WeatherDescription,
  type WeatherTone,
} from "@/lib/weather";
import { buildTimedStops, duration, type TimedStop } from "@/lib/trip-stops";
import styles from "./trip.module.css";

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

function mapsLink([lat, lon]: [number, number]) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

const TIMED_STOPS = buildTimedStops();
const FORECAST_POINTS = TIMED_STOPS.map((stop) => ({
  lat: stop.coords[0],
  lon: stop.coords[1],
}));
const DAY_MS = 24 * 60 * 60 * 1_000;

const TAG_ACCENT = new Set(["Start", "เติมเต็มถัง", "สำคัญ", "ก่อนเข้าเมือง", "Finish"]);
const TAG_REST = new Set(["Day run", "พักคน", "พักรถ", "พักสั้น", "Breakfast", "Lunch"]);
const TAG_DANGER = new Set(["Decision"]);

type ForecastState =
  | { status: "loading" }
  | { status: "ready"; series: HourlySeries[] }
  | { status: "error" }
  | { status: "out-of-range" };

type ForecastStatus = ForecastState["status"];

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

function RouteWeatherSummary({
  state,
  forecasts,
}: {
  state: ForecastState;
  forecasts: Array<ForecastWeather | null>;
}) {
  const summary = summarizeRouteWeather(state, forecasts);

  return (
    <section className={cx(styles.weatherSummary, summary.tone ? weatherToneClass(summary.tone) : null)} aria-live="polite">
      <div className={styles.weatherSummaryTop}>
        <span className={styles.weatherSummaryLabel}>สภาพอากาศทริป</span>
        <span className={styles.weatherSummaryDate}>13 ก.ค.</span>
      </div>
      <p className={styles.weatherSummaryTitle}>{summary.title}</p>
      <p className={styles.weatherSummaryMeta}>{summary.meta}</p>
    </section>
  );
}

function StopWeather({
  status,
  forecast,
}: {
  status: ForecastStatus;
  forecast: ForecastWeather | null;
}) {
  if (status === "loading") {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>กำลังโหลดอากาศตามเวลาถึง</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>เปิดพยากรณ์ไม่ได้ตอนนี้</span>
      </div>
    );
  }

  if (status === "out-of-range") {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>ยังไม่มีข้อมูลพยากรณ์ / ใกล้วันเดินทางจะแม่นขึ้น</span>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>ไม่มีข้อมูลชั่วโมงนี้</span>
      </div>
    );
  }

  const description = describeWeather(forecast.code);

  return (
    <div className={cx(styles.stopWeather, weatherToneClass(description.tone))}>
      <span className={styles.stopWeatherIcon} aria-hidden="true">
        {description.icon}
      </span>
      <div className={styles.stopWeatherBody}>
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherLabel}>{description.label}</span>
      </div>
      <div className={styles.stopWeatherMetrics}>
        <span>{Math.round(forecast.tempC)}°C</span>
        <span>ฝน {Math.round(forecast.precipProb)}%</span>
        <span>ลม {Math.round(forecast.windKmh)} กม./ชม.</span>
      </div>
    </div>
  );
}

function StopRow({
  stop,
  index,
  forecast,
  forecastStatus,
}: {
  stop: TimedStop;
  index: number;
  forecast: ForecastWeather | null;
  forecastStatus: ForecastStatus;
}) {
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
        <StopWeather status={forecastStatus} forecast={forecast} />
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
  const [forecastState, setForecastState] = useState<ForecastState>(() => initialForecastState());

  useEffect(() => {
    if (!isForecastDateInRange(new Date())) {
      return undefined;
    }

    const controller = new AbortController();

    void fetchStopsForecast(FORECAST_POINTS, WEATHER_FORECAST_DATE, controller.signal)
      .then((series) => setForecastState({ status: "ready", series }))
      .catch((error) => {
        if (isAbortError(error)) {
          return;
        }

        setForecastState({ status: "error" });
      });

    return () => controller.abort();
  }, []);

  const stopForecasts = useMemo(() => {
    if (forecastState.status !== "ready") {
      return TIMED_STOPS.map(() => null);
    }

    return TIMED_STOPS.map((stop, index) => {
      const series = forecastState.series[index];

      return series ? pickForecastAtHour(series, stop.arrive) : null;
    });
  }, [forecastState]);

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

          <RouteWeatherSummary state={forecastState} forecasts={stopForecasts} />

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
              <StopRow
                key={stop.name}
                stop={stop}
                index={index}
                forecast={stopForecasts[index] ?? null}
                forecastStatus={forecastState.status}
              />
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

function summarizeRouteWeather(
  state: ForecastState,
  forecasts: Array<ForecastWeather | null>
): { title: string; meta: string; tone: WeatherTone | null } {
  if (state.status === "loading") {
    return {
      title: "13 ก.ค. · กำลังโหลดพยากรณ์ตามเวลาถึง",
      meta: "เรียก Open-Meteo หนึ่งครั้งสำหรับ 10 จุดพัก",
      tone: null,
    };
  }

  if (state.status === "error") {
    return {
      title: "13 ก.ค. · เปิดพยากรณ์ไม่ได้ตอนนี้",
      meta: "ข้ามข้อมูลอากาศไว้ก่อน แผนจุดพักยังใช้ได้ตามเดิม",
      tone: null,
    };
  }

  if (state.status === "out-of-range") {
    return {
      title: "13 ก.ค. · ยังไม่มีข้อมูลพยากรณ์",
      meta: "ยังไม่มีข้อมูลพยากรณ์ / ใกล้วันเดินทางจะแม่นขึ้น",
      tone: null,
    };
  }

  const dominant = dominantWeather(forecasts);
  const rainiest = rainiestStop(forecasts);

  if (!dominant || !rainiest) {
    return {
      title: "13 ก.ค. · ยังไม่มีข้อมูลชั่วโมงเวลาถึง",
      meta: "Open-Meteo ตอบกลับแล้ว แต่ข้อมูลรายชั่วโมงไม่ครบสำหรับจุดพัก",
      tone: null,
    };
  }

  return {
    title: `13 ก.ค. · ส่วนใหญ่ ${dominant.label}`,
    meta: `ฝนสูงสุด ${Math.round(rainiest.forecast.precipProb)}% แถว ${rainiest.stop.name}`,
    tone: dominant.tone,
  };
}

function dominantWeather(forecasts: Array<ForecastWeather | null>): WeatherDescription | null {
  const counts = new Map<string, { description: WeatherDescription; count: number }>();

  for (const forecast of forecasts) {
    if (!forecast) {
      continue;
    }

    const description = describeWeather(forecast.code);
    const existing = counts.get(description.label);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(description.label, { description, count: 1 });
    }
  }

  let best: { description: WeatherDescription; count: number } | null = null;

  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }

  return best?.description ?? null;
}

function rainiestStop(forecasts: Array<ForecastWeather | null>): { stop: TimedStop; forecast: ForecastWeather } | null {
  let rainiest: { stop: TimedStop; forecast: ForecastWeather } | null = null;

  for (let index = 0; index < forecasts.length; index += 1) {
    const forecast = forecasts[index];
    const stop = TIMED_STOPS[index];

    if (!forecast || !stop) {
      continue;
    }

    if (!rainiest || forecast.precipProb > rainiest.forecast.precipProb) {
      rainiest = { stop, forecast };
    }
  }

  return rainiest;
}

function weatherToneClass(tone: WeatherTone): string {
  switch (tone) {
    case "clear":
      return styles.weatherToneClear;
    case "cloud":
      return styles.weatherToneCloud;
    case "rain":
      return styles.weatherToneRain;
    case "storm":
      return styles.weatherToneStorm;
    case "fog":
      return styles.weatherToneFog;
  }
}

function isForecastDateInRange(now: Date): boolean {
  const todayMs = dateKeyToUtcMs(bangkokDateKey(now));
  const forecastMs = dateKeyToUtcMs(WEATHER_FORECAST_DATE);

  if (todayMs === null || forecastMs === null) {
    return false;
  }

  const diffDays = Math.round((forecastMs - todayMs) / DAY_MS);

  return diffDays >= 0 && diffDays <= WEATHER_FORECAST_MAX_DAYS;
}

function initialForecastState(): ForecastState {
  return isForecastDateInRange(new Date()) ? { status: "loading" } : { status: "out-of-range" };
}

function bangkokDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = datePart(parts, "year");
  const month = datePart(parts, "month");
  const day = datePart(parts, "day");

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string | null {
  const part = parts.find((entry) => entry.type === type);

  return part?.value ?? null;
}

function dateKeyToUtcMs(value: string): number | null {
  const parts = value.split("-");

  if (parts.length !== 3) {
    return null;
  }

  const yearText = parts[0];
  const monthText = parts[1];
  const dayText = parts[2];

  if (!yearText || !monthText || !dayText) {
    return null;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
