export type RequestStatus = 'New' | 'Qualifying' | 'Waiting for Customer' | 'Assessment Needed' | 'Assessment Complete' | 'Quote Draft' | 'Quote Sent' | 'Follow-up Due' | 'Accepted' | 'Scheduling' | 'Scheduled' | 'In Progress' | 'Needs Approval' | 'Quality Check' | 'Completed' | 'Unsupported' | 'Declined' | 'Expired' | 'Cancelled'

export type Service = {
  id: string
  name: string
  description: string
  buyers: string
  color: string
  icon: string
  category: string
  featured: boolean
  featuredOrder: number
  sizeUnit: string
  propertyTypes?: string[]
  frequencyOptions?: string[]
}

export type Catalog = {
  services: Service[]
  propertyTypes: string[]
  conditions: string[]
  frequencies: string[]
  addOns: string[]
}

export type Estimate = {
  low: number
  high: number
  breakdown: string[]
  inputs: string[]
}

export type RequestActivity = {
  type: string
  channel: string
  note: string
  fromStatus: string | null
  toStatus: string
  created: string
}

export type Workflow = {
  customer: { id: number, name: string, organization: string, email: string, phone: string, notes: string }
  property: { id: number, label: string, address: string, property_type: string, access_notes: string }
  assessments: Array<{ id: number, type: string, status: string, confidence: string, findings: string, measurements: string, evidence: string[] }>
  quote: { id: number, status: string, current_version: number, versions: Array<{ id: number, version: number, service: string, scope: string, inclusions: string, exclusions: string, assumptions: string, addOns: string[], estimate_low: number | null, estimate_high: number | null, amount: number | null, rate_card_version: string }> }
  conversations: Array<{ id: number, channel: string, direction: string, subject: string, body: string, created: string }>
  followUps: Array<{ id: number, action: string, dueAt: string, status: string, note: string }>
  job: any | null
}

export type Lead = {
  id: string
  customer: string
  organization: string
  email: string
  phone: string
  service: string
  property: string
  size: number | null
  condition: string
  frequency: string
  addOns: string[]
  location: string
  scope: string
  timing: string
  status: RequestStatus
  allowedTransitions: RequestStatus[]
  priority: 'High' | 'Normal'
  value: string
  estimate: Estimate | null
  assessmentType: 'quick' | 'photos' | 'video' | 'walkthrough' | 'formal-survey'
  assessmentStatus: string
  assessmentConfidence: string
  accessNotes: string
  lastCleaned: string
  customerExpectations: string
  nextAction: string
  nextActionDue: string
  nextActionOwner: string
  quoteStatus: string
  quoteNotes: string
  activity: RequestActivity[]
  created: string
  updated: string
}

export type Operator = { id: number; email: string; name: string }

export type AddOnRule = { name: string; valueType: string; price: number }

export type ManagedService = {
  id: string
  name: string
  category: string
  status: 'Draft' | 'Published' | 'Paused' | 'Archived'
  description: string
  buyers: string
  color: string
  icon: string
  featuredOrder: number
  sizeUnit: string
  propertyTypes: string[]
  customerTypes: string[]
  frequencyOptions: string[]
  useCases: string
  includedScope: string
  exclusions: string
  tags: string
  timingPattern: string
  preferredLeadTime: string
  estimatedDuration: string
  repeatPotential: string
  customerNote: string
  featured: boolean
  pricingReadiness: string
  pricingBasis: string
  pricingModel: string
  sizeInputLabel: string
  basePrice: number | null
  estimateSpread: number | null
  unitRate: number | null
  minimumPrice: number | null
  standardMultiplier: number | null
  heavyMultiplier: number | null
  extremeMultiplier: number | null
  oneTimeMultiplier: number | null
  recurringMultiplier: number | null
  rushMultiplier: number | null
  travelFeeType: string
  travelFeeAmount: number | null
  serviceAreaRule: string
  addOnRules: AddOnRule[]
  version: string
  effectiveDate: string | null
  changeReason: string
  updatedAt: string
}

export type RateCard = {
  id: number
  serviceId: string
  serviceName: string
  serviceCategory: string
  name: string
  status: 'Draft' | 'Published' | 'Archived'
  locationName: string
  postalCodes: string[]
  pricingModel: string
  sizeInputLabel: string
  basePrice: number | null
  unitRate: number | null
  minimumPrice: number | null
  estimateSpread: number | null
  standardMultiplier: number | null
  heavyMultiplier: number | null
  extremeMultiplier: number | null
  oneTimeMultiplier: number | null
  recurringMultiplier: number | null
  travelFeeAmount: number | null
  addOnRules: AddOnRule[]
  version: string
  effectiveDate: string | null
  changeReason: string
  updatedAt: string
}

export type QuoteInput = {
  service: string
  property: string
  size: string
  condition: string
  frequency: string
  addOns: string[]
  location: string
}

export type QuoteSubmission = QuoteInput & {
  customer: string
  organization: string
  email: string
  phone: string
  scope: string
  timing: string
}

export type QuoteReceipt = {
  reference: string
  status: RequestStatus
  estimate: Estimate | null
  value: string
}

/** Thrown for any non-2xx response; `errors` carries per-field validation text. */
export class ApiError extends Error {
  status: number
  errors: string[]

  constructor(status: number, message: string, errors: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

// Matches the deployed base path, so the same code works at a domain root
// and under a subpath such as /cleaner/.
const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const errors: string[] = Array.isArray(body?.errors) ? body.errors : []
    throw new ApiError(response.status, body?.error ?? errors[0] ?? 'Request failed.', errors)
  }

  return body as T
}

export const getCatalog = () => request<Catalog>('/catalog')

export const getEstimate = (input: QuoteInput, signal?: AbortSignal) =>
  request<{ estimate: Estimate | null }>('/estimate', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  }).then((result) => result.estimate)

export const submitQuote = (input: QuoteSubmission) =>
  request<QuoteReceipt>('/requests', { method: 'POST', body: JSON.stringify(input) })

export const login = (email: string, password: string) =>
  request<{ operator: Operator }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }).then((result) => result.operator)

export const logout = () => request<void>('/auth/logout', { method: 'POST' })

export const getSession = () =>
  request<{ operator: Operator }>('/auth/me').then((result) => result.operator)

export const getOperatorServices = () =>
  request<{ services: ManagedService[] }>('/ops/services').then((result) => result.services)

export const createOperatorService = (input: { id: string; name: string; description?: string }) =>
  request<{ service: ManagedService }>('/ops/services', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((result) => result.service)

export const saveOperatorService = (id: string, service: Partial<ManagedService>) =>
  request<{ service: ManagedService }>(`/ops/services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(service),
  }).then((result) => result.service)

export const publishOperatorService = (id: string) =>
  request<{ service: ManagedService }>(`/ops/services/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  }).then((result) => result.service)

export const pauseOperatorService = (id: string) =>
  request<{ service: ManagedService }>(`/ops/services/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    body: JSON.stringify({}),
  }).then((result) => result.service)

export const previewOperatorService = (id: string, service: Partial<ManagedService>, input: { size: number; condition: string; frequency: string; addOns: string[]; location: string }) =>
  request<{ estimate: Estimate }>(`/ops/services/${encodeURIComponent(id)}/preview`, {
    method: 'POST',
    body: JSON.stringify({ ...input, ...service }),
  }).then((result) => result.estimate)

export const getOperatorRateCards = () =>
  request<{ rateCards: RateCard[] }>('/ops/rate-cards').then((result) => result.rateCards)

export const createRateCard = (input: { serviceId: string; name?: string }) =>
  request<{ rateCard: RateCard }>('/ops/rate-cards', { method: 'POST', body: JSON.stringify(input) }).then((result) => result.rateCard)

export const duplicateRateCard = (id: number, name?: string) =>
  request<{ rateCard: RateCard }>(`/ops/rate-cards/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) }).then((result) => result.rateCard)

export const saveRateCard = (id: number, card: Partial<RateCard>) =>
  request<{ rateCard: RateCard }>(`/ops/rate-cards/${id}`, { method: 'PATCH', body: JSON.stringify(card) }).then((result) => result.rateCard)

export const previewRateCard = (id: number, input: { size: number; condition: string; frequency: string; addOns: string[]; location: string }) =>
  request<{ estimate: Estimate | null }>(`/ops/rate-cards/${id}/preview`, { method: 'POST', body: JSON.stringify(input) }).then((result) => result.estimate)

export const publishRateCard = (id: number) =>
  request<{ rateCard: RateCard }>(`/ops/rate-cards/${id}/publish`, { method: 'POST', body: JSON.stringify({}) }).then((result) => result.rateCard)

export const archiveRateCard = (id: number) =>
  request<{ rateCard: RateCard }>(`/ops/rate-cards/${id}/archive`, { method: 'POST', body: JSON.stringify({}) }).then((result) => result.rateCard)

export const getRequests = () =>
  request<{ requests: Lead[] }>('/requests').then((result) => result.requests)

export const getWorkflow = (reference: string) =>
  request<{ workflow: Workflow }>(`/requests/${encodeURIComponent(reference)}/workflow`).then((result) => result.workflow)

export const createAssessment = (reference: string, input: Record<string, unknown>) =>
  request<{ assessment: unknown }>(`/requests/${encodeURIComponent(reference)}/assessments`, { method: 'POST', body: JSON.stringify(input) })

export const createQuoteVersion = (reference: string, input: Record<string, unknown>) =>
  request<{ quote: unknown }>(`/requests/${encodeURIComponent(reference)}/quotes`, { method: 'POST', body: JSON.stringify(input) })

export const updateQuoteStatus = (quoteId: number, input: { status: string, decisionNote?: string }) =>
  request<{ quote: unknown }>(`/quotes/${quoteId}`, { method: 'PATCH', body: JSON.stringify(input) })

export const addConversation = (reference: string, input: Record<string, unknown>) =>
  request<{ conversation: unknown }>(`/requests/${encodeURIComponent(reference)}/conversations`, { method: 'POST', body: JSON.stringify(input) })

export const addFollowUp = (reference: string, input: Record<string, unknown>) =>
  request<{ followUp: unknown }>(`/requests/${encodeURIComponent(reference)}/follow-ups`, { method: 'POST', body: JSON.stringify(input) })

export const updateFollowUp = (id: number, status: string) =>
  request<{ followUp: unknown }>(`/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })

export const saveSchedule = (reference: string, input: Record<string, unknown>) =>
  request<{ job: unknown }>(`/requests/${encodeURIComponent(reference)}/schedule`, { method: 'POST', body: JSON.stringify(input) })

export const saveHandoff = (reference: string, input: Record<string, unknown>) =>
  request<{ handoff: unknown }>(`/requests/${encodeURIComponent(reference)}/handoff`, { method: 'POST', body: JSON.stringify(input) })

export const addVariance = (reference: string, input: Record<string, unknown>) =>
  request<{ variance: unknown }>(`/requests/${encodeURIComponent(reference)}/variances`, { method: 'POST', body: JSON.stringify(input) })

export const decideVariance = (id: number, decision: string) =>
  request<{ variance: unknown }>(`/variances/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) })

export const saveQuality = (reference: string, input: Record<string, unknown>) =>
  request<{ quality: unknown }>(`/requests/${encodeURIComponent(reference)}/quality`, { method: 'POST', body: JSON.stringify(input) })

export const completeJob = (reference: string, input: Record<string, unknown>) =>
  request<{ completion: unknown }>(`/requests/${encodeURIComponent(reference)}/complete`, { method: 'POST', body: JSON.stringify(input) })

export const advanceRequest = (reference: string, status?: RequestStatus) =>
  request<{ request: Lead }>(`/requests/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    body: JSON.stringify(status ? { status } : {}),
  }).then((result) => result.request)

export const updateRequest = (reference: string, input: Partial<Lead> & { status?: RequestStatus; activityNote?: string; activityChannel?: string }) =>
  request<{ request: Lead }>(`/requests/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((result) => result.request)
