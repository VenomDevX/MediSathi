'use client'
import { Info, Translate } from '@phosphor-icons/react'
import { useLang, useT } from '@/i18n'
import { Card, PageHeader, cx } from '@/ui/components'

export default function More() {
  const t = useT()
  const { lang, setLang } = useLang()

  return (
    <>
      <PageHeader title={t('moreTitle')} />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Translate size={22} className="text-neel" aria-hidden />
            {t('moreLanguage')}
          </h2>
          <div role="radiogroup" aria-label={t('moreLanguage')} className="grid grid-cols-2 gap-2">
            {(['hi', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                lang={l}
                onClick={() => setLang(l)}
                className={cx('min-h-12 rounded-[var(--radius-control)] border font-semibold', lang === l ? 'border-neel bg-neel-soft text-neel' : 'border-line')}
              >
                {l === 'hi' ? 'हिंदी' : 'English'}
              </button>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info size={22} className="text-neel" aria-hidden />
            {t('moreAbout')}
          </h2>
          <p className="text-muted">{t('moreAboutText')}</p>
        </Card>
      </div>
    </>
  )
}
