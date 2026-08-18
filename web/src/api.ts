export type RequestStatus = 'New' | 'Under Review' | 'Quote Sent' | 'Confirmed' | 'Completed'

export type Service = {
  id: string
  name: string
  description: string
  buyers: string
  color: string
  sizeUnit: string
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
  priority: 'High' | 'Normal'
  value: string
  estimate: Estimate | null
  created: string
  updated: string
}

export type Operator = { id: number; email: string; name: string }

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

export const getRequests = () =>
  request<{ requests: Lead[] }>('/requests').then((result) => result.requests)

export const advanceRequest = (reference: string, status?: RequestStatus) =>
  request<{ request: Lead }>(`/requests/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    body: JSON.stringify(status ? { status } : {}),
  }).then((result) => result.request)
