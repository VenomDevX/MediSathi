import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './app-context'
import { LangProvider, useT } from './i18n'
import { AppShell } from './ui/AppShell'
import { Today } from './ui/screens/Today'
import { PatientList, PatientNew } from './ui/screens/Patients'
import { PatientDetail, VisitForm } from './ui/screens/PatientDetail'
import { LockGate } from './ui/LockGate'
import { ScanHome } from './ui/screens/Scan'
import { ReportResults, ReportReview } from './ui/screens/Report'
import { GuidanceDetail, GuidanceList } from './ui/screens/Guidance'
import { Emergency } from './ui/screens/Emergency'
import { Donors } from './ui/screens/Donors'
import { Sync } from './ui/screens/Sync'
import type { StringKey } from './strings'

function Splash({ text }: { text: StringKey }) {
  const t = useT()
  return <p className="flex min-h-[100dvh] items-center justify-center text-muted">{t(text)}</p>
}

// HashRouter: works from file:// inside Capacitor and on any static host without rewrites.
export default function App() {
  return (
    <LangProvider>
      <AppProvider loading={<Splash text="loading" />} error={<Splash text="loadError" />}>
        <HashRouter>
        <LockGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Today />} />
              <Route path="patients" element={<PatientList />} />
              <Route path="patients/new" element={<PatientNew />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="patients/:id/visit" element={<VisitForm />} />
              <Route path="patients/:id/visit/:visitId/correct" element={<VisitForm />} />
              <Route path="scan" element={<ScanHome />} />
              <Route path="scan/:id" element={<ReportResults />} />
              <Route path="scan/:id/review" element={<ReportReview />} />
              <Route path="guidance" element={<GuidanceList />} />
              <Route path="guidance/:id" element={<GuidanceDetail />} />
              <Route path="donors" element={<Donors />} />
              <Route path="sync" element={<Sync />} />
              <Route path="emergency" element={<Emergency />} />
            </Route>
          </Routes>
        </LockGate>
        </HashRouter>
      </AppProvider>
    </LangProvider>
  )
}
