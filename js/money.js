// All amounts are stored as whole cents (12.50 -> 1250), so adding them up is always exact.

// Largest amount accepted (cents) - far above any personal amount, well inside exact whole numbers
const MAX_CENTS = 99999999999;

// Typed text -> cents, or NaN when it isn't clearly an amount. Accepts the usual ways of writing
// money: "1500", "12.50" or "12,50" (comma or point for decimals), a sign ("-200"), and thousands
// separated by spaces, commas or points ("1 500", "1,500.50", "1.500,50"). Money has at most two
// decimals, so a separator followed by exactly three digits separates thousands ("1,500" is 1500).
// Arabic-Indic digits and separators are read too. Anything else ("1 50", "1.5000", "12abc",
// "1e5") is refused rather than guessed.
export function parseAmount(text){
  if (text === null || text === undefined) return NaN;
  let s = String(text).trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".").replace(/٬/g, ",")
    .replace(/[\s  ]+/g, " ");
  let sign = 1;
  if (/^[-−]/.test(s)){ sign = -1; s = s.slice(1).trim(); }
  else if (s.startsWith("+")) s = s.slice(1).trim();
  s = s.replace(/[.,]$/, ""); // "12." while typing
  if (!/^[\d., ]*\d[\d., ]*$/.test(s)) return NaN;

  // The decimal separator: the last point or comma, when one or two digits follow it
  let whole = s, decimals = "", decimalMark = null;
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (last !== -1 && /^\d{1,2}$/.test(s.slice(last + 1))){
    decimalMark = s[last];
    whole = s.slice(0, last);
    decimals = s.slice(last + 1);
  }
  // What's left is digits, possibly in groups of three split by one kind of separator
  const separators = new Set(whole.replace(/\d/g, ""));
  if (separators.size > 1 || separators.has(decimalMark)) return NaN;
  if (separators.size === 1){
    const groups = whole.split([...separators][0]);
    if (!/^[1-9]\d{0,2}$/.test(groups[0]) || !groups.slice(1).every(g => /^\d{3}$/.test(g))) return NaN;
  }
  const cents = Number(whole.replace(/\D/g, "") || "0") * 100 + Number(decimals.padEnd(2, "0") || "0");
  if (!(cents <= MAX_CENTS)) return NaN;
  return cents === 0 ? 0 : sign * cents;
}

// Cents -> "1,234.56 DH" (thousands separators follow the phone's language)
export function formatMoney(cents, currency){
  const sign = cents < 0 ? "-" : "";
  const amount = Math.abs(cents) / 100;
  return sign + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
}

// Cents -> plain text for an input field ("1250.5"), so editing shows what was typed
export function centsToInput(cents){ return String(cents / 100); }
