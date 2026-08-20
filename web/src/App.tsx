import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  advanceRequest,
  addConversation,
  addFollowUp,
  addVariance,
  completeJob,
  createAssessment,
  createQuoteVersion,
  decideVariance,
  ApiError,
  createServiceOffering,
  createRateCard,
  duplicateRateCard,
  getCatalog,
  getEstimate,
  getRequests,
  getWorkflow,
  getOperatorServices,
  getOperatorRateCards,
  getSession,
  login,
  logout,
  pauseOperatorService,
  archiveRateCard,
  publishOperatorService,
  previewOperatorService,
  previewRateCard,
  publishRateCard,
  saveOperatorService,
  saveRateCard,
  saveHandoff,
  saveQuality,
  saveSchedule,
  submitQuote,
  updateFollowUp,
  updateQuoteStatus,
  updateRequest,
  type Catalog,
  type Estimate,
  type Lead,
  type ManagedService,
  type RateCard,
  type Operator,
  type QuoteInput,
  type QuoteReceipt,
  type RequestStatus,
  type Workflow,
  type Service,
} from './api'

type RateCardForm = {
  name: string
  locationName: string
  postalCodes: string
  pricingModel: string
  sizeInputLabel: string
  basePrice: string
  unitRate: string
  minimumPrice: string
  estimateSpread: string
  standardMultiplier: string
  heavyMultiplier: string
  extremeMultiplier: string
  recurringMultiplier: string
}

const emptyRateCardForm = (name = ''): RateCardForm => ({
  name,
  locationName: 'Default service area',
  postalCodes: '',
  pricingModel: 'Custom quote',
  sizeInputLabel: 'Units or project scope',
  basePrice: '',
  unitRate: '',
  minimumPrice: '',
  estimateSpread: '0',
  standardMultiplier: '1',
  heavyMultiplier: '1',
  extremeMultiplier: '1',
  recurringMultiplier: '1',
})

const rateCardFormPayload = (form: RateCardForm) => ({
  name: form.name.trim(),
  locationName: form.locationName.trim() || 'Default service area',
  postalCodes: form.postalCodes.split(',').map((item) => item.trim()).filter(Boolean),
  pricingModel: form.pricingModel,
  sizeInputLabel: form.sizeInputLabel.trim() || 'Units or project scope',
  basePrice: form.basePrice === '' ? null : Number(form.basePrice),
  unitRate: form.unitRate === '' ? null : Number(form.unitRate),
  minimumPrice: form.minimumPrice === '' ? null : Number(form.minimumPrice),
  estimateSpread: form.estimateSpread === '' ? 0 : Number(form.estimateSpread),
  standardMultiplier: form.standardMultiplier === '' ? 1 : Number(form.standardMultiplier),
  heavyMultiplier: form.heavyMultiplier === '' ? 1 : Number(form.heavyMultiplier),
  extremeMultiplier: form.extremeMultiplier === '' ? 1 : Number(form.extremeMultiplier),
  recurringMultiplier: form.recurringMultiplier === '' ? 1 : Number(form.recurringMultiplier),
  addOnRules: [],
})

type View = 'home' | 'services' | 'request' | 'operations'

const formatCurrency = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"; render it in the viewer's zone. */
function formatTimestamp(value: string) {
  const parsed = new Date(value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(parsed.getTime())) return value

  const now = new Date()
  const sameDay = parsed.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today, ${parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (parsed.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isPastDue(value: string) {
  if (!value) return false
  const due = new Date(`${value}T23:59:59`)
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now()
}

function missingInformationFor(lead: Lead) {
  return [
    !lead.location && 'location',
    !lead.scope && 'scope',
    !lead.accessNotes && 'access',
    !lead.customerExpectations && 'success criteria',
  ].filter(Boolean) as string[]
}

function dueSortValue(lead: Lead) {
  if (!lead.nextActionDue) return Number.POSITIVE_INFINITY
  const due = new Date(`${lead.nextActionDue}T23:59:59`).getTime()
  return Number.isNaN(due) ? Number.POSITIVE_INFINITY : due
}

function App() {
  const [view, setView] = useState<View>('home')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestedService, setRequestedService] = useState('')
  const [operator, setOperator] = useState<Operator | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const scrollPositions = useRef<Partial<Record<View, number>>>({})

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((error: ApiError) => setCatalogError(error.message))
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions.current[view] ?? 0)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  useEffect(() => {
    const closeProfile = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    window.addEventListener('keydown', closeProfile)
    return () => window.removeEventListener('keydown', closeProfile)
  }, [])

  const navigate = (nextView: View) => {
    scrollPositions.current[view] = window.scrollY
    setProfileOpen(false)
    setView(nextView)
  }

  const signOutOperator = async () => {
    await logout().catch(() => undefined)
    setOperator(null)
    setProfileOpen(false)
    setNotice('Signed out of the operator workspace.')
  }

  const openRequest = (service?: string) => {
    setNotice('')
    setRequestedService(service || '')
    navigate('request')
  }

  return (
    <div className="app-shell">
      <header className={`topbar ${view === 'operations' ? 'workspace-topbar' : ''}`}>
        <div className="topbar-inner page-width">
          <button className="brand" onClick={() => navigate('home')} aria-label="Return to home">
            <span className="brand-mark">fh</span>
            <span><strong>fieldhouse</strong><small>cleaning platform</small></span>
          </button>
          {view === 'operations' ? <div className="profile-menu">
            <button className="profile-trigger" aria-label="Open operator profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
              <span className="profile-avatar" aria-hidden="true">{operator ? operator.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() : 'OP'}</span>
              <span className="profile-chevron" aria-hidden="true">⌄</span>
            </button>
            {profileOpen && <div className="profile-dropdown" role="menu">
              <strong>{operator?.name || 'Operator'}</strong>
              <small>{operator?.email || 'Loading profile...'}</small>
              <button role="menuitem" onClick={signOutOperator}>Sign out</button>
            </div>}
          </div> : <>
            <nav className="public-nav" aria-label="Public navigation">
              <button className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
              <button className={view === 'services' ? 'active' : ''} onClick={() => navigate('services')}>Services</button>
            </nav>
            <div className="topbar-actions">
              <button className="text-button" onClick={() => navigate('operations')}>Operator workspace</button>
              <button className="button button-dark compact" onClick={() => openRequest()}>Request a quote <span>↗</span></button>
            </div>
          </>}
        </div>
      </header>

      {notice && (
        <div className="notice" role="status">
          <span>✓</span>{notice}
          <button onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}

      {catalogError && (
        <div className="notice notice-error" role="alert">
          <span>!</span>{catalogError}
        </div>
      )}

      {view === 'home' && <Home services={catalog?.services ?? []} onRequest={openRequest} onServices={() => navigate('services')} />}
      {view === 'services' && <Services services={catalog?.services ?? []} onRequest={openRequest} />}
      {view === 'request' && <QuoteRequest catalog={catalog} onBack={() => navigate('home')} initialService={requestedService} />}
      {view === 'operations' && <Operations operator={operator} setOperator={setOperator} onNotice={setNotice} />}

      <footer className="footer">
        <span>Local cleaning, clearly scoped.</span>
        <span>Minneapolis · Twin Cities metro</span>
        <span>Payments handled offline</span>
      </footer>
    </div>
  )
}

function Home({ services, onRequest, onServices }: { services: Service[], onRequest: () => void, onServices: () => void }) {
  const featuredServices = services.filter((service) => service.featured).sort((a, b) => a.featuredOrder - b.featuredOrder).slice(0, 3)
  return <main>
    <section className="hero page-width">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />CLEANING, DONE PROPERLY</div>
        <h1>Make space for what comes next.</h1>
        <p className="hero-intro">Dependable cleaning for the properties, projects, and businesses that keep the Twin Cities moving.</p>
        <div className="hero-actions"><button className="button button-dark" onClick={onRequest}>Request a quote <span>↗</span></button><button className="button button-quiet" onClick={onServices}>Explore services <span>↗</span></button></div>
      </div>
      <div className="hero-art" aria-label="Abstract illustration of a clean room">
        <div className="art-sun" /><div className="art-window"><i /><i /><i /><i /></div><div className="art-floor" /><div className="art-plant"><b /><em /><em /><em /></div><div className="art-chair" /><span className="art-label">TWIN CITIES<br />SERVICE AREA</span>
      </div>
    </section>
    <section className="proof-strip"><div className="page-width proof-grid"><div><strong>01</strong><span>Know what happens next.<br />Clear scope, clear quote.</span></div><div><strong>02</strong><span>Keep your property moving.<br />Reliable repeat service.</span></div><div><strong>03</strong><span>Get responsive local support.<br />One operator, start to finish.</span></div><div className="proof-cta"><span>Tell us what needs doing.<br />We will take it from there.</span><button onClick={onRequest}>Start with a quote <span>↗</span></button></div></div></section>
    <section className="section page-width">
      <div className="section-heading"><div><div className="eyebrow">FEATURED SERVICES</div><h2>A clean start for<br /><i>different kinds</i> of work.</h2></div><p>From turnovers to active facilities, choose the service that fits the property, project, or operating need. We will review the scope before confirming the work.</p></div>
      <div className="service-grid">{featuredServices.map((service, index) => <ServiceCard key={service.id} service={service} index={index} onRequest={onRequest} />)}</div>
      <button className="services-link" onClick={onServices}>See all services <span>↗</span></button>
    </section>
    <section className="process-section"><div className="page-width process"><div><div className="eyebrow">HOW IT WORKS</div><h2>From request<br />to <i>ready.</i></h2></div><div className="process-steps"><div><span>01</span><h3>Tell us about the space</h3><p>Share the property, service, and timing. A few useful details help us understand the job.</p></div><div><span>02</span><h3>We review the scope</h3><p>An operator reviews your request and follows up with a clear quote or a clarifying question.</p></div><div><span>03</span><h3>We get to work</h3><p>Once the scope works for everyone, we confirm the time and get to work.</p></div></div></div></section>
    <section className="closing-cta page-width"><div className="closing-cta-heading"><div className="eyebrow">READY WHEN YOU ARE</div><h2>Let's talk about<br /><i>your space.</i></h2></div><div className="closing-cta-copy"><p>Not sure where to start? Tell us what you need, and we will help shape the right scope before confirming the work.</p><button className="button button-light" onClick={onRequest}>Request a quote <span>↗</span></button></div></section>
  </main>
}

function Services({ services, onRequest }: { services: Service[], onRequest: (service?: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = useMemo(
    () => ['All', ...new Set(services.map((service) => service.category).filter(Boolean))],
    [services],
  )
  const visibleServices = services.filter((service) => {
    const matchesCategory = category === 'All' || service.category === category
    const searchText = `${service.name} ${service.description} ${service.buyers}`.toLowerCase()
    return matchesCategory && searchText.includes(query.toLowerCase().trim())
  })
  return <main className="page-width inner-page">
    <div className="eyebrow">SERVICE CATALOG</div>
    <div className="inner-title"><h1>Services for<br /><i>the work ahead.</i></h1><p>Practical cleaning services for the properties, facilities, projects, and operating teams that keep work moving.</p></div>
    <div className="catalog-tools"><label>Search services<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by service or need" /></label><label>Filter by work type<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <div className="service-list">{visibleServices.map((service, index) => <ServiceCard key={service.id} service={service} index={index} onRequest={onRequest} large />)}{visibleServices.length === 0 && <p className="empty-catalog">No services match those filters. Try a broader search.</p>}</div>
  </main>
}

function ServiceCard({ service, index, onRequest, large = false }: { service: Service, index: number, onRequest: (service?: string) => void, large?: boolean }) {
  return <article className={`service-card ${service.color} ${large ? 'large' : ''}`}>
    <div className="service-number">{String(index + 1).padStart(2, '0')}</div>
    <div className="service-card-main">
      <div><h3>{service.name}</h3><p>{service.description}</p></div>
      <div className="service-bottom"><span>Best for: <strong>{service.buyers}</strong></span><button onClick={() => onRequest(service.id)}>Request for Service <span>↗</span></button></div>
    </div>
    <div className="service-icon">{service.icon}</div>
  </article>
}

const emptyQuote: QuoteInput = {
  serviceId: '',
  service: '',
  property: '',
  size: '',
  condition: 'Standard',
  frequency: 'One-time',
  addOns: [],
  location: '',
}

function QuoteRequest({ catalog, onBack, initialService }: { catalog: Catalog | null, onBack: () => void, initialService?: string }) {
  const [input, setInput] = useState<QuoteInput>(emptyQuote)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<QuoteReceipt | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const selected = catalog?.services.find((service) => service.id === initialService || service.name === initialService)
    if (!selected) return
    setInput((current) => current.service ? current : { ...current, serviceId: selected.id, service: selected.name })
  }, [catalog, initialService])

  const selectedService = catalog?.services.find((service) => service.id === input.serviceId || service.name === input.service)
  const sizeUnit = selectedService?.sizeUnit ?? 'rooms, units, or sq ft'

  // The server owns pricing, so the live preview is a debounced call rather
  // than a second copy of the formula in the bundle.
  useEffect(() => {
    if (!input.service || !input.size) {
      setEstimate(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getEstimate(input, controller.signal)
        .then(setEstimate)
        .catch(() => { /* preview is best-effort; submission revalidates */ })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [input])

  const update = <K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }))

  const toggleAddOn = (name: string, checked: boolean) =>
    setInput((current) => ({
      ...current,
      addOns: checked ? [...current.addOns, name] : current.addOns.filter((item) => item !== name),
    }))

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSubmitting(true)
    setErrors([])
    try {
      const result = await submitQuote({
        ...input,
        customer: String(data.get('customer') || ''),
        organization: String(data.get('organization') || ''),
        email: String(data.get('email') || ''),
        phone: String(data.get('phone') || ''),
        scope: String(data.get('scope') || ''),
        timing: String(data.get('timing') || ''),
      })
      setReceipt(result)
      setInput(emptyQuote)
      setEstimate(null)
      form.reset()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      const apiError = error as ApiError
      setErrors(apiError.errors.length ? apiError.errors : [apiError.message])
    } finally {
      setSubmitting(false)
    }
  }

  if (receipt) {
    return <main className="page-width quote-page">
      <div className="quote-receipt">
        <div className="eyebrow">REQUEST RECEIVED</div>
        <h1>Thank you.<br /><i>We have it.</i></h1>
        <p>Your request is logged as <strong>{receipt.reference}</strong>. An operator will review the scope and follow up by email with a quote or a clarifying question.</p>
        {receipt.estimate && (
          <div className="estimate-card">
            <div>
              <span className="estimate-label">ILLUSTRATIVE ESTIMATE</span>
              <strong>{formatCurrency(receipt.estimate.low)} - {formatCurrency(receipt.estimate.high)}</strong>
              <small>Non-binding range. Your final quote is confirmed by an operator.</small>
            </div>
            <div className="estimate-breakdown">{receipt.estimate.breakdown.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
          </div>
        )}
        <div className="hero-actions">
          <button className="button button-dark" onClick={onBack}>Back to website <span>↗</span></button>
          <button className="button button-quiet" onClick={() => setReceipt(null)}>Send another request</button>
        </div>
      </div>
    </main>
  }

  return <main className="page-width quote-page">
    <button className="back-link" onClick={onBack}>← Back to website</button>
    <div className="quote-layout">
      <div className="quote-intro">
        <div className="eyebrow">START WITH THE DETAILS</div>
        <h1>Request a<br /><i>quote.</i></h1>
        <p>Tell us enough to understand the space. An operator will review your request and follow up with a quote or a quick question.</p>
        <div className="quote-aside"><span>Good to know</span><p>Preferred dates are requests, not confirmed bookings. We will confirm availability with you.</p></div>
      </div>

      <form className="quote-form" ref={formRef} onSubmit={onSubmit}>
        <div className="form-section">
          <span className="form-step">01 / 05</span>
          <h2>What needs cleaning?</h2>
          <label>Service
            <select name="service" required value={input.serviceId} onChange={(event) => { const service = catalog?.services.find((item) => item.id === event.target.value); setInput((current) => ({ ...current, serviceId: event.target.value, service: service?.name || '' })) }}>
              <option value="" disabled>Select a working service</option>
              {catalog?.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label>Property type
            <select name="property" required value={input.property} onChange={(event) => update('property', event.target.value)}>
              <option value="" disabled>Choose a property type</option>
              {catalog?.propertyTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <div className="two-col">
            <label>Approx. {sizeUnit}
              <input name="size" type="number" min="1" required placeholder="e.g. 6" value={input.size} onChange={(event) => update('size', event.target.value)} />
            </label>
            <label>Condition
              <select name="condition" value={input.condition} onChange={(event) => update('condition', event.target.value)}>
                {catalog?.conditions.map((condition) => <option key={condition}>{condition}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="form-section">
          <span className="form-step">02 / 05</span>
          <h2>Where is the work?</h2>
          <label>Address or neighborhood
            <input name="location" required placeholder="e.g. North Loop, Minneapolis 55401" value={input.location} onChange={(event) => update('location', event.target.value)} />
          </label>
          <label>What should we know?
            <textarea name="scope" placeholder="Surfaces, access notes, special requirements..." rows={3} />
          </label>
        </div>

        <div className="form-section">
          <span className="form-step">03 / 05</span>
          <h2>Shape the estimate</h2>
          <label>Service frequency
            <select name="frequency" value={input.frequency} onChange={(event) => update('frequency', event.target.value)}>
              {catalog?.frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}
            </select>
          </label>
          <fieldset className="add-on-group">
            <legend>Add-on work</legend>
            {catalog?.addOns.map((addOn) => (
              <label key={addOn} className="checkbox-row">
                <input type="checkbox" checked={input.addOns.includes(addOn)} onChange={(event) => toggleAddOn(addOn, event.target.checked)} />
                <span>{addOn}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="estimate-card" aria-live="polite">
          {estimate ? <>
            <div>
              <span className="estimate-label">ILLUSTRATIVE ESTIMATE</span>
              <strong>{formatCurrency(estimate.low)} - {formatCurrency(estimate.high)}</strong>
              <small>Non-binding range based on the details provided.</small>
            </div>
            <div className="estimate-breakdown">{estimate.breakdown.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
          </> : <>
            <span className="estimate-label">YOUR ESTIMATE WILL APPEAR HERE</span>
            <p>Choose a service and enter an approximate size to see an illustrative range.</p>
          </>}
        </div>

        <div className="form-section contact-section">
          <span className="form-step">04 / 05</span>
          <h2>When would help?</h2>
          <label>Preferred timing<input name="timing" placeholder="e.g. August 22-24, flexible" /></label>
        </div>

        <div className="form-section">
          <span className="form-step">05 / 05</span>
          <h2>How can we reach you?</h2>
          <div className="two-col">
            <label>Name<input name="customer" required placeholder="Your name" /></label>
            <label>Organization<input name="organization" placeholder="Company or property name" /></label>
          </div>
          <div className="two-col">
            <label>Email<input name="email" type="email" required placeholder="you@example.com" /></label>
            <label>Phone<input name="phone" placeholder="(612) 555-0148" /></label>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="form-errors" role="alert">
            {errors.map((error) => <p key={error}>{error}</p>)}
          </div>
        )}

        <button className="button button-dark submit-button" type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send request'} <span>↗</span>
        </button>
      </form>
    </div>
  </main>
}

const MVP_STATUSES = new Set<RequestStatus>([
  'New',
  'Qualifying',
  'Waiting for Customer',
  'Assessment Needed',
  'Assessment Complete',
  'Quote Draft',
  'Quote Sent',
  'Follow-up Due',
  'Accepted',
])

const FILTERS = {
  All: () => true,
  'Needs review': (lead: Lead) => lead.status === 'New',
  'Needs information': (lead: Lead) => ['Qualifying', 'Waiting for Customer'].includes(lead.status),
  Assessment: (lead: Lead) => lead.status === 'Assessment Needed',
  'Ready to quote': (lead: Lead) => ['Assessment Complete', 'Quote Draft'].includes(lead.status),
  'Acceptance due': (lead: Lead) => ['Quote Sent', 'Follow-up Due'].includes(lead.status),
  Accepted: (lead: Lead) => lead.status === 'Accepted',
} satisfies Record<string, (lead: Lead) => boolean>

type FilterKey = keyof typeof FILTERS

const NEXT_LABEL: Partial<Record<RequestStatus, string>> = {
  New: 'Review request',
  Qualifying: 'Choose assessment path',
  'Waiting for Customer': 'Review customer response',
  'Assessment Needed': 'Complete assessment',
  'Assessment Complete': 'Prepare quote',
  'Quote Draft': 'Send quote',
  'Quote Sent': 'Follow up with customer',
  'Follow-up Due': 'Record customer decision',
  Accepted: 'Acceptance recorded',
}

function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function SidebarNavButton({ icon, label, selected, onClick }: { icon: string, label: string, selected: boolean, onClick: () => void }) {
  return <button className={selected ? 'selected' : ''} aria-current={selected ? 'page' : undefined} aria-label={label} title={label} onClick={onClick}>
    <span className="sidebar-icon" aria-hidden="true">{icon}</span>
    <span className="sidebar-label">{label}</span>
  </button>
}

function Operations({ operator, setOperator, onNotice }: { operator: Operator | null, setOperator: Dispatch<SetStateAction<Operator | null>>, onNotice: (message: string) => void }) {
  const [checking, setChecking] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('All')
  const [requestQuery, setRequestQuery] = useState('')
  const [requestSort, setRequestSort] = useState<{ key: 'id' | 'customer' | 'service' | 'condition' | 'status' | 'next', direction: 'asc' | 'desc' }>({ key: 'next', direction: 'asc' })
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [section, setSection] = useState<'overview' | 'requests' | 'services' | 'rates'>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setLeads(await getRequests())
      setError('')
      setLastRefreshed(new Date())
    } catch (caught) {
      const apiError = caught as ApiError
      if (apiError.status === 401) setOperator(null)
      else setError(apiError.message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    getSession()
      .then((session) => { setOperator(session); return load() })
      .catch(() => setOperator(null))
      .finally(() => setChecking(false))
  }, [load])

  useEffect(() => {
    if (!operator) return

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const interval = window.setInterval(refreshWhenVisible, 60_000)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [operator, load])

  const onSignedIn = async (session: Operator) => {
    setOperator(session)
    await load()
  }

  const counts = useMemo(() => ({
    review: leads.filter(FILTERS['Needs review']).length,
    information: leads.filter(FILTERS['Needs information']).length,
    assessment: leads.filter(FILTERS.Assessment).length,
    acceptance: leads.filter(FILTERS['Acceptance due']).length,
  }), [leads])

  const analytics = useMemo(() => {
    const now = Date.now()
    const start = now - 30 * 24 * 60 * 60 * 1000
    const weekly = Array.from({ length: 5 }, (_, index) => ({ label: index === 4 ? 'Now' : `W${index + 1}`, count: 0 }))
    let progressed = 0
    let accepted = 0
    leads.forEach((lead) => {
      const created = new Date(lead.created).getTime()
      if (created >= start) weekly[Math.min(4, Math.floor((created - start) / (7 * 24 * 60 * 60 * 1000)))].count += 1
      lead.activity.forEach((event) => {
        const eventTime = new Date(event.created).getTime()
        if (eventTime >= start && event.type === 'status' && event.fromStatus) progressed += 1
        if (eventTime >= start && event.type === 'status' && event.toStatus === 'Accepted') accepted += 1
      })
    })
    const pipeline = Object.entries(FILTERS).slice(0, 6).map(([label, matcher]) => ({ label, count: leads.filter(matcher).length }))
    return { weekly, progressed, accepted, pipeline }
  }, [leads])

  const visible = useMemo(() => [...leads]
    .filter((lead) => MVP_STATUSES.has(lead.status))
    .filter(FILTERS[filter])
    .filter((lead) => `${lead.id} ${lead.customer} ${lead.organization} ${lead.service} ${lead.property} ${lead.location} ${lead.nextAction} ${lead.nextActionOwner}`.toLowerCase().includes(requestQuery.toLowerCase().trim()))
    .sort((left, right) => {
      const direction = requestSort.direction === 'asc' ? 1 : -1
      if (requestSort.key === 'next') return direction * (dueSortValue(left) - dueSortValue(right) || right.updated.localeCompare(left.updated))
      const values: Record<'id' | 'customer' | 'service' | 'condition' | 'status' | 'next', [string, string]> = {
        id: [left.id, right.id], customer: [left.customer, right.customer], service: [left.service, right.service], condition: [left.condition, right.condition], status: [left.status, right.status], next: ['', ''],
      }
      return direction * values[requestSort.key][0].localeCompare(values[requestSort.key][1])
    }), [leads, filter, requestQuery, requestSort])
  const sortRequests = (key: typeof requestSort.key) => setRequestSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  const selectedLead = leads.find((lead) => lead.id === selectedId && MVP_STATUSES.has(lead.status)) ?? null

  const onAdvance = async (lead: Lead) => {
    if (lead.status === 'Accepted') {
      onNotice('Quote accepted. Scheduling is outside this MVP workspace.')
      return
    }
    try {
      const updated = await advanceRequest(lead.id)
      setLeads((current) => current.map((item) => item.id === updated.id ? updated : item))
      onNotice(`Request ${updated.id} moved to ${updated.status}.`)
    } catch (caught) {
      setError((caught as ApiError).message)
    }
  }

  const onUpdate = async (lead: Lead, input: Partial<Lead>) => {
    try {
      const updated = await updateRequest(lead.id, input)
      setLeads((current) => current.map((item) => item.id === updated.id ? updated : item))
      onNotice(`${updated.id} updated.`)
    } catch (caught) {
      setError((caught as ApiError).message)
    }
  }

  if (checking) return <main className="ops-page page-width"><p className="loading-note">Checking your session...</p></main>
  if (!operator) return <OperatorLogin onSignedIn={onSignedIn} />

  return <main className="ops-page">
    <div className={`ops-layout page-width ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`ops-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="Operator workspace navigation">
        <button className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand workspace navigation' : 'Collapse workspace navigation'} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
          <span aria-hidden="true">{sidebarCollapsed ? '»' : '«'}</span>
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
        <nav>
          <SidebarNavButton icon="◈" label="Overview" selected={section === 'overview'} onClick={() => setSection('overview')} />
          <SidebarNavButton icon="▤" label="Requests" selected={section === 'requests'} onClick={() => setSection('requests')} />
          <SidebarNavButton icon="⌂" label="Services" selected={section === 'services'} onClick={() => setSection('services')} />
          <SidebarNavButton icon="▥" label="Rate Cards" selected={section === 'rates'} onClick={() => setSection('rates')} />
        </nav>
      </aside>

      <div className="ops-main">
        {section === 'overview' && <div className="ops-header">
          <div>
            <div className="eyebrow">OPERATOR WORKSPACE <span className="live-dot" /> {operator.name.toUpperCase()}</div>
            <h1>{timeGreeting()}, {operator.name.split(/\s+/)[0]}.</h1>
            <p>Here is what needs your attention before a quote is accepted.</p>
            <div className="overview-refresh">
              <small className="refresh-status" role="status">{refreshing ? 'Updating requests...' : lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Requests are updating automatically'}</small>
              <button className="refresh-button" aria-label="Refresh requests" onClick={() => void load()} disabled={refreshing}>↻ <span>Refresh</span></button>
            </div>
          </div>
        </div>}

        {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
        <div className="sr-only" aria-live="polite">{selectedLead ? `${selectedLead.id}, ${selectedLead.customer}, ${selectedLead.status}. ${selectedLead.nextAction}` : 'No request selected.'}</div>

        {section === 'overview' && <>
           <div className="metric-grid">
            <Metric label="Needs review" value={counts.review} detail="Start with the oldest request" tone="clay" onClick={() => { setFilter('Needs review'); setSection('requests') }} />
            <Metric label="Missing information" value={counts.information} detail="Clarify before pricing" tone="gold" onClick={() => { setFilter('Needs information'); setSection('requests') }} />
            <Metric label="Assessment work" value={counts.assessment} detail="Choose or complete an assessment" tone="sage" onClick={() => { setFilter('Assessment'); setSection('requests') }} />
             <Metric label="Acceptance due" value={counts.acceptance} detail="Record the customer decision" tone="ink" onClick={() => { setFilter('Acceptance due'); setSection('requests') }} />
           </div>
           <RequestAnalytics data={analytics} />
           <section className="overview-panel">
            <div><div className="eyebrow">QUICK ACTIONS</div><h2>Keep the pipeline moving.</h2><p>Jump to the work area that needs your attention.</p></div>
            <div className="overview-actions">
              <button className="button button-dark" onClick={() => setSection('requests')}>Review requests <span>↗</span></button>
              <button className="button button-quiet" onClick={() => setSection('services')}>Manage services <span>↗</span></button>
              <button className="button button-quiet" onClick={() => setSection('rates')}>Manage rate cards <span>↗</span></button>
            </div>
          </section>
        </>}

        {section === 'services'
          ? <ServiceManagement onNotice={onNotice} onUnauthorized={() => setOperator(null)} />
          : section === 'rates'
            ? <RateCardManagement onNotice={onNotice} onUnauthorized={() => setOperator(null)} />
            : section === 'requests' ? <div className="ops-content request-content">
      {selectedLead ? <div className="detail-panel request-detail-page">
        <button className="back-link request-back" onClick={() => setSelectedId(null)}>← Return to requests</button>
        <LeadDetail lead={selectedLead} onAdvance={onAdvance} onUpdate={onUpdate} onNotice={onNotice} />
      </div> : <>
        <div className="ops-header request-page-header">
          <div><div className="eyebrow">INBOUND PIPELINE</div><h1>Requests</h1><p>Move each request toward a clear customer decision.</p></div>
        </div>
        <section className="request-panel">
        <div className="request-tabs" role="tablist" aria-label="Filter requests">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <button key={key} className={filter === key ? 'selected' : ''} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>
              {key} <span>{leads.filter(FILTERS[key]).length}</span>
            </button>
           ))}
         </div>
            <div className="request-table">
             <div className="request-column-headings" role="row">
               <span role="columnheader" title="Stable identifier for this request"><SortHeader label="Request ID" column="id" current={requestSort} onSort={(key) => sortRequests(key as typeof requestSort.key)} /></span>
               <span role="columnheader" title="Customer who submitted the request"><SortHeader label="Customer" column="customer" current={requestSort} onSort={(key) => sortRequests(key as typeof requestSort.key)} /></span>
               <span role="columnheader" title="Requested cleaning service"><SortHeader label="Service" column="service" current={requestSort} onSort={(key) => sortRequests(key as typeof requestSort.key)} /></span>
               <span role="columnheader" title="Customer-provided property condition used for scoping"><SortHeader label="Condition" column="condition" current={requestSort} onSort={(key) => sortRequests(key as typeof requestSort.key)} /></span>
               <span role="columnheader" title="Current workflow status"><SortHeader label="Status" column="status" current={requestSort} onSort={(key) => sortRequests(key as typeof requestSort.key)} /></span>
               <span role="columnheader" title="Recommended next operator action"><SortHeader label="Next action" column="next" current={requestSort} onSort={(key) => sortRequests(key as typeof requestSort.key)} /></span>
             </div>
             <div className="request-tools"><label className="workspace-search">Search requests<input value={requestQuery} onChange={(event) => setRequestQuery(event.target.value)} placeholder="Search ID, customer, service..." /></label></div>
            {visible.length === 0 && <p className="loading-note">{requestQuery ? 'No requests match this search.' : 'No requests in this view yet.'}</p>}
            {visible.map((lead) => (
             <button className={`request-row ${selectedId === lead.id ? 'row-selected' : ''}`} aria-pressed={selectedId === lead.id} aria-label={`${lead.id}, ${lead.customer}, ${lead.nextAction}${lead.nextActionDue ? ` due ${lead.nextActionDue}` : ''}`} key={lead.id} onClick={() => setSelectedId(lead.id)}>
                <span className="request-id-cell">{lead.id}</span>
                <span className="request-customer-cell">{lead.customer}</span>
                <span className="request-service-cell">{lead.service}</span>
                <span className="request-condition-cell">{lead.condition}</span>
                <span className="request-status-cell"><Status status={lead.status} /></span>
                <span className="request-action"><strong className={isPastDue(lead.nextActionDue) ? 'past-due' : ''}>{lead.nextAction} <span aria-hidden="true">→</span></strong>{lead.nextActionDue && <small>{lead.nextActionDue}</small>}</span>
             </button>
            ))}
         </div>
       </section>
      </>}
            </div> : null}
      </div>
    </div>
  </main>
}

function LinkedRateCards({ service, selectedId, onSelect, onChanged }: { service: ManagedService, selectedId: number | null, onSelect: (id: number | null) => void, onChanged: (card: RateCard) => void }) {
  const cards = service.rateCards || []
  const selected = cards.find((card) => card.id === selectedId) || null
  const [draft, setDraft] = useState<RateCard | null>(selected)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setDraft(selected) }, [selectedId, service.rateCards])

  const create = async () => {
    setBusy(true)
    try {
      const card = await createRateCard({ serviceId: service.id, name: `${service.name} default rate` })
      onChanged(card)
      onSelect(card.id)
      setError('')
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const card = await saveRateCard(draft.id, draft)
      onChanged(card)
      setError('')
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const publish = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const card = await publishRateCard(draft.id)
      onChanged(card)
      setError('')
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const setField = <K extends keyof RateCard>(key: K, value: RateCard[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const setNumber = (key: keyof RateCard, value: string) => setField(key, value === '' ? null : Number(value) as never)

  return <div className="editor-section linked-rate-cards">
    <div className="linked-rate-card-heading"><div><div className="eyebrow">CONNECTED PRICING</div><h3>Rate cards for this service</h3><p className="field-help">Choose the pricing rule that applies to an area. Customer cards use the published rate card selected by location and inputs.</p></div><button className="button button-quiet" type="button" onClick={create} disabled={busy}>Add rate card <span>+</span></button></div>
    {!cards.length && <p className="loading-note">No rate cards are attached. Add one before publishing this service.</p>}
    {cards.length > 0 && <label className="rate-card-selector">Rate card<select value={selectedId ?? ''} onChange={(event) => onSelect(Number(event.target.value))}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.locationName} · {card.status}</option>)}</select></label>}
    {draft && <div className="linked-rate-card-editor"><div className="linked-rate-card-status"><span className={`catalog-status ${draft.status.toLowerCase()}`}>{draft.status}</span><span>{draft.version}</span>{draft.status === 'Draft' && <button className="button button-dark" type="button" onClick={publish} disabled={busy}>Publish rate card</button>}</div><div className="editor-fields"><label>Rate card name<input value={draft.name} onChange={(event) => setField('name', event.target.value)} disabled={draft.status === 'Published'} /></label><label>Area / scope<input value={draft.locationName} onChange={(event) => setField('locationName', event.target.value)} disabled={draft.status === 'Published'} /></label><label>Postal codes<input value={draft.postalCodes.join(', ')} onChange={(event) => setField('postalCodes', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} disabled={draft.status === 'Published'} placeholder="Blank = default area" /></label><label>Pricing model<select value={draft.pricingModel} onChange={(event) => setField('pricingModel', event.target.value)} disabled={draft.status === 'Published'}><option>Flat range</option><option>Per room</option><option>Per square foot</option><option>Per unit</option><option>Hourly</option><option>Custom quote</option></select></label><label>Base price<input type="number" value={draft.basePrice ?? ''} onChange={(event) => setNumber('basePrice', event.target.value)} disabled={draft.status === 'Published'} /></label><label>Unit rate<input type="number" step="0.01" value={draft.unitRate ?? ''} onChange={(event) => setNumber('unitRate', event.target.value)} disabled={draft.status === 'Published'} /></label><label>Minimum price<input type="number" value={draft.minimumPrice ?? ''} onChange={(event) => setNumber('minimumPrice', event.target.value)} disabled={draft.status === 'Published'} /></label><label>Estimate spread<input type="number" step="0.01" value={draft.estimateSpread ?? ''} onChange={(event) => setNumber('estimateSpread', event.target.value)} disabled={draft.status === 'Published'} /></label></div>{error && <p className="form-error-text">{error}</p>}{draft.status === 'Draft' && <button className="button button-quiet" type="button" onClick={save} disabled={busy}>Save rate card</button>}</div>}
  </div>
}

function ServiceReadiness({ service }: { service: ManagedService }) {
  const checks = [
    ['Public identity', Boolean(service.name && service.description)],
    ['Included scope', Boolean(service.includedScope.trim())],
    ['Exclusions', Boolean(service.exclusions.trim())],
    ['Customer preparation', Boolean(service.customerNote.trim())],
    ['Eligible property types', service.propertyTypes.length > 0],
    ['Timing and duration', Boolean(service.timingPattern.trim() && service.estimatedDuration.trim())],
    ['Pricing ready', Boolean(service.rateCards?.some((card) => card.status === 'Published'))],
  ] as const
  const ready = checks.every(([, complete]) => complete)
  return <div className="readiness-card"><div className="workflow-block-heading"><span>SERVICE READINESS</span><small className={ready ? 'ready-label' : 'not-ready-label'}>{ready ? 'Ready to review' : `${checks.filter(([, complete]) => !complete).length} items to complete`}</small></div><div className="readiness-list">{checks.map(([label, complete]) => <span className={complete ? 'ready' : 'not-ready'} key={label}><b>{complete ? '✓' : '!'}</b>{label}</span>)}</div><p className="field-help">Publishing should make the customer-facing scope and pricing understandable without relying on operator memory.</p></div>
}

function serviceNextAction(service: ManagedService) {
  if (service.status === 'Paused') return 'Review and republish'
  if (service.status === 'Published') return 'Review public listing'
  if (!service.rateCards?.some((card) => card.status === 'Published')) return 'Add a rate card'
  if (!service.description || !service.includedScope || !service.exclusions) return 'Complete service basics'
  return 'Review and publish'
}

function rateCardNextAction(card: RateCard) {
  if (card.status === 'Archived') return 'Create a new version'
  if (card.status === 'Published') return 'Review published pricing'
  if (pricingErrorsFor(card).length > 0) return 'Resolve pricing issues'
  return 'Test estimate before publishing'
}

function pricingErrorsFor(card: RateCard) {
  return [
    card.basePrice != null && card.basePrice < 0,
    card.unitRate != null && card.unitRate < 0,
    card.minimumPrice != null && card.minimumPrice < 0,
    card.estimateSpread != null && (card.estimateSpread < 0 || card.estimateSpread > 1),
    [card.standardMultiplier, card.heavyMultiplier, card.extremeMultiplier, card.recurringMultiplier].some((value) => value != null && value <= 0),
  ].filter(Boolean)
}

function ServiceManagement({ onNotice, onUnauthorized }: { onNotice: (message: string) => void, onUnauthorized: () => void }) {
  const [services, setServices] = useState<ManagedService[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRateCardId, setSelectedRateCardId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ManagedService | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | ManagedService['status']>('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [readinessFilter, setReadinessFilter] = useState('All')
  const [serviceSort, setServiceSort] = useState<{ key: 'name' | 'category' | 'status' | 'readiness' | 'next', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ low: number, high: number, breakdown: string[] } | null>(null)
  const [sampleSize, setSampleSize] = useState('4')
  const [sampleCondition, setSampleCondition] = useState('Standard')
  const [sampleFrequency, setSampleFrequency] = useState('One-time')
  const [creating, setCreating] = useState(false)
  const [newService, setNewService] = useState({ id: '', name: '', description: '', category: '', buyers: '', includedScope: '', exclusions: '', customerNote: '', timingPattern: '', estimatedDuration: '' })
  const [newServiceRateCard, setNewServiceRateCard] = useState<RateCardForm>(emptyRateCardForm('Default rate'))

  const load = useCallback(async () => {
    try {
      const result = await getOperatorServices()
      setServices(result)
      setSelectedId((current) => current && result.some((service) => service.id === current) ? current : result[0]?.id ?? null)
      setError('')
    } catch (caught) {
      const apiError = caught as ApiError
      if (apiError.status === 401) onUnauthorized()
      else setError(apiError.message)
    }
  }, [onUnauthorized])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const next = services.find((service) => service.id === selectedId) ?? null
    setDraft(next ? { ...next, addOnRules: next.addOnRules.map((item) => ({ ...item })) } : null)
    setSelectedRateCardId(next?.rateCards?.find((card) => card.status === 'Published')?.id ?? next?.rateCards?.[0]?.id ?? null)
    setPreview(null)
  }, [selectedId, services])

  const serviceCategories = [...new Set(services.map((service) => service.category).filter(Boolean))].sort()
  const serviceReadiness = [...new Set(services.map((service) => service.pricingReadiness).filter(Boolean))].sort()
  const matchesServiceSearchAndFilters = (service: ManagedService) => {
    const matchesSearch = `${service.id} ${service.name} ${service.category} ${service.description} ${service.status}`.toLowerCase().includes(query.toLowerCase().trim())
    return matchesSearch && (categoryFilter === 'All' || service.category === categoryFilter) && (readinessFilter === 'All' || service.pricingReadiness === readinessFilter)
  }
  const visible = [...services.filter((service) => (statusFilter === 'All' || service.status === statusFilter) && matchesServiceSearchAndFilters(service))].sort((left, right) => {
    const direction = serviceSort.direction === 'asc' ? 1 : -1
    const values: Record<typeof serviceSort.key, [string, string]> = {
      name: [left.name, right.name], category: [left.category, right.category], status: [left.status, right.status], readiness: [left.pricingReadiness, right.pricingReadiness], next: [serviceNextAction(left), serviceNextAction(right)],
    }
    return direction * values[serviceSort.key][0].localeCompare(values[serviceSort.key][1])
  })
  const sortServices = (key: typeof serviceSort.key) => setServiceSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  const clearServiceFilters = () => { setQuery(''); setStatusFilter('All'); setCategoryFilter('All'); setReadinessFilter('All') }
  const setField = <K extends keyof ManagedService>(key: K, value: ManagedService[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }
  const setNumber = (key: keyof ManagedService, value: string) => setField(key, value === '' ? null : Number(value) as never)

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const saved = await saveOperatorService(draft.id, draft)
      setServices((current) => current.map((service) => service.id === saved.id ? saved : service))
       onNotice(`${saved.name} saved.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const publish = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const saved = await saveOperatorService(draft.id, draft)
      const published = await publishOperatorService(saved.id)
      setServices((current) => current.map((service) => service.id === published.id ? published : service))
      onNotice(`${published.name} is now published.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const pause = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const paused = await pauseOperatorService(draft.id)
      setServices((current) => current.map((service) => service.id === paused.id ? paused : service))
      onNotice(`${paused.name} is paused and hidden from new requests.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const create = async () => {
    const name = newService.name.trim()
    const id = newService.id.trim()
    if (!name || !id) { setError('Enter a service name and ID before creating the draft.'); return }
    try {
      const created = await createServiceOffering({ service: { ...newService, id, name, propertyTypes: [], frequencyOptions: ['One-time', 'Recurring'] }, rateCards: [{ ...rateCardFormPayload(newServiceRateCard), name: newServiceRateCard.name.trim() || `${name} default rate` }] })
      setServices((current) => [...current, created])
      setSelectedId(created.id)
      setCreating(false)
      setNewService({ id: '', name: '', description: '', category: '', buyers: '', includedScope: '', exclusions: '', customerNote: '', timingPattern: '', estimatedDuration: '' })
      setNewServiceRateCard(emptyRateCardForm('Default rate'))
       onNotice(`${created.name} created with a connected Rate Card.`)
    } catch (caught) { setError((caught as ApiError).message) }
  }

  const runPreview = async () => {
    if (!draft) return
    try {
      setPreview(await previewOperatorService(draft.id, draft, { size: Number(sampleSize), condition: sampleCondition, frequency: sampleFrequency, addOns: draft.addOnRules.map((item) => item.name).slice(0, 1), location: '55401' }))
      setError('')
    } catch (caught) { setError((caught as ApiError).message) }
  }

  return <div className={`service-management service-catalog-management ${editing ? 'editing' : ''}`}>
    <div className={`service-management-toolbar ${editing ? 'detail-toolbar' : ''}`}>
      <div><div className="eyebrow">WORKING SERVICE CATALOG</div><h2>Service catalog</h2><p>Maintain the services customers can request.</p></div>
      <div className="hero-actions"><button className="button button-quiet" onClick={load}>Refresh</button><button className="button button-dark" onClick={() => setCreating((current) => !current)}>{creating ? 'Cancel' : 'Add service'} <span>{creating ? '×' : '+'}</span></button></div>
    </div>
     {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
     {editing && <button className="back-link management-back" onClick={() => setEditing(false)}>← Return to services</button>}
     {creating && <form className="new-service-form" onSubmit={(event) => { event.preventDefault(); create() }}><div><div className="eyebrow">NEW SERVICE OFFERING</div><p>Complete the customer-facing identity and connect its first Rate Card before saving.</p></div><label>Service ID<input required pattern="[a-z0-9-]+" value={newService.id} onChange={(event) => setNewService((current) => ({ ...current, id: event.target.value }))} placeholder="e.g. move-in-cleaning" /></label><label>Service name<input required value={newService.name} onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Move-in cleaning" /></label><label className="span-2">Short description<textarea value={newService.description} onChange={(event) => setNewService((current) => ({ ...current, description: event.target.value }))} /></label><fieldset className="new-service-rate-card span-2"><legend>First Rate Card</legend><div className="editor-fields"><label>Rate card name<input value={newServiceRateCard.name} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, name: event.target.value }))} /></label><label>Pricing method<select value={newServiceRateCard.pricingModel} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, pricingModel: event.target.value }))}><option>Flat range</option><option>Per unit</option><option>Per room</option><option>Per square foot</option><option>Hourly</option><option>Custom quote</option></select></label><label>Service area<input value={newServiceRateCard.locationName} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, locationName: event.target.value }))} /></label><label>Postal codes<input value={newServiceRateCard.postalCodes} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, postalCodes: event.target.value }))} placeholder="55401, 55402" /></label><label>Size input<input value={newServiceRateCard.sizeInputLabel} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, sizeInputLabel: event.target.value }))} /></label><label>Base price<input type="number" min="0" value={newServiceRateCard.basePrice} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, basePrice: event.target.value }))} /></label><label>Unit rate<input type="number" min="0" step="0.01" value={newServiceRateCard.unitRate} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, unitRate: event.target.value }))} /></label><label>Minimum price<input type="number" min="0" value={newServiceRateCard.minimumPrice} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, minimumPrice: event.target.value }))} /></label><label>Estimate spread<input type="number" min="0" max="1" step="0.01" value={newServiceRateCard.estimateSpread} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, estimateSpread: event.target.value }))} /></label><label>Standard multiplier<input type="number" min="0.01" step="0.01" value={newServiceRateCard.standardMultiplier} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, standardMultiplier: event.target.value }))} /></label><label>Heavy multiplier<input type="number" min="0.01" step="0.01" value={newServiceRateCard.heavyMultiplier} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, heavyMultiplier: event.target.value }))} /></label><label>Extreme multiplier<input type="number" min="0.01" step="0.01" value={newServiceRateCard.extremeMultiplier} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, extremeMultiplier: event.target.value }))} /></label><label>Recurring multiplier<input type="number" min="0.01" step="0.01" value={newServiceRateCard.recurringMultiplier} onChange={(event) => setNewServiceRateCard((current) => ({ ...current, recurringMultiplier: event.target.value }))} /></label></div></fieldset><button className="button button-dark" type="submit">Create service with Rate Card <span>+</span></button></form>}
     {creating && <div className="new-service-metadata"><div className="eyebrow">CUSTOMER CARD DETAILS</div><label>Category<input value={newService.category} onChange={(event) => setNewService((current) => ({ ...current, category: event.target.value }))} placeholder="e.g. Residential / Multifamily" /></label><label>Best for<input value={newService.buyers} onChange={(event) => setNewService((current) => ({ ...current, buyers: event.target.value }))} placeholder="Who this service is for" /></label><label>Included scope<textarea value={newService.includedScope} onChange={(event) => setNewService((current) => ({ ...current, includedScope: event.target.value }))} /></label><label>Exclusions<textarea value={newService.exclusions} onChange={(event) => setNewService((current) => ({ ...current, exclusions: event.target.value }))} /></label><label>Customer preparation<textarea value={newService.customerNote} onChange={(event) => setNewService((current) => ({ ...current, customerNote: event.target.value }))} /></label><label>Timing pattern<input value={newService.timingPattern} onChange={(event) => setNewService((current) => ({ ...current, timingPattern: event.target.value }))} placeholder="e.g. Weekdays, 8am–5pm" /></label><label>Estimated duration<input value={newService.estimatedDuration} onChange={(event) => setNewService((current) => ({ ...current, estimatedDuration: event.target.value }))} placeholder="e.g. 2–4 hours" /></label></div>}
     <div className="service-management-grid">
       <aside className="service-index">
         <div className="workspace-tabs" role="tablist" aria-label="Filter services">
            {(['All', 'Published', 'Draft', 'Paused'] as const).map((filter) => <button key={filter} className={statusFilter === filter ? 'selected' : ''} role="tab" aria-selected={statusFilter === filter} onClick={() => setStatusFilter(filter)}>{filter}<span>{services.filter((service) => (filter === 'All' || service.status === filter) && matchesServiceSearchAndFilters(service)).length}</span></button>)}
          </div>
          <div className="service-table">
            <div className="service-column-headings" role="row"><span role="columnheader" title="Public service name"><SortHeader label="Service" column="name" current={serviceSort} onSort={(key) => sortServices(key as typeof serviceSort.key)} /></span><span role="columnheader" title="Service grouping used for navigation and pricing"><SortHeader label="Category" column="category" current={serviceSort} onSort={(key) => sortServices(key as typeof serviceSort.key)} /></span><span role="columnheader" title="Whether customers can currently request this service"><SortHeader label="Status" column="status" current={serviceSort} onSort={(key) => sortServices(key as typeof serviceSort.key)} /></span><span role="columnheader" title="Whether pricing is ready for this service"><SortHeader label="Readiness" column="readiness" current={serviceSort} onSort={(key) => sortServices(key as typeof serviceSort.key)} /></span><span role="columnheader" title="Recommended next operator action"><SortHeader label="Next action" column="next" current={serviceSort} onSort={(key) => sortServices(key as typeof serviceSort.key)} /></span></div>
            <div className="service-list-tools">
              <div className="workspace-filters" aria-label="Service filters">
                <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All</option>{serviceCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Readiness<select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)}><option>All</option>{serviceReadiness.map((readiness) => <option key={readiness}>{readiness}</option>)}</select></label>
                <button className="clear-filters" type="button" onClick={clearServiceFilters} disabled={!query && statusFilter === 'All' && categoryFilter === 'All' && readinessFilter === 'All'}>Clear filters</button>
              </div>
              <label className="workspace-search service-list-search">Search services<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service name, category..." /></label>
            </div>
            {visible.map((service) => <button className={`service-index-row ${selectedId === service.id ? 'selected' : ''}`} key={service.id} aria-label={`${service.name}, ${service.status}, ${serviceNextAction(service)}`} onClick={() => { setSelectedId(service.id); setEditing(true) }}><span className="service-name-cell">{service.name}</span><span className="service-category-cell">{service.category}</span><span className="service-status-cell"><em className={`catalog-status ${service.status.toLowerCase()}`}>{service.status}</em></span><span className="service-readiness-cell">{service.pricingReadiness}</span><span className="service-action-cell">{serviceNextAction(service)} <span aria-hidden="true">→</span></span></button>)}
            {visible.length === 0 && <p className="loading-note">No services match this search or filter.</p>}
          </div>
       </aside>
      {draft && <section className="service-editor">
         <div className="editor-heading"><div><span className={`catalog-status ${draft.status.toLowerCase()}`}>{draft.status}</span><h3>{draft.name}</h3><p>Version {draft.version} · {draft.pricingReadiness}</p></div><div className="editor-actions"><button className="button button-quiet" onClick={save} disabled={busy}>Save service</button>{draft.status === 'Published' ? <button className="button button-quiet" onClick={pause} disabled={busy}>Pause</button> : <button className="button button-dark" onClick={publish} disabled={busy}>Publish</button>}</div></div>
          <ServiceReadiness service={draft} />
          <LinkedRateCards service={draft} selectedId={selectedRateCardId} onSelect={setSelectedRateCardId} onChanged={(card) => { setDraft((current) => { if (!current) return current; const rateCards = current.rateCards || []; return { ...current, rateCards: rateCards.some((item) => item.id === card.id) ? rateCards.map((item) => item.id === card.id ? card : item) : [...rateCards, card], pricingReadiness: card.status === 'Published' ? 'Ready' : current.pricingReadiness } }); setServices((current) => current.map((item) => { if (item.id !== draft.id) return item; const rateCards = item.rateCards || []; return { ...item, rateCards: rateCards.some((rateCard) => rateCard.id === card.id) ? rateCards.map((rateCard) => rateCard.id === card.id ? card : rateCard) : [...rateCards, card], pricingReadiness: card.status === 'Published' ? 'Ready' : item.pricingReadiness } })) }} />
         <div className="editor-section"><div className="eyebrow">BASICS</div><div className="editor-fields"><label>Service name<input value={draft.name} onChange={(event) => setField('name', event.target.value)} /></label><label>Category<input value={draft.category} onChange={(event) => setField('category', event.target.value)} /></label><label>Card icon<input value={draft.icon} onChange={(event) => setField('icon', event.target.value)} maxLength={2} /></label><label>Featured order<input type="number" min="0" value={draft.featuredOrder} onChange={(event) => setField('featuredOrder', Number(event.target.value))} /></label><label className="toggle-field"><input type="checkbox" checked={draft.featured} onChange={(event) => setField('featured', event.target.checked)} /> Show in featured services</label><label className="span-2">Short description<textarea value={draft.description} onChange={(event) => setField('description', event.target.value)} /></label><label className="span-2">Included scope<textarea value={draft.includedScope} onChange={(event) => setField('includedScope', event.target.value)} /></label><label className="span-2">Exclusions and assumptions<textarea value={draft.exclusions} onChange={(event) => setField('exclusions', event.target.value)} /></label><label className="span-2">Customer preparation guidance<textarea value={draft.customerNote} onChange={(event) => setField('customerNote', event.target.value)} placeholder="What should the customer do before service?" /></label></div></div>
        <div className="editor-section"><div className="eyebrow">PRICING RULE</div><p className="field-help">These fields drive the estimate. Price Low and Price High remain reference ranges; they are not calculation inputs.</p><div className="editor-fields pricing-fields"><label>Pricing model<select value={draft.pricingModel} onChange={(event) => setField('pricingModel', event.target.value)}><option>Flat range</option><option>Per room</option><option>Per square foot</option><option>Per unit</option><option>Hourly</option><option>Custom quote</option></select></label><label>Size input<input value={draft.sizeInputLabel} onChange={(event) => setField('sizeInputLabel', event.target.value)} /></label><label>Base price<input type="number" value={draft.basePrice ?? ''} onChange={(event) => setNumber('basePrice', event.target.value)} /></label><label>Unit rate<input type="number" step="0.01" value={draft.unitRate ?? ''} onChange={(event) => setNumber('unitRate', event.target.value)} /></label><label>Minimum price<input type="number" value={draft.minimumPrice ?? ''} onChange={(event) => setNumber('minimumPrice', event.target.value)} /></label><label>Estimate spread<input type="number" step="0.01" value={draft.estimateSpread ?? ''} onChange={(event) => setNumber('estimateSpread', event.target.value)} /></label><label>Standard multiplier<input type="number" step="0.01" value={draft.standardMultiplier ?? ''} onChange={(event) => setNumber('standardMultiplier', event.target.value)} /></label><label>Heavy multiplier<input type="number" step="0.01" value={draft.heavyMultiplier ?? ''} onChange={(event) => setNumber('heavyMultiplier', event.target.value)} /></label><label>Extreme multiplier<input type="number" step="0.01" value={draft.extremeMultiplier ?? ''} onChange={(event) => setNumber('extremeMultiplier', event.target.value)} /></label><label>Recurring multiplier<input type="number" step="0.01" value={draft.recurringMultiplier ?? ''} onChange={(event) => setNumber('recurringMultiplier', event.target.value)} /></label><label>Travel fee amount<input type="number" value={draft.travelFeeAmount ?? ''} onChange={(event) => setNumber('travelFeeAmount', event.target.value)} /></label><label>Pricing readiness<select value={draft.pricingReadiness} onChange={(event) => setField('pricingReadiness', event.target.value)}><option>Needs operator pricing review</option><option>Ready</option><option>Blocked</option></select></label><label className="span-2">Pricing basis<textarea value={draft.pricingBasis} onChange={(event) => setField('pricingBasis', event.target.value)} /></label><label className="span-2">Change reason<textarea value={draft.changeReason} onChange={(event) => setField('changeReason', event.target.value)} /></label></div></div>
        <div className="editor-section"><div className="eyebrow">ADD-ONS</div><p className="field-help">One rule per line: name | flat or per unit | amount.</p><textarea className="addon-editor" value={draft.addOnRules.map((item) => `${item.name} | ${item.valueType} | ${item.price}`).join('\n')} onChange={(event) => setField('addOnRules', event.target.value.split('\n').filter(Boolean).map((line) => { const [name, valueType, price] = line.split('|').map((part) => part.trim()); return { name, valueType: valueType || 'flat', price: Number(price) || 0 } }))} /> </div>
        <div className="editor-section preview-section"><div><div className="eyebrow">PREVIEW DRAFT</div><p className="field-help">Test the current draft without publishing it.</p></div><div className="preview-controls"><label>Sample size<input type="number" value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} /></label><label>Condition<select value={sampleCondition} onChange={(event) => setSampleCondition(event.target.value)}><option>Standard</option><option>Heavy</option><option>Extreme</option></select></label><label>Frequency<select value={sampleFrequency} onChange={(event) => setSampleFrequency(event.target.value)}><option>One-time</option><option>Recurring</option></select></label><button className="button button-dark" onClick={runPreview}>Preview estimate</button></div>{preview && <div className="preview-result"><strong>${preview.low.toLocaleString()}–${preview.high.toLocaleString()}</strong><span>{preview.breakdown.join(' · ')}</span></div>}</div>
      </section>}
    </div>
  </div>
}

function RateCardManagement({ onNotice, onUnauthorized }: { onNotice: (message: string) => void, onUnauthorized: () => void }) {
  const [cards, setCards] = useState<RateCard[]>([])
  const [services, setServices] = useState<ManagedService[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<RateCard | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | RateCard['status']>('All')
  const [serviceFilter, setServiceFilter] = useState('All')
  const [pricingModelFilter, setPricingModelFilter] = useState('All')
  const [areaFilter, setAreaFilter] = useState('All')
  const [rateCardSort, setRateCardSort] = useState<{ key: 'name' | 'service' | 'area' | 'model' | 'status' | 'next', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
  const [creating, setCreating] = useState(false)
  const [newServiceId, setNewServiceId] = useState('')
  const [newRateCard, setNewRateCard] = useState<RateCardForm>(emptyRateCardForm())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Estimate | null>(null)
  const [sampleSize, setSampleSize] = useState('4')
  const [sampleLocation, setSampleLocation] = useState('55401')
  const [sampleCondition, setSampleCondition] = useState('Standard')
  const [sampleFrequency, setSampleFrequency] = useState('One-time')
  const [sampleAddOns, setSampleAddOns] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const [nextCards, nextServices] = await Promise.all([getOperatorRateCards(), getOperatorServices()])
      setCards(nextCards)
      setServices(nextServices)
      setSelectedId((current) => current && nextCards.some((card) => card.id === current) ? current : nextCards[0]?.id ?? null)
      setError('')
    } catch (caught) {
      const apiError = caught as ApiError
      if (apiError.status === 401) onUnauthorized()
      else setError(apiError.message)
    }
  }, [onUnauthorized])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const next = cards.find((card) => card.id === selectedId) ?? null
    setDraft(next ? { ...next, postalCodes: [...next.postalCodes], addOnRules: next.addOnRules.map((item) => ({ ...item })) } : null)
    setPreview(null)
    setSampleAddOns([])
  }, [cards, selectedId])

  const rateCardServices = [...new Set(cards.map((card) => card.serviceName).filter(Boolean))].sort()
  const pricingModels = [...new Set(cards.map((card) => card.pricingModel).filter(Boolean))].sort()
  const rateCardAreas = [...new Set(cards.map((card) => card.locationName).filter(Boolean))].sort()
  const matchesRateCardSearchAndFilters = (card: RateCard) => {
    const matchesSearch = `${card.serviceName} ${card.name} ${card.locationName} ${card.pricingModel} ${card.status} ${card.postalCodes.join(' ')}`.toLowerCase().includes(query.toLowerCase().trim())
    return matchesSearch && (serviceFilter === 'All' || card.serviceName === serviceFilter) && (pricingModelFilter === 'All' || card.pricingModel === pricingModelFilter) && (areaFilter === 'All' || card.locationName === areaFilter)
  }
  const visible = [...cards.filter((card) => (statusFilter === 'All' || card.status === statusFilter) && matchesRateCardSearchAndFilters(card))].sort((left, right) => {
    const direction = rateCardSort.direction === 'asc' ? 1 : -1
    const values: Record<typeof rateCardSort.key, [string, string]> = {
      name: [left.name, right.name], service: [left.serviceName, right.serviceName], area: [left.locationName, right.locationName], model: [left.pricingModel, right.pricingModel], status: [left.status, right.status], next: [rateCardNextAction(left), rateCardNextAction(right)],
    }
    return direction * values[rateCardSort.key][0].localeCompare(values[rateCardSort.key][1])
  })
  const sortRateCards = (key: typeof rateCardSort.key) => setRateCardSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  const clearRateCardFilters = () => { setQuery(''); setStatusFilter('All'); setServiceFilter('All'); setPricingModelFilter('All'); setAreaFilter('All') }
  const setField = <K extends keyof RateCard>(key: K, value: RateCard[K]) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const setNumber = (key: keyof RateCard, value: string) => setField(key, value === '' ? null : Number(value) as never)
  const pricingErrors = (card: RateCard) => {
    const errors: string[] = []
    if (card.basePrice != null && card.basePrice < 0) errors.push('Base price cannot be negative.')
    if (card.unitRate != null && card.unitRate < 0) errors.push('Unit rate cannot be negative.')
    if (card.minimumPrice != null && card.minimumPrice < 0) errors.push('Minimum price cannot be negative.')
    if (card.estimateSpread != null && (card.estimateSpread < 0 || card.estimateSpread > 1)) errors.push('Estimate range must be between 0 and 1.')
    if ([card.standardMultiplier, card.heavyMultiplier, card.extremeMultiplier, card.recurringMultiplier].some((value) => value != null && value <= 0)) errors.push('Condition and frequency adjustments must be greater than zero.')
    return errors
  }

  const create = async () => {
    if (!newServiceId) { setError('Choose a service before creating a rate card.'); return }
    if (!newRateCard.name.trim()) { setError('Name the rate card before creating it.'); return }
    setBusy(true)
    try {
      const created = await createRateCard({ serviceId: newServiceId, ...rateCardFormPayload(newRateCard) })
      setCards((current) => [...current, created])
      setSelectedId(created.id)
      setEditing(true)
      setCreating(false)
      setNewRateCard(emptyRateCardForm())
      onNotice(`${created.name} created. Complete and publish the rate card when ready.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const saved = await saveRateCard(draft.id, draft)
      setCards((current) => current.map((card) => card.id === saved.id ? saved : card))
      onNotice(`${saved.name} saved as a draft.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const duplicate = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const copy = await duplicateRateCard(draft.id)
      setCards((current) => [...current, copy])
      setSelectedId(copy.id)
      setEditing(true)
      onNotice(`${copy.name} created as a draft.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const publish = async () => {
    if (!draft) return
    const validation = pricingErrors(draft)
    if (validation.length) { setError(validation.join(' ')); return }
    if (!window.confirm(`Publish ${draft.name} ${draft.version} for ${draft.locationName}? This changes the pricing available to operators and may affect new estimates.`)) return
    setBusy(true)
    try {
      const saved = draft.status === 'Draft' ? await saveRateCard(draft.id, draft) : draft
      const published = await publishRateCard(saved.id)
      await load()
      setSelectedId(published.id)
      onNotice(`${published.serviceName} pricing is now published.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const archive = async () => {
    if (!draft) return
    if (!window.confirm(`Archive ${draft.name} ${draft.version}? Existing quote snapshots remain unchanged.`)) return
    setBusy(true)
    try {
      const archived = await archiveRateCard(draft.id)
      setCards((current) => current.map((card) => card.id === archived.id ? archived : card))
      onNotice(`${archived.name} archived.`)
    } catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  const runPreview = async () => {
    if (!draft) return
    try {
      setPreview(await previewRateCard(draft.id, { size: Number(sampleSize), condition: sampleCondition, frequency: sampleFrequency, addOns: sampleAddOns, location: sampleLocation }))
      setError('')
    } catch (caught) { setError((caught as ApiError).message) }
  }

  return <div className={`service-management rate-card-management ${editing ? 'editing' : ''}`}>
    <div className={`service-management-toolbar ${editing ? 'detail-toolbar' : ''}`}>
      <div><div className="eyebrow">RATE CARDS</div><h2>Rate cards</h2><p>Test and publish the pricing rules operators use.</p></div>
      <div className="hero-actions"><button className="button button-quiet" onClick={load}>Refresh</button><button className="button button-dark" onClick={() => setCreating((current) => !current)}>{creating ? 'Cancel' : 'Add rate card'} <span>{creating ? '×' : '+'}</span></button></div>
    </div>
     {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
     {editing && <button className="back-link management-back" onClick={() => setEditing(false)}>← Return to rate cards</button>}
     {creating && <div className="new-rate-card-form"><div className="new-rate-card-intro"><div className="eyebrow">NEW RATE CARD</div><p>Choose a service and enter the pricing inputs now. You can save the card as a draft, then publish it after testing.</p></div><div className="new-rate-card-fields"><label>Service<select value={newServiceId} onChange={(event) => setNewServiceId(event.target.value)}><option value="">Choose a service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Rate card name<input value={newRateCard.name} onChange={(event) => setNewRateCard((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Minneapolis default rate" /></label><label>Pricing method<select value={newRateCard.pricingModel} onChange={(event) => setNewRateCard((current) => ({ ...current, pricingModel: event.target.value }))}><option>Flat range</option><option>Per unit</option><option>Per room</option><option>Per square foot</option><option>Hourly</option><option>Custom quote</option></select></label><label>Service area<input value={newRateCard.locationName} onChange={(event) => setNewRateCard((current) => ({ ...current, locationName: event.target.value }))} /></label><label>Postal codes<input value={newRateCard.postalCodes} onChange={(event) => setNewRateCard((current) => ({ ...current, postalCodes: event.target.value }))} placeholder="55401, 55402" /></label><label>Size input<input value={newRateCard.sizeInputLabel} onChange={(event) => setNewRateCard((current) => ({ ...current, sizeInputLabel: event.target.value }))} /></label><label>Base price<input type="number" min="0" value={newRateCard.basePrice} onChange={(event) => setNewRateCard((current) => ({ ...current, basePrice: event.target.value }))} /></label><label>Unit rate<input type="number" min="0" step="0.01" value={newRateCard.unitRate} onChange={(event) => setNewRateCard((current) => ({ ...current, unitRate: event.target.value }))} /></label><label>Minimum price<input type="number" min="0" value={newRateCard.minimumPrice} onChange={(event) => setNewRateCard((current) => ({ ...current, minimumPrice: event.target.value }))} /></label><label>Estimate spread<input type="number" min="0" max="1" step="0.01" value={newRateCard.estimateSpread} onChange={(event) => setNewRateCard((current) => ({ ...current, estimateSpread: event.target.value }))} /></label><label>Standard multiplier<input type="number" min="0.01" step="0.01" value={newRateCard.standardMultiplier} onChange={(event) => setNewRateCard((current) => ({ ...current, standardMultiplier: event.target.value }))} /></label><label>Heavy multiplier<input type="number" min="0.01" step="0.01" value={newRateCard.heavyMultiplier} onChange={(event) => setNewRateCard((current) => ({ ...current, heavyMultiplier: event.target.value }))} /></label><label>Extreme multiplier<input type="number" min="0.01" step="0.01" value={newRateCard.extremeMultiplier} onChange={(event) => setNewRateCard((current) => ({ ...current, extremeMultiplier: event.target.value }))} /></label><label>Recurring multiplier<input type="number" min="0.01" step="0.01" value={newRateCard.recurringMultiplier} onChange={(event) => setNewRateCard((current) => ({ ...current, recurringMultiplier: event.target.value }))} /></label></div><button className="button button-dark" onClick={create} disabled={busy}>Create and configure <span>+</span></button></div>}
    <div className="service-management-grid rate-card-grid">
       <aside className="service-index">
          <div className="workspace-tabs" role="tablist" aria-label="Filter rate cards">{(['All', 'Published', 'Draft', 'Archived'] as const).map((filter) => <button key={filter} className={statusFilter === filter ? 'selected' : ''} role="tab" aria-selected={statusFilter === filter} onClick={() => setStatusFilter(filter)}>{filter}<span>{cards.filter((card) => (filter === 'All' || card.status === filter) && matchesRateCardSearchAndFilters(card)).length}</span></button>)}</div>
          <div className="service-table rate-card-table">
            <div className="service-column-headings" role="row"><span role="columnheader" title="Name of the pricing rule"><SortHeader label="Rate card" column="name" current={rateCardSort} onSort={(key) => sortRateCards(key as typeof rateCardSort.key)} /></span><span role="columnheader" title="Service this pricing rule applies to"><SortHeader label="Service" column="service" current={rateCardSort} onSort={(key) => sortRateCards(key as typeof rateCardSort.key)} /></span><span role="columnheader" title="Area or postal scope for this pricing rule"><SortHeader label="Area / scope" column="area" current={rateCardSort} onSort={(key) => sortRateCards(key as typeof rateCardSort.key)} /></span><span role="columnheader" title="How this rate is calculated"><SortHeader label="Pricing model" column="model" current={rateCardSort} onSort={(key) => sortRateCards(key as typeof rateCardSort.key)} /></span><span role="columnheader" title="Whether this pricing rule is active"><SortHeader label="Status" column="status" current={rateCardSort} onSort={(key) => sortRateCards(key as typeof rateCardSort.key)} /></span><span role="columnheader" title="Recommended next operator action"><SortHeader label="Next action" column="next" current={rateCardSort} onSort={(key) => sortRateCards(key as typeof rateCardSort.key)} /></span></div>
            <div className="service-list-tools">
              <div className="workspace-filters" aria-label="Rate card filters">
                <label>Service<select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option>All</option>{rateCardServices.map((service) => <option key={service}>{service}</option>)}</select></label>
                <label>Pricing model<select value={pricingModelFilter} onChange={(event) => setPricingModelFilter(event.target.value)}><option>All</option>{pricingModels.map((model) => <option key={model}>{model}</option>)}</select></label>
                <label>Area / scope<select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option>All</option>{rateCardAreas.map((area) => <option key={area}>{area}</option>)}</select></label>
                <button className="clear-filters" type="button" onClick={clearRateCardFilters} disabled={!query && statusFilter === 'All' && serviceFilter === 'All' && pricingModelFilter === 'All' && areaFilter === 'All'}>Clear filters</button>
              </div>
              <label className="workspace-search service-list-search">Search rate cards<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service, area, pricing..." /></label>
            </div>
            {visible.map((card) => <button className={`service-index-row ${selectedId === card.id ? 'selected' : ''}`} key={card.id} aria-label={`${card.name}, ${card.serviceName}, ${card.status}, ${rateCardNextAction(card)}`} onClick={() => { setSelectedId(card.id); setEditing(true) }}><span className="rate-card-name-cell">{card.name}</span><span className="rate-card-service-cell">{card.serviceName}</span><span className="rate-card-area-cell">{card.locationName || 'Default area'}</span><span className="rate-card-model-cell">{card.pricingModel}</span><span className="rate-card-status-cell"><em className={`catalog-status ${card.status.toLowerCase()}`}>{card.status}</em></span><span className="rate-card-action-cell">{rateCardNextAction(card)} <span aria-hidden="true">→</span></span></button>)}
            {visible.length === 0 && <p className="loading-note">No rate cards match this view.</p>}
          </div>
       </aside>
      {draft && <section className="service-editor">
        <div className="editor-heading"><div><span className={`catalog-status ${draft.status.toLowerCase()}`}>{draft.status}</span><h3>{draft.serviceName}</h3><p>{draft.name} · {draft.version}</p></div><div className="editor-actions">{draft.status === 'Published' ? <><button className="button button-quiet" onClick={duplicate} disabled={busy}>New version</button><button className="button button-quiet" onClick={archive} disabled={busy}>Archive</button></> : <><button className="button button-quiet" onClick={save} disabled={busy}>Save draft</button><button className="button button-dark" onClick={publish} disabled={busy}>Publish</button></>}</div></div>
        <div className="editor-section"><div className="eyebrow">RATE SCOPE</div><div className="editor-fields"><label>Rate card name<input disabled={draft.status === 'Published'} value={draft.name} onChange={(event) => setField('name', event.target.value)} /></label><label>Pricing method<select disabled={draft.status === 'Published'} value={draft.pricingModel} onChange={(event) => setField('pricingModel', event.target.value)}><option>Flat range</option><option>Per unit</option><option>Per room</option><option>Per square foot</option><option>Hourly</option><option>Custom quote</option></select></label><label>Service area<input disabled={draft.status === 'Published'} value={draft.locationName} onChange={(event) => setField('locationName', event.target.value)} /></label><label>Postal codes<input disabled={draft.status === 'Published'} value={draft.postalCodes.join(', ')} onChange={(event) => setField('postalCodes', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Blank = default rate" /></label></div><p className="field-help">Leave postal codes blank for the default service-area rate. A matching postal-code rate takes priority.</p></div>
        <div className="editor-section"><div className="eyebrow">AMOUNTS</div><div className="editor-fields pricing-fields"><label>Base price<input disabled={draft.status === 'Published'} type="number" value={draft.basePrice ?? ''} onChange={(event) => setNumber('basePrice', event.target.value)} /></label><label>Unit rate<input disabled={draft.status === 'Published'} type="number" step="0.01" value={draft.unitRate ?? ''} onChange={(event) => setNumber('unitRate', event.target.value)} /></label><label>Minimum price<input disabled={draft.status === 'Published'} type="number" value={draft.minimumPrice ?? ''} onChange={(event) => setNumber('minimumPrice', event.target.value)} /></label><label>Estimate spread<input disabled={draft.status === 'Published'} type="number" step="0.01" value={draft.estimateSpread ?? ''} onChange={(event) => setNumber('estimateSpread', event.target.value)} /></label><label>Travel fee<input disabled={draft.status === 'Published'} type="number" value={draft.travelFeeAmount ?? ''} onChange={(event) => setNumber('travelFeeAmount', event.target.value)} /></label><label>Size label<input disabled={draft.status === 'Published'} value={draft.sizeInputLabel} onChange={(event) => setField('sizeInputLabel', event.target.value)} /></label></div></div>
        <div className="editor-section"><div className="eyebrow">ADJUSTMENTS</div><div className="editor-fields pricing-fields"><label>Standard multiplier<input disabled={draft.status === 'Published'} type="number" step="0.01" value={draft.standardMultiplier ?? ''} onChange={(event) => setNumber('standardMultiplier', event.target.value)} /></label><label>Heavy multiplier<input disabled={draft.status === 'Published'} type="number" step="0.01" value={draft.heavyMultiplier ?? ''} onChange={(event) => setNumber('heavyMultiplier', event.target.value)} /></label><label>Extreme multiplier<input disabled={draft.status === 'Published'} type="number" step="0.01" value={draft.extremeMultiplier ?? ''} onChange={(event) => setNumber('extremeMultiplier', event.target.value)} /></label><label>Recurring multiplier<input disabled={draft.status === 'Published'} type="number" step="0.01" value={draft.recurringMultiplier ?? ''} onChange={(event) => setNumber('recurringMultiplier', event.target.value)} /></label></div><p className="field-help">Use 1.00 for no adjustment. Add-ons remain attached to the service and are priced in the service editor for now.</p></div>
         <div className="editor-section preview-section"><div><div className="eyebrow">TEST THE RATE</div><p className="field-help">Test representative scenarios before publishing. This is an internal estimate preview, not a customer quote.</p></div><div className="preview-controls"><label>Sample {draft.sizeInputLabel}<input type="number" min="1" value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} /></label><label>Condition<select value={sampleCondition} onChange={(event) => setSampleCondition(event.target.value)}><option>Standard</option><option>Heavy</option><option>Extreme</option></select></label><label>Frequency<select value={sampleFrequency} onChange={(event) => setSampleFrequency(event.target.value)}><option>One-time</option><option>Recurring</option></select></label><label>Postal code<input value={sampleLocation} onChange={(event) => setSampleLocation(event.target.value)} /></label><button className="button button-dark" type="button" onClick={runPreview}>Preview estimate</button></div>{draft.addOnRules.length > 0 && <fieldset className="preview-addons"><legend>Test add-ons</legend>{draft.addOnRules.map((rule) => <label key={rule.name} className="checkbox-row"><input type="checkbox" checked={sampleAddOns.includes(rule.name)} onChange={(event) => setSampleAddOns((current) => event.target.checked ? [...current, rule.name] : current.filter((item) => item !== rule.name))} />{rule.name}</label>)}</fieldset>}{preview && <div className="preview-result" aria-live="polite"><strong>${preview.low.toLocaleString()}–${preview.high.toLocaleString()}</strong><span>{preview.breakdown.join(' · ')} · {draft.version}</span></div>}</div>
      </section>}
    </div>
  </div>
}

function OperatorLogin({ onSignedIn }: { onSignedIn: (operator: Operator) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      onSignedIn(await login(String(data.get('email') || ''), String(data.get('password') || '')))
    } catch (caught) {
      setError((caught as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  return <main className="page-width login-page">
    <div className="eyebrow">OPERATOR WORKSPACE</div>
    <h1>Sign in to<br /><i>the pipeline.</i></h1>
    <form className="quote-form login-form" onSubmit={onSubmit}>
      <label>Email<input name="email" type="email" required autoComplete="username" placeholder="operator@example.com" /></label>
      <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
      {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
      <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'} <span>↗</span></button>
    </form>
  </main>
}

function Metric({ label, value, detail, tone, onClick }: { label: string, value: number, detail: string, tone: string, onClick: () => void }) {
  return <button className={`metric metric-button ${tone}`} onClick={onClick} aria-label={`${label}: ${value}. ${detail}`}><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong><small>{detail}</small></button>
}

function RequestAnalytics({ data }: { data: { weekly: { label: string, count: number }[], progressed: number, accepted: number, pipeline: { label: string, count: number }[] } }) {
  const maxWeekly = Math.max(1, ...data.weekly.map((item) => item.count))
  const maxPipeline = Math.max(1, ...data.pipeline.map((item) => item.count))
  return <section className="analytics-panel" aria-labelledby="analytics-title">
    <div className="analytics-heading"><div><div className="eyebrow">RECENT OPERATING SIGNALS</div><h2 id="analytics-title">What is moving.</h2><p>Requests received and progressed over the last 30 days.</p></div><div className="analytics-totals"><span><strong>{data.progressed}</strong> progressed</span><span><strong>{data.accepted}</strong> accepted</span></div></div>
    <div className="analytics-charts">
      <div className="analytics-chart"><div className="chart-label">Requests received <span>30 days</span></div><div className="request-bars">{data.weekly.map((item) => <div className="request-bar-column" key={item.label}><div className="request-bar-track"><span style={{ height: `${Math.max(4, (item.count / maxWeekly) * 100)}%` }} title={`${item.count} requests received`} /></div><small>{item.label}</small><em>{item.count}</em></div>)}</div></div>
      <div className="analytics-chart"><div className="chart-label">Pipeline at a glance <span>current</span></div><div className="pipeline-bars">{data.pipeline.map((item) => <div className="pipeline-bar" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.count / maxPipeline) * 100}%` }} /><em>{item.count}</em></div></div>)}</div></div>
    </div>
  </section>
}

function SortHeader({ label, column, current, onSort }: { label: string, column: string, current: { key: string, direction: 'asc' | 'desc' }, onSort: (column: string) => void }) {
  const active = current.key === column
  return <button className={`sort-header ${active ? 'active' : ''}`} type="button" onClick={() => onSort(column)} aria-label={`Sort by ${label}`} aria-pressed={active}>{label}<span aria-hidden="true">{active ? (current.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span></button>
}

function Status({ status }: { status: RequestStatus }) {
  return <span className={`status ${status.toLowerCase().replace(/ /g, '-')}`}><i />{status}</span>
}

function MvpAcceptanceWorkflow({ lead, onUpdate, onNotice }: { lead: Lead, onUpdate: (lead: Lead, input: Partial<Lead>) => void, onNotice: (message: string) => void }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [assessment, setAssessment] = useState({ type: lead.assessmentType, status: lead.assessmentStatus, confidence: lead.assessmentConfidence, findings: '', measurements: '' })
  const [quote, setQuote] = useState({ scope: lead.scope, inclusions: '', exclusions: '', assumptions: '', amount: '', rateCardVersion: '' })
  const [acceptanceNote, setAcceptanceNote] = useState('')
  const isCommercial = /commercial|office|retail|medical|school|facility/i.test(`${lead.service} ${lead.property}`)

  const load = useCallback(async () => {
    try {
      const next = await getWorkflow(lead.id)
      setWorkflow(next)
      const version = next.quote.versions[0]
      if (version) setQuote({ scope: version.scope || lead.scope, inclusions: version.inclusions || '', exclusions: version.exclusions || '', assumptions: version.assumptions || '', amount: version.amount == null ? '' : String(version.amount), rateCardVersion: version.rate_card_version || '' })
      setError('')
    }
    catch (caught) { setError((caught as ApiError).message) }
  }, [lead.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    setAssessment({ type: lead.assessmentType, status: lead.assessmentStatus, confidence: lead.assessmentConfidence, findings: '', measurements: '' })
    setQuote((current) => ({ ...current, scope: lead.scope }))
  }, [lead.id, lead.updated])

  const save = async (action: () => Promise<unknown>, message: string, leadUpdate?: Partial<Lead>) => {
    setBusy(true); setError('')
    try { await action(); await load(); if (leadUpdate) onUpdate(lead, leadUpdate); setAcceptanceNote(''); setError(''); onNotice(message) }
    catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }

  if (!workflow) return <div className="workflow-block"><span>Loading MVP acceptance workflow...</span>{error && <small>{error}</small>}</div>
  const latestQuote = workflow.quote.versions[0]
  const assessmentReady = assessment.status === 'Complete' || (!isCommercial && assessment.type === 'quick')
  const scopeReady = Boolean(quote.scope.trim() && quote.inclusions.trim() && quote.exclusions.trim() && quote.assumptions.trim())
  const quoteReady = Boolean(latestQuote && latestQuote.rate_card_version)

  return <div className="workflow-suite">
    {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
    <div className="workflow-block">
      <div className="workflow-block-heading"><span>MVP ACCEPTANCE READINESS</span><small>{isCommercial ? 'Commercial assessment required' : 'Residential qualification'}</small></div>
      <div className="mvp-readiness-grid"><span className={assessmentReady ? 'ready' : 'not-ready'}>{assessmentReady ? 'Ready' : 'Needs'} assessment</span><span className={scopeReady ? 'ready' : 'not-ready'}>{scopeReady ? 'Ready' : 'Needs'} scope</span><span className={quoteReady ? 'ready' : 'not-ready'}>{quoteReady ? 'Ready' : 'Needs'} pricing version</span></div>
      <div className="readiness-list"><span className={assessmentReady ? 'ready' : 'not-ready'}><b>{assessmentReady ? '✓' : '!'}</b>{isCommercial ? 'Commercial evidence complete' : 'Assessment path sufficient'}</span><span className={scopeReady ? 'ready' : 'not-ready'}><b>{scopeReady ? '✓' : '!'}</b>Scope and assumptions recorded</span><span className={quoteReady ? 'ready' : 'not-ready'}><b>{quoteReady ? '✓' : '!'}</b>Rate-card version attached</span><span className="not-ready"><b>!</b>Customer decision still needed</span></div>
      <p className="field-help">This MVP ends when the operator has enough evidence, scope, pricing, and customer acceptance to safely accept the job. Scheduling, handoff, delivery, quality, and repeat-service controls are shelved.</p>
    </div>
    <div className="workflow-block">
      <div className="workflow-block-heading"><span>QUALIFICATION AND ASSESSMENT</span><small>{workflow.assessments.length} saved assessment records</small></div>
      <div className="two-col compact-fields"><label>Customer type<select value={isCommercial ? 'commercial' : 'residential'} disabled><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label><label>Assessment path<select value={assessment.type} onChange={(event) => setAssessment((current) => ({ ...current, type: event.target.value as typeof current.type }))}><option value="quick">Quick estimate</option><option value="photos">Customer photos</option><option value="video">Customer video</option><option value="walkthrough">On-site walkthrough</option><option value="formal-survey">Formal survey</option></select></label></div>
      <div className="two-col compact-fields"><label>Status<select value={assessment.status} onChange={(event) => setAssessment((current) => ({ ...current, status: event.target.value }))}><option>Not started</option><option>Requested</option><option>In progress</option><option>Complete</option></select></label><label>Confidence<select value={assessment.confidence} onChange={(event) => setAssessment((current) => ({ ...current, confidence: event.target.value }))}><option>Unassessed</option><option>Low</option><option>Medium</option><option>High</option></select></label></div>
      <label>Findings and evidence<textarea rows={3} value={assessment.findings} onChange={(event) => setAssessment((current) => ({ ...current, findings: event.target.value }))} placeholder="Areas covered, photos/video reviewed, hazards, unknowns, and limitations..." /></label>
      <label>Measurements and operating requirements<textarea rows={2} value={assessment.measurements} onChange={(event) => setAssessment((current) => ({ ...current, measurements: event.target.value }))} placeholder="Square footage, rooms, fixtures, service windows, access, or security requirements..." /></label>
      <button className="button button-quiet workflow-save" disabled={busy} onClick={() => save(() => createAssessment(lead.id, assessment).then(() => undefined), 'Assessment saved.')}>Save assessment</button>
    </div>
    <div className="workflow-block">
      <div className="workflow-block-heading"><span>SCOPE AND QUOTE</span><small>{workflow.quote.status} · v{workflow.quote.current_version}</small></div>
      <label>Included scope<textarea rows={3} value={quote.scope} onChange={(event) => setQuote((current) => ({ ...current, scope: event.target.value }))} placeholder="Areas, tasks, quantities, frequency, and desired outcome..." /></label>
      <div className="two-col compact-fields"><label>Inclusions<textarea rows={2} value={quote.inclusions} onChange={(event) => setQuote((current) => ({ ...current, inclusions: event.target.value }))} /></label><label>Exclusions<textarea rows={2} value={quote.exclusions} onChange={(event) => setQuote((current) => ({ ...current, exclusions: event.target.value }))} /></label></div>
      <div className="two-col compact-fields"><label>Assumptions and preparation<textarea rows={2} value={quote.assumptions} onChange={(event) => setQuote((current) => ({ ...current, assumptions: event.target.value }))} /></label><label>Rate-card version<input value={quote.rateCardVersion} onChange={(event) => setQuote((current) => ({ ...current, rateCardVersion: event.target.value }))} placeholder="e.g. v1.0" /></label></div>
      <label>Firm amount, if known<input type="number" value={quote.amount} onChange={(event) => setQuote((current) => ({ ...current, amount: event.target.value }))} placeholder="Optional; estimate ranges remain valid" /></label>
      <button className="button button-quiet workflow-save" disabled={busy} onClick={() => save(() => createQuoteVersion(lead.id, { ...quote, amount: quote.amount ? Number(quote.amount) : null, pricingSnapshot: lead.estimate }).then(() => undefined), 'Quote version saved.', { quoteStatus: 'Draft' })}>Save quote version</button>
    </div>
    <div className="workflow-block">
      <div className="workflow-block-heading"><span>CUSTOMER DECISION</span><small>Acceptance must reference the saved quote version</small></div>
      <label>Acceptance evidence<textarea rows={2} value={acceptanceNote} onChange={(event) => setAcceptanceNote(event.target.value)} placeholder="Customer name, channel, date, and exact approval or decline statement..." /></label>
      <div className="hero-actions"><button className="button button-quiet" disabled={busy || !acceptanceNote.trim()} onClick={() => save(() => updateQuoteStatus(workflow.quote.id, { status: 'Declined', decisionNote: acceptanceNote }), 'Quote decision recorded.', { quoteStatus: 'Declined' })}>Record declined</button><button className="button button-dark" disabled={busy || !acceptanceNote.trim() || !assessmentReady || !scopeReady || !quoteReady} onClick={() => save(() => updateQuoteStatus(workflow.quote.id, { status: 'Accepted', decisionNote: acceptanceNote }), 'Quote accepted. MVP acceptance is complete.', { status: 'Accepted', quoteStatus: 'Accepted' })}>Record quote acceptance</button></div>
    </div>
  </div>
}

function OperationalWorkflow({ lead, onUpdate }: { lead: Lead, onUpdate: (lead: Lead, input: Partial<Lead>) => void }) {
  const conversationTemplates = {
    'Request photos': 'Could you send a few photos of the main areas, surfaces, and any access constraints? That will help us confirm the scope.',
    'Send quote': 'We have prepared a quote based on the agreed scope and assumptions. Please let us know if you have any questions or changes.',
    'Confirm access': 'Before the scheduled arrival, please confirm the access instructions and any parking, lockbox, alarm, or contact details.',
  }
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [assessment, setAssessment] = useState({ type: lead.assessmentType, status: lead.assessmentStatus, confidence: lead.assessmentConfidence, findings: '', measurements: '' })
  const [quote, setQuote] = useState({ scope: lead.scope, inclusions: '', exclusions: '', assumptions: '', amount: '', notes: '' })
  const [conversation, setConversation] = useState({ channel: 'phone', direction: 'inbound', body: '', template: '' })
  const [followUp, setFollowUp] = useState({ action: '', dueAt: '', note: '' })
  const [schedule, setSchedule] = useState({ requestedWindow: lead.timing, confirmedWindow: '', status: 'Requested', assignedTo: '', accessConfirmed: false, notes: '' })
  const [handoff, setHandoff] = useState({ acceptedScope: lead.scope, exclusions: '', assignedTeam: '', checklist: '' })
  const [variance, setVariance] = useState({ issue: '', evidence: '', priceDelta: '', timeDelta: '' })
  const [quality, setQuality] = useState({ result: 'Pass', issues: '', checklist: '' })
  const [completion, setCompletion] = useState({ customerSignoff: 'Recorded', actualNotes: '', repeatRecommended: false, nextRecommendedDate: '', issueFollowup: '' })

  const load = useCallback(async () => {
    try { setWorkflow(await getWorkflow(lead.id)); setError('') }
    catch (caught) { setError((caught as ApiError).message) }
  }, [lead.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    setAssessment({ type: lead.assessmentType, status: lead.assessmentStatus, confidence: lead.assessmentConfidence, findings: '', measurements: '' })
    setQuote((current) => ({ ...current, scope: lead.scope }))
    setSchedule((current) => ({ ...current, requestedWindow: lead.timing }))
    setHandoff((current) => ({ ...current, acceptedScope: lead.scope }))
  }, [lead.id, lead.updated])

  const run = async (action: () => Promise<unknown>, message: string, leadUpdate?: Partial<Lead>) => {
    setBusy(true); setError('')
    try { await action(); await load(); if (leadUpdate) onUpdate(lead, leadUpdate); setError(''); window.dispatchEvent(new CustomEvent('workflow-notice', { detail: message })) }
    catch (caught) { setError((caught as ApiError).message) }
    finally { setBusy(false) }
  }
  const field = <T extends object>(setter: Dispatch<SetStateAction<T>>, key: keyof T, value: T[keyof T]) => setter((current) => ({ ...current, [key]: value }))
  if (!workflow) return <div className="workflow-block"><span>Loading structured workflow...</span>{error && <small>{error}</small>}</div>

  return <div className="workflow-suite">
    {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
    <div className="workflow-block">
      <div className="workflow-block-heading"><span>ASSESSMENT RECORD</span><small>{workflow.assessments.length} saved</small></div>
      <div className="two-col compact-fields"><label>Path<select value={assessment.type} onChange={(event) => field(setAssessment, 'type', event.target.value)}><option value="quick">Quick estimate</option><option value="photos">Customer photos</option><option value="video">Customer video</option><option value="walkthrough">On-site walkthrough</option><option value="formal-survey">Formal survey</option></select></label><label>Status<select value={assessment.status} onChange={(event) => field(setAssessment, 'status', event.target.value)}><option>Requested</option><option>In progress</option><option>Complete</option></select></label></div>
      <label>Findings<textarea rows={2} value={assessment.findings} onChange={(event) => field(setAssessment, 'findings', event.target.value)} placeholder="Areas, surfaces, access, hazards, evidence gaps..." /></label>
      <label>Measurements<textarea rows={2} value={assessment.measurements} onChange={(event) => field(setAssessment, 'measurements', event.target.value)} placeholder="Rooms, square footage, fixtures, duration assumptions..." /></label>
      <button className="button button-quiet workflow-save" disabled={busy} onClick={() => run(() => createAssessment(lead.id, assessment).then(() => undefined), 'Assessment saved.')}>Save assessment</button>
    </div>

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>QUOTE VERSIONS</span><small>{workflow.quote.status} · v{workflow.quote.current_version}</small></div>
      <div className="two-col compact-fields"><label>Amount<input type="number" value={quote.amount} onChange={(event) => field(setQuote, 'amount', event.target.value)} placeholder="Optional firm amount" /></label><label>Status<select value={workflow.quote.status} onChange={(event) => run(() => updateQuoteStatus(workflow.quote.id, { status: event.target.value }), 'Quote status updated.', { quoteStatus: event.target.value })}><option>Draft</option><option>Sent</option><option>Follow-up due</option><option>Accepted</option><option>Declined</option><option>Expired</option><option>Revised</option></select></label></div>
      <label>Accepted scope<textarea rows={2} value={quote.scope} onChange={(event) => field(setQuote, 'scope', event.target.value)} /></label>
      <div className="two-col compact-fields"><label>Inclusions<textarea rows={2} value={quote.inclusions} onChange={(event) => field(setQuote, 'inclusions', event.target.value)} /></label><label>Exclusions<textarea rows={2} value={quote.exclusions} onChange={(event) => field(setQuote, 'exclusions', event.target.value)} /></label></div>
      <label>Assumptions<textarea rows={2} value={quote.assumptions} onChange={(event) => field(setQuote, 'assumptions', event.target.value)} /></label>
      <button className="button button-quiet workflow-save" disabled={busy} onClick={() => run(() => createQuoteVersion(lead.id, { ...quote, amount: quote.amount ? Number(quote.amount) : null, pricingSnapshot: lead.estimate }).then(() => undefined), 'Quote version saved.')}>Save new quote version</button>
      {workflow.quote.versions.map((item) => <div className="workflow-summary" key={item.id}><strong>Version {item.version}</strong><span>{item.scope || 'No scope recorded'}{item.amount ? ` · $${item.amount}` : ''}</span></div>)}
    </div>

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>CONVERSATION AND FOLLOW-UP</span><small>{workflow.followUps.filter((item) => item.status === 'Open').length} open follow-ups</small></div>
      <div className="two-col compact-fields"><label>Channel<select value={conversation.channel} onChange={(event) => field(setConversation, 'channel', event.target.value)}><option>phone</option><option>email</option><option>sms</option><option>internal</option></select></label><label>Direction<select value={conversation.direction} onChange={(event) => field(setConversation, 'direction', event.target.value)}><option>inbound</option><option>outbound</option><option>internal</option></select></label></div>
      <label>Use a message template<select value={conversation.template} onChange={(event) => setConversation((current) => ({ ...current, template: event.target.value, body: conversationTemplates[event.target.value as keyof typeof conversationTemplates] || current.body }))}><option value="">Start from scratch</option>{Object.keys(conversationTemplates).map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Conversation note<textarea rows={2} value={conversation.body} onChange={(event) => field(setConversation, 'body', event.target.value)} placeholder="Record what the customer said or what was sent." /></label>
      <button className="button button-quiet workflow-save" disabled={busy || !conversation.body.trim()} onClick={() => run(() => addConversation(lead.id, conversation).then(() => undefined), 'Conversation recorded.')}>Record conversation</button>
      <div className="two-col compact-fields"><label>Next action<input value={followUp.action} onChange={(event) => field(setFollowUp, 'action', event.target.value)} placeholder="Send revised quote" /></label><label>Due date<input type="datetime-local" value={followUp.dueAt} onChange={(event) => field(setFollowUp, 'dueAt', event.target.value)} /></label></div>
      <button className="button button-quiet workflow-save" disabled={busy || !followUp.action || !followUp.dueAt} onClick={() => run(() => addFollowUp(lead.id, followUp).then(() => undefined), 'Follow-up added.')}>Add follow-up</button>
      {workflow.followUps.slice(0, 4).map((item) => <div className="workflow-summary" key={item.id}><strong>{item.action}</strong><span>{item.dueAt} · {item.status}{item.status === 'Open' && <button className="text-button" onClick={() => run(() => updateFollowUp(item.id, 'Completed').then(() => undefined), 'Follow-up completed.')}>Complete</button>}</span></div>)}
    </div>

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>SCHEDULE AND FIELD HANDOFF</span><small>{workflow.job ? workflow.job.status : 'No job yet'}</small></div>
      <div className="two-col compact-fields"><label>Requested window<input value={schedule.requestedWindow} onChange={(event) => field(setSchedule, 'requestedWindow', event.target.value)} /></label><label>Confirmed window<input value={schedule.confirmedWindow} onChange={(event) => field(setSchedule, 'confirmedWindow', event.target.value)} placeholder="Not confirmed" /></label></div>
      <div className="two-col compact-fields"><label>Assigned team<input value={schedule.assignedTo} onChange={(event) => field(setSchedule, 'assignedTo', event.target.value)} /></label><label>Status<select value={schedule.status} onChange={(event) => field(setSchedule, 'status', event.target.value)}><option>Requested</option><option>Confirmed</option></select></label></div>
      <label className="checkbox-row"><input type="checkbox" checked={schedule.accessConfirmed} onChange={(event) => field(setSchedule, 'accessConfirmed', event.target.checked)} /> Access confirmed</label>
      <button className="button button-quiet workflow-save" disabled={busy} onClick={() => run(() => saveSchedule(lead.id, schedule).then(() => undefined), 'Schedule saved.', { status: schedule.status === 'Confirmed' ? 'Scheduled' : 'Scheduling' })}>Save schedule</button>
      <label>Accepted scope<textarea rows={2} value={handoff.acceptedScope} onChange={(event) => field(setHandoff, 'acceptedScope', event.target.value)} /></label>
      <div className="two-col compact-fields"><label>Exclusions<textarea rows={2} value={handoff.exclusions} onChange={(event) => field(setHandoff, 'exclusions', event.target.value)} /></label><label>Checklist<textarea rows={2} value={handoff.checklist} onChange={(event) => field(setHandoff, 'checklist', event.target.value)} placeholder="One requirement per line" /></label></div>
      <button className="button button-quiet workflow-save" disabled={busy || !workflow.job} onClick={() => run(() => saveHandoff(lead.id, { ...handoff, checklist: handoff.checklist.split('\n').filter(Boolean) }).then(() => undefined), 'Field handoff saved.')}>Save field handoff</button>
    </div>

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>VARIANCE, QUALITY, COMPLETION</span><small>{workflow.job ? `${workflow.job.variances?.length || 0} variance records` : 'Schedule first'}</small></div>
      <label>Scope variance<textarea rows={2} value={variance.issue} onChange={(event) => field(setVariance, 'issue', event.target.value)} placeholder="What differs from the accepted scope?" /></label>
      <div className="two-col compact-fields"><label>Price delta<input type="number" value={variance.priceDelta} onChange={(event) => field(setVariance, 'priceDelta', event.target.value)} /></label><label>Time delta (minutes)<input type="number" value={variance.timeDelta} onChange={(event) => field(setVariance, 'timeDelta', event.target.value)} /></label></div>
      <button className="button button-quiet workflow-save" disabled={busy || !workflow.job || !variance.issue.trim()} onClick={() => run(() => addVariance(lead.id, { ...variance, priceDelta: Number(variance.priceDelta) || 0, timeDelta: Number(variance.timeDelta) || 0 }).then(() => undefined), 'Variance sent for approval.', { status: 'Needs Approval' })}>Request customer approval</button>
      <label>Quality result<select value={quality.result} onChange={(event) => field(setQuality, 'result', event.target.value)}><option>Pass</option><option>Pending</option><option>Fail</option></select></label>
      <label>Quality notes<textarea rows={2} value={quality.issues} onChange={(event) => field(setQuality, 'issues', event.target.value)} placeholder="Checklist exceptions, rework, evidence..." /></label>
      <button className="button button-quiet workflow-save" disabled={busy || !workflow.job} onClick={() => run(() => saveQuality(lead.id, { ...quality, checklist: quality.checklist.split('\n').filter(Boolean) }).then(() => undefined), 'Quality review saved.', { status: quality.result === 'Pass' ? 'Quality Check' : 'Needs Approval' })}>Save quality review</button>
      <div className="two-col compact-fields"><label>Customer sign-off<select value={completion.customerSignoff} onChange={(event) => field(setCompletion, 'customerSignoff', event.target.value)}><option>Recorded</option><option>Pending</option></select></label><label>Next recommended date<input type="date" value={completion.nextRecommendedDate} onChange={(event) => field(setCompletion, 'nextRecommendedDate', event.target.value)} /></label></div>
      <label className="checkbox-row"><input type="checkbox" checked={completion.repeatRecommended} onChange={(event) => field(setCompletion, 'repeatRecommended', event.target.checked)} /> Recommend repeat service</label>
      <label>Completion notes<textarea rows={2} value={completion.actualNotes} onChange={(event) => field(setCompletion, 'actualNotes', event.target.value)} /></label>
      <button className="button button-dark workflow-save" disabled={busy || !workflow.job || completion.customerSignoff === 'Pending'} onClick={() => run(() => completeJob(lead.id, completion).then(() => undefined), 'Job completed and repeat signal recorded.', { status: 'Completed' })}>Complete job</button>
    </div>
  </div>
}

function LeadDetail({ lead, onAdvance, onUpdate, onNotice }: { lead: Lead, onAdvance: (lead: Lead) => void, onUpdate: (lead: Lead, input: Partial<Lead>) => void, onNotice: (message: string) => void }) {
  const [activityNote, setActivityNote] = useState('')
  const [draft, setDraft] = useState({
    assessmentType: lead.assessmentType,
    assessmentStatus: lead.assessmentStatus,
    assessmentConfidence: lead.assessmentConfidence,
    nextAction: lead.nextAction,
    nextActionDue: lead.nextActionDue,
    nextActionOwner: lead.nextActionOwner,
    accessNotes: lead.accessNotes,
    lastCleaned: lead.lastCleaned,
    customerExpectations: lead.customerExpectations,
    quoteStatus: lead.quoteStatus,
    quoteNotes: lead.quoteNotes,
  })

  useEffect(() => {
    setDraft({
      assessmentType: lead.assessmentType,
      assessmentStatus: lead.assessmentStatus,
      assessmentConfidence: lead.assessmentConfidence,
      nextAction: lead.nextAction,
      nextActionDue: lead.nextActionDue,
      nextActionOwner: lead.nextActionOwner,
      accessNotes: lead.accessNotes,
      lastCleaned: lead.lastCleaned,
      customerExpectations: lead.customerExpectations,
      quoteStatus: lead.quoteStatus,
      quoteNotes: lead.quoteNotes,
    })
  }, [lead.id, lead.updated])

  const setField = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const saveWorkflow = () => {
    onUpdate(lead, { ...draft, activityNote, activityChannel: 'internal' } as Partial<Lead> & { activityNote: string, activityChannel: string })
    setActivityNote('')
  }
  const commercialRequest = /commercial|office|retail|medical|school|facility/i.test(`${lead.service} ${lead.property}`)
  const missing = missingInformationFor(lead).map((item) => item === 'location' ? 'service location' : item === 'scope' ? 'customer scope' : item === 'access' ? 'access details' : item)
  const risk = lead.condition === 'Extreme' || /hazard|bio|mold|damage|post-construction|disaster/i.test(`${lead.scope} ${lead.service}`)
  const recommendation = risk ? 'Pause and clarify risk before pricing' : commercialRequest ? 'Complete a commercial assessment' : lead.status === 'New' ? 'Qualify the request' : lead.assessmentType === 'quick' ? 'Confirm quick-estimate evidence' : 'Complete the selected assessment'
  const mvpTransitions = [lead.status, ...lead.allowedTransitions.filter((status) => status !== lead.status && MVP_STATUSES.has(status))]

  return <div className="lead-detail">
    <div className="detail-top">
      <span className="request-id">{lead.id}<small>{formatTimestamp(lead.created)}</small></span>
      <Status status={lead.status} />
    </div>
    <h2>{lead.customer}</h2>
    <p className="detail-org">{lead.organization}</p>

    <div className="detail-block">
      <span>CONTACT</span>
      <strong><a href={`mailto:${lead.email}`}>{lead.email}</a></strong>
      {lead.phone && <p><a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a></p>}
    </div>

    <div className="detail-block">
      <span>REQUESTED SERVICE</span>
      <strong>{lead.service}</strong>
      <p>{lead.property}{lead.addOns.length > 0 && ` · ${lead.addOns.join(', ')}`}</p>
    </div>

    <div className="detail-block">
      <span>LOCATION</span>
      <strong>{lead.location}</strong>
      <p>Preferred timing: {lead.timing}</p>
    </div>

    <div className="decision-strip" role="region" aria-label="Request decision summary">
      <div className="decision-strip-main"><span className="eyebrow">DO THIS NEXT</span><strong>{recommendation}</strong><p>{commercialRequest ? 'Commercial work needs evidence before a firm quote.' : risk ? 'Do not rely on the illustrative estimate while a risk is unresolved.' : 'Use the checklist below to turn this request into a clear customer decision.'}</p></div>
      <div className="decision-strip-facts"><span><b>Known</b>{lead.scope || 'Basic request details only'}</span><span><b>{missing.length ? 'Still needed' : 'Ready facts'}</b>{missing.length ? missing.join(', ') : 'Core request context recorded'}</span><span className={risk ? 'risk-flag' : ''}><b>{risk ? 'Risk flag' : 'Confidence'}</b>{risk ? 'Review before quote' : lead.assessmentConfidence}</span></div>
    </div>

    <div className="workflow-block next-action-card">
      <div className="workflow-block-heading"><span>NEXT ACTION</span><small>{draft.nextActionDue ? `Due ${draft.nextActionDue}` : 'No due date'}</small></div>
      <label>Opportunity stage<select value={lead.status} onChange={(event) => onUpdate(lead, { status: event.target.value as RequestStatus })}>{mvpTransitions.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Action<input value={draft.nextAction} onChange={(event) => setField('nextAction', event.target.value)} placeholder="Request photos, schedule walkthrough..." /></label>
      <div className="two-col compact-fields"><label>Due date<input type="date" value={draft.nextActionDue} onChange={(event) => setField('nextActionDue', event.target.value)} /></label><label>Owner<input value={draft.nextActionOwner} onChange={(event) => setField('nextActionOwner', event.target.value)} placeholder="Operator or teammate" /></label></div>
      <button className="button button-quiet workflow-save" onClick={saveWorkflow}>Save next action</button>
    </div>

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>ASSESSMENT</span><small>Choose the evidence path before pricing</small></div>
      <label>Assessment path<select value={draft.assessmentType} onChange={(event) => setField('assessmentType', event.target.value)}><option value="quick">Quick estimate</option><option value="photos">Customer photos</option><option value="video">Customer video</option><option value="walkthrough">On-site walkthrough</option><option value="formal-survey">Formal commercial survey</option></select></label>
      <div className="two-col compact-fields"><label>Status<select value={draft.assessmentStatus} onChange={(event) => setField('assessmentStatus', event.target.value)}><option>Not started</option><option>Requested</option><option>In progress</option><option>Complete</option></select></label><label>Confidence<select value={draft.assessmentConfidence} onChange={(event) => setField('assessmentConfidence', event.target.value)}><option>Unassessed</option><option>Low</option><option>Medium</option><option>High</option></select></label></div>
      <label>Last professional clean<input value={draft.lastCleaned} onChange={(event) => setField('lastCleaned', event.target.value)} placeholder="e.g. 3 months ago" /></label>
    </div>

    {lead.scope && <div className="detail-block"><span>CUSTOMER NOTES</span><p>{lead.scope}</p></div>}

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>SCOPE CONTEXT</span><small>What the customer expects and what access requires</small></div>
      <label>Customer expectation<textarea rows={3} value={draft.customerExpectations} onChange={(event) => setField('customerExpectations', event.target.value)} placeholder="What would a great result look like?" /></label>
      <label>Access notes<textarea rows={2} value={draft.accessNotes} onChange={(event) => setField('accessNotes', event.target.value)} placeholder="Keys, lockbox, parking, alarm, contact..." /></label>
    </div>

    <div className="operator-estimate">
      <div><span>ILLUSTRATIVE RANGE</span><strong>{lead.value}</strong></div>
      <p>{lead.estimate ? 'Calculated from the submitted service, size, condition, and location details.' : 'Not enough scope detail to calculate an estimate.'}</p>
      {lead.estimate && <div className="operator-inputs">{lead.estimate.inputs.map((item) => <span key={item}>{item}</span>)}</div>}
    </div>

    <div className="workflow-block">
      <div className="workflow-block-heading"><span>QUOTE PREPARATION</span><small>Separate estimate from customer decision</small></div>
      <label>Quote status<select value={draft.quoteStatus} onChange={(event) => setField('quoteStatus', event.target.value)}><option>Not started</option><option>Draft</option><option>Sent</option><option>Follow-up due</option><option>Accepted</option><option>Declined</option><option>Expired</option><option>Revised</option></select></label>
      <label>Operator quote notes<textarea rows={3} value={draft.quoteNotes} onChange={(event) => setField('quoteNotes', event.target.value)} placeholder="Scope, assumptions, exclusions, or customer objection..." /></label>
      <label>Conversation or follow-up note<textarea rows={2} value={activityNote} onChange={(event) => setActivityNote(event.target.value)} placeholder="What did the customer say, or what should happen next?" /></label>
      <button className="button button-quiet workflow-save" onClick={saveWorkflow}>Save workflow context</button>
    </div>

    <MvpAcceptanceWorkflow lead={lead} onUpdate={onUpdate} onNotice={onNotice} />

    {lead.activity.length > 0 && <div className="activity-list"><div className="eyebrow">RECENT ACTIVITY</div>{lead.activity.slice(0, 5).map((event, index) => <div className="activity-item" key={`${event.created}-${index}`}><strong>{event.type === 'status' ? `${event.fromStatus || 'Created'} → ${event.toStatus}` : event.type}</strong><small>{formatTimestamp(event.created)} · {event.channel}</small>{event.note && <p>{event.note}</p>}</div>)}</div>}

    <div className="detail-actions">
      <span>Move request forward</span>
      <button onClick={() => onAdvance(lead)} disabled={lead.status === 'Completed' || lead.status === 'Accepted'}>
         {lead.status === 'Completed' ? 'Completed' : lead.status === 'Accepted' ? 'Acceptance recorded' : `Next: ${NEXT_LABEL[lead.status] || 'Update request'}`} <span>→</span>
      </button>
    </div>
  </div>
}

export default App
