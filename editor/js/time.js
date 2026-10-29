const pad = (n) => String(n).padStart(2, "0");

export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// datetime-local strings <-> epoch seconds
export function toLocalString(sec) {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function toUtcString(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 19);
}

export function fromLocalString(s) {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

export function fromUtcString(s) {
  const t = new Date(`${s}Z`).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}
