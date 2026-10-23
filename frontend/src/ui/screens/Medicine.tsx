import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChatCircleText, FileArrowUp, Pill, SpeakerHigh, Stop, Warning } from '@phosphor-icons/react'
import { identifyMedicine, parseExpiry, strength, type Expiry, type Medicine as Med } from '../../domain/medicine'
import { ruleText } from '../../domain/emergency'
import { useFormatDate, useLang, useT } from '../../i18n'
import { medicines } from '../../medicines'
import { isSafeType } from '../../platform/files'
import { canSpeak, speak, stopSpeaking } from '../../platform/speech'
import { Banner, Button, Card, LinkButton, PageHeader } from '../components'

type Result = { med?: Med; dose?: string; expiry?: Expiry }

/** Photo of a strip or box → name, use, warning and expiry. Read on the device; nothing is saved. */
export function MedicineScan() {
  const t = useT()
  const fmt = useFormatDate()
  const { lang } = useLang()
  const [pct, setPct] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [failed, setFailed] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isSafeType(file.type)) return
    setFailed(false)
    setResult(null)
    setPct(0)
    try {
      const { extractText } = await import('../../platform/ocr')
      const text = (await extractText(file, (p) => setPct(Math.round(p.fraction * 100)))).map((l) => l.text).join('\n')
      setResult({ med: identifyMedicine(text, medicines), dose: strength(text), expiry: parseExpiry(text, new Date()) })
    } catch (err) {
      console.error('Medicine scan failed', err instanceof Error ? err.message : err)
      setFailed(true)
    } finally {
      setPct(null)
    }
  }

  const med = result?.med
  const name = med ? [med.generic, result?.dose].filter(Boolean).join(' ') : ''
  const expiryText = (x?: Expiry) =>
    !x ? t('medicineNoExpiry') : t(x.status === 'expired' ? 'medicineExpired' : x.status === 'soon' ? 'medicineExpiresSoon' : 'medicineExpiresOn', { date: fmt(x.date) })

  function toggleSpeak() {
    stopSpeaking()
    if (speaking || !med) return setSpeaking(false)
    setSpeaking(true)
    speak(`${name}. ${ruleText(med.use, lang)} ${ruleText(med.warning, lang)} ${expiryText(result?.expiry)}`, lang, () => setSpeaking(false))
  }

  return (
    <>
      <PageHeader title={t('medicineTitle')} back={{ to: '/scan', label: t('navScan') }} />
      <div className="flex flex-col gap-6">
        <p className="text-muted">{t('medicineHint')}</p>
        {pct !== null ? (
          <p role="status" aria-live="polite" className="font-medium">{t('medicineReading', { pct })}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button onClick={() => camera.current?.click()}>
              <Camera size={22} aria-hidden />
              {t('takePhoto')}
            </Button>
            <Button variant="secondary" onClick={() => picker.current?.click()}>
              <FileArrowUp size={22} aria-hidden />
              {t('chooseFile')}
            </Button>
          </div>
        )}
        <input ref={camera} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={onFile} className="hidden" aria-hidden tabIndex={-1} />
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" aria-label={t('chooseFile')} tabIndex={-1} />
        {failed && <Banner tone="danger">{t('ocrFailed')}</Banner>}

        {result && !med && <Banner tone="caution" icon={<Warning size={20} />}>{t('medicineUnknown')}</Banner>}
        {result && result.expiry?.status === 'expired' && (
          <Banner tone="danger" icon={<Warning size={20} />}>{expiryText(result.expiry)}</Banner>
        )}
        {med && (
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Pill size={28} className="text-neem" aria-hidden />
              {name}
            </h2>
            <section>
              <h3 className="font-semibold text-muted">{t('medicineUse')}</h3>
              <p>{ruleText(med.use, lang)}</p>
            </section>
            <section>
              <h3 className="font-semibold text-muted">{t('medicineWarning')}</h3>
              <p>{ruleText(med.warning, lang)}</p>
            </section>
            {result?.expiry?.status !== 'expired' && (
              <p className={result?.expiry?.status === 'soon' ? 'font-semibold text-caution' : 'text-muted'}>{expiryText(result?.expiry)}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {canSpeak() && (
                <Button variant="secondary" onClick={toggleSpeak} aria-pressed={speaking}>
                  {speaking ? <Stop size={20} aria-hidden /> : <SpeakerHigh size={20} aria-hidden />}
                  {t(speaking ? 'stop' : 'readAloud')}
                </Button>
              )}
              <LinkButton to={`/chat?q=${encodeURIComponent(t('medicineAskText', { name: med.generic }))}`} variant="secondary">
                <ChatCircleText size={20} aria-hidden />
                {t('medicineAsk')}
              </LinkButton>
            </div>
          </Card>
        )}
        <p className="text-sm text-muted">{t('medicineDisclaimer')}</p>
      </div>
    </>
  )
}
