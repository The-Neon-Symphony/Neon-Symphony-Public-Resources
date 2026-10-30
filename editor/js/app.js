import { TZ, toLocalString, toUtcString, fromLocalString, fromUtcString } from "./time.js";
import { buildGantt, renderGantt } from "./gantt.js";

if (typeof mermaid !== "undefined") {
  mermaid.initialize({ startOnLoad: false, theme: "dark", gantt: { useMaxWidth: false } });
}

const TIMESTAMP_KEYS = ["start", "finish", "startTime"];
const MULTILINE_KEYS = ["pre", "inter", "post"];
// Fields added by the publish action; they must never appear in the source data.json.
const GENERATED_KEYS = ["logoUV", "instanceLogoUV", "gitHash"];

const now = () => Math.floor(Date.now() / 1000);

document.addEventListener("alpine:init", () => {
  Alpine.data("editor", () => ({
    TZ,
    data: { messages: {}, displayActive: [], performers: [] },
    status: { text: "", error: false },
    jsonError: "",

    async init() {
      try {
        this.load(await this.fetchRemote());
      } catch {
        this.setStatus('Open data.json with "Open file…"', true);
      }
    },

    // --- loading ---

    load(obj) {
      obj.messages ||= {};
      obj.displayActive = (obj.displayActive || []).map((w) => ({ name: "", ...w }));
      obj.instances ||= [];
      obj.performers ||= [];
      for (const target of [obj.messages, ...obj.instances, ...obj.performers]) GENERATED_KEYS.forEach((k) => delete target[k]);
      this.data = obj;
    },

    async fetchRemote() {
      const res = await fetch("../data.json", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return res.json();
    },

    async loadRemote() {
      try {
        this.load(await this.fetchRemote());
        this.setStatus("Loaded ../data.json");
      } catch (err) {
        this.setStatus(`Fetch failed (use "Open file…" if opened via file://): ${err.message}`, true);
      }
    },

    async loadFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        this.load(JSON.parse(await file.text()));
        this.setStatus(`Loaded ${file.name}`);
      } catch (err) {
        this.setStatus(`Invalid JSON: ${err.message}`, true);
      }
      event.target.value = "";
    },

    setStatus(text, error = false) {
      this.status = { text, error };
    },

    // --- output box ---

    get output() {
      return `${JSON.stringify(this.data, null, 4)}\n`;
    },

    checkOutput(text) {
      try {
        JSON.parse(text);
        this.jsonError = "";
      } catch (err) {
        this.jsonError = `Invalid JSON: ${err.message}`;
      }
    },

    loadOutput(text) {
      try {
        this.load(JSON.parse(text));
        this.jsonError = "";
        this.setStatus("Loaded from output box");
      } catch (err) {
        this.jsonError = `Invalid JSON: ${err.message}`;
      }
    },

    async copy(box) {
      try {
        await navigator.clipboard.writeText(box.value);
      } catch {
        box.select();
        document.execCommand("copy");
      }
      this.setStatus("Copied to clipboard");
    },

    // --- layout ---

    get columns() {
      const d = this.data;
      const label = (it, i, fallback) => `${i + 1}. ${it.name || fallback}`;
      return [
        [
          { title: "Messages", list: [d.messages], single: true },
          { title: "Display active windows", list: d.displayActive, label: (it, i) => label(it, i, "(unnamed window)"),
            make: () => ({ name: "", start: now(), finish: now() + 3600 }) },
          { title: "Instances", list: d.instances, label: (it, i) => `${it.id ?? "?"}. ${it.name || "(unnamed)"}`,
            make: () => ({ id: this.nextInstanceId(), name: "", instanceLogoName: "" }) },
        ],
        [
          { title: "Performers", list: d.performers, label: (it, i) => label(it, i, "(unnamed)"),
            make: () => {
              const last = d.performers.at(-1);
              const startTime = last ? last.startTime + (last.setLength || 60) * 60 : now();
              return { name: "", instanceId: last?.instanceId ?? d.instances[0]?.id ?? 1, startTime, setLength: 60, logoName: "", genre: "", credits: { VJ: [], LD: [] } };
            } },
        ],
      ];
    },

    nextInstanceId() {
      return Math.max(0, ...this.data.instances.map((x) => Number(x.id) || 0)) + 1;
    },

    // A fresh duplicate of an instance must not reuse its id.
    duplicate(list, i) {
      const copy = structuredClone(Alpine.raw(list[i]));
      if (list === this.data.instances) copy.id = this.nextInstanceId();
      list.splice(i + 1, 0, copy);
    },

    move(list, i, delta) {
      const j = i + delta;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    },

    // --- fields ---

    // A boolean directly before a text field is its toggle: they share one row.
    rows(item) {
      const keys = Object.keys(item);
      const rows = [];
      for (let i = 0; i < keys.length; i++) {
        if (typeof item[keys[i]] === "boolean" && typeof item[keys[i + 1]] === "string") {
          rows.push([keys[i], keys[i + 1]]);
          i++;
        } else {
          rows.push([keys[i]]);
        }
      }
      return rows;
    },

    kind(item, key) {
      const v = item[key];
      if (TIMESTAMP_KEYS.includes(key) && typeof v === "number") return "timestamp";
      if (key === "credits" && v && typeof v === "object") return "credits";
      if (key === "instanceId" && typeof v === "number") return "instance";
      if (typeof v === "boolean") return "boolean";
      if (typeof v === "number") return "number";
      if (typeof v === "string") return MULTILINE_KEYS.includes(key) || v.includes("\n") ? "multiline" : "text";
      return "raw";
    },

    toLocal: (sec) => (Number.isFinite(sec) ? toLocalString(sec) : ""),
    toUtc: (sec) => (Number.isFinite(sec) ? toUtcString(sec) : ""),

    setTime(item, key, text, parse) {
      const sec = text === "" ? null : parse(text);
      if (sec !== null) item[key] = sec;
    },
    setLocal(item, key, text) { this.setTime(item, key, text, fromLocalString); },
    setUtc(item, key, text) { this.setTime(item, key, text, fromUtcString); },

    // Unknown/nested values are edited as raw JSON so they are never lost.
    rawText: (v) => JSON.stringify(v, null, 2),
    setRaw(item, key, box) {
      try {
        item[key] = JSON.parse(box.value);
        box.classList.remove("invalid");
      } catch {
        box.classList.add("invalid");
      }
    },

    addRole(credits, name) {
      const role = name.trim();
      if (role && !(role in credits)) credits[role] = [];
    },

    // --- timeline ---

    drawTimeline(box) {
      renderGantt(box, buildGantt(this.data));
    },
  }));
});
