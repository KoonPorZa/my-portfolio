// Single source of truth for the Plan C itinerary (Songkhla -> Bangkok, 2 days,
// overnight at Langsuan Place / โรงแรมหลังสวนเพลส). Both the /trip/001 roadbook and the shared
// TripProgressTimeline (used on /live and /share) build their "แผน" times from
// here, so the plan can never drift between the pages again.
import { buildTimedStops, toHHMM, type TimedStop } from "./trip-stops";

export const PLAN_C_START_DATE = "2026-07-12";
export const PLAN_C_SECOND_DAY_DATE = "2026-07-13";
export const PLAN_C_OVERNIGHT_STOP_INDEX = 3;
export const PLAN_C_SECOND_DAY_START_MINUTES = 5 * 60;
export const PLAN_C_HOTEL_COORDS: [number, number] = [9.9633216, 99.0684246];

export function buildSplitTimeline(
  allStops: readonly TimedStop[],
  options: {
    overnightStopIndex: number;
    firstDayStartMinutes: number;
    secondDayStartMinutes: number;
    secondDayFirstLegMinutes?: number;
    overnightRole?: string;
    overnightNote?: string;
  }
): {
  dayOne: TimedStop[];
  dayTwo: TimedStop[];
} {
  let firstDayClock = options.firstDayStartMinutes;
  const dayOne = allStops.slice(0, options.overnightStopIndex + 1).map((stop, index) => {
    const arriveMinutes = firstDayClock + stop.rideMin;
    const isOvernightStop = index === options.overnightStopIndex;
    const depart = isOvernightStop
      ? `${toHHMM(options.secondDayStartMinutes)} วันถัดไป`
      : toHHMM(arriveMinutes + stop.restMin);

    firstDayClock = arriveMinutes + stop.restMin;

    return {
      ...stop,
      arrive: toHHMM(arriveMinutes),
      arriveMinutes,
      depart,
      restLabel: isOvernightStop ? "ค้างคืน" : stop.restMin ? `${stop.restMin} นาที` : "ไม่พักต่อ",
      role: isOvernightStop ? (options.overnightRole ?? "จบทริปวันแรก / พักค้างคืน") : stop.role,
      note: isOvernightStop
        ? (options.overnightNote ??
          "เช็กอิน พักร่างกายและรถให้เต็มคืน ก่อนตรวจโซ่ ลมยาง น้ำมัน และอากาศอีกครั้งตอนเช้า")
        : stop.note,
      tags: isOvernightStop ? ["พักค้างคืน", "พักรถ"] : stop.tags,
    };
  });

  let clock = options.secondDayStartMinutes;
  const dayTwo = allStops.slice(options.overnightStopIndex + 1).map((stop, index) => {
    const rideMin = index === 0 ? (options.secondDayFirstLegMinutes ?? stop.rideMin) : stop.rideMin;
    const arriveMinutes = clock + rideMin;
    const depart = stop.restMin ? toHHMM(arriveMinutes + stop.restMin) : "จบทริป";

    clock = arriveMinutes + stop.restMin;

    return {
      ...stop,
      rideMin,
      arrive: toHHMM(arriveMinutes),
      arriveMinutes,
      depart,
      restLabel: stop.restMin ? `${stop.restMin} นาที` : "ไม่พักต่อ",
    };
  });

  return { dayOne, dayTwo };
}

const PLAN_C_TIMELINE = buildSplitTimeline(buildTimedStops(), {
  overnightStopIndex: PLAN_C_OVERNIGHT_STOP_INDEX,
  firstDayStartMinutes: 13 * 60 + 30,
  secondDayStartMinutes: PLAN_C_SECOND_DAY_START_MINUTES,
  secondDayFirstLegMinutes: 48,
  overnightRole: "จบทริปวันแรก / ไปโรงแรมหลังสวนเพลส",
  overnightNote:
    "จบวันแรกที่ปั๊มจิงโจ้ หลังสวน แล้วขี่ต่ออีกประมาณ 6.1 กม. / 5 นาทีถึงโรงแรมหลังสวนเพลส เช็กอิน พักเต็มคืน ก่อนออกเช้าวันที่ 13",
});

export const PLAN_C_DAY_ONE = PLAN_C_TIMELINE.dayOne;
export const PLAN_C_DAY_TWO = PLAN_C_TIMELINE.dayTwo;
export const PLAN_C_TIMED_STOPS = [...PLAN_C_DAY_ONE, ...PLAN_C_DAY_TWO];
