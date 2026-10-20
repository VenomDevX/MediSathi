import { ArrowsClockwise, CheckCircle, CloudArrowUp, SignOut, WarningCircle, WifiSlash } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { useFormatDate, useT } from '../../i18n'
import type { StringKey } from '../../strings'
import { useSync } from '../../sync/useSync'
import { Banner, Button, Card, PageHeader } from '../components'
import { useAsync } from '../useAsync'

type ProblemRow = { operation_id: string; entity_type: string; status: string; last_error_code: string | null; created_at: string }

/** PRD SY-05: pending, successful, failed and conflicted operations are all visible. */
export function Sync() {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user, online } = useApp()
  const sync = useSync()
  const { data: problems } = useAsync(
    () => db.query<ProblemRow>("SELECT operation_id, entity_type, status, last_error_code, created_at FROM sync_operations WHERE status IN ('failed', 'conflict') ORDER BY created_at DESC LIMIT 50"),
    [db, sync.last, sync.pending],
  )

  return (
    <>
      <PageHeader title={t('syncTitle')} />
      <div className="flex flex-col gap-5">
        {sync.canSync && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            {sync.pending === 0 ? (
              <CheckCircle size={32} weight="fill" className="shrink-0 text-ok" aria-hidden />
            ) : (
              <CloudArrowUp size={32} className="shrink-0 text-caution" aria-hidden />
            )}
            <div>
              <p className="text-xl font-semibold">{sync.pending === 0 ? t('allSynced') : t('pendingCount', { n: sync.pending })}</p>
              <p className="text-muted">
                {sync.last ? t('lastSynced', { date: fmt(sync.last.at, true) }) : t('neverSynced')}
                {sync.last && `, ${t('syncResult', { pushed: sync.last.summary.pushed, pulled: sync.last.summary.pulled })}`}
              </p>
            </div>
          </div>
          <Button onClick={() => void sync.syncNow()} disabled={sync.syncing || !online}>
            <ArrowsClockwise size={20} aria-hidden className={sync.syncing ? 'motion-safe:animate-spin' : ''} />
            {t(sync.syncing ? 'syncing' : 'syncNow')}
          </Button>
        </Card>
        )}

        {!sync.canSync && <Banner tone="info">{t('demoNoSync')}</Banner>}
        {sync.canSync && !online && <Banner tone="info" icon={<WifiSlash size={20} />}>{t('syncOfflineNow')}</Banner>}
        {sync.error && <Banner tone="danger" icon={<WarningCircle size={20} />}>{t(sync.error === 'auth' ? 'syncAuthError' : 'syncFailedError')}</Banner>}

        {problems && problems.length > 0 && (
          <section aria-labelledby="problems">
            <h2 id="problems" className="mb-3 text-xl font-semibold">{t('problems')}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {problems.map((p) => (
                <li key={p.operation_id} className="flex flex-col gap-0.5 px-4 py-3">
                  <p className="font-semibold">{t(`entity_${p.entity_type}` as StringKey)}, {fmt(p.created_at, true)}</p>
                  <p className="text-sm text-muted">{p.status === 'conflict' ? t('problemConflict') : t('problemFailed', { code: p.last_error_code ?? '?' })}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-muted">{t('signedInAs', { name: user.display_name, role: t(`role_${user.role}` as StringKey) })}</p>
          <Button variant="secondary" onClick={() => void sync.signOut()}>
            <SignOut size={20} aria-hidden />
            {t('signOut')}
          </Button>
        </div>
      </div>
    </>
  )
}
