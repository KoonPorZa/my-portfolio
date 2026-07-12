"use client";

import { useEffect, useMemo, useState } from "react";

import {
  WEATHER_FORECAST_DATES,
  WEATHER_FORECAST_MAX_DAYS,
  describeWeather,
  fetchStopsForecast,
  forecastSampleTime,
  formatThaiShortDate,
  pickForecastAtHour,
  type ForecastWeather,
  type HourlySeries,
  type WeatherDescription,
  type WeatherTone,
} from "@/lib/weather";
import { buildTimedStops, duration, type TimedStop } from "@/lib/trip-stops";
import {
  PLAN_C_DAY_ONE,
  PLAN_C_DAY_TWO,
  PLAN_C_HOTEL_COORDS,
  PLAN_C_OVERNIGHT_STOP_INDEX,
  PLAN_C_SECOND_DAY_DATE,
  PLAN_C_START_DATE,
  PLAN_C_TIMED_STOPS,
} from "@/lib/trip-plan";
import { TripLiveStatus } from "./live-status";
import styles from "./trip.module.css";

const principles = [
  [
    "ยึดจังหวะ ออกบ่าย–นอนหลังสวน",
    "ออก 13:30 วันที่ 12 จากสงขลา นอนโรงแรมหลังสวนเพลส (อ.หลังสวน) แล้วออกต่อ 05:00 เช้าวันที่ 13",
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
  ["น้ำมัน Gasohol 95 (40 กม./ลิตร + เผื่อ 10%)", "≈1,060฿"],
  ["อาหาร/น้ำ 7‑Eleven แบบกินนิ่มตลอด 2 วัน", "≈450–650฿"],
  ["ที่พักหลังสวนเพลส 1 คืน", "≈500–600฿"],
  ["เงินเผื่อฉุกเฉินเล็กน้อย", "≈300–500฿"],
] as const;

const fuelRows = [
  ["กินมาก 35 กม./ลิตร", "≈28.6 ลิตร", "≈1,100฿", "≈1,210฿", "worst case: 80–100 กม./ชม. + ลมต้าน + สัมภาระ"],
  ["ค่ากลาง 40 กม./ลิตร", "≈25.0 ลิตร", "≈962฿", "≈1,060฿", "ใช้เป็นงบหลักของแผนนี้"],
  ["ประหยัด 45 กม./ลิตร", "≈22.2 ลิตร", "≈855฿", "≈940฿", "ขี่นิ่ง รถเบา ถนนโล่ง"],
  ["E20 @ 33.48 (ถ้าใช้ได้จริง)", "≈25.0 ลิตร", "≈837฿", "≈921฿", "เฉพาะถ้ารถรองรับและใช้ประจำ"],
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
const WEATHER_START_DATE = WEATHER_FORECAST_DATES[0];
const WEATHER_FETCH_START_DATE = PLAN_C_START_DATE;
const LAST_DEPARTURE_DATE = WEATHER_FORECAST_DATES[WEATHER_FORECAST_DATES.length - 1] ?? WEATHER_START_DATE;
const WEATHER_END_DATE = shiftDateKey(LAST_DEPARTURE_DATE, 1) ?? LAST_DEPARTURE_DATE;

const TAG_ACCENT = new Set(["Start", "เติมเต็มถัง", "สำคัญ", "ก่อนเข้าเมือง", "Finish"]);
const TAG_REST = new Set(["Day run", "พักคน", "พักรถ", "พักสั้น", "พักค้างคืน", "Breakfast", "Lunch", "Dinner"]);
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
  selectedDate,
  onSelectDate,
}: {
  state: ForecastState;
  forecasts: Array<ForecastWeather | null>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const dateLabel = formatThaiShortDate(selectedDate);
  const summary = summarizeRouteWeather(state, forecasts, dateLabel);

  return (
    <section className={cx(styles.weatherSummary, summary.tone ? weatherToneClass(summary.tone) : null)} aria-live="polite">
      <div className={styles.weatherSummaryTop}>
        <span className={styles.weatherSummaryLabel}>สภาพอากาศทริป</span>
        <span className={styles.weatherSummaryDate}>{dateLabel}</span>
      </div>
      <p className={styles.weatherSummaryTitle}>{summary.title}</p>
      <p className={styles.weatherSummaryMeta}>{summary.meta}</p>

      <div className={styles.weatherDates} role="group" aria-label="เลือกวันพยากรณ์อากาศ">
        <span className={styles.weatherDatesLabel}>เลือกวัน</span>
        {WEATHER_FORECAST_DATES.map((dateKey) => {
          const active = dateKey === selectedDate;

          return (
            <button
              key={dateKey}
              type="button"
              className={cx(styles.weatherDate, active ? styles.weatherDateActive : null)}
              aria-pressed={active}
              onClick={() => onSelectDate(dateKey)}
            >
              {formatThaiShortDate(dateKey)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StopWeather({
  status,
  forecast,
  dateKey,
  stop,
}: {
  status: ForecastStatus;
  forecast: ForecastWeather | null;
  dateKey: string;
  stop: TimedStop;
}) {
  const forecastContext = <ForecastContext dateKey={dateKey} stop={stop} />;

  if (status === "loading") {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>กำลังโหลดอากาศตามเวลาถึง</span>
        {forecastContext}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>เปิดพยากรณ์ไม่ได้ตอนนี้</span>
        {forecastContext}
      </div>
    );
  }

  if (status === "out-of-range") {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>ยังไม่มีข้อมูลพยากรณ์ / ใกล้วันเดินทางจะแม่นขึ้น</span>
        {forecastContext}
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className={cx(styles.stopWeather, styles.stopWeatherMuted)} aria-live="polite">
        <span className={styles.stopWeatherKicker}>พยากรณ์เวลาถึง</span>
        <span className={styles.stopWeatherEmpty}>ไม่มีข้อมูลชั่วโมงนี้</span>
        {forecastContext}
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
      {forecastContext}
      <div className={styles.stopWeatherMetrics}>
        <span>{Math.round(forecast.tempC)}°C</span>
        <span>ฝน {Math.round(forecast.precipProb)}%</span>
        <span>ลม {Math.round(forecast.windKmh)} กม./ชม.</span>
      </div>
    </div>
  );
}

function ForecastContext({ dateKey, stop }: { dateKey: string; stop: TimedStop }) {
  const sampleTime = forecastSampleTime(stop.arrive) ?? stop.arrive;

  return (
    <div className={styles.stopWeatherContext}>
      <div className={styles.stopWeatherContextMeta}>
        <span>{formatThaiShortDate(dateKey)}</span>
        <span>ETA {stop.arrive}</span>
        <span>ข้อมูล {sampleTime}</span>
      </div>
      <span className={styles.stopWeatherLocation}>
        {stop.name} · {stop.place}
      </span>
    </div>
  );
}

function StopRow({
  stop,
  index,
  forecast,
  forecastStatus,
  forecastDate,
}: {
  stop: TimedStop;
  index: number;
  forecast: ForecastWeather | null;
  forecastStatus: ForecastStatus;
  forecastDate: string;
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
        <StopWeather status={forecastStatus} forecast={forecast} dateKey={forecastDate} stop={stop} />
        <p className={styles.stopNote}>{stop.note}</p>

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

function TimelineDayHeader({
  day,
  dateKey,
  route,
  meta,
}: {
  day: "01" | "02";
  dateKey: string;
  route: string;
  meta: string;
}) {
  return (
    <header className={styles.timelineDayHeader}>
      <div>
        <span className={styles.timelineDayIndex}>DAY {day}</span>
        <span className={styles.timelineDayDate}>{formatThaiShortDate(dateKey)}</span>
      </div>
      <h3>{route}</h3>
      <p>{meta}</p>
    </header>
  );
}

export function Trip01Client({ fontClassName }: { fontClassName: string }) {
  const [forecastState, setForecastState] = useState<ForecastState>(() => initialForecastState());
  const [selectedDate, setSelectedDate] = useState<string>(WEATHER_START_DATE);

  useEffect(() => {
    if (!isForecastRangeInRange(new Date())) {
      return undefined;
    }

    const controller = new AbortController();

    // One request covers every selectable day for all stops; the picker just
    // reslices the same hourly series client-side.
    void fetchStopsForecast(FORECAST_POINTS, WEATHER_FETCH_START_DATE, WEATHER_END_DATE, controller.signal)
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

      return series ? pickForecastAtHour(series, stop.arrive, selectedDate) : null;
    });
  }, [forecastState, selectedDate]);

  const planCStopForecasts = useMemo(() => {
    if (forecastState.status !== "ready") {
      return PLAN_C_TIMED_STOPS.map(() => null);
    }

    return PLAN_C_TIMED_STOPS.map((stop, index) => {
      const series = forecastState.series[index];
      const forecastDate = index <= PLAN_C_OVERNIGHT_STOP_INDEX ? PLAN_C_START_DATE : PLAN_C_SECOND_DAY_DATE;

      return series ? pickForecastAtHour(series, stop.arrive, forecastDate) : null;
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
            roadbook 2 วันแบบมือถืออ่านง่าย โทนสว่างสำหรับเปิดกลางวัน — ออกบ่ายวันที่ 12 นอนหลังสวน
            แล้วเข้ากรุงเทพฯ บ่ายต้นวันที่ 13 เน้นจุดเติม PTT เวลาพัก งบประมาณ และเช็กลิสต์สำคัญก่อนออก
          </p>

          <dl className={styles.cluster}>
            <div className={styles.clusterCell}>
              <dt>ระยะรวม</dt>
              <dd>
                ~1,000 <span>กม.</span>
              </dd>
            </div>
            <div className={styles.clusterCell}>
              <dt>ออกตัว</dt>
              <dd>
                13:30 <span>12 ก.ค.</span>
              </dd>
            </div>
            <div className={styles.clusterCell}>
              <dt>ถึง กทม.</dt>
              <dd>
                13:33 <span>–14:45 · 13 ก.ค.</span>
              </dd>
            </div>
            <div className={styles.clusterCell}>
              <dt>งบรวม</dt>
              <dd>
                2,300 <span>–2,800฿</span>
              </dd>
            </div>
          </dl>

          <RouteWeatherSummary
            state={forecastState}
            forecasts={stopForecasts}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#plans">
              ดูแผนเดินทาง ↓
            </a>
            <a className={styles.liveButton} href="/trip/001/live">
              <span className={styles.liveDot} aria-hidden="true" />
              ดูตำแหน่งสด
              <span aria-hidden="true">→</span>
            </a>
            <button className={styles.ghostButton} type="button" onClick={() => window.print()}>
              พิมพ์ / บันทึก
            </button>
          </div>
        </header>

        <TripLiveStatus />

        <section className={styles.block} id="plans">
          <SectionHead
            index="01"
            eyebrow="Trip plan"
            title="แผน Plan C · ออกบ่ายแล้วนอนหลังสวน"
            lead="เส้นทางสงขลา → กรุงเทพฯ แบ่งเป็น 2 วัน — ออก 13:30 วันที่ 12 พักคืนที่โรงแรมหลังสวนเพลส (อ.หลังสวน) แล้วออกต่อเช้าวันที่ 13 เพื่อเข้าเมืองช่วงบ่ายต้น"
          />

          <div className={styles.planOverview}>
            <article className={cx(styles.planCard, styles.planCardAfternoon)} aria-labelledby="plan-afternoon-title">
              <div className={styles.planCardHead}>
                <span className={styles.planTag}>Plan C · 12 Jul</span>
                <span className={cx(styles.planBadge, styles.planBadgeAfternoon)}>ออกบ่าย</span>
              </div>
              <h3 id="plan-afternoon-title" className={styles.planTitle}>
                ออกวันที่ 12 แล้วพักหลังสวนเพลส
              </h3>
              <p className={styles.planIntro}>
                เริ่มเดินทางเวลา 13:30 ถึงปตท. จิงโจ้ หลังสวนราว 19:13 แล้วขี่ต่ออีกประมาณ 6.1 กม. / 5 นาที
                ถึงโรงแรมหลังสวนเพลส ราว 19:18 — ช่วงท้ายเริ่มมืด เปิดไฟขี่ระวัง แล้วพักเต็มคืนก่อนออกเช้าวันที่ 13
              </p>

              <dl className={styles.planStats}>
                <div>
                  <dt>วันแรก</dt>
                  <dd>~422 กม.</dd>
                </div>
                <div>
                  <dt>วันที่สอง</dt>
                  <dd>~578 กม.</dd>
                </div>
                <div>
                  <dt>เข้า กทม.</dt>
                  <dd>บ่ายต้น</dd>
                </div>
              </dl>

              <ol className={styles.planDays}>
                <li>
                  <span className={styles.planDayNo}>12 ก.ค.</span>
                  <div>
                    <strong>สงขลา → หลังสวนเพลส</strong>
                    <span>13:30–ประมาณ 19:18 · ปั๊มจิงโจ้ถึงโรงแรม ~6.1 กม.</span>
                  </div>
                </li>
                <li>
                  <span className={styles.planDayNo}>13 ก.ค.</span>
                  <div>
                    <strong>หลังสวน → รามคำแหง</strong>
                    <span>05:00–13:33 โดยประมาณ · เผื่อรถเข้าเมืองถึง 14:45</span>
                  </div>
                </li>
              </ol>

              <p className={styles.planCost}>
                โรงแรมหลังสวนเพลส · 40/4 ต.วังตะกอ อ.หลังสวน ชุมพร 86110 · โทร 082‑183‑8365 ·
                โรงแรม 2 ดาว ห้องแอร์ + WiFi ฟรี · โทรจองล่วงหน้าได้
              </p>
              <p className={styles.planSafeStop}>
                วันที่ 13 พยากรณ์ฝนฟ้าคะนองช่วงบ่ายแถบเข้า กทม. จึงแนะนำออก 05:00 ให้ถึงรามคำแหงก่อน 15:00
                (เผื่อรถติด +45–90 นาที ยิ่งออกเช้ายิ่งกันพลาด) · ช่วงแรก ~1 ชม. ยังมืด–สลัว ใช้ไฟหน้า+แว่นใส
                และช่วงใต้ฝนหนักทั้งวัน ใส่ชุดกันฝนตั้งแต่ออก · เช็กเรดาร์ก่อนออก ถ้ามีฟ้าผ่าที่หลังสวนให้รอ
                และถ้าเจอพายุตั้งเค้าช่วงเพชรบุรี–พระราม 2 ให้หลบเข้าปั๊มรอก่อน อย่าฝ่าฟ้าผ่าเข้าเมือง
              </p>
            </article>
          </div>

          <h3 className={styles.rulesTitle}>กฎเดินทางของทริปนี้</h3>
          <div className={styles.ruleGrid}>
            {principles.map(([title, text], i) => (
              <article key={title} className={styles.rule}>
                <span className={styles.ruleNo}>{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.block} id="budget">
          <SectionHead
            index="02"
            eyebrow="Trip budget"
            title="งบน้ำมัน + 7‑Eleven + ที่พัก"
            lead="คำนวณจากระยะผ่าน waypoint ~1,000 กม. โดยเริ่มนับ 0 กม. ที่ PTT ม่วงงาม และสมมติฐาน R15v3 วิ่งจริง 35–45 กม./ลิตร"
          />
          <div className={styles.budgetWrap}>
            <article className={styles.budgetHero}>
              <p className={styles.budgetLabel}>พกอย่างน้อย</p>
              <p className={styles.budgetFigure}>2,300–2,800฿</p>
              <p className={styles.budgetSub}>
                Gasohol 95 แบบมี buffer + อาหาร/น้ำ 7‑Eleven ตลอด 2 วัน + ที่พักหลังสวน 1 คืน + เงินเผื่อฉุกเฉิน
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
            index="03"
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

        <section className={styles.block} id="stops">
          <SectionHead
            index="04"
            eyebrow="PTT stops"
            title="ไทม์ไลน์จุดเติม + พัก"
            lead="ไทม์ไลน์จุดเติม PTT และเวลาพักของ Plan C — วันแรกออก 13:30 ถึงโรงแรมหลังสวนเพลส ช่วงค่ำ พักคืน แล้วออกต่อ 05:00 เช้าวันที่ 13 (เลี่ยงพายุบ่ายตอนเข้า กทม.) ถึงกรุงเทพฯ ช่วงบ่ายต้น"
          />

          <div>
            <TimelineDayHeader
              day="01"
              dateKey={PLAN_C_START_DATE}
              route="สงขลา → โรงแรมหลังสวนเพลส"
              meta="ออก 13:30 · ถึงประมาณ 19:18 · ระยะวันแรก ~422 กม."
            />
            <ol className={styles.timeline}>
              {PLAN_C_DAY_ONE.map((stop, index) => (
                <StopRow
                  key={`afternoon-one-${stop.name}`}
                  stop={stop}
                  index={index}
                  forecast={planCStopForecasts[index] ?? null}
                  forecastStatus={forecastState.status}
                  forecastDate={PLAN_C_START_DATE}
                />
              ))}
            </ol>

            <div className={styles.overnightDivider} role="note">
              <span>พักคืนวันที่ 12</span>
              <strong>โรงแรมหลังสวนเพลส · ห่างจากปั๊มจิงโจ้ หลังสวน ~6.1 กม. / 5 นาที</strong>
              <p>40/4 ต.วังตะกอ อ.หลังสวน ชุมพร 86110 · โทร 082‑183‑8365 · โรงแรม 2 ดาว ห้องแอร์ + WiFi ฟรี</p>
              <a href={mapsLink(PLAN_C_HOTEL_COORDS)} target="_blank" rel="noreferrer" className={styles.overnightMapLink}>
                เปิดพิกัดโรงแรม ↗
              </a>
            </div>

            <TimelineDayHeader
              day="02"
              dateKey={PLAN_C_SECOND_DAY_DATE}
              route="หลังสวน → รามคำแหง"
              meta="แนะนำออก 05:00 เลี่ยงพายุบ่าย · ถึง 13:33–14:45 · ระยะวันที่สอง ~578 กม."
            />
            <ol className={cx(styles.timeline, styles.timelineDayTwo)}>
              {PLAN_C_DAY_TWO.map((stop, dayIndex) => {
                const stopIndex = PLAN_C_DAY_ONE.length + dayIndex;

                return (
                  <StopRow
                    key={`afternoon-two-${stop.name}`}
                    stop={stop}
                    index={stopIndex}
                    forecast={planCStopForecasts[stopIndex] ?? null}
                    forecastStatus={forecastState.status}
                    forecastDate={PLAN_C_SECOND_DAY_DATE}
                  />
                );
              })}
            </ol>
          </div>
        </section>

        <footer className={styles.footer}>
          <p className={styles.footerNote}>
            ใช้เป็น roadbook ส่วนตัว ไม่ใช่คำสั่งให้ยึดเวลาเป๊ะ — ถ้าเริ่มง่วง ตาล้า ปวดข้อมือ
            หรือฝนหนัก ให้พักหรือเลื่อนเวลาออกทันที
          </p>
          <p className={styles.footerMeta}>
            ETA: ออก 13:30 (12 ก.ค.) · เริ่มนับ 0 กม. ที่ PTT ม่วงงาม · นอนโรงแรมหลังสวนเพลส · ออกต่อ 05:00 (13 ก.ค.) ·
            ถึงรามคำแหง 13:33–14:45 · ทางหลัก 85–90 · สมุทรสาคร–รามคำแหง 70 กม./ชม.
          </p>
        </footer>
      </div>
    </main>
  );
}

function summarizeRouteWeather(
  state: ForecastState,
  forecasts: Array<ForecastWeather | null>,
  dateLabel: string
): { title: string; meta: string; tone: WeatherTone | null } {
  if (state.status === "loading") {
    return {
      title: `${dateLabel} · กำลังโหลดพยากรณ์ตามเวลาถึง`,
      meta: "เรียก Open-Meteo หนึ่งครั้งสำหรับ 10 จุดพัก",
      tone: null,
    };
  }

  if (state.status === "error") {
    return {
      title: `${dateLabel} · เปิดพยากรณ์ไม่ได้ตอนนี้`,
      meta: "ข้ามข้อมูลอากาศไว้ก่อน แผนจุดพักยังใช้ได้ตามเดิม",
      tone: null,
    };
  }

  if (state.status === "out-of-range") {
    return {
      title: `${dateLabel} · ยังไม่มีข้อมูลพยากรณ์`,
      meta: "ยังไม่มีข้อมูลพยากรณ์ / ใกล้วันเดินทางจะแม่นขึ้น",
      tone: null,
    };
  }

  const dominant = dominantWeather(forecasts);
  const rainiest = rainiestStop(forecasts);

  if (!dominant || !rainiest) {
    return {
      title: `${dateLabel} · ยังไม่มีข้อมูลชั่วโมงเวลาถึง`,
      meta: "Open-Meteo ตอบกลับแล้ว แต่ข้อมูลรายชั่วโมงไม่ครบสำหรับจุดพัก",
      tone: null,
    };
  }

  return {
    title: `${dateLabel} · ส่วนใหญ่ ${dominant.label}`,
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

function shiftDateKey(value: string, days: number): string | null {
  const dateMs = dateKeyToUtcMs(value);

  if (dateMs === null) {
    return null;
  }

  return new Date(dateMs + days * DAY_MS).toISOString().slice(0, 10);
}

function isForecastDateInRange(now: Date, dateKey: string): boolean {
  const todayMs = dateKeyToUtcMs(bangkokDateKey(now));
  const forecastMs = dateKeyToUtcMs(dateKey);

  if (todayMs === null || forecastMs === null) {
    return false;
  }

  const diffDays = Math.round((forecastMs - todayMs) / DAY_MS);

  return diffDays >= 0 && diffDays <= WEATHER_FORECAST_MAX_DAYS;
}

// Worth fetching as long as any selectable day still falls in the forecast window.
function isForecastRangeInRange(now: Date): boolean {
  return [PLAN_C_START_DATE, ...WEATHER_FORECAST_DATES].some((dateKey) => isForecastDateInRange(now, dateKey));
}

function initialForecastState(): ForecastState {
  return isForecastRangeInRange(new Date()) ? { status: "loading" } : { status: "out-of-range" };
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
