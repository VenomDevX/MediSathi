import { Warning } from '@phosphor-icons/react'
import { SYMPTOM_LABEL, type Cluster } from '../../domain/outbreak'
import { useT } from '../../i18n'
import { localities } from '../../localities'
import { Banner, Card, PageHeader } from '../components'
import { useClusters } from '../useClusters'

export function Outbreak() {
  const t = useT()
  const { data: clusters } = useClusters()
  const alerts = clusters?.filter((c) => c.alert) ?? []

  return (
    <>
      <PageHeader title={t('outbreakTitle')} />
      <div className="flex flex-col gap-6">
        <p className="text-muted">{t('outbreakIntro')}</p>
        {alerts.map((c) => (
          <Banner key={c.village + c.symptom} tone="danger" icon={<Warning size={20} />}>
            <p className="font-semibold">{t('outbreakAlert', { n: c.cases, symptom: t(SYMPTOM_LABEL[c.symptom]).toLowerCase(), village: c.village })}</p>
            <p className="mt-1">{t('outbreakAction')}</p>
          </Banner>
        ))}
        {clusters && <VillageMap clusters={clusters} />}
        {clusters?.length === 0 ? (
          <p className="text-muted">{t('outbreakNone')}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {clusters?.map((c) => (
              <li key={c.village + c.symptom} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <span className="font-semibold">
                  {c.village}: {t(SYMPTOM_LABEL[c.symptom])}
                </span>
                <span className={c.alert ? 'font-semibold text-danger' : 'text-muted'}>{t('outbreakRow', { n: c.cases, prev: c.previous })}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">{t('outbreakNote')}</p>
      </div>
    </>
  )
}

/** Villages placed by latitude and longitude, no map tiles, so it works offline. Circle size follows this week's cases. */
function VillageMap({ clusters }: { clusters: Cluster[] }) {
  const t = useT()
  const W = 400
  const H = 260
  const pad = 40
  const lats = localities.map((l) => l.lat)
  const lngs = localities.map((l) => l.lng)
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const x = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * pad)
  const y = (lat: number) => pad + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * pad)
  const byVillage = (name: string) => clusters.filter((c) => c.village.toLowerCase() === name.toLowerCase())

  return (
    <Card className="p-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('outbreakMap')} className="h-auto w-full">
        {localities.map((l) => {
          const here = byVillage(l.name)
          const cases = Math.max(0, ...here.map((c) => c.cases))
          const alert = here.some((c) => c.alert)
          return (
            <g key={l.id}>
              {cases > 0 && <circle cx={x(l.lng)} cy={y(l.lat)} r={8 + 5 * Math.sqrt(cases)} className={alert ? 'fill-danger/30 stroke-danger' : 'fill-caution/25 stroke-caution'} strokeWidth={2} />}
              <circle cx={x(l.lng)} cy={y(l.lat)} r={3.5} className={alert ? 'fill-danger' : 'fill-muted'} />
              <text x={x(l.lng)} y={y(l.lat) - 10 - (cases > 0 ? 5 * Math.sqrt(cases) : 0)} textAnchor="middle" className={alert ? 'fill-danger text-[13px] font-bold' : 'fill-ink text-[11px]'}>
                {l.name}
              </text>
            </g>
          )
        })}
      </svg>
    </Card>
  )
}
