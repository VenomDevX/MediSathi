import { HashRouter, Route, Routes } from 'react-router-dom'
import { Hourglass } from '@phosphor-icons/react'
import { AppProvider } from './app-context'
import { LangProvider, useT } from './i18n'
import { AppShell } from './ui/AppShell'
import { EmptyState, PageHeader } from './ui/components'
import { Today } from './ui/screens/Today'
import { PatientList, PatientNew } from './ui/screens/Patients'
import { PatientDetail, VisitForm } from './ui/screens/PatientDetail'
import { LockGate } from './ui/LockGate'
import type { StringKey } from './strings'

function Placeholder({ title }: { title: StringKey }) {
  const t = useT()
  return (
    <>
      <PageHeader title={t(title)} />
      <EmptyState icon={<Hourglass size={32} />} title={t('comingSoon')} />
    </>
  )
}

function Splash({ text }: { text: StringKey }) {
  const t = useT()
  return <p className="flex min-h-[100dvh] items-center justify-center text-muted">{t(text)}</p>
}

// HashRouter: works from file:// inside Capacitor and on any static host without rewrites.
export default function App() {
  return (
    <LangProvider>
      <AppProvider loading={<Splash text="loading" />} error={<Splash text="loadError" />}>
        <LockGate>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Today />} />
              <Route path="patients" element={<PatientList />} />
              <Route path="patients/new" element={<PatientNew />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="patients/:id/visit" element={<VisitForm />} />
              <Route path="patients/:id/visit/:visitId/correct" element={<VisitForm />} />
              <Route path="scan/*" element={<Placeholder title="navScan" />} />
              <Route path="guidance/*" element={<Placeholder title="navGuidance" />} />
              <Route path="donors/*" element={<Placeholder title="navDonors" />} />
              <Route path="sync" element={<Placeholder title="navSync" />} />
              <Route path="emergency" element={<Placeholder title="emergency" />} />
            </Route>
          </Routes>
        </HashRouter>
        </LockGate>
      </AppProvider>
    </LangProvider>
  )
}
