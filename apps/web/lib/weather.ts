// Trip departure day + the following days — all selectable on the roadbook.
export const WEATHER_FORECAST_DATES = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"] as const;
export const WEATHER_FORECAST_DATE = WEATHER_FORECAST_DATES[0];
export const WEATHER_FORECAST_MAX_DAYS = 16;

const THAI_MONTHS_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;

// "2026-07-13" → "13 ก.ค."
export function formatThaiShortDate(dateKey: string): string {
  const parts = dateKey.split("-");
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const abbr = Number.isInteger(month) ? THAI_MONTHS_ABBR[month - 1] : undefined;

  if (!Number.isInteger(day) || !abbr) {
    return dateKey;
  }

  return `${day} ${abbr}`;
}

const OPEN_METEO_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
] as const;
const HOURLY_FIELDS = [
  "temperature_2m",
  "precipitation_probability",
  "weather_code",
  "wind_speed_10m",
] as const;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MINUTES_PER_DAY = 24 * 60;

export type WeatherTone = "clear" | "cloud" | "rain" | "storm" | "fog";

export type WeatherDescription = {
  label: string;
  icon: string;
  tone: WeatherTone;
};

export type CurrentWeather = {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  precipMm: number;
  windKmh: number;
  code: number;
};

export type ForecastPoint = {
  lat: number;
  lon: number;
};

export type HourlySeries = {
  time: string[];
  temperature2m: number[];
  precipitationProbability: number[];
  weatherCode: number[];
  windSpeed10m: number[];
};

export type ForecastWeather = {
  tempC: number;
  precipProb: number;
  windKmh: number;
  code: number;
};

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<CurrentWeather> {
  assertCoordinate(lat, lon);

  const response = await fetch(
    openMeteoUrl({
      latitude: formatCoordinate(lat),
      longitude: formatCoordinate(lon),
      current: CURRENT_FIELDS.join(","),
      timezone: "auto",
    }),
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    }
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error("Open-Meteo current weather request failed");
  }

  const weather = coerceCurrentWeather(body);

  if (!weather) {
    throw new Error("Open-Meteo current weather response was invalid");
  }

  return weather;
}

export async function fetchStopsForecast(
  points: readonly ForecastPoint[],
  startDate: string,
  endDate: string,
  signal?: AbortSignal
): Promise<HourlySeries[]> {
  for (const point of points) {
    assertCoordinate(point.lat, point.lon);
  }

  if (points.length === 0) {
    return [];
  }

  const response = await fetch(
    openMeteoUrl({
      latitude: points.map((point) => formatCoordinate(point.lat)).join(","),
      longitude: points.map((point) => formatCoordinate(point.lon)).join(","),
      hourly: HOURLY_FIELDS.join(","),
      start_date: startDate,
      end_date: endDate,
      timezone: "Asia/Bangkok",
    }),
    {
      headers: { Accept: "application/json" },
      signal,
    }
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error("Open-Meteo stops forecast request failed");
  }

  const responses = Array.isArray(body) ? body : [body];

  return points.map((_, index) => {
    const entry = responses[index];
    const series = coerceHourlySeries(entry);

    if (!series) {
      throw new Error("Open-Meteo stops forecast response was invalid");
    }

    return series;
  });
}

export function pickForecastAtHour(
  series: HourlySeries,
  hhmm: string,
  dateKey?: string
): ForecastWeather | null {
  const targetMinutes = roundHHMMToHourMinutes(hhmm);

  if (targetMinutes === null) {
    return null;
  }

  const index = findHourlyIndex(series.time, targetMinutes, dateKey);

  if (index === null) {
    return null;
  }

  const tempC = series.temperature2m[index];
  const precipProb = series.precipitationProbability[index];
  const windKmh = series.windSpeed10m[index];
  const code = series.weatherCode[index];

  if (
    !isFiniteNumber(tempC) ||
    !isFiniteNumber(precipProb) ||
    !isFiniteNumber(windKmh) ||
    !isFiniteNumber(code)
  ) {
    return null;
  }

  return {
    tempC,
    precipProb,
    windKmh,
    code: Math.round(code),
  };
}

export function forecastSampleTime(hhmm: string): string | null {
  const minutes = roundHHMMToHourMinutes(hhmm);

  if (minutes === null) {
    return null;
  }

  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const remainder = String(minutes % 60).padStart(2, "0");

  return `${hours}:${remainder}`;
}

export function describeWeather(code: number): WeatherDescription {
  if (code === 0) {
    return { label: "ท้องฟ้าโปร่ง", icon: "☀️", tone: "clear" };
  }

  if (code === 1 || code === 2) {
    return { label: "มีเมฆบางส่วน", icon: "🌤️", tone: "cloud" };
  }

  if (code === 3) {
    return { label: "เมฆมาก", icon: "☁️", tone: "cloud" };
  }

  if (code === 45 || code === 48) {
    return { label: "หมอก", icon: "🌫️", tone: "fog" };
  }

  if (code === 51 || code === 53 || code === 55) {
    return { label: "ฝนปรอย", icon: "🌦️", tone: "rain" };
  }

  if (code === 61 || code === 63 || code === 65) {
    return { label: "ฝนตก", icon: "🌧️", tone: "rain" };
  }

  if (code === 66 || code === 67) {
    return { label: "ฝนเยือกแข็ง", icon: "🌧️", tone: "rain" };
  }

  if (code === 71 || code === 73 || code === 75 || code === 77) {
    return { label: "หิมะ", icon: "🌨️", tone: "rain" };
  }

  if (code === 80 || code === 81 || code === 82) {
    return { label: "ฝนซู่", icon: "🌦️", tone: "rain" };
  }

  if (code === 95) {
    return { label: "พายุฝนฟ้าคะนอง", icon: "⛈️", tone: "storm" };
  }

  if (code === 96 || code === 99) {
    return { label: "พายุฝนฟ้าคะนองมีลูกเห็บ", icon: "⛈️", tone: "storm" };
  }

  return { label: "ไม่ทราบสภาพอากาศ", icon: "·", tone: "cloud" };
}

function openMeteoUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);

  return `${OPEN_METEO_FORECAST_ENDPOINT}?${searchParams.toString()}`;
}

function formatCoordinate(value: number): string {
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function assertCoordinate(lat: number, lon: number): void {
  if (
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lon) ||
    lat < MIN_LATITUDE ||
    lat > MAX_LATITUDE ||
    lon < MIN_LONGITUDE ||
    lon > MAX_LONGITUDE
  ) {
    throw new Error("Invalid weather coordinate");
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    return null;
  }
}

function coerceCurrentWeather(value: unknown): CurrentWeather | null {
  if (!isRecord(value) || !isRecord(value.current)) {
    return null;
  }

  const current = value.current;
  const tempC = readFiniteNumber(current, "temperature_2m");
  const feelsLikeC = readFiniteNumber(current, "apparent_temperature");
  const humidity = readFiniteNumber(current, "relative_humidity_2m");
  const precipMm = readFiniteNumber(current, "precipitation");
  const windKmh = readFiniteNumber(current, "wind_speed_10m");
  const code = readFiniteNumber(current, "weather_code");

  if (
    tempC === null ||
    feelsLikeC === null ||
    humidity === null ||
    precipMm === null ||
    windKmh === null ||
    code === null
  ) {
    return null;
  }

  return {
    tempC,
    feelsLikeC,
    humidity,
    precipMm,
    windKmh,
    code: Math.round(code),
  };
}

function coerceHourlySeries(value: unknown): HourlySeries | null {
  if (!isRecord(value) || !isRecord(value.hourly)) {
    return null;
  }

  const hourly = value.hourly;
  const time = readStringArray(hourly, "time");
  const temperature2m = readNumberArray(hourly, "temperature_2m");
  const precipitationProbability = readNumberArray(hourly, "precipitation_probability");
  const weatherCode = readNumberArray(hourly, "weather_code");
  const windSpeed10m = readNumberArray(hourly, "wind_speed_10m");

  if (!time || !temperature2m || !precipitationProbability || !weatherCode || !windSpeed10m) {
    return null;
  }

  return {
    time,
    temperature2m,
    precipitationProbability,
    weatherCode,
    windSpeed10m,
  };
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | null {
  const value = record[key];

  if (!Array.isArray(value)) {
    return null;
  }

  const strings: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }

    strings.push(item);
  }

  return strings;
}

function readNumberArray(record: Record<string, unknown>, key: string): number[] | null {
  const value = record[key];

  if (!Array.isArray(value)) {
    return null;
  }

  const numbers: number[] = [];

  for (const item of value) {
    if (!isFiniteNumber(item)) {
      return null;
    }

    numbers.push(item);
  }

  return numbers;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  return isFiniteNumber(value) ? value : null;
}

function roundHHMMToHourMinutes(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);

  if (!match) {
    return null;
  }

  const hourText = match[1];
  const minuteText = match[2];

  if (hourText === undefined || minuteText === undefined) {
    return null;
  }

  const hours = Number(hourText);
  const minutes = Number(minuteText);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const rounded = Math.round((hours * 60 + minutes) / 60) * 60;

  return rounded >= MINUTES_PER_DAY ? null : rounded;
}

function findHourlyIndex(
  times: readonly string[],
  targetMinutes: number,
  dateKey?: string
): number | null {
  let matchedIndex: number | null = null;

  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];

    if (time === undefined) {
      continue;
    }

    if (dateKey && !time.startsWith(`${dateKey}T`)) {
      continue;
    }

    const minutes = minutesFromOpenMeteoTime(time);

    if (minutes === targetMinutes) {
      matchedIndex = index;
      break;
    }
  }

  return matchedIndex;
}

function minutesFromOpenMeteoTime(value: string): number | null {
  const match = /T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hourText = match[1];
  const minuteText = match[2];

  if (hourText === undefined || minuteText === undefined) {
    return null;
  }

  const hours = Number(hourText);
  const minutes = Number(minuteText);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
