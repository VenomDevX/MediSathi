import type { Statement } from '../database/types'

export type EntityType = 'patient' | 'patient_visit' | 'medical_report' | 'audit_event'

/** The queue row that must be written in the same batch as the entity change (TRD §8.1). */
export function syncOp(entity_type: EntityType, entity_id: string, operation: 'create' | 'update', payload: object, base_version: number | null = null): Statement {
  return {
    sql: `INSERT INTO sync_operations (operation_id, entity_type, entity_id, operation_type, payload_json, base_version)
          VALUES (?, ?, ?, ?, ?, ?)`,
    bind: [crypto.randomUUID(), entity_type, entity_id, operation, JSON.stringify(payload), base_version],
  }
}
