export type FlowDataClass =
  | 'public'
  | 'external'
  | 'internal'
  | 'client_confidential'
  | 'synthesis'
  | 'approved_conclusion'

export type FlowEvidenceLevel = 'strong' | 'medium' | 'early' | 'unknown'

export type FlowSourceKind = 'internal' | 'external' | 'master_document' | 'synthesis'

export type FlowStepStatus = 'waiting' | 'active' | 'done' | 'blocked' | 'error'

export interface FlowQuestionInput {
  question: string
  clientContext?: string
  masterDocumentVersion?: string
}

export interface FlowResearchStep {
  id: string
  label: string
  description: string
  status: FlowStepStatus
  detail?: string
}

export interface FlowSource {
  id: string
  title: string
  kind: FlowSourceKind
  classification: FlowDataClass
  evidenceLevel: FlowEvidenceLevel
  excerpt: string
  date?: string
}

export interface FlowGuardrailCheck {
  id: string
  label: string
  status: 'passed' | 'warning' | 'blocked'
  note: string
  sourceIds?: string[]
}

export interface FlowAuditItem {
  label: string
  value: string
}

export interface FlowResearchAnswer {
  id: string
  title: string
  summary: string
  recommendations: string[]
  uncertainties: string[]
  sources: FlowSource[]
  guardrails: FlowGuardrailCheck[]
  auditTrail: FlowAuditItem[]
}

export interface FlowResearchAdapter {
  run(
    input: FlowQuestionInput,
    onStepUpdate: (steps: FlowResearchStep[]) => void,
  ): Promise<FlowResearchAnswer>
}
