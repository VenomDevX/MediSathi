import catalogue from '../../content/lab_catalogue.json'
import type { LabTest } from './domain/labs'

export const labCatalogue = catalogue as unknown as LabTest[]
export const labTest = (id: string | null) => labCatalogue.find((t) => t.id === id)
