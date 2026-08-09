export type TimeFormat = "12" | "24";

const STORAGE_KEY = "vire.timeFormat";

export function readTimeFormat(): TimeFormat {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "12" || raw === "24") return raw;
  } catch {
    /* ignore */
  }
  return "24";
}

export function writeTimeFormat(format: TimeFormat): void {
  try {
    localStorage.setItem(STORAGE_KEY, format);
  } catch {
    /* ignore */
  }
}

/** Format an "HH:MM" or "HH:MM:SS" string for display. */
export function formatTime(hhmm: string, format: TimeFormat): string {
  const parts = hhmm.trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm.slice(0, 5);

  if (format === "24") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Short range for tight calendar blocks, e.g. "2–3p" or "14:00–15:00". */
export function formatTimeRangeCompact(
  start: string,
  end: string,
  format: TimeFormat,
): string {
  if (format === "24") {
    return `${formatTime(start, "24")}–${formatTime(end, "24")}`;
  }

  const sp = start.trim().split(":");
  const ep = end.trim().split(":");
  const sh = Number(sp[0]);
  const sm = Number(sp[1] ?? 0);
  const eh = Number(ep[0]);
  const em = Number(ep[1] ?? 0);

  function piece(h: number, m: number, withPeriod: boolean): string {
    const period = h >= 12 ? "p" : "a";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const core = m === 0 ? String(hour12) : `${hour12}:${String(m).padStart(2, "0")}`;
    return withPeriod ? `${core}${period}` : core;
  }

  const samePeriod = sh >= 12 === eh >= 12;
  if (samePeriod) {
    return `${piece(sh, sm, false)}–${piece(eh, em, true)}`;
  }
  return `${piece(sh, sm, true)}–${piece(eh, em, true)}`;
}

/** Minutes since midnight from "HH:MM" / "HH:MM:SS". */
export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

/** "HH:MM" from minutes since midnight. */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
