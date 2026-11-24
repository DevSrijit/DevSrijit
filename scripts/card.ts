// Draws the contribution card for the profile README, in a light and a dark version.
// Every number comes from GitHub's own contribution calendar (the same data as the graph on the profile),
// so the card always matches what GitHub shows. Private contributions count when the token belongs to the user.
// Usage: GITHUB_TOKEN=... bun scripts/card.ts [out-dir]

const login = "DevSrijit";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("Set GITHUB_TOKEN to a token of the profile owner.");
const outDir = Bun.argv[2] ?? "card";

type Day = { date: string; contributionCount: number; weekday: number };

const query = `{ user(login: "${login}") { contributionsCollection { contributionCalendar {
  totalContributions weeks { contributionDays { date contributionCount weekday } } } } } }`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-card" },
  body: JSON.stringify({ query }),
});
const json = (await res.json()) as any;
if (!json.data) throw new Error(`GitHub GraphQL error: ${JSON.stringify(json.errors ?? json)}`);
const calendar = json.data.user.contributionsCollection.contributionCalendar;
const weeks: Day[][] = calendar.weeks.map((w: any) => w.contributionDays);
const days = weeks.flat();
const total: number = calendar.totalContributions;

// Numbers from the calendar only.
const busiest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
const activeDays = days.filter((d) => d.contributionCount > 0).length;
let best = 0;
let run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  best = Math.max(best, run);
}
// The current streak may include today with no contributions yet, so start from yesterday in that case.
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}

// Levels by quantile of active days, so one huge day does not flatten the rest of the year.
const counts = days.map((d) => d.contributionCount).filter((c) => c > 0).sort((a, b) => a - b);
const q = (p: number) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
// Three cuts give levels 1 to 4 for active days. Level 0 is a day with no contributions.
const cuts = [q(0.3), q(0.6), q(0.85)];
const level = (c: number) => (c === 0 ? 0 : 1 + cuts.filter((t) => c > t).length);

const fmt = (n: number) => n.toLocaleString("en-US");
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return `${months[m - 1]} ${d}, ${y}`;
};

type Theme = { bg: string; ink: string; muted: string; faint: string; line: string; levels: string[] };
const themes: Record<"light" | "dark", Theme> = {
  light: {
    bg: "#ffffff",
    ink: "#0a0a0a",
    muted: "#6e6e73",
    faint: "#a1a1a6",
    line: "#e5e5ea",
    levels: ["#f0f0f2", "#cfcfd4", "#9a9aa0", "#5a5a60", "#0a0a0a"],
  },
  dark: {
    bg: "#0d1117",
    ink: "#f5f5f7",
    muted: "#8e8e93",
    faint: "#636366",
    line: "#21262d",
    levels: ["#161b22", "#3a3a3f", "#6e6e73", "#aeaeb2", "#f5f5f7"],
  },
};

const W = 880;
const cell = 12;
const gap = 3;
const step = cell + gap;
const gridX = 44;
const gridY = 176;
const font = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;

function render(t: Theme) {
  const H = gridY + 7 * step + 60;
  const parts: string[] = [];

  // Month labels on the first week that holds the 1st of a month.
  weeks.forEach((w, x) => {
    const first = w.find((d) => d.date.endsWith("-01"));
    if (first && x < weeks.length - 1) {
      const m = Number(first.date.slice(5, 7));
      parts.push(`<text x="${gridX + x * step}" y="${gridY - 10}" class="label">${months[m - 1]}</text>`);
    }
  });
  for (const [i, name] of [[1, "Mon"], [3, "Wed"], [5, "Fri"]] as const) {
    parts.push(`<text x="${gridX - 8}" y="${gridY + i * step + 10}" class="label" text-anchor="end">${name}</text>`);
  }

  // Cells. Each column fades in once, left to right.
  let bx = 0;
  let by = 0;
  weeks.forEach((w, x) => {
    for (const d of w) {
      const cx = gridX + x * step;
      const cy = gridY + d.weekday * step;
      if (d.date === busiest.date) {
        bx = cx;
        by = cy;
      }
      const title = `${fmt(d.contributionCount)} on ${longDate(d.date)}`;
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="3" fill="${t.levels[level(d.contributionCount)]}" style="animation-delay:${(x * 14).toFixed(0)}ms"><title>${title}</title></rect>`,
      );
    }
  });

  // A note on the busiest day: a ring on the cell and a line up to a label.
  const labelY = gridY - 34;
  const right = bx > W - 240;
  parts.push(
    `<g class="note"><rect x="${bx - 2.5}" y="${by - 2.5}" width="${cell + 5}" height="${cell + 5}" rx="4.5" fill="none" stroke="${t.ink}" stroke-width="1.5"/>`,
    `<line x1="${bx + cell / 2}" y1="${by - 3}" x2="${bx + cell / 2}" y2="${labelY + 6}" stroke="${t.ink}" stroke-width="1"/>`,
    `<text x="${bx + cell / 2 + (right ? -6 : 6)}" y="${labelY + 4}" class="note-text" text-anchor="${right ? "end" : "start"}">${fmt(busiest.contributionCount)} in one day · ${longDate(busiest.date)}</text></g>`,
  );

  // Stats row.
  const stats: [string, string][] = [
    [`${fmt(best)} days`, "longest streak"],
    [`${fmt(current)} days`, "current streak"],
    [`${fmt(activeDays)} of ${fmt(days.length)}`, "days with work"],
    [fmt(Math.round(total / days.length)), "a day on average"],
  ];
  const statX = 470;
  const statW = (W - statX - 44) / 2;
  const statsSvg = stats
    .map(([v, l], i) => {
      const x = statX + (i % 2) * statW;
      const y = 52 + Math.floor(i / 2) * 50;
      return `<text x="${x}" y="${y}" class="stat">${v}</text><text x="${x}" y="${y + 18}" class="label">${l}</text>`;
    })
    .join("");

  // Legend.
  const legendX = W - 44 - (5 * step + 70);
  const legendY = gridY + 7 * step + 22;
  const legend = [
    `<text x="${legendX}" y="${legendY + 10}" class="label">Less</text>`,
    ...t.levels.map((c, i) => `<rect x="${legendX + 30 + i * step}" y="${legendY}" width="${cell}" height="${cell}" rx="3" fill="${c}"/>`),
    `<text x="${legendX + 34 + 5 * step}" y="${legendY + 10}" class="label">More</text>`,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(total)} contributions on GitHub in the last year">
<style>
  text { font-family: ${font}; fill: ${t.ink}; }
  .big { font-size: 56px; font-weight: 700; letter-spacing: -2px; }
  .sub { font-size: 15px; fill: ${t.muted}; }
  .stat { font-size: 20px; font-weight: 600; letter-spacing: -0.3px; }
  .label { font-size: 11px; fill: ${t.muted}; }
  .note-text { font-size: 12px; font-weight: 600; }
  .foot { font-size: 11px; fill: ${t.faint}; }
  rect[style] { animation: in 500ms cubic-bezier(.2,.8,.2,1) both; }
  .note { animation: fade 600ms ease-out 900ms both; }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { rect[style], .note { animation: none; } }
</style>
<rect width="${W}" height="${H}" rx="16" fill="${t.bg}" stroke="${t.line}"/>
<text x="44" y="78" class="big">${fmt(total)}</text>
<text x="46" y="104" class="sub">contributions in the last year, private work included</text>
${statsSvg}
${parts.join("\n")}
<text x="44" y="${legendY + 10}" class="foot">From GitHub's contribution calendar · updated ${longDate(days[days.length - 1].date)}</text>
${legend}
</svg>`;
}

await Bun.write(`${outDir}/contributions-light.svg`, render(themes.light));
await Bun.write(`${outDir}/contributions-dark.svg`, render(themes.dark));
console.log(`${fmt(total)} contributions · busiest ${busiest.contributionCount} on ${busiest.date} · best streak ${best} · current ${current}`);
