# DESIGN.md — Frontend & UI/UX specification for "ReviewLock"

> This file is the single source of truth for how the product LOOKS and FEELS.
> Do not invent your own visual style. Do not use default shadcn/Tailwind looks
> unchanged. If something is not specified here, choose the option that is
> quieter, tighter and more "pro tool" — and tell me what you chose.

---

## 1. Design intent

**One-line vibe:** a calm, dark, precise tool that feels like a professional
editing suite (think DaVinci Resolve's discipline + Linear's polish), not a
colourful startup SaaS.

**Who uses it**
- *Editors* (freelance video editors, motion designers). They live in dark
  UIs all day. They notice bad typography, sloppy alignment and fake-looking UI.
- *Clients* (non-technical). They open one link on a phone or laptop. The viewer
  page must feel trustworthy, cinematic and obvious within 2 seconds.

**Keywords:** cinematic · precise · quiet · confident · timeline-native.

**Signature motif:** the **timeline**. A thin amber playhead line and mono
timecodes show up as the product's visual identity: in the logo, the hero,
loading bars, the range selector, the status timeline, and the viewer scrub bar.

**Never show Google/Drive anywhere in the UI** (no Drive logo, no "connect Drive", no Drive wording). Storage is simply "your storage".

**Hard NO list (reject your own output if it contains these)**
- Purple/blue-to-pink gradients, glassmorphism blobs, glowing neon borders
- Emoji used as icons, stock illustrations, 3D blobs, "AI sparkle" iconography
- Centered-everything marketing layouts with 3 identical feature cards
- Pure `#000` backgrounds or pure `#fff` text
- Default Inter-only typography with random font sizes
- Heavy drop shadows, rounded-3xl cards, oversized padding everywhere
- Lorem ipsum. Use realistic content (see §12).

---

## 2. Libraries (use exactly these; nothing else for UI)
- Tailwind CSS with design tokens defined as **CSS variables** (§3)
- **shadcn/ui** primitives (Radix) as unstyled-ish base. RESTYLE them to the tokens below.
- `lucide-react` icons only, stroke width 1.5, sizes 16 / 20
- `motion` (Framer Motion) for animation
- `sonner` for toasts, `react-hook-form` + `zod` for forms, `@tanstack/react-query` for data
- `hls.js` for playback, `next/font` for fonts
- No other component libraries. No CSS-in-JS.

---

## 3. Design tokens

Put these in `app/globals.css` and map them in `tailwind.config`. **Never hardcode
hex values in components. Always use the token.**

```css
:root {
  /* surfaces (dark only in v1) */
  --bg:            #0B0B0E;  /* app background */
  --surface-1:     #121217;  /* cards, sidebar */
  --surface-2:     #18181F;  /* inputs, hovered cards, popovers */
  --surface-3:     #20202A;  /* pressed, selected rows */
  --border:        #262630;  /* default 1px borders */
  --border-strong: #35354A;  /* focus-adjacent, dividers on hover */

  /* text */
  --text:          #ECECF1;
  --text-muted:    #9494A6;
  --text-faint:    #62627A;

  /* brand = the playhead */
  --accent:        #FFB020;  /* amber */
  --accent-hover:  #FFC24D;
  --accent-soft:   rgba(255,176,32,0.12);
  --accent-ink:    #1A1204;  /* text on accent buttons */

  /* semantic */
  --success: #3DDC97;  --success-soft: rgba(61,220,151,0.12);
  --danger:  #FF5C6C;  --danger-soft:  rgba(255,92,108,0.12);
  --info:    #6EA8FF;  --info-soft:    rgba(110,168,255,0.12);

  /* shape */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; /* never above 14px */

  /* motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 360ms;
}
```

**Typography** (load via `next/font/google`)
- Display / headings: **Bricolage Grotesque** (600). Used for H1–H3, logo, big numbers.
- UI / body: **Inter** (400, 500, 600).
- Timecodes, IDs, sizes, durations, slugs: **JetBrains Mono** (400, 500), `tabular-nums`.

| Role | Size / line-height / weight / tracking |
|---|---|
| Display (landing hero only) | 56 / 60 / 600 / -0.03em |
| H1 | 28 / 34 / 600 / -0.02em |
| H2 | 20 / 28 / 600 / -0.01em |
| H3 | 16 / 24 / 600 |
| Body | 14 / 22 / 400 |
| Small / caption | 12 / 18 / 500, colour `--text-muted` |
| Mono | 12–13 / 18 / 500 |

**Spacing:** strict 4px grid. Common gaps: 8, 12, 16, 24, 32. Page padding 32 desktop / 16 mobile.
**Borders over shadows:** cards are `--surface-1` + 1px `--border`. The only shadow allowed
is on popovers/dialogs: `0 12px 40px rgba(0,0,0,0.5)`.
**Focus ring:** 2px `--accent` outline with 2px offset, on every interactive element.

---

## 4. Core components (build these FIRST, in a `/dev/components` showcase page)

Every component must show all states: default, hover, focus, active, disabled, loading, error.

1. **Button** — variants: `primary` (amber bg, `--accent-ink` text), `secondary`
   (`--surface-2` + border), `ghost`, `danger`. Sizes: sm 32px / md 40px / lg 48px.
   Radius 8px. Loading = spinner replaces icon, width stays fixed.
2. **Input / Textarea / Select / Switch / Slider** — height 40px, `--surface-2` bg,
   1px `--border`, focus = border `--accent` + soft amber ring. Labels above (12px
   medium), helper text below, error text in `--danger`.
3. **StatusPill** — 22px high, 11px uppercase semi-bold, 0.04em tracking, leading 6px dot.
   | Status | Colours | Dot |
   |---|---|---|
   | Processing | info | spinner |
   | Ready | neutral (`--text-muted`) | solid |
   | Live (active link) | accent | pulsing |
   | Viewed | info | solid |
   | Exhausted / Expired | faint | hollow |
   | Revoked / Failed | danger | solid |
   | Paid / Unlocked | success | check icon |
4. **Timecode** — mono, `mm:ss` (or `h:mm:ss` over an hour), `tabular-nums`.
5. **CopyLinkButton** — shows the shortened URL in a mono field with a copy icon button.
   On click: icon morphs to a check for 1.5s, toast "Link copied". Always provides a
   readable text fallback if clipboard API fails.
6. **Dropzone** — dashed 1.5px `--border-strong`, radius 14px, 220px tall. Drag-over: border
   `--accent`, bg `--accent-soft`. Contains a lucide `Film` icon, "Drop your video here",
   "or browse files", and mono hint `MP4 · MOV · MKV · WEBM · up to 5 GB`.
7. **ProgressBar** — 4px tall, track `--surface-3`, fill `--accent`. Indeterminate state =
   a small playhead tick sliding across (not a barber pole).
8. **ProjectCard** — 16:9 thumbnail, mono duration chip bottom-right (black 70% bg, 11px),
   title (14/600, 1 line truncate), status pill, small meta "2 links · 1 viewed · 3d ago".
   Hover: border → `--border-strong`, translateY(-2px), action menu button fades in top-right.
9. **TimelineRangeSelector** — the hero component (spec in §6.3).
10. **StatusTimeline** — vertical list: dot + vertical 1px line, event title, mono timestamp,
    optional detail. Completed dots filled, the current one amber, future ones hollow.
11. **ConfirmDialog**, **Drawer** (right side, 480px), **Tooltip**, **EmptyState**, **Skeleton**.
12. **Logo** — wordmark "ReviewLock" in Bricolage 600 with a 2px × 18px amber vertical bar
    (the playhead) between "Review" and "Lock". Favicon = that bar on `--surface-1`.

---

## 5. App shell (editor area)

```
┌──────────┬──────────────────────────────────────────────────────────┐
│ ▌Logo    │  Page title                      [search]   [+ New upload]│  ← top bar 56px
│          ├──────────────────────────────────────────────────────────┤
│ Projects │                                                          │
│ Links    │              page content (max-w 1280, centered)          │
│ Activity │                                                          │
│ Settings │                                                          │
│          │                                                          │
│ ──────── │                                                          │
│ avatar   │                                                          │
│ name     │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
 sidebar 232px (collapses to 64px icon rail <1100px; becomes bottom tab bar <768px)
 The sidebar footer holds a StorageMeter: 4px bar (amber; turns --danger above 90%), mono text
 "6.2 GB of 20 GB". Clicking it opens Settings > Storage.
```
- Sidebar bg `--surface-1`, 1px right border. Active item: `--surface-3` bg + 2px amber bar on the left.
- Nav items 36px high, icon 16px + label 14/500.
- Top bar bg `--bg`, 1px bottom border, sticky.
- Global shortcut: `U` = new upload, `/` = focus search. Show kbd hints in tooltips.

---

## 6. Screens

### 6.1 Landing page `/` (marketing, one scroll)
- **Hero** (left-aligned, not centered): H-display "Get paid before the client gets the file."
  Sub: "Share a locked preview. Release the full-quality video when the payment lands."
  CTAs: primary "Start free", secondary "See how it works".
  Right side: a stylised **timeline graphic** (CSS/SVG, not an image): 3 horizontal tracks with
  coloured clips, an amber playhead line, and a diagonal-hatched "locked" region after the
  playhead. Slow 20s loop: the playhead drifts and a small mono tag "00:30 · PREVIEW ENDS" follows it.
- **How it works**: 3 steps in one horizontal row with mono step numbers `01 02 03`:
  Upload → Share a locked link → Release on payment. Each has a small UI snippet, not an icon.
- **Trust strip**: "Your original never leaves private storage until you release it." + 3 short
  facts (server-side limits, watermarked previews, one-time download links).
- Footer minimal. Total height ≲ 3 viewports.

### 6.2 Auth `/login`, `/signup`
Split layout: left 480px form on `--surface-1`, right = the timeline graphic on `--bg`.
Fields: email, password (show/hide toggle), submit. Inline validation, no page reload.
Error: red text under the field, never an alert.

### 6.3 Dashboard `/projects`
- Header: H1 "Projects", search input, filter chips `All · Processing · Ready · Awaiting payment · Paid`,
  grid/list toggle (grid default), primary "New upload".
- Grid: `repeat(auto-fill, minmax(280px, 1fr))`, gap 20.
- List view: table rows 56px, columns Thumbnail+Title, Status, Links, Last viewed, Size, kebab menu.
- Empty state (no projects): centered EmptyState with the Dropzone itself embedded and the line
  "Upload your first cut. Nothing is shared until you create a link."
- Loading: 6 skeleton cards with shimmer (1.4s).

### 6.4 Upload flow (Dialog, 640px)
1. Dropzone (or after drop: file row with name, size mono, remove ×).
2. Title field (prefilled from filename, cleaned).
3. On "Upload": row turns into progress: ProgressBar + `42% · 1.2 GB of 2.9 GB · 18 MB/s · 1 min left`
   (mono for numbers). Buttons: Pause/Resume, Cancel.
4. After upload: stages shown as a 3-step list with live status:
   `Uploaded ✓ → Building secure preview (spinner) → Saving original to private storage`.
5. Allow closing the dialog; progress continues in a small docked **upload tray** bottom-right
   (320px wide). Survives navigation.
6. Errors (too large, wrong type, storage full, network) appear inline with a "Retry" action. Network loss
   auto-resumes the chunked upload.

### 6.5 Project detail `/projects/[id]`
```
← Projects
┌──────────────────────────────────────┬───────────────────────────┐
│  [ video player — preview of editor ]│  Wedding_Reel_v3.mp4  ✎   │
│  (editor sees the full original      │  READY · 4:12 · 2.9 GB    │
│   proxy? NO — shows the preview      │  1920×1080 · 24 fps       │
│   rendition only, same as client)    │  Uploaded 2d ago          │
├──────────────────────────────────────┤  [ + Create share link ]  │
│  Tabs:  Share links · Activity       │                           │
│  ┌ link row ─────────────────────┐   │  Danger zone              │
│  │ Rahul – Wedding Reel  [LIVE]  │   │  [ Delete project ]       │
│  │ rl.app/v/x7Kq…  [copy]        │   │                           │
│  │ 0:00–0:30 · 0/1 viewers · 2h  │   │                           │
│  │ [Open] [Edit] [Revoke] ⋯      │   │                           │
│  └───────────────────────────────┘   │                           │
└──────────────────────────────────────┴───────────────────────────┘
```
- Left column flexible, right column 340px sticky.
- Link row = `--surface-1` card, 16px padding. Status pill top-right. Mono values for slug and counters.
- If the status is `viewers_exhausted` or `expired`, show an inline hint: "Client has seen the preview. Release the full file when paid." with primary button **Release full file**.

### 6.6 Create / edit share link (right Drawer, 480px) — most important screen
Sections, top to bottom, separated by 1px borders and 24px gaps:

1. **Who is this for** — `client_label` input (placeholder "e.g. Rahul – Wedding Reel").
2. **Preview range** — the **TimelineRangeSelector** (below).
3. **Access** — segmented control `Private (passcode)` | `Public (anyone with link)`.
   If Private: passcode input with a "Generate" button (6 chars, mono) and show/hide.
4. **Viewer limit** — stepper `− 1 +` with caption "Unique viewers who can open this link".
5. **Expiry** — select: Never · 1 hour · 24 hours · 7 days · Custom.
6. **Downloads** — Switch "Allow preview download" with helper "Only the watermarked preview
   can be downloaded. The full video stays locked until you release it."
7. **Watermark** — text input prefilled `PREVIEW · NOT PAID`, plus a small live preview
   thumbnail with the watermark tiled diagonally.
Footer (sticky): secondary "Cancel", primary "Create link". After success the drawer swaps to
a **success state**: big CopyLinkButton, passcode with copy button (if private), summary lines,
and "Done". Confetti is banned; use a subtle amber check draw-in animation (360ms).

#### TimelineRangeSelector spec
- Full-width track, 64px tall, radius 10px, bg `--surface-2`, 1px border.
- Background shows a **filmstrip of thumbnails** (from `/api/projects/:id/thumbs`), 8–12 frames,
  each dimmed to 55% opacity.
- Mode toggle above: `First N seconds` | `Custom segment`.
  - *First N seconds*: one amber handle that drags from the left edge; quick-pick chips
    `15s · 30s · 60s · 2m` + custom `mm:ss` input.
  - *Custom segment*: two amber handles (start, end), draggable body.
- **Allowed range:** filled `--accent-soft`, 2px amber borders at both ends, handles are 10px
  wide × full height rounded bars with two tiny grip lines.
- **Locked region (outside range):** darkened 70% with a 45° diagonal hatch pattern
  (`repeating-linear-gradient`) and a small lock icon centered in the region once it's wider than 80px.
- Above handles: floating mono timecode tags that follow the handles.
- Below: a ruler with mono ticks every 10–60s depending on length; total duration on the right.
- Summary line under the track (14px): "Client will see **0:00 → 0:30** of **4:12** (12%)".
- Warning if range > 50% of the video: amber text "That's a big preview. Consider a shorter one."
- Keyboard: handles focusable; ←/→ = 1s, Shift+←/→ = 10s, Home/End snap to ends.
- Touch: handle hit area ≥ 44px.

### 6.7 Link detail & "Release full file"
Opening a link row shows a Drawer with:
- StatusTimeline: `Created → Opened by client → Preview finished → Paid → Downloaded`
  (each with mono timestamp; unfilled steps hollow).
- Stats: opens, viewers used `1 / 1`, last viewed, preview downloads.
- Primary button **Release full file** (amber). Click → ConfirmDialog:
  - Title: "Release the full-quality video?"
  - Body: "{client_label} will be able to download the original file. This can't be undone, but you can still revoke the link afterwards."
  - Buttons: "Cancel" / "Yes, release".
- After release: success toast + the pill turns green "Paid" and a copy-ready message appears:
  "Your file is ready: {link}" with a copy button.

### 6.8 Settings `/settings`
Sections as stacked cards: Profile (name, email), Storage (usage bar + per-project size list, largest first, with a Delete action; plain text "Storage is managed for you. No Google account needed."), Default watermark text, Default viewer limit,
Default preview length, Danger zone (delete account). Save bar slides up from the bottom when dirty.

### 6.9 CLIENT VIEWER PAGE `/v/[slug]` (the page clients judge you by)
Full-viewport dark page, no app chrome. Must work well at 375px wide.

```
┌───────────────────────────────────────────────────────────┐
│ ▌ReviewLock                        Shared by Priyanshu    │  ← 56px bar, no nav
├───────────────────────────────────────────────────────────┤
│                                                           │
│        ┌─────────────────────────────────────┐            │
│        │                                     │            │
│        │          16:9 PLAYER                │  max-w 1100│
│        │   (diagonal tiled watermark)        │            │
│        │                                     │            │
│        │  ▶  ━━━━●━━━━━━━━━━━━🔒  0:07 / 0:30 │            │
│        └─────────────────────────────────────┘            │
│   Wedding Reel v3                      [ PREVIEW ] pill   │
│   Preview only · 30 seconds of 4:12                       │
│                                                           │
│   "The full-quality video is released by the editor       │
│    after payment."                                        │
└───────────────────────────────────────────────────────────┘
```
**Player (custom controls, never the native `<video controls>`)**
- Bottom control bar over a 0→black 60% gradient, auto-hides after 2.5s idle.
- Controls: play/pause, scrub bar (width = preview length ONLY; a lock icon sits at the end),
  mono `0:07 / 0:30`, volume, fullscreen. No speed menu, no download button, no PiP.
- Scrub bar: 4px (8px on hover), amber played portion, buffered portion `--surface-3`.
- Keyboard: Space/K, ←/→ ±5s, F, M.
- Watermark: diagonal tiled text (burned-in is in the video; add a DOM overlay at 12% opacity
  containing `viewer-id · timestamp`, slowly drifting). Overlay is `pointer-events: none`.
- `controlsList="nodownload"`, `disablePictureInPicture`, context menu disabled on the player.
  **These are deterrents only; real enforcement is server-side (CONTRACT §2).**
- Start fast: show poster immediately, buffer first segment, big centered play button
  (64px circle, `--accent`, soft pulse on idle).
- When the preview ends: player dims, an **end card** fades in (360ms):
  lock icon, "That's the end of the preview.", "The full video is released after payment."
  and a ghost button "Watch again" (does NOT consume another viewer slot).

**Other viewer states (each a centered 440px card on `--bg`, same top bar)**
| State | Icon | Title | Body |
|---|---|---|---|
| Passcode | `KeyRound` | "This video is private" | Passcode input (mono, letter-spaced) + "Continue". Wrong: shake 300ms + "That passcode isn't right." Lockout: "Too many attempts. Try again in 12:40." |
| Loading | skeleton | — | Poster skeleton with shimmer |
| Preview not ready | `Loader` | "Preparing your preview" | "This usually takes a minute." Auto-polls. |
| Viewer limit reached | `UsersRound` | "This link has reached its viewer limit" | "Ask {editor} for a new link." |
| Expired | `Clock` | "This link has expired" | "Ask {editor} for a new link." |
| Revoked | `Ban` | "This link is no longer available" | — |
| Not found | `SearchX` | "We can't find that link" | "Check the address and try again." |
| **Unlocked** | `BadgeCheck` (success) | "Your video is ready" | File name, size (mono), "Original quality · no compression", primary lg button **Download full video**. Shows a download progress line while streaming. |
| Preview download (if allowed) | — | — | A secondary button under the player: "Download preview (watermarked)". |

Never show editor email, internal IDs, or Drive info on this page.

### 6.10 System pages
404, 500 and offline pages use the same centered-card pattern with the timeline motif.

---

## 7. Motion rules
- Durations: hover 120ms, state changes 200ms, page/drawer transitions 360ms, always `--ease`.
- Drawer: slides from right + backdrop fade. Dialog: scale 0.98→1 + fade.
- Lists: stagger children 30ms on first load only.
- Respect `prefers-reduced-motion`: disable transforms, keep opacity fades.
- Never animate layout properties that cause jank; use transform/opacity.

## 8. Responsive behaviour
| Breakpoint | Behaviour |
|---|---|
| ≥1280 | Full layout as above |
| 1100–1279 | Sidebar collapses to icon rail |
| 768–1099 | Project detail becomes single column; right panel moves under the player |
| <768 | Bottom tab bar (Projects, Upload, Settings), drawers become full-height sheets, tables become cards, viewer page player is full-bleed |

## 9. Accessibility (required, not optional)
- WCAG AA contrast on all text; `--text-faint` only for non-essential hints.
- All controls keyboard operable with visible focus ring; dialogs trap focus and restore it.
- Player controls have aria-labels; timeline handles use `role="slider"` with `aria-valuetext` like "30 seconds".
- Status never relies on colour alone (dot shape + text).
- Toasts use `aria-live="polite"`.

## 10. Microcopy voice
Plain, calm, short. Second person. No exclamation marks, no "Oops!", no jargon.
- Success: "Link copied" · "Full file released" · "Preview is ready"
- Errors say what happened and what to do: "Upload paused — your connection dropped. It will resume automatically."
- Buttons are verbs: "Create link", "Release full file", "Revoke link".

## 11. Empty / loading / error states (every screen must implement all three)
- Empty: icon (lucide, 24px, `--text-faint`) + one-line title + one-line help + one primary action.
- Loading: skeletons matching the final layout. Spinners only inside buttons.
- Error: inline card with `--danger-soft` bg, message, "Try again" button. Never a blank screen.

## 12. Realistic sample content (use in mocks and seeds)
Editor: "Priyanshu". Projects: "Wedding_Reel_v3.mp4 (4:12)", "Brand_Promo_Final.mov (1:48)",
"Podcast_Ep14_Cut.mp4 (38:05)". Clients: "Rahul – Wedding Reel", "Studio Kala – Promo".
Links: `rl.app/v/x7Kq9Zr2…`.

---

## 13. How you (the builder agent) must work on the frontend
1. **Build order:** tokens + fonts → core components + `/dev/components` page → app shell →
   screens with **mock data** typed from CONTRACT §9 → only then wire to real APIs.
2. Put mocks in `/lib/mocks` behind an `NEXT_PUBLIC_USE_MOCKS=true` flag so the UI can be reviewed
   with no backend.
3. File structure: `components/ui/*` (primitives), `components/features/*` (project, links, player, upload),
   `app/(editor)/*`, `app/(public)/v/[slug]`, `lib/api.ts` (typed client), `lib/format.ts` (time/size).
4. Write `lib/format.ts` once: `formatTimecode(sec)`, `formatBytes(n)`, `formatRelative(date)`.
5. After finishing each screen, **open it in the browser, take screenshots at 1440px and 390px, and
   compare against the wireframes and the Hard NO list above.** Fix mismatches before reporting done.
6. Do not add features, pages, colours or fonts that are not in this file.

## 14. Definition of done (frontend)
- [ ] All tokens used; zero hardcoded colours or random pixel values
- [ ] Every component has all states in `/dev/components`
- [ ] Every screen has empty, loading, error states
- [ ] Viewer page tested at 375px, 768px, 1440px
- [ ] Keyboard-only walkthrough passes (upload → create link → copy)
- [ ] Lighthouse accessibility ≥ 95 on viewer page and dashboard
- [ ] No console errors or hydration warnings
