// Dates are handled as local "YYYY-MM-DD" strings and months as "YYYY-MM" keys,
// so they compare and sort as plain text and never shift with time zones.

const pad2 = n => String(n).padStart(2, "0");

export function toDateStr(d){ return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
export function todayStr(){ return toDateStr(new Date()); }
export function monthKeyOf(dateStr){ return dateStr.slice(0, 7); }
export function currentMonthKey(){ return monthKeyOf(todayStr()); }
export function dayOfMonth(dateStr){ return parseInt(dateStr.slice(8, 10), 10); }

// Rejects impossible dates such as 2026-02-30
export function isValidDateStr(s){
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d)) === s;
}
export function isValidMonthKey(s){ return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }

// Moves a month key by whole months. Always works from the 1st, so the 31st can't spill into the next month.
export function shiftMonthKey(key, delta){
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
}
export function daysInMonth(key){
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthLabel(key){
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
// "Oct", for chart labels
export function shortMonthLabel(key){
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}
// "1 Oct" (the year is added when it isn't this year)
export function shortDate(dateStr){
  const [y, m, d] = dateStr.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString(undefined, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

export function addDays(dateStr, days){
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}
// Whole calendar days from d1 to d2 (rounding absorbs daylight-saving hours)
export function daysBetween(d1, d2){
  return Math.round((new Date(d2 + "T00:00:00") - new Date(d1 + "T00:00:00")) / 86400000);
}
