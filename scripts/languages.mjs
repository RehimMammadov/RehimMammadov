// Ranks languages by number of projects (repos) using them, then by number of files.
// Writes languages.svg. Runs in GitHub Actions with Node 20+ (built-in fetch).
import { writeFileSync } from "node:fs";

const TOKEN = process.env.GH_TOKEN;
const USER = process.env.GH_USER;
const SKIP_REPOS = (process.env.SKIP_REPOS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const TOP = 10;

// File extension -> language. Markup/config files are not counted.
const EXT = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  vue: "Vue", svelte: "Svelte", py: "Python", php: "PHP", java: "Java",
  kt: "Kotlin", dart: "Dart", go: "Go", rs: "Rust", rb: "Ruby", cs: "C#",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", swift: "Swift",
  scss: "SCSS", sass: "SCSS", sql: "SQL", sh: "Shell", ps1: "PowerShell",
};
// Blade templates (*.blade.php) count as Blade, not PHP.
const langOf = path => {
  if (path.endsWith(".blade.php")) return "Blade";
  if (path.endsWith(".d.ts") || path.endsWith(".min.js")) return null;
  return EXT[path.split(".").pop().toLowerCase()] || null;
};
// Folders with third-party or generated code.
const IGNORE_DIR = /(^|\/)(node_modules|vendor|venv|\.venv|env|site-packages|dist|build|\.next|out|coverage|public\/build|storage|bower_components|__pycache__|migrations)\//;

const COLORS = {
  TypeScript: "#3178C6", JavaScript: "#F1E05A", Vue: "#41B883", Python: "#3572A5",
  PHP: "#4F5D95", Blade: "#F7523F", Java: "#B07219", Dart: "#00B4AB", SCSS: "#C6538C",
  "C++": "#F34B7D", C: "#555555", Go: "#00ADD8", Kotlin: "#A97BFF", "C#": "#178600",
  Shell: "#89E051", SQL: "#E38C00", Svelte: "#FF3E00", Rust: "#DEA584",
};

const api = async url => {
  const r = await fetch(url.startsWith("http") ? url : `https://api.github.com${url}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

const repos = [];
for (let page = 1; ; page++) {
  const batch = await api(`/user/repos?affiliation=owner&per_page=100&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}

const stats = {}; // lang -> { projects, files }
for (const repo of repos) {
  if (repo.fork || repo.archived || repo.size === 0) continue;
  if (repo.name.toLowerCase() === USER.toLowerCase() || SKIP_REPOS.includes(repo.name.toLowerCase())) continue;
  let tree;
  try {
    tree = await api(`/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`);
  } catch { continue; }
  const counts = {};
  for (const item of tree.tree) {
    if (item.type !== "blob" || IGNORE_DIR.test(item.path)) continue;
    const lang = langOf(item.path);
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }
  for (const [lang, n] of Object.entries(counts)) {
    stats[lang] ??= { projects: 0, files: 0 };
    stats[lang].projects++;
    stats[lang].files += n;
  }
}

const top = Object.entries(stats)
  .sort((a, b) => b[1].projects - a[1].projects || b[1].files - a[1].files)
  .slice(0, TOP);
const maxProjects = top[0]?.[1].projects || 1;

const W = 560, rowH = 30, H = 70 + top.length * rowH;
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const rows = top.map(([lang, s], i) => {
  const y = 60 + i * rowH, color = COLORS[lang] || "#8B949E";
  const barW = Math.max(4, (s.projects / maxProjects) * 220);
  return `
  <text x="20" y="${y + 14}" class="rank">#${i + 1}</text>
  <circle cx="62" cy="${y + 9}" r="6" fill="${color}"/>
  <text x="76" y="${y + 14}" class="lang">${esc(lang)}</text>
  <rect x="180" y="${y + 3}" width="220" height="12" rx="6" fill="#21262D"/>
  <rect x="180" y="${y + 3}" width="${barW.toFixed(1)}" height="12" rx="6" fill="${color}"/>
  <text x="${W - 20}" y="${y + 14}" class="meta" text-anchor="end">${s.projects} proj · ${s.files} files</text>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    text { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .title { fill: #2BDE98; font-size: 17px; font-weight: 700; }
    .rank { fill: #8B949E; font-size: 13px; font-weight: 600; }
    .lang { fill: #C9D1D9; font-size: 14px; }
    .meta { fill: #8B949E; font-size: 12px; }
  </style>
  <rect width="100%" height="100%" rx="10" fill="#0D1117"/>
  <text x="20" y="34" class="title">Top ${top.length} Languages · by projects &amp; files</text>
  ${rows}
</svg>`;

writeFileSync("languages.svg", svg);
console.table(Object.fromEntries(top));
