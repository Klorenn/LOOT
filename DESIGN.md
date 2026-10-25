---
version: alpha
name: "Glass Noir"
description: "Light, bent through dark glass."
colors:
  primary: "#DFB9E0"
  on-primary: "#000000"
  primary-hover: "#E4C4E5"
  secondary: "#2350A0"
  on-secondary: "#FFFFFF"
  secondary-hover: "#1E4488"
  tertiary: "#A1A1A6"
  neutral: "#0A0A0A"
  on-neutral: "#FFFFFF"
  surface: "#1A1919"
  on-surface: "#FAFAFB"
  muted: "#A1A1A6"
  outline: "#2C2B2C"
  error: "#FF5A5F"
  on-error: "#000000"
  outline-strong: "#666666"
  focus-ring: "#DFB9E0"
typography:
  headline-display:
    fontFamily: "Geist"
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: "Geist"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.03em
  headline-md:
    fontFamily: "Geist"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.03em
  body-lg:
    fontFamily: "Geist"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  body-md:
    fontFamily: "Geist"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  body-sm:
    fontFamily: "Geist"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0em
  label-lg:
    fontFamily: "Geist Mono"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.04em
  label-md:
    fontFamily: "Geist Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.04em
  label-sm:
    fontFamily: "Geist Mono"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.04em
rounded:
  none: 0px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin: 20px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: "12px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: "12px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
  chip-hover:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "{colors.on-secondary}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-neutral}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px"
  alert:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "12px"
  caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label-sm}"
  input-border:
    backgroundColor: "{colors.outline-strong}"
    height: "1px"
  focus-ring:
    backgroundColor: "{colors.focus-ring}"
    height: "2px"
x-fuzz:
  gradientsAllowed: true
  patternGradientsAllowed: true
  borders:
    # css = shorthand; parts = [width, style, color]
    button:
      css: "1px solid #2C2B2C"
      parts: ["1px", "solid", "#2C2B2C"]
    card:
      css: "1px solid #2C2B2C"
      parts: ["1px", "solid", "#2C2B2C"]
    input:
      css: "1px solid #666666"
      parts: ["1px", "solid", "#666666"]
    chip:
      css: "1px solid #2C2B2C"
      parts: ["1px", "solid", "#2C2B2C"]
    alert:
      css: "1px solid #2C2B2C"
      parts: ["1px", "solid", "#2C2B2C"]
  shadows:
    button: "0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)"
    card: "0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)"
    input: "0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)"
    chip: "0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)"
    alert: "0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)"
  forbidden:
    - "Mix multiple saturated accents"
    - "Mix radii and border styles"
    - "Use more than two type families"
    - "Stack effects for decoration"
    - "Text or input borders that fail WCAG 2.2 AA contrast"
    - "Removing focus outlines without a visible :focus-visible replacement"
    - "Tap targets under 44x44"
    - "Animation that ignores prefers-reduced-motion"
  accessibility:
    wcagLevel: "AA"
    wcagVersion: "2.2"
    contrastPairs:
      - {fg: "on-primary", bg: "primary", ratio: 12.15, min: 4.5, use: "text"}
      - {fg: "on-primary", bg: "primary-hover", ratio: 13.33, min: 4.5, use: "text"}
      - {fg: "on-secondary", bg: "secondary", ratio: 7.7, min: 4.5, use: "text"}
      - {fg: "on-secondary", bg: "secondary-hover", ratio: 9.39, min: 4.5, use: "text"}
      - {fg: "on-surface", bg: "surface", ratio: 16.82, min: 4.5, use: "text"}
      - {fg: "on-neutral", bg: "neutral", ratio: 19.8, min: 4.5, use: "text"}
      - {fg: "muted", bg: "surface", ratio: 6.82, min: 4.5, use: "text"}
      - {fg: "muted", bg: "neutral", ratio: 7.7, min: 4.5, use: "text"}
      - {fg: "on-error", bg: "error", ratio: 6.88, min: 4.5, use: "text"}
      - {fg: "outline-strong", bg: "surface", ratio: 3.06, min: 3.0, use: "non-text: input/control border"}
      - {fg: "outline-strong", bg: "neutral", ratio: 3.45, min: 3.0, use: "non-text: input/control border"}
      - {fg: "focus-ring", bg: "surface", ratio: 10.15, min: 3.0, use: "non-text: focus indicator"}
      - {fg: "focus-ring", bg: "neutral", ratio: 11.46, min: 3.0, use: "non-text: focus indicator"}
    decorativeOutline: "#2C2B2C is for decorative dividers only; input, checkbox, toggle and other control boundaries use outline-strong"
    minTapTarget: 44
    minTapTargetUnit: "pt (iOS) / dp (Android) / CSS px (web); never below 24x24 even inline"
    minTextSize: 11
    focusRing: "2px solid #DFB9E0 (token focus-ring), 2px offset, on :focus-visible, >=3:1 against surface and neutral"
    reducedMotion: "Under prefers-reduced-motion: reduce (iOS Reduce Motion), replace movement, parallax, auto-scroll and scale transitions with an instant change or opacity fade <=150ms; pause any auto-playing marquee"
    colorAlone: false
    textResize: "Layouts must survive 200% text / Dynamic Type XXL without clipping"
  a11yForbidden:
    - "Text below 4.5:1 (or 3:1 at >=24px / >=19px bold) against its background"
    - "Input or control borders below 3:1 (use outline-strong, not outline)"
    - "Removing focus outlines without a visible :focus-visible replacement"
    - "Tap targets smaller than 44x44"
    - "Motion that ignores prefers-reduced-motion"
    - "Conveying state by color alone"
    - "Text smaller than 11px"
  patterns:
    paywall:
      source: "references.md (RevenueCat, Adapty, App Store Review Guideline 3.1.2)"
      rules:
        close: "Close control (x) in a top corner, visible from the first frame, >=44x44 tap area, AA contrast, accessible label \"Close\""
        headline: "Outcome headline (<=8 words) plus at most one short context line; value before price"
        benefits: "3-4 benefit rows, icon + short text, no paragraphs"
        socialProof: "Social proof above the plans: one real rating, user count or short quote; never invent numbers, label placeholders as samples"
        plans: "2-3 plan cards; annual preselected with a \"Best value / Save X%\" badge and its per-month price; selected state shown by border/outline, check icon and weight, never color alone"
        trial: "Trial lives inside the plan card (\"7-day free trial\", then $X/yr); no free-trial toggle"
        timeline: "Trial timeline: Today full access / Day N-2 reminder / Day N charge"
        cta: "One full-width primary CTA, >=48-56 tall, in the bottom thumb zone, labeled with the action (\"Start free trial\" / \"Continue\")"
        terms: "\"Cancel anytime\" plus the renewal line (full price, period, auto-renew) directly under the CTA, >=11px, AA contrast"
        footer: "Footer row: Restore Purchases, Terms of Use, Privacy Policy; each >=44 tall, >=11px, AA contrast"
        noDarkPatterns: "No countdown timers, fake scarcity, progress bars, pre-checked upsells or hidden/delayed close"
        layout: "The checklist fixes CONTENT and ORDER only; each style owns its LAYOUT (grid, poster, sheet, cards) within the hardChecks"
        dynamicType: "Survives Dynamic Type XXL / 200% text without clipping; Reduce Motion stops animated heroes"
      hardChecks:
        billedPriceMostProminent: "App Review 3.1.2: the full billed price (e.g. $29.99/yr) is the largest price on screen, larger than any per-month/per-week breakdown"
        termsLegible: "App Review 3.1.2: renewal terms (price, period, auto-renew, cancel) and Restore Purchases / Terms / Privacy links are >=11px with AA contrast"
        closeVisibleTopCorner: "Close control visible from the first frame in a top corner, >=44x44, AA contrast, never delayed or hidden"
        ctaBottom: "Primary CTA sits in the bottom thumb zone, full or near-full width, >=48 tall"
        billedPriceAdjacentCta: "The billed price sits directly above the CTA (nothing between them)"
        annualDefault: "Annual plan preselected; its free trial lives inside the annual card; no trial toggle, no countdown or fake urgency"
      forbidden:
        - "Free-trial toggle"
        - "Countdown timers or fake urgency/scarcity"
        - "Hidden, delayed or low-contrast close button"
        - "Invented ratings, user counts or reviews"
  iconLibrary: "@phosphor-icons/core"
  iconWeight: "duotone"
  iconStrokeWidth: 1.5
  iconCheck: true
  icons:
    library: "Phosphor"
    package: "@phosphor-icons/core@2.1.1"
    license: "MIT"
    variant: "duotone"
    size: 22
    strokeWidth: 1.5
    linecap: "round"
    linejoin: "round"
    corner: "soft"
    fill: "duotone: 20% opacity back layer tinted accent"
    names:
      lock: "lock"
      clock: "clock"
      settings: "gear"
      user: "user"
      search: "magnifying-glass"
      close: "x"
      check: "check"
      alert: "warning"
      arrow: "arrow-right"
    fallback:
      library: "Hugeicons (free)"
      package: "@hugeicons/core-free-icons@4.3.5"
      license: "MIT"
      variant: "stroke-rounded"
      strokeWidth: 1.5
      names:
        lock: "SquareLock02Icon"
        clock: "Clock01Icon"
        settings: "Settings01Icon"
        user: "UserIcon"
        search: "Search01Icon"
        close: "Cancel01Icon"
        check: "Tick02Icon"
        alert: "Alert02Icon"
        arrow: "ArrowRight01Icon"
---

# Glass Noir

## Overview

Light, bent through dark glass.

Glassmorphism (2020) and Apple's translucent materials, fused with dark-mode developer culture, creative-coding demos (three.js / WebGPU) and a hint of skeuomorphic tactility. Coined: established 'Glassmorphism' alone misses the dark, demo-driven, code-native character.

- **Depth through light:** Layers separate by blur and edge highlight, not by color.
- **Show the trick:** Interfaces are demos: reveal the mechanism, invite play.
- **Dark canvas, soft light:** Near-black base; color appears as glow, tint or refraction.
- **Tactile response:** Hover, magnetism, pressure — the UI reacts to the cursor.
- **Code-native:** Everything should be buildable in CSS/WebGL; no fake renders.
- **Restraint in glow:** One luminous element per view.

## Colors

- **Primary (#DFB9E0):** main accent for the single most important action; text on it uses on-primary (#000000).
- **Secondary (#2350A0):** supporting accent for chips, hover and secondary emphasis; on-secondary #FFFFFF.
- **Tertiary (#A1A1A6):** muted tone for metadata and captions.
- **Neutral (#0A0A0A):** page background; text uses on-neutral (#FFFFFF).
- **Surface (#1A1919):** cards and panels; on-surface #FAFAFB.
- **Outline (#2C2B2C):** decorative hairlines and dividers.
- **Outline-strong (#666666):** input and control borders (>=3:1 against surface and neutral).
- **Focus-ring (#DFB9E0):** 2px :focus-visible outline (>=3:1).
- **Error (#FF5A5F):** alerts only; on-error #000000.

Fills that could not reach AA were nudged in lightness until they did. On-colors were selected by computed WCAG 2.x contrast to meet AA (4.5:1) against their backgrounds.

## Typography

- **Headlines:** Geist, weight 600, tracking -0.03em.
- **Body:** Geist, 13–18px, 1.45–1.5 line height.
- **Labels:** Geist Mono, 11–14px, tracking 0.04em.
- **Casing:** Sentence case; lowercase allowed for playful labels

## Layout

Base spacing unit 4px with scale xs–xl. Columns: {"desktop": 12, "tablet": 8, "mobile": 4}. Margins: {"desktop": "64px", "tablet": "32px", "mobile": "20px"}. Layouts: 8/4 hero split, 3-up cards, 8-col centered reading.

## Elevation & Depth

Signature elevation: `0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)`. 

Shadows per component (exact CSS, also in `x-fuzz.shadows`):
- **button:** `0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)`
- **card:** `0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)`
- **input:** `0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)`
- **chip:** `0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)`
- **alert:** `0 0 0 1px rgba(255,255,255,.08) inset,0 20px 40px rgba(0,0,0,.5)`

Smooth gradients: allowed; hard-stop/repeating texture gradients: allowed. Forbidden patterns (`x-fuzz.forbidden`):
- Mix multiple saturated accents
- Mix radii and border styles
- Use more than two type families
- Stack effects for decoration
- Text or input borders that fail WCAG 2.2 AA contrast
- Removing focus outlines without a visible :focus-visible replacement
- Tap targets under 44x44
- Animation that ignores prefers-reduced-motion

## Shapes

Borders (machine-readable in `x-fuzz.borders`): button 1px solid #2C2B2C; card 1px solid #2C2B2C; input 1px solid #666666; chip 1px solid #2C2B2C; alert 1px solid #2C2B2C.

Icons (`x-fuzz.icons`): **Phosphor** duotone, 22px, stroke 1.5px, round caps / round joins, soft corners. Fill rule: duotone: 20% opacity back layer tinted accent. Fallback: Hugeicons (free) stroke-rounded.

Base corner radius 16px (rounded.md). Scale: none 0px, sm 8px, md 16px, lg 24px, xl 32px, full 9999px.

## Components

- **button-primary / button-primary-hover:** primary fill with on-primary label, 16px radius, 48px height.
- **button-secondary / button-secondary-hover:** surface fill, flips to secondary on hover.
- **card:** surface with on-surface text, 24px radius, 16px padding.
- **input:** neutral fill, 44px height.
- **chip:** secondary pill for tags/status.
- **alert:** error fill with on-error text.
- **caption:** muted label on surface.
- **icon:** @phosphor-icons/core@2.1.1 (MIT). Names: lock `lock`, clock `clock`, settings `gear`, user `user`, search `magnifying-glass`, close `x`, check `check`, alert `warning`, arrow `arrow-right`. Icon-only buttons need an accessible label; icons inherit currentColor (on-primary inside button-primary).

## Do's and Don'ts

- Do use one accent (#DFB9E0) per view.
- Do keep radius 16px consistent.
- Do set headlines in Geist at weight 600.
- Do apply one effect treatment per artifact.
- Don't mix multiple saturated accents.
- Don't mix radii and border styles.
- Don't use more than two type families.
- Don't stack effects for decoration.
- Do maintain WCAG 2.2 AA contrast: 4.5:1 for body text, 3:1 for large text (>=24px, or >=19px bold) and for input borders, icons and focus rings
- Do use outline-strong (#666666) for input, checkbox and toggle borders; outline (#2C2B2C) is for decorative dividers only
- Do show a visible focus ring on every interactive element: 2px solid focus-ring (#DFB9E0), 2px offset, via :focus-visible
- Do make every tap target at least 44x44 (pad small icons and text links)
- Do honor prefers-reduced-motion / Reduce Motion: swap movement for an instant change or a short fade
- Don't signal state (selected plan, error, success) by color alone; pair it with an icon, label or weight change
- Don't set text below 11px or remove focus outlines

## Paywall Pattern

Every subscription paywall in this style follows the checklist below (machine-readable in `x-fuzz.patterns.paywall`). The checklist fixes content and order; this style owns the layout. Do not change the order, drop items or break any `hardChecks` entry.

- **close:** Close control (x) in a top corner, visible from the first frame, >=44x44 tap area, AA contrast, accessible label "Close"
- **headline:** Outcome headline (<=8 words) plus at most one short context line; value before price
- **benefits:** 3-4 benefit rows, icon + short text, no paragraphs
- **socialProof:** Social proof above the plans: one real rating, user count or short quote; never invent numbers, label placeholders as samples
- **plans:** 2-3 plan cards; annual preselected with a "Best value / Save X%" badge and its per-month price; selected state shown by border/outline, check icon and weight, never color alone
- **trial:** Trial lives inside the plan card ("7-day free trial", then $X/yr); no free-trial toggle
- **timeline:** Trial timeline: Today full access / Day N-2 reminder / Day N charge
- **cta:** One full-width primary CTA, >=48-56 tall, in the bottom thumb zone, labeled with the action ("Start free trial" / "Continue")
- **terms:** "Cancel anytime" plus the renewal line (full price, period, auto-renew) directly under the CTA, >=11px, AA contrast
- **footer:** Footer row: Restore Purchases, Terms of Use, Privacy Policy; each >=44 tall, >=11px, AA contrast
- **noDarkPatterns:** No countdown timers, fake scarcity, progress bars, pre-checked upsells or hidden/delayed close
- **layout:** The checklist fixes CONTENT and ORDER only; each style owns its LAYOUT (grid, poster, sheet, cards) within the hardChecks
- **dynamicType:** Survives Dynamic Type XXL / 200% text without clipping; Reduce Motion stops animated heroes

Selected plan: primary fill on the radio plus a check icon, a focus-ring (#DFB9E0) outline and bolder plan name. Primary CTA uses button-primary (#DFB9E0 / #000000).

## Motion

- **hover:** 150ms · cubic-bezier(.2,0,0,1) · Magnetic hover, tilt
- **spring:** 400ms · spring(1,170,26) · Cards, toggles
- **blur-in:** 500ms · cubic-bezier(.16,1,.3,1) · Enter with blur 8→0px
- **ambient:** 8s · linear loop · Sheen, orb drift
- Honor Reduce Motion
- Motion communicates state
- One hero animation at a time

## Checklist

- Background is #0A0A0A (or approved mode)
- Accent ≤ 5% of the view
- All text ≥ WCAG AA
- Headlines Geist 600, tracking -0.03em
- Max 2 families + accent face
- Radius 16px everywhere
- Borders 1px #2C2B2C
- Spacing on base grid
- Icons follow stroke spec
- One effect treatment max
- Motion uses tokens; Reduce Motion honored
- Copy matches voice: Curious, Casual, Show-don't-tell

## AI Build Steps

1. Pick mode (core or one extended palette).
2. Set bg #0A0A0A, surface #1A1919, text #FAFAFB.
3. Choose one accent: #DFB9E0 (primary) — accent2 #2350A0 only in support.
4. Typeset headlines in Geist 600 tracking -0.03em; body Geist.
5. Lay out on 12-col grid with spacing tokens.
6. Build from component specs; use semantic tokens only.
7. Apply at most one effect: Frosted glass is the signature.
8. Write copy in voice: Curious, Casual, Show-don't-tell, Builder-to-builder
9. Apply motion tokens; respect Reduce Motion.
10. Run checklist before delivering.

- **Prompt (image):** Glass Noir style: Light, bent through dark glass. Palette #0A0A0A, #1A1919, #2C2B2C, #FAFAFB, #A1A1A6, #DFB9E0. Treatment: Frosted glass. References: Glassmorphism, Dark mode UI.
- **Prompt (ui):** Design a screen in Glass Noir: bg #0A0A0A, surface #1A1919, hairlines #2C2B2C, text #FAFAFB/#A1A1A6, one #DFB9E0 primary action, Geist headlines, radius 16px, 1px borders.
- **Prompt (copy):** Write copy that is Curious, Casual, Show-don't-tell, Builder-to-builder; avoid Corporate, Over-explained, Salesy. Examples: progressive blur > masked blur / Try it ↓ / Built in a single HTML file / View source.
