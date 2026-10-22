// The assistant's safe core. Every message goes: emergency rules -> library search -> (model or composed answer).
// Nothing here calls a model, so this path answers on every device, offline, deterministically.
import type { Guidance } from '../data/guidance'
import type { Database } from '../database/types'
import { matchEmergency, type EmergencyRule } from '../domain/emergency'
import type { Lang } from '../i18n'

export type Plan = { kind: 'emergency'; rule: EmergencyRule } | { kind: 'grounded'; sources: Guidance[] } | { kind: 'unknown' }

// Words that say nothing about the health problem. Hindi, Hinglish and English.
const FILLER = new Set(
  (
    'है हैं था थी थे का की के को में से और या क्या कैसे क्यों मेरा मेरी मेरे मुझे मैं हम हो रहा रही रहे कर करें करना करे भी तो पर एक यह वह ये वो कल आज ' +
    'कितना कितनी कितने दें दे देना दो दूं दूँ दीजिए लें ले लेना चाहिए ' +
    'hai hain tha thi the ka ki ke ko me mein se aur ya kya kaise kyu kyon mera meri mere mujhe mai main hum ho raha rahi rahe kar karu kare karna bhi to par ek ye wo yeh woh kal aaj ' +
    'kitna kitni kitne de dena do du dijiye le lena chahiye ' +
    'a an the is are was were be been what how why when which who my me i we you it its to of in on at for from and or do does did have has had with can could should would will please tell about this that there ' +
    'much many give take'
  ).split(' '),
)

const TOP = 3

// ponytail: crude English suffix stripping so "burned" finds "Burns"; a real stemmer if the library outgrows it.
const stem = (w: string) => (/^[a-z]{5,}$/.test(w) ? w.replace(/(ing|ed|es|s)$/, '') : w)

/** Library items for a free-text question: one per topic, best first, in the reader's language when available. */
export async function retrieve(db: Database, message: string, lang: Lang): Promise<Guidance[]> {
  const words = [...new Set((message.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).filter((w) => w.length > 1 && !FILLER.has(w)).map(stem))]
  if (!words.length) return []
  // A hit must be in a title or keywords, so a word that happens to appear in some text is not enough.
  // Each word is a quoted prefix term, so user input is never read as FTS syntax.
  const match = `{title keywords} : (${words.map((w) => `"${w}"*`).join(' OR ')})`
  const hits = await db.query<{ topic: string }>(
    `SELECT g.topic FROM guidance_fts f JOIN guidance_documents g ON g.id = f.id
     WHERE guidance_fts MATCH ? AND g.status = 'active'
     ORDER BY bm25(guidance_fts, 0, 10.0, 1.0, 5.0)`,
    [match],
  )
  const topics = [...new Set(hits.map((h) => h.topic))].slice(0, TOP)
  if (!topics.length) return []
  const docs = await db.query<Guidance>(
    `SELECT id, title, language, topic, category, summary, content, source_name, source_reference, reviewed, reviewed_at, limitations, audience, version
     FROM guidance_documents WHERE status = 'active' AND topic IN (${topics.map(() => '?').join(',')})`,
    topics,
  )
  return topics.map((t) => docs.find((d) => d.topic === t && d.language === lang) ?? docs.find((d) => d.topic === t)!)
}

export async function planReply(db: Database, rules: EmergencyRule[], message: string, lang: Lang): Promise<Plan> {
  const rule = matchEmergency(rules, message)
  if (rule) return { kind: 'emergency', rule }
  const sources = await retrieve(db, message, lang)
  return sources.length ? { kind: 'grounded', sources } : { kind: 'unknown' }
}

const seeAlso: Record<string, string> = { hi: 'यह भी देखें', en: 'See also', ta: 'இதையும் பாருங்கள்', te: 'ఇవి కూడా చూడండి', bn: 'আরও দেখুন', mr: 'हे देखील पहा', gu: 'આ પણ જુઓ', kn: 'ಇದನ್ನೂ ನೋಡಿ', ml: 'ഇതും കാണുക', pa: 'ਇਹ ਵੀ ਵੇਖੋ', or: 'ଏହା ମଧ୍ୟ ଦେଖନ୍ତୁ', as: 'এইটোও চাওক', ur: 'یہ بھی دیکھیں' }

/** The answer when no model is available: the top item's own words, its limits, and related items. */
export function composeAnswer(sources: Guidance[], lang: Lang): string {
  const [top, ...rest] = sources
  const parts = [top.summary, top.content, top.limitations].filter(Boolean)
  if (rest.length) parts.push(`${seeAlso[lang] ?? seeAlso['en']}: ${rest.map((s) => s.title).join(', ')}`)
  return parts.join('\n\n')
}
