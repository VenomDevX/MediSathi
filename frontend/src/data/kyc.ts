// Demo DigiLocker identity check. The real flow is DigiLocker's own sign-in and consent, which needs a registered
// partner organisation and internet; here a bundled synthetic answer stands in for it. The result is kept on this device.
// ponytail: device-only and unsynced; move to the patient record once the real DigiLocker flow exists.
import demo from '../../../content/demo_digilocker.json'
import type { Kyc } from '../domain/identity'
import type { Database } from '../database/types'

export const lookupKyc = (abha: string) => (demo.records as Kyc[]).find((r) => r.abha === abha)

const key = (personId: string) => `kyc_verified:${personId}`

/** When this person's current ABHA number was verified, or null (never, or the number has changed since). */
export async function verifiedAt(db: Database, personId: string, abha: string): Promise<string | null> {
  const [row] = await db.query<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key(personId)])
  const v = row && (JSON.parse(row.value) as { abha: string; at: string })
  return v && v.abha === abha ? v.at : null
}

export async function markVerified(db: Database, personId: string, abha: string, at: string): Promise<void> {
  await db.batch([{ sql: 'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', bind: [key(personId), JSON.stringify({ abha, at })] }])
}
