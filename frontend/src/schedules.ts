import schedule from '../../content/immunization_schedule.json'
import type { ScheduleItem } from './domain/schedule'

export const CHILD = schedule.child as ScheduleItem[]
export const PREGNANCY = schedule.pregnancy as ScheduleItem[]
