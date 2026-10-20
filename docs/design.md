# MediSaathi design v2 (personal app)

**Design read:** a personal health companion for Indian families (Hindi and English, mixed literacy, cheap Android phones and laptops). It should feel trust-first, calm and warm, and the assistant is the hero. Dials: variance 4, motion 3, density 3.

**Why it changed from v1:** v1 (Mukta, neem green, sage canvas) was a health-worker tool, with dense lists and a "today's work" mindset. v2 is for one person worrying about their family, so it needs to be quieter, give one clear place to ask, and use bigger type.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| canvas | `#F5F6FA` | `#10131F` | page background (cool paper, not cream) |
| surface | `#FFFFFF` | `#171B2B` | cards, inputs, bars |
| ink | `#18203A` | `#E9EBF3` | text |
| muted | `#5B6178` | `#9AA0B5` | secondary text |
| line | `#E2E5EE` | `#262B3F` | 1px borders, dividers |
| neel (accent) | `#2D3A8C` | `#9AA6FF` | the one accent: primary actions, focus, active nav |
| neel-soft | `#E8EAF6` | `#1F2547` | user chat bubble, selected tile, info banner |
| marigold | `#E9A23B` | `#E9A23B` | **only** the assistant's mark (a small dot/flower glyph); never text |
| danger / -bg | `#B42318` / `#FDECEA` | `#FF8A80` / `#3A1714` | SOS, emergency, HIGH |
| caution / -bg | `#8A5A00` / `#FDF3DC` | `#F2C46D` / `#33270F` | LOW/HIGH flags, "check this" |
| ok / -bg | `#1F6B45` / `#E6F4EC` | `#7FD3A4` / `#13291D` | normal, done |

Indigo (neel) comes from Indian indigo dye: deep and flat, never a gradient or a glow.

## Type
- **Anek Devanagari** (variable; Devanagari and Latin), self-hosted via `next/font`. One family.
- Display (h1, the assistant prompt): width 112, weight 650, tracking -0.01em, line-height 1.15.
- Body: width 100, weight 420, 17px, line-height 1.6. Devanagari needs this height.
- Labels: 15px weight 550. Sentence case, no all-caps, no em-dashes.

## Shape and depth
- Cards 16px radius, controls 12px, pills (`9999px`) only for chips and the SOS button.
- No shadows. Elevation is a 1px `line` border on `surface` over `canvas`.
- Touch targets ≥ 48px. Focus: 2px neel outline, offset 2px.

## Layout
Phone (bottom bar: Home, Chat, Records, More):
```
MediSaathi                    (SOS)
Good evening, Asha
+--------------------------------+
| * Ask about any health worry   |   <- the hero: looks like an input, opens Chat
|   "Child has fever since..."  (mic)
+--------------------------------+
[ Read a report ] [ My family ]       2x2 tiles, icon + one line
[ First aid     ] [ Reminders ]
Coming up
  Ma: BP check, tomorrow
Not a doctor. In an emergency call 108.
```
Laptop: left rail for nav, content column max 720px, tiles in one row of 4, and chat with a sources pane on the right.

## Chat
- Assistant answers are plain text blocks on the canvas, with a marigold mark, not bubbles. User messages sit in neel-soft bubbles on the right.
- Every answer ends with source chips: "First aid: fever · demo, not reviewed".
- The emergency card is a full-width danger-bg card with a big "Call 108" button, and appears before anything else.
- "I don't know" is a plain answer plus a "Find a doctor / call 104" link, never a guess.
- Streaming shows text as it arrives with no typing animation, and the marigold mark pulses only while generating (and not at all with reduced motion).

## Motion
Only in response to the user: page transitions none, the sheet slides 150 ms, and the streaming caret. `prefers-reduced-motion` turns all of it off.
