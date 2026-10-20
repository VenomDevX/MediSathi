// Bundled demo content (see content/README.md). Bundling keeps it available offline with no fetch.
import manifest from '../../content/manifest.json'
import users from '../../content/users.json'
import patients from '../../content/patients.json'
import guidance from '../../content/guidance.json'
import labCatalogue from '../../content/lab_catalogue.json'
import donors from '../../content/donors.json'
import type { SeedContent } from './database/seed'

export const content = {
  version: manifest.version,
  users,
  patients,
  guidance,
  labCatalogue,
  donors,
} as SeedContent
