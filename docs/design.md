# MediSaathi design system

**Design read:** trust-first health utility for ASHA workers and caregivers on low-cost Android phones and clinic laptops. Calm, minimal, bilingual (Hindi first). Dials: variance 3, motion 2, density 4.

## Color
| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#F4F6F3` | `#111614` | Page background (cool sage off-white, not cream) |
| `surface` | `#FFFFFF` | `#192019` | Cards, sheets, inputs |
| `ink` | `#1D2522` | `#E6EBE8` | Text |
| `muted` | `#56625D` | `#9BA8A2` | Secondary text |
| `line` | `#DFE5E1` | `#2A332F` | 1px borders and dividers |
| `neem` | `#1E6B52` | `#6CC3A0` | The one accent: primary actions, brand, focus ring |

Semantic pastels are used **only** for meaning, always with text and an icon:
- Danger / HIGH / emergency: bg `#FDEBEC`, text `#9F2F2D`
- Caution / LOW / pending: bg `#FBF3DB`, text `#7A5200`
- Normal / synced: bg `#E8F3EC`, text `#2E6340`
- Info / local: bg `#E6F0FA`, text `#1F5F8F`

## Type
- One family: **Mukta** (self-hosted, Latin + Devanagari), weights 400/500/600/700.
- Scale: 14 / 16 / 17 (body) / 20 / 24 / 32. Line-height 1.6 for body, 1.25 for headings.
- Sentence case everywhere. No all-caps labels, no eyebrows, no em-dashes in UI copy.

## Shape and depth
- Radius: 12px cards and sheets, 10px buttons and inputs, full for small status chips.
- Borders do the work; shadows only on floating sheets (`0 8px 24px rgb(29 37 34 / 0.08)`).

## Layout
- Phone (< 1024px): single column, 16px gutter, bottom tab bar with icon + label, 64px tall.
- Laptop (>= 1024px): left rail navigation, content column max 760px; list + detail panes where useful.
- Touch targets >= 48px. One primary action per screen.

## Motion
- Only in response to user actions: sheet open, toast, status change. 150-200ms, ease-out. Off under `prefers-reduced-motion`.

## Icons
- Phosphor (regular weight in nav, bold for status). Always with a text label.

## The one memorable thing
The **Today** home screen: a large bilingual greeting and today's follow-ups as the first thing a worker sees. Everything else stays quiet.
