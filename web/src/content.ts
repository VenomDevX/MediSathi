// Bundled reference content (see content/README.md). Bundling keeps it available offline with no fetch.
import manifest from '../../content/manifest.json'
import guidance from '../../content/guidance.json'
import labCatalogue from '../../content/lab_catalogue.json'
import donors from '../../content/donors.json'
import type { SeedContent } from './database/seed'

export const content = { version: manifest.version, guidance, labCatalogue, donors } as SeedContent
export { default as localities } from '../../content/localities.json'
