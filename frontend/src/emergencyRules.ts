import rules from '../../content/emergency_rules.json'
import type { EmergencyRule } from './domain/emergency'

export const emergencyRules = rules as EmergencyRule[]
