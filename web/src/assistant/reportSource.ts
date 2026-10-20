// A checked report as one more numbered source for the assistant: the model may only repeat what is on it,
// and the guard already rejects any number that is not in a source.
import type { Guidance } from '../data/guidance'
import { readResults, type Report } from '../data/reports'
import type { Lang } from '../i18n'

const words = {
  en: {
    title: 'Your report', summary: 'The values checked on this report, compared with their usual ranges.',
    low: 'low', normal: 'within the usual range', high: 'high', usual: 'usual range', to: 'to', below: 'below', above: 'above',
    report: 'printed on the report', table: 'from the app table', unknown: 'This app has no reliable information about this test.',
    limits: 'Only a doctor who knows the person can say what these results mean. Do not start or stop medicines because of them.',
  },
  hi: {
    title: 'आपकी रिपोर्ट', summary: 'इस रिपोर्ट में जांचे गए मान, उनकी सामान्य सीमा से तुलना।',
    low: 'कम', normal: 'सामान्य सीमा में', high: 'ज़्यादा', usual: 'सामान्य सीमा', to: 'से', below: 'से कम', above: 'से ज़्यादा',
    report: 'रिपोर्ट पर छपी', table: 'ऐप की तालिका से', unknown: 'इस जांच के बारे में ऐप के पास भरोसेमंद जानकारी नहीं है।',
    limits: 'इन नतीजों का मतलब वही डॉक्टर बता सकता है जो व्यक्ति को जानता हो। इनकी वजह से दवा शुरू या बंद न करें।',
  },
}

export function reportSource(report: Report, lang: Lang): Guidance {
  const w = words[lang]
  const lines = readResults(report.fields, report.profile_sex, lang).map(({ field: f, name, result: r, explanation }) => {
    const value = `${name}: ${f.value}${f.unit ? ` ${f.unit}` : ''}`
    if (r.status === 'unknown' || !explanation) return `${value}. ${w.unknown}`
    // Ranges keep the report's own spelling ("12.0"), so the model can quote them and the guard can find them.
    const lo = r.rangeSource === 'report' ? f.range_low : String(r.low ?? '')
    const hi = r.rangeSource === 'report' ? f.range_high : String(r.high ?? '')
    const range = lo && hi ? `${lo} ${w.to} ${hi}` : hi ? `${w.below} ${hi}` : `${w.above} ${lo}`
    return `${value}, ${w[r.status]} (${w.usual} ${range}, ${w[r.rangeSource === 'report' ? 'report' : 'table']}). ${explanation}`
  })
  return {
    id: `report:${report.id}`,
    title: `${w.title}: ${report.file_name}`,
    language: lang,
    topic: `report:${report.id}`,
    category: 'report',
    summary: w.summary,
    content: lines.join('\n'),
    source_name: w.title,
    source_reference: null,
    reviewed: 0,
    reviewed_at: null,
    limitations: w.limits,
    audience: 'public',
    version: '1',
  }
}
