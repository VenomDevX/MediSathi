import catalogue from '../../content/medicines.json'
import type { Medicine } from './domain/medicine'

export const medicines = catalogue as Medicine[]
