"use strict";

let data = { messages: {}, displayActive: [], performers: [] };

const $ = (selector) => document.querySelector(selector);
const pad = (n) => String(n).padStart(2, "0");
const TIMESTAMP_KEYS = new Set(["start", "finish", "startTime"]);
const MULTILINE_KEYS = new Set(["pre", "inter", "post"]);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

$("#tzname").textContent = TZ;

// --- time conversion (datetime-local strings <-> epoch seconds) ---

function toLocalString(sec) {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toUtcString(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 19);
}

function fromLocalString(s) {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

function fromUtcString(s) {
  const t = new Date(`${s}Z`).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

// --- DOM helpers ---

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

const labeled = (text, input) => el("label", { class: "field" }, text, input);

function onChange() {
  $("#out").value = `${JSON.stringify(data, null, 4)}\n`;
  $("#jsonErr").textContent = "";
}

function setStatus(message, isError = false) {
  const status = $("#status");
  status.textContent = message;
  status.className = isError ? "status error" : "status";
}

// --- field editors ---

function timestampField(obj, key) {
  const local = el("input", { type: "datetime-local", step: "1" });
  const utc = el("input", { type: "datetime-local", step: "1" });
  const epoch = el("input", { type: "number", step: "1" });

  const sync = (source) => {
    const value = obj[key];
    const valid = Number.isFinite(value);
    if (source !== epoch) epoch.value = value;
    if (source !== local) local.value = valid ? toLocalString(value) : "";
    if (source !== utc) utc.value = valid ? toUtcString(value) : "";
  };

  const bind = (input, parse) => {
    input.oninput = () => {
      const sec = input.value === "" ? null : parse(input.value);
      if (sec === null) return;
      obj[key] = sec;
      sync(input);
      onChange();
    };
  };
  bind(local, fromLocalString);
  bind(utc, fromUtcString);
  bind(epoch, (v) => parseInt(v, 10));

  sync();
  return el("div", { class: "timestamp" },
    el("span", { class: "timestamp__title" }, key),
    labeled(`Local (${TZ})`, local),
    labeled("UTC", utc),
    labeled("Epoch seconds", epoch));
}

function creditsField(obj, key) {
  const grid = el("div", { class: "grid" });
  for (const role of Object.keys(obj[key])) {
    const area = el("textarea", { rows: 3 });
    area.value = obj[key][role].join("\n");
    area.oninput = () => {
      obj[key][role] = area.value.split("\n").map((s) => s.trim()).filter(Boolean);
      onChange();
    };
    grid.append(labeled(role, area));
  }
  return el("div", { class: "credits" }, el("div", { class: "hint" }, `${key} (one name per line)`), grid);
}

function field(obj, key) {
  const value = obj[key];

  if (TIMESTAMP_KEYS.has(key) && typeof value === "number") return timestampField(obj, key);
  if (key === "credits" && value && typeof value === "object") return creditsField(obj, key);

  if (typeof value === "boolean") {
    const box = el("input", { type: "checkbox" });
    box.checked = value;
    box.onchange = () => { obj[key] = box.checked; onChange(); };
    return el("label", { class: "field field--check" }, box, key);
  }

  if (typeof value === "number") {
    const input = el("input", { type: "number" });
    input.value = value;
    input.oninput = () => {
      if (input.value === "") return;
      obj[key] = Number(input.value);
      onChange();
    };
    return labeled(key, input);
  }

  if (typeof value === "string") {
    const multiline = MULTILINE_KEYS.has(key) || value.includes("\n");
    const input = multiline ? el("textarea", { rows: 3 }) : el("input", { type: "text" });
    input.value = value;
    input.oninput = () => { obj[key] = input.value; onChange(); };
    return labeled(key, input);
  }

  // Unknown/nested values are edited as raw JSON so they are never lost.
  const area = el("textarea", { rows: 4 });
  area.value = JSON.stringify(value, null, 2);
  area.oninput = () => {
    try {
      obj[key] = JSON.parse(area.value);
      area.classList.remove("invalid");
      onChange();
    } catch {
      area.classList.add("invalid");
    }
  };
  return labeled(`${key} (raw JSON)`, area);
}

function fields(obj) {
  const grid = el("div", { class: "grid" });
  for (const key of Object.keys(obj)) grid.append(field(obj, key));
  return grid;
}

// --- lists ---

function moveItem(arr, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return;
  [arr[index], arr[target]] = [arr[target], arr[index]];
  render();
  onChange();
}

function button(text, cls, handler, title) {
  return el("button", { class: `btn btn--${cls}`, title: title || "", onclick: handler }, text);
}

function listSection(title, arr, makeNew, labelFor) {
  const section = el("section", { class: "section" },
    el("h2", {}, title, button("+ Add", "secondary", () => { arr.push(makeNew()); render(); onChange(); })));

  arr.forEach((item, i) => {
    const actions = el("span", {},
      button("↑", "secondary", () => moveItem(arr, i, -1), "Move up"), " ",
      button("↓", "secondary", () => moveItem(arr, i, 1), "Move down"), " ",
      button("Duplicate", "secondary", () => { arr.splice(i + 1, 0, structuredClone(item)); render(); onChange(); }), " ",
      button("Delete", "danger", () => { arr.splice(i, 1); render(); onChange(); }));
    section.append(el("div", { class: "card" },
      el("div", { class: "card__head" }, el("span", {}, labelFor(item, i)), actions),
      fields(item)));
  });
  return section;
}

function newPerformer() {
  const last = data.performers.at(-1);
  const startTime = last ? last.startTime + (last.setLength || 60) * 60 : Math.floor(Date.now() / 1000);
  return { name: "", startTime, setLength: 60, logoName: "", genre: "", credits: { VJ: [], LD: [] } };
}

function newWindow() {
  const now = Math.floor(Date.now() / 1000);
  return { start: now, finish: now + 3600 };
}

function render() {
  const app = $("#app");
  app.replaceChildren(
    el("section", { class: "section" }, el("h2", {}, "Messages"), el("div", { class: "card" }, fields(data.messages))),
    listSection("Display active windows", data.displayActive, newWindow, (_, i) => `Window ${i + 1}`),
    listSection("Performers", data.performers, newPerformer, (p, i) => `${i + 1}. ${p.name || "(unnamed)"}`));
}

function load(obj) {
  obj.messages ||= {};
  obj.displayActive ||= [];
  obj.performers ||= [];
  data = obj;
  render();
  onChange();
}

// --- toolbar ---

$("#loadFile").onclick = () => $("#file").click();

$("#file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    load(JSON.parse(await file.text()));
    setStatus(`Loaded ${file.name}`);
  } catch (err) {
    setStatus(`Invalid JSON: ${err.message}`, true);
  }
  e.target.value = "";
};

async function fetchRemote() {
  const res = await fetch("../data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

$("#loadRemote").onclick = async () => {
  try {
    load(await fetchRemote());
    setStatus("Loaded ../data.json");
  } catch (err) {
    setStatus(`Fetch failed (use "Open file…" if opened via file://): ${err.message}`, true);
  }
};

$("#loadPaste").onclick = () => {
  try {
    load(JSON.parse($("#out").value));
    setStatus("Loaded from output box");
  } catch (err) {
    $("#jsonErr").textContent = `Invalid JSON: ${err.message}`;
  }
};

$("#copy").onclick = async () => {
  const out = $("#out");
  try {
    await navigator.clipboard.writeText(out.value);
  } catch {
    out.select();
    document.execCommand("copy");
  }
  setStatus("Copied to clipboard");
};

$("#out").oninput = () => {
  try {
    JSON.parse($("#out").value);
    $("#jsonErr").textContent = "";
  } catch (err) {
    $("#jsonErr").textContent = `Invalid JSON: ${err.message}`;
  }
};

fetchRemote()
  .then(load)
  .catch(() => {
    render();
    onChange();
    setStatus('Open data.json with "Open file…"', true);
  });
