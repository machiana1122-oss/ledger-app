// Safe HTML building. Everything put into the page goes through html`...`, which escapes every
// value by default, so text from the user or from a backup file can never become markup.
//
//   html`<p>${note}</p>`          note is escaped
//   html`<ul>${items.map(...)}</ul>` arrays and nested html`` are inserted as-is

class SafeHtml {
  constructor(text){ this.text = text; }
  toString(){ return this.text; }
}

export function html(strings, ...values){
  let out = strings[0];
  values.forEach((value, i) => { out += toHtml(value) + strings[i + 1]; });
  return new SafeHtml(out);
}

function toHtml(value){
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(toHtml).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

export function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function setHtml(el, content){ el.innerHTML = toHtml(content); }
