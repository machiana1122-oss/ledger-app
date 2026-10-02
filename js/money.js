// All amounts are stored as whole cents (12.50 -> 1250), so adding them up is always exact.

// Typed text -> cents, or NaN. A comma is accepted as the decimal point ("12,5").
export function parseAmount(text){
  if (text === null || text === undefined) return NaN;
  const value = parseFloat(String(text).trim().replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

// Cents -> "1,234.56 DH" (thousands separators follow the phone's language)
export function formatMoney(cents, currency){
  const sign = cents < 0 ? "-" : "";
  const amount = Math.abs(cents) / 100;
  return sign + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
}

// Cents -> plain text for an input field ("1250.5"), so editing shows what was typed
export function centsToInput(cents){ return String(cents / 100); }
