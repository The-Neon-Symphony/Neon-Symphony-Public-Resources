import { toLocalString } from "./time.js";

const time = (sec) => toLocalString(sec).replace("T", " ");
const clean = (name) => String(name || "").replace(/[:;#]/g, " ").trim() || "(unnamed)";
let run = 0;

function section(title, items, startKey, endFor, nameFor) {
  const rows = items
    .filter((i) => Number.isFinite(i[startKey]) && Number.isFinite(endFor(i)) && endFor(i) > i[startKey])
    .sort((a, b) => a[startKey] - b[startKey])
    .map((i) => `    ${clean(nameFor(i))} :${time(i[startKey])}, ${time(endFor(i))}`);
  return rows.length ? [`  section ${title}`, ...rows] : [];
}

export function buildGantt(data) {
  const lines = [
    ...section("Display windows", data.displayActive, "start", (w) => w.finish, (w) => w.name),
    ...section("Performers", data.performers, "startTime", (p) => p.startTime + (p.setLength || 0) * 60, (p) => p.name),
  ];
  if (!lines.length) return null;
  return ["gantt", "  dateFormat YYYY-MM-DD HH:mm:ss", "  axisFormat %a %H:%M", "  tickInterval 1hour", ...lines].join("\n");
}

// Mermaid is a global from a classic <script> tag in index.html.
export async function renderGantt(box, source) {
  if (typeof mermaid === "undefined") {
    box.textContent = "Mermaid failed to load (are you offline?).";
    return;
  }
  if (!source) {
    box.textContent = "Nothing to show yet.";
    return;
  }
  const current = ++run;
  try {
    const { svg } = await mermaid.render(`timeline-${current}`, source);
    if (current === run) box.innerHTML = svg;
  } catch (err) {
    if (current === run) box.textContent = `Timeline error: ${err.message || err}`;
  }
}
