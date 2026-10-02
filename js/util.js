// Small general helpers

export const clone = value => JSON.parse(JSON.stringify(value));
export const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
export const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

export function makeId(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}
