// Category colours: each name always gets the same colour from the palette

const CATEGORY_COLORS = ["#E3BB63", "#6FA08F", "#CB5F35", "#8C7FB0", "#5B8FA8", "#C97B8B", "#A3A15C", "#D4876A"];

export function colorForCategory(name){
  const str = String(name);
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}
