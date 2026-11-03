# UX Specification

## Design direction

**v2 (current): "black velvet gallery".** Pure black canvas with monochrome UI chrome. The only colour on screen is the hero painting (`web/public/hero-pura.webp`). The hero layout follows a reference the team supplied: a full-bleed image, a small uppercase label, a large serif headline and a centred translucent prompt box with chips on the left and a light action button on the right. The token system follows the team's supplied style reference (FLORA-like).

> The hero painting shows a lakeside temple in the style of Pura Ulun Danu Beratan, **not a Canggu location**. Its alt text says it is an illustration. The team supplied the image; its licence/provenance should be confirmed before public use. v1 deliberately avoided temple imagery; v2 uses it at the team's request.

| Token | Value | Use |
|---|---|---|
| `obsidian` | `#000000` | page canvas |
| `carbon` | `#191919` | cards, composer, panels |
| `graphite` | `#303030` | nested surfaces, notes box, selected option |
| `slate` / `ash` | `#606060` / `#7b7b7b` | numerals, metadata, section labels |
| `fog` | `#b4b4b4` | body secondary text |
| `bone` | `#eeeeee` | primary text, primary buttons, user bubbles |
| `pitch` | `#050505` | text on light buttons |

Borders: hairline `white/10–20` (no shadows). Radii: 24px cards, inputs and composer; 10px buttons/tags; full pills for chips.

Typography: **Geist** (UI/body, 400/500/600, cv03/cv04/cv09/cv11). **Instrument Serif** stands in for Redaction (not on Google Fonts) for display headlines, with one word in italic ("*before*", "*sebelum*", "*where*"). Small uppercase labels use 11px with 0.12–0.2em tracking.

**Source types without colour.** The monochrome rule forbids colour-coded status, so source classes are told apart by visual weight, border style and icon:

| Source type | Badge |
|---|---|
| Official regulation | solid light fill, dark text, landmark icon (strongest) |
| Community-verified | solid light outline, users icon |
| General advice | dashed grey outline, lightbulb icon (weakest) |

Retrieval status follows the same pattern: filled = good match, outline = partial match, dashed = no grounded answer. Every badge also carries its text label.

### v1 (superseded)

Warm sand background, clay accent, Fraunces + Inter, and colour-coded badges (blue official, green community, amber advice).

## Views

1. **Landing**
   - **Hero** (full viewport, two columns from 768px, stacked on mobile): the painting with a dark gradient and a transparent header (wordmark + EN/ID toggle).
     - **Left column:** the label "Etiquette assistant · Canggu, Bali", the headline "Understand local norms *before* they become misunderstandings.", a two-line tagline and a *How it works ↓* link.
     - **Right column:** the **"Set your context" form as a glass panel**: Tourist/Newcomer cards, the Canggu location, answer language and *Start asking →*. *Start asking* opens the chat directly.
   - The form is a shared `ContextForm` component, so the hero and the standalone Setup page (reached from the chat header chip) stay identical. Settings are controlled by `App`, so choosing a language in the form re-renders the hero copy immediately.
   - History: v2a let users type a question in the hero; v2b used a *Get started* button that opened Setup. The current v2c puts Setup inside the hero (team request), so users pick their context before every first question.
   - Below the hero, on black: an editorial heading "Every answer shows *where* it comes from." with a description; three numbered cards (01/02/03); a label-legend card; a "What LocalNorm is not" card.
2. **Setup** — *I am a…* Tourist / Newcomer (radio cards with hints); Location select with only *Canggu, Badung* and the note "Other areas are not part of this pilot"; answer language EN / Bahasa Indonesia; *Start asking*.
3. **Chat**
   - Header chip `Canggu · Tourist · EN` returns to setup.
   - **Empty state:** title, 6 suggested questions (in the chosen language, tap to ask), "Topics covered" with document counts from `/api/knowledge/categories`.
   - **Loading:** spinner + "Checking the knowledge base…" (`role=status`).
   - **Error:** alert bubble with message and *Try again*.
   - Composer: textarea (Enter sends, Shift+Enter newline, 1000 char max), disabled send for < 2 chars, *New conversation* button.
4. **Answer card** — visually separated:
   - Top line: retrieval status pill, source-classification badges, generation mode ("Quoted from the knowledge base" / "Written by AI from the sources").
   - **A. Guidance** — the answer paragraph.
   - **B. Why it matters**.
   - **C. What you can do** — bulleted actions.
   - **Please note** — amber box with caveats (verification, applicability, scope, customary rules, refusals).
   - **D/E. Sources** — per source: classification badge, validation status pill, *Demo data* pill when applicable, title, source name, `ln-id · % match · effective date`, *Open source ↗* link.
   - Feedback: "Was this helpful? Yes / No" → "Thanks for the feedback."
5. **Fallback states** — same card; status pill "Not in knowledge base" / "Outside pilot area" / "Outside etiquette scope"; Sources section shows "No source in the knowledge base supports an answer to this question."; actions list who to ask (host, kelian banjar, Desa Adat office).

## Accessibility

Semantic landmarks and headings; all icon buttons have `aria-label`; radio groups use `role=radio` + `aria-checked`; chat region `aria-live=polite`; errors `role=alert`; visible focus ring (`:focus-visible` clay outline); `prefers-reduced-motion` disables animations; `<html lang>` follows the selected language; colour is never the only signal (badges have icons + text).

## Responsiveness

Single column ≤ 640 px, 2-column suggestion grid ≥ 640 px, max content width 768 px. Verified in the in-app browser at 375 × 812: `document.documentElement.scrollWidth === 375` (no horizontal scroll) with an answer card rendered.

## Not done

No dark mode; no visual regression tests; screenshots were not captured in this session because the desktop window was minimised (DOM-level checks only).
