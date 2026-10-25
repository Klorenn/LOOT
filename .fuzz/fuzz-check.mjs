#!/usr/bin/env node
// Fuzz local style checker. Runs entirely on your machine; nothing is uploaded.
// Usage: node .fuzz/fuzz-check.mjs .fuzz/rules.json <file> [file...]
// Stylesheets a file links or imports, and CSS files passed in the same run, count for its paywall text sizes.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
const hexRgb = h => { h = h.replace("#", ""); if (h.length <= 4) h = [...h.slice(0, 3)].map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lab = rgb => { const f = c => (c /= 255) <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; const [r, g, b] = rgb.map(f);
  const x = (r*.4124+g*.3576+b*.1805)/.95047, y = r*.2126+g*.7152+b*.0722, z = (r*.0193+g*.1192+b*.9505)/1.08883;
  const t = v => v > .008856 ? Math.cbrt(v) : 7.787*v + 16/116; return [116*t(y)-16, 500*(t(x)-t(y)), 200*(t(y)-t(z))]; };
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0]-B[0], A[1]-B[1], A[2]-B[2]); };
const px = v => { const m = /^\s*(-?[\d.]+)(px|rem)?\s*$/.exec(v); return m ? +m[1] * (m[2] === "rem" ? 16 : 1) : null; };
const TW = { "rounded-none": 0, "rounded-sm": 2, rounded: 4, "rounded-md": 6, "rounded-lg": 8, "rounded-xl": 12, "rounded-2xl": 16, "rounded-3xl": 24, "rounded-full": 9999 };
// CSS-wide keywords: the declaration defers to another rule, so there is no family to check.
const KEYWORD = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
// Generic families and common OS fonts: fine as fallbacks after the style's face, flagged when they come first.
const MONO = ["monospace", "ui-monospace", "sfmono-regular", "sf mono", "menlo", "monaco", "consolas", "liberation mono", "courier new", "courier", "lucida console"];
const FALLBACK = new Set([...MONO, "system-ui", "sans-serif", "serif", "cursive", "fantasy", "emoji", "math", "fangsong", "ui-sans-serif", "ui-serif", "ui-rounded",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica neue", "helvetica", "arial", "noto sans", "ubuntu", "cantarell", "oxygen", "oxygen-sans",
  "fira sans", "droid sans", "liberation sans", "verdana", "tahoma", "trebuchet ms", "georgia", "times new roman", "times",
  "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji"]);
const unquote = f => f.replace(/!important/i, "").trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
/** Font family lists in CSS (font-family, the font shorthand) and JSX (fontFamily). Double-quoted names count unless the quote closes an HTML attribute. */
function familyLists(code) {
  const out = [];
  for (const m of code.matchAll(/font-family\s*:\s*((?:"[^"\n<>=;{}]*"|'[^'\n<>=;{}]*'|[^;}"'\n])+)/gi)) out.push(m[1]);
  for (const m of code.matchAll(/(?<![\w-])font\s*:\s*((?:"[^"\n<>=;{}]*"|'[^'\n<>=;{}]*'|[^;}"'\n])+)/gi)) { const f = /(?:^|\s)[\d.]+(?:px|rem|em|pt|%)(?:\s*\/\s*\S+)?\s+(.+)$/i.exec(m[1].trim()); if (f) out.push(f[1]); }
  for (const m of code.matchAll(/fontFamily\s*:\s*(["'`])((?:(?!\1)[^\n])+)\1/g)) out.push(m[2]);
  return out.map(l => l.split(",").map(unquote).filter(Boolean));
}
/** Font sizes under 11px: font-size, the font shorthand, React fontSize and Tailwind text-[Npx]. */
function smallSizes(s) {
  const out = [];
  for (const m of s.matchAll(/font-size\s*:\s*([\d.]+(?:px|rem))/gi)) out.push(m[1]);
  for (const m of s.matchAll(/(?<![\w-])font\s*:\s*(?:[^;}"\n]*?\s)?([\d.]+(?:px|rem))\b/gi)) out.push(m[1]);
  for (const m of s.matchAll(/fontSize\s*:\s*["'`]?([\d.]+(?:px|rem)?)(?![\w%.])/g)) out.push(/\d$/.test(m[1]) ? m[1] + "px" : m[1]);
  for (const m of s.matchAll(/\btext-\[([\d.]+(?:px|rem))\]/g)) out.push(m[1]);
  return out.filter(v => { const n = px(v); return n !== null && n > 0 && n < 11; });
}
/** Rules in a stylesheet that set text under 11px on a class, id or tag this markup uses (or on body / *). */
function smallRules(css, markup) {
  const names = new Set();
  for (const m of markup.matchAll(/\b(?:class|className|id)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g)) for (const t of (m[1] ?? m[2] ?? m[3]).match(/[\w-]+/g) || []) names.add(t);
  for (const m of markup.matchAll(/\bstyles(?:\.([\w$]+)|\[["']([\w-]+)["']\])/g)) names.add(m[1] ?? m[2]);
  const hits = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = smallSizes(m[2])[0]; if (!size) continue;
    for (const sel of m[1].split(",").map(s => s.trim()).filter(s => s && !s.startsWith("@"))) {
      const bare = sel.replace(/\[[^\]]*\]/g, "").replace(/::?[\w-]+(?:\([^)]*\))?/g, ""); const subject = bare.split(/[\s>+~]+/).filter(Boolean).pop() || "";
      const tag = /^[a-z][\w-]*/i.exec(subject)?.[0];
      // Every class and id in the selector must be in this markup; a bare tag subject must appear as an element.
      const applies = [...bare.matchAll(/[.#]([\w-]+)/g)].every(x => names.has(x[1])) && (/[.#]/.test(subject) || subject === "*" || /^body$/i.test(tag || "") || (!!tag && new RegExp(`<${tag}[\\s>/]`, "i").test(markup)));
      if (applies) { hits.push(`${size} (${sel})`); break; }
    }
  }
  return hits;
}
export function check(R, code, ctx = {}) {
  const d = []; const add = (category, severity, found, fix, extra = {}) => d.push({ category, severity, found, fix, ...extra });
  const pal = Object.fromEntries(R.palette.map(h => [h, hexRgb(h)])); const seen = new Set();
  for (const c of code.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g) || []) {
    const k = c.toUpperCase().replace(/ /g, ""); if (seen.has(k)) continue; seen.add(k);
    let rgb = c.startsWith("#") ? hexRgb(c) : (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number); if (rgb.length < 3) continue;
    if (/^rgba/i.test(c) && /,\s*0?\.\d+\s*\)$/.test(c) && new Set(rgb).size === 1 && [0, 255].includes(rgb[0])) continue;
    let best = null, bd = 1e9; for (const [h, v] of Object.entries(pal)) { const x = dE(rgb, v); if (x < bd) { bd = x; best = h; } }
    if (bd > 6) add("color", bd > 20 ? "high" : "medium", c, `Replace with ${best}, deltaE ${bd.toFixed(0)}`);
  }
  for (const m of new Set(code.match(/\b(?:from|via|to|bg|text)-(?:purple|violet|indigo|fuchsia)-\d{2,3}\b/g) || [])) add("color", "high", m, `Tailwind default palette; use accent ${R.accent}`);
  // Fonts: every named family must be in the style's list, and the first one must be the style's own face, not a system fallback.
  const okF = new Set(R.fonts.map(f => f.toLowerCase()));
  const faces = new Set([R.headingFont, R.bodyFont, R.monoFont, ...(R.faces || []), ...R.fonts.filter(f => !FALLBACK.has(f.toLowerCase()))].filter(Boolean).map(f => f.toLowerCase()));
  const families = new Set(), flagged = new Set();
  for (const list of familyLists(code)) list.forEach((f, i) => {
    if (KEYWORD.has(f) || /^var\(|^[$@]|\$\{/.test(f)) return; // var(), SCSS/Less variables, template literals
    if (!FALLBACK.has(f)) families.add(f);
    if (flagged.has(f) || faces.has(f)) return;
    if (i === 0 && FALLBACK.has(f)) { flagged.add(f); const face = MONO.includes(f) && R.monoFont ? `'${R.monoFont}'` : `'${R.bodyFont}' (body) or '${R.headingFont}' (headings)`; add("font", "high", f, `${f} is a fallback, not this style's face; put ${face} first`); }
    else if (!FALLBACK.has(f) && !okF.has(f)) { flagged.add(f); add("font", "high", f, `Use '${R.headingFont}' for headings and '${R.bodyFont}' for body`); }
  });
  if (families.size > 3) add("font", "medium", `${families.size} families`, "Max 2 families + accent face");
  const radii = new Set(R.radii); const badR = new Set();
  for (const m of code.matchAll(/border-radius\s*:\s*([^;}"]+)/gi)) for (const p of m[1].split(/\s+/)) { const v = px(p); if (v !== null && !radii.has(v) && v < 999) badR.add(p); }
  for (const c of code.match(/\brounded(?:-[a-z0-9]+)?\b/g) || []) { const v = TW[c]; if (v !== undefined && !radii.has(v) && v < 999) badR.add(c); }
  for (const r of badR) add("radius", "medium", r, `Use radius ${R.radius}`);
  const scale = R.spacing; const badS = new Set();
  for (const m of code.matchAll(/\b(?:padding|margin|gap)(?:-[a-z]+)?\s*:\s*([^;}"]+)/gi)) for (const p of m[1].split(/\s+/)) { const v = px(p); if (v !== null && v > 0 && !scale.includes(v)) badS.add(p); }
  for (const s of badS) { const v = px(s); const near = scale.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a); add("spacing", "low", s, `Snap to ${near}px`); }
  const grads = (code.match(/(?:linear|radial|conic)-gradient\(|\bbg-gradient-to-\w+/g) || []).length;
  if (grads && !R.gradientsAllowed) add("pattern", "high", `${grads} gradient(s)`, "This style uses no gradients");
  if (/#(?:667eea|764ba2|8b5cf6|a855f7|6366f1|7c3aed)/i.test(code)) add("pattern", "high", "generic AI purple palette", `Use accent ${R.accent} on ${R.bg}`);
  if (/blur\(/.test(code) && !R.blurAllowed) add("pattern", "medium", "blur effect", "Blur is not part of this style");
  if (R.elevationNone && /box-shadow\s*:|\bshadow-(?:sm|md|lg|xl|2xl)\b/.test(code)) add("pattern", "medium", "box-shadow", "Style elevation is none; use borders");
  for (const n of R.neverDo || []) if (n.pattern && new RegExp(n.pattern, "i").test(code)) add("never-do", "high", n.pattern, n.rule);
  if (/(\$\d+[.,]\d\d\s*\/\s*(yr|year|mo|month|wk|week))|free trial|subscribe/i.test(code)) {
    const H = R.paywall.hardChecks; const pw = (k, f) => add("paywall", "high", f, H[k], { check: k });
    if (/countdown|expires in|offer ends|\d\d:\d\d:\d\d/i.test(code)) pw("annualDefault", "countdown / fake urgency");
    if (/role=["']switch|toggle/i.test(code) && /trial/i.test(code)) pw("annualDefault", "free-trial toggle");
    if (!/close/i.test(code)) pw("closeVisibleTopCorner", "no close control found");
    if (!/restore/i.test(code) || !/terms/i.test(code) || !/privacy/i.test(code)) pw("termsLegible", "missing Restore / Terms / Privacy");
    if (!/auto-?renew|renews/i.test(code)) pw("termsLegible", "no renewal terms");
    const small = smallSizes(code).map(s => `text at ${s}`);
    for (const { file, css } of ctx.css || []) small.push(...smallRules(css, code).map(h => `text at ${h} in ${file}`));
    if (small.length) pw("termsLegible", small.slice(0, 3).join("; ") + (small.length > 3 ? ` (+${small.length - 3} more)` : ""));
  }
  const w = { high: 12, medium: 6, low: 2 }; const score = Math.max(0, 100 - d.reduce((a, x) => a + w[x.severity], 0));
  return { style: R.slug, score, drifts: d };
}
/** Local stylesheets a file pulls in: <link rel="stylesheet">, @import, and import / require of a .css/.scss/.sass/.less file. */
export function linkedCss(file, code, seen = new Set([resolve(file)]), depth = 0) {
  const refs = [], out = []; if (depth > 3) return out;
  for (const m of code.matchAll(/<link\b[^>]*>/gi)) { const h = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(m[0]); if (h && /\brel\s*=\s*["']?stylesheet\b/i.test(m[0])) refs.push(h[1]); }
  for (const m of code.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) refs.push(m[1]);
  for (const m of code.matchAll(/(?:\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?|\brequire\s*\(\s*)["']([^"']+\.(?:css|scss|sass|less))["']/g)) refs.push(m[1]);
  for (const ref of refs) {
    if (/^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith("data:")) continue;
    const p0 = ref.split(/[?#]/)[0];
    const p = (p0.startsWith("/") ? [join(dirname(file), p0), join(process.cwd(), p0), join(process.cwd(), "public", p0)] : [resolve(dirname(file), p0)]).map(x => resolve(x)).find(x => existsSync(x));
    if (!p || seen.has(p)) continue; seen.add(p);
    const css = readFileSync(p, "utf8"); out.push({ file: relative(process.cwd(), p), css }, ...linkedCss(p, css, seen, depth + 1));
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fuzz-check.mjs")) {
  const [rulesPath, ...files] = process.argv.slice(2);
  if (!rulesPath || !files.length) { console.error("usage: node fuzz-check.mjs rules.json <files...>"); process.exit(2); }
  const R = JSON.parse(readFileSync(rulesPath, "utf8"));
  const src = Object.fromEntries(files.map(f => [f, readFileSync(f, "utf8")]));
  const given = files.filter(f => /\.(?:css|scss|sass|less)$/i.test(f));
  const out = files.map(f => {
    const seen = new Set([resolve(f)]); const css = linkedCss(f, src[f], seen);
    for (const g of given) if (!seen.has(resolve(g))) css.push({ file: g, css: src[g] });
    return { file: f, ...check(R, src[f], { css }) };
  });
  console.log(JSON.stringify(out, null, 2)); process.exit(out.some(o => o.drifts.some(x => x.severity === "high")) ? 1 : 0);
}
