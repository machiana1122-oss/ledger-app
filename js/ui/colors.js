// Category colours. Every category gets a colour of its own, from its place in the category lists
// (expense categories first, as they share the spending chart), so no two categories ever share
// one. The first 8 are the most distinct from each other - checked for normal and colour-blind
// vision against the card colour, and kept clear of the gold and rust that mean money in and out -
// and the rest fill the gaps between them. Categories that were removed but are still on old
// transactions come after the lists, so they keep a colour of their own too.

const PALETTE = [
  "#a29700", "#0098fa", "#6f54d6", "#00ac90", "#cf61cd", "#c02b6c", "#007c9c", "#008819",
  "#5d73f1", "#cb469d", "#9444be", "#00b05a", "#009a64", "#669200", "#b153c7", "#0091ab"
];

// Past the palette (more than 16 categories), more hues spread around the colour wheel.
// Always "#rrggbb", as History adds transparency to it ("#rrggbb22").
const colorAt = i => i < PALETTE.length ? PALETTE[i] : hslToHex(i * 137.508 % 360, 0.6, 0.52);

function hslToHex(hue, sat, light){
  const k = n => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const channel = n => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [0, 8, 4].map(n => Math.round(channel(n) * 255).toString(16).padStart(2, "0")).join("");
}

// Returns a function giving each category's colour. Make it once per drawing.
export function categoryColors(state){
  const names = [];
  const add = name => { if (!names.includes(name)) names.push(name); };
  const onTransactions = type => [...new Set(state.transactions.filter(t => t.type === type).map(t => t.category))].sort();
  state.categories.expense.forEach(add);
  onTransactions("expense").forEach(add);
  state.categories.income.forEach(add);
  onTransactions("income").forEach(add);
  const colors = new Map(names.map((name, i) => [name, colorAt(i)]));
  return name => colors.get(name) || colorAt(names.length);
}
