import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  advanceRequest,
  ApiError,
  createOperatorService,
  getCatalog,
  getEstimate,
  getRequests,
  getOperatorServices,
  getSession,
  login,
  logout,
  pauseOperatorService,
  publishOperatorService,
  previewOperatorService,
  saveOperatorService,
  submitQuote,
  type Catalog,
  type Estimate,
  type Lead,
  type ManagedService,
  type Operator,
  type QuoteInput,
  type QuoteReceipt,
  type RequestStatus,
  type Service,
} from './api'

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

function App() {
  const [view, setView] = useState<View>('home')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestedService, setRequestedService] = useState('')
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

  const navigate = (nextView: View) => {
    scrollPositions.current[view] = window.scrollY
    setView(nextView)
  }

  const openRequest = (service?: string) => {
    setNotice('')
    setRequestedService(service || '')
    navigate('request')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')} aria-label="Return to home">
          <span className="brand-mark">fh</span>
          <span><strong>fieldhouse</strong><small>cleaning platform</small></span>
        </button>
        <nav className="public-nav" aria-label="Public navigation">
          <button className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button>
          <button className={view === 'services' ? 'active' : ''} onClick={() => navigate('services')}>Services</button>
        </nav>
        <div className="topbar-actions">
          <button className="text-button" onClick={() => navigate('operations')}>Operator workspace</button>
          <button className="button button-dark compact" onClick={() => openRequest()}>Request a quote <span>↗</span></button>
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
      {view === 'operations' && <Operations onNotice={setNotice} />}

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
      <div className="service-bottom"><span>Best for: <strong>{service.buyers}</strong></span><button onClick={() => onRequest(service.name)}>Request for Service <span>↗</span></button></div>
    </div>
    <div className="service-icon">{service.icon}</div>
  </article>
}

const emptyQuote: QuoteInput = {
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
    if (!initialService || !catalog?.services.some((service) => service.name === initialService)) return
    setInput((current) => current.service ? current : { ...current, service: initialService })
  }, [catalog, initialService])

  const selectedService = catalog?.services.find((service) => service.name === input.service)
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
            <select name="service" required value={input.service} onChange={(event) => update('service', event.target.value)}>
              <option value="" disabled>Select a working service</option>
              {catalog?.services.map((service) => <option key={service.id}>{service.name}</option>)}
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

const FILTERS = {
  All: () => true,
  New: (lead: Lead) => lead.status === 'New',
  Upcoming: (lead: Lead) => lead.status === 'Confirmed',
  Closed: (lead: Lead) => lead.status === 'Completed',
} satisfies Record<string, (lead: Lead) => boolean>

type FilterKey = keyof typeof FILTERS

const NEXT_LABEL: Record<RequestStatus, string> = {
  New: 'Review request',
  'Under Review': 'Send quote',
  'Quote Sent': 'Confirm booking',
  Confirmed: 'Mark completed',
  Completed: 'Completed',
}

function Operations({ onNotice }: { onNotice: (message: string) => void }) {
  const [operator, setOperator] = useState<Operator | null>(null)
  const [checking, setChecking] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('All')
  const [error, setError] = useState('')
  const [section, setSection] = useState<'requests' | 'services'>('requests')

  const load = useCallback(async () => {
    try {
      setLeads(await getRequests())
      setError('')
    } catch (caught) {
      const apiError = caught as ApiError
      if (apiError.status === 401) setOperator(null)
      else setError(apiError.message)
    }
  }, [])

  useEffect(() => {
    getSession()
      .then((session) => { setOperator(session); return load() })
      .catch(() => setOperator(null))
      .finally(() => setChecking(false))
  }, [load])

  const onSignedIn = async (session: Operator) => {
    setOperator(session)
    await load()
  }

  const signOut = async () => {
    await logout().catch(() => undefined)
    setOperator(null)
    setLeads([])
    setSelectedId(null)
    onNotice('Signed out of the operator workspace.')
  }

  const counts = useMemo(() => ({
    new: leads.filter((lead) => lead.status === 'New').length,
    quotes: leads.filter((lead) => lead.status === 'Quote Sent').length,
    confirmed: leads.filter((lead) => lead.status === 'Confirmed').length,
    completed: leads.filter((lead) => lead.status === 'Completed').length,
  }), [leads])

  const visible = useMemo(() => leads.filter(FILTERS[filter]), [leads, filter])
  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? null

  const onAdvance = async (lead: Lead) => {
    try {
      const updated = await advanceRequest(lead.id)
      setLeads((current) => current.map((item) => item.id === updated.id ? updated : item))
      onNotice(`Request ${updated.id} moved to ${updated.status}.`)
    } catch (caught) {
      setError((caught as ApiError).message)
    }
  }

  if (checking) return <main className="ops-page page-width"><p className="loading-note">Checking your session...</p></main>
  if (!operator) return <OperatorLogin onSignedIn={onSignedIn} />

  return <main className="ops-page">
    <div className="ops-header page-width">
      <div>
        <div className="eyebrow">OPERATOR WORKSPACE <span className="live-dot" /> {operator.name.toUpperCase()}</div>
        <h1>Good morning, operator.</h1>
        <p>Here is what needs your attention across the pipeline.</p>
      </div>
      <div className="hero-actions">
          <button className={`button button-quiet ${section === 'requests' ? 'selected' : ''}`} onClick={() => setSection('requests')}>Requests</button>
          <button className={`button button-quiet ${section === 'services' ? 'selected' : ''}`} onClick={() => setSection('services')}>Services</button>
          <button className="button button-quiet" onClick={load}>Refresh</button>
          <button className="button button-dark" onClick={signOut}>Sign out</button>
        </div>
    </div>

    {error && <div className="page-width form-errors" role="alert"><p>{error}</p></div>}

    {section === 'requests' && <div className="page-width metric-grid">
      <Metric label="New requests" value={counts.new} detail="Needs first review" tone="clay" />
      <Metric label="Quotes to follow up" value={counts.quotes} detail="Waiting on customer" tone="gold" />
      <Metric label="Confirmed work" value={counts.confirmed} detail="Upcoming bookings" tone="sage" />
      <Metric label="Completed" value={counts.completed} detail="Closed this pipeline" tone="ink" />
    </div>}

    {section === 'services'
      ? <ServiceManagement onNotice={onNotice} onUnauthorized={() => setOperator(null)} />
      : <div className="ops-content page-width">
      <section className="request-panel">
        <div className="panel-heading">
          <div><div className="eyebrow">INBOUND PIPELINE</div><h2>Requests</h2></div>
          <div className="filter-pills">
            {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
              <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>
                {key} <span>{leads.filter(FILTERS[key]).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="request-table">
          {visible.length === 0 && <p className="loading-note">No requests in this view yet.</p>}
          {visible.map((lead) => (
            <button className={`request-row ${selectedId === lead.id ? 'row-selected' : ''}`} key={lead.id} onClick={() => setSelectedId(lead.id)}>
              <span className="request-id">{lead.id}<small>{formatTimestamp(lead.created)}</small></span>
              <span className="request-customer"><strong>{lead.customer}</strong><small>{lead.organization}</small></span>
              <span className="request-service"><strong>{lead.service}</strong><small>{lead.property} · {lead.location}</small></span>
              <span className={`priority ${lead.priority.toLowerCase()}`}>{lead.priority}</span>
              <Status status={lead.status} />
            </button>
          ))}
        </div>
      </section>
      <aside className="detail-panel">
        {selectedLead
          ? <LeadDetail lead={selectedLead} onAdvance={onAdvance} />
          : <div className="empty-detail"><div className="empty-icon">↗</div><h3>Select a request</h3><p>Review scope, prepare a quote, and keep the next action moving.</p></div>}
      </aside>
      </div>}
  </main>
}

function ServiceManagement({ onNotice, onUnauthorized }: { onNotice: (message: string) => void, onUnauthorized: () => void }) {
  const [services, setServices] = useState<ManagedService[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ManagedService | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | ManagedService['status']>('All')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ low: number, high: number, breakdown: string[] } | null>(null)
  const [sampleSize, setSampleSize] = useState('4')
  const [sampleCondition, setSampleCondition] = useState('Standard')
  const [sampleFrequency, setSampleFrequency] = useState('One-time')
  const [creating, setCreating] = useState(false)
  const [newService, setNewService] = useState({ id: '', name: '', description: '' })

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
    setPreview(null)
  }, [selectedId, services])

  const visible = services.filter((service) => {
    const matchesStatus = statusFilter === 'All' || service.status === statusFilter
    return matchesStatus && `${service.name} ${service.category} ${service.status}`.toLowerCase().includes(query.toLowerCase().trim())
  })
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
      onNotice(`${saved.name} saved as a draft.`)
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
      const created = await createOperatorService({ ...newService, id, name })
      setServices((current) => [...current, created])
      setSelectedId(created.id)
      setCreating(false)
      setNewService({ id: '', name: '', description: '' })
      onNotice(`${created.name} created as a draft.`)
    } catch (caught) { setError((caught as ApiError).message) }
  }

  const runPreview = async () => {
    if (!draft) return
    try {
      setPreview(await previewOperatorService(draft.id, draft, { size: Number(sampleSize), condition: sampleCondition, frequency: sampleFrequency, addOns: draft.addOnRules.map((item) => item.name).slice(0, 1), location: '55401' }))
      setError('')
    } catch (caught) { setError((caught as ApiError).message) }
  }

  return <div className="service-management page-width">
    <div className="service-management-toolbar">
      <div><div className="eyebrow">WORKING SERVICE CATALOG</div><h2>Services and pricing</h2><p>Draft changes privately, preview the estimate, then publish when the rule is ready.</p></div>
      <div className="hero-actions"><button className="button button-quiet" onClick={load}>Refresh</button><button className="button button-dark" onClick={() => setCreating((current) => !current)}>{creating ? 'Cancel' : 'Add service'} <span>{creating ? '×' : '+'}</span></button></div>
    </div>
    {error && <div className="form-errors" role="alert"><p>{error}</p></div>}
    {creating && <form className="new-service-form" onSubmit={(event) => { event.preventDefault(); create() }}><div><div className="eyebrow">NEW DRAFT SERVICE</div><p>Start with the public identity. Scope and pricing can be completed in the editor before publishing.</p></div><label>Service ID<input required pattern="[a-z0-9-]+" value={newService.id} onChange={(event) => setNewService((current) => ({ ...current, id: event.target.value }))} placeholder="e.g. move-in-cleaning" /></label><label>Service name<input required value={newService.name} onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Move-in cleaning" /></label><label className="span-2">Short description<textarea value={newService.description} onChange={(event) => setNewService((current) => ({ ...current, description: event.target.value }))} /></label><button className="button button-dark" type="submit">Create draft <span>+</span></button></form>}
    <div className="service-management-grid">
      <aside className="service-index">
        <label>Find a service<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services" /></label>
        <div className="service-filter-pills" aria-label="Filter services">
          {(['All', 'Published', 'Draft', 'Paused'] as const).map((filter) => <button key={filter} className={statusFilter === filter ? 'selected' : ''} onClick={() => setStatusFilter(filter)}>{filter}<span>{filter === 'All' ? services.length : services.filter((service) => service.status === filter).length}</span></button>)}
        </div>
        <label className="mobile-service-select">Choose service<select value={selectedId ?? ''} onChange={(event) => setSelectedId(event.target.value)}>{visible.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.status}</option>)}</select></label>
        {visible.map((service) => <button className={`service-index-row ${selectedId === service.id ? 'selected' : ''}`} key={service.id} onClick={() => setSelectedId(service.id)}><span><strong>{service.name}</strong><small>{service.category}</small></span><em className={`catalog-status ${service.status.toLowerCase()}`}>{service.status}</em></button>)}
      </aside>
      {draft && <section className="service-editor">
        <div className="editor-heading"><div><span className={`catalog-status ${draft.status.toLowerCase()}`}>{draft.status}</span><h3>{draft.name}</h3><p>Version {draft.version} · {draft.pricingReadiness}</p></div><div className="editor-actions"><button className="button button-quiet" onClick={save} disabled={busy}>Save draft</button>{draft.status === 'Published' ? <button className="button button-quiet" onClick={pause} disabled={busy}>Pause</button> : <button className="button button-dark" onClick={publish} disabled={busy}>Publish</button>}</div></div>
        <div className="editor-section"><div className="eyebrow">BASICS</div><div className="editor-fields"><label>Service name<input value={draft.name} onChange={(event) => setField('name', event.target.value)} /></label><label>Category<input value={draft.category} onChange={(event) => setField('category', event.target.value)} /></label><label>Card icon<input value={draft.icon} onChange={(event) => setField('icon', event.target.value)} maxLength={2} /></label><label>Featured order<input type="number" min="0" value={draft.featuredOrder} onChange={(event) => setField('featuredOrder', Number(event.target.value))} /></label><label className="toggle-field"><input type="checkbox" checked={draft.featured} onChange={(event) => setField('featured', event.target.checked)} /> Show in featured services</label><label className="span-2">Short description<textarea value={draft.description} onChange={(event) => setField('description', event.target.value)} /></label><label className="span-2">Included scope<textarea value={draft.includedScope} onChange={(event) => setField('includedScope', event.target.value)} /></label><label className="span-2">Exclusions and assumptions<textarea value={draft.exclusions} onChange={(event) => setField('exclusions', event.target.value)} /></label></div></div>
        <div className="editor-section"><div className="eyebrow">PRICING RULE</div><p className="field-help">These fields drive the estimate. Price Low and Price High remain reference ranges; they are not calculation inputs.</p><div className="editor-fields pricing-fields"><label>Pricing model<select value={draft.pricingModel} onChange={(event) => setField('pricingModel', event.target.value)}><option>Flat range</option><option>Per room</option><option>Per square foot</option><option>Per unit</option><option>Hourly</option><option>Custom quote</option></select></label><label>Size input<input value={draft.sizeInputLabel} onChange={(event) => setField('sizeInputLabel', event.target.value)} /></label><label>Base price<input type="number" value={draft.basePrice ?? ''} onChange={(event) => setNumber('basePrice', event.target.value)} /></label><label>Unit rate<input type="number" step="0.01" value={draft.unitRate ?? ''} onChange={(event) => setNumber('unitRate', event.target.value)} /></label><label>Minimum price<input type="number" value={draft.minimumPrice ?? ''} onChange={(event) => setNumber('minimumPrice', event.target.value)} /></label><label>Estimate spread<input type="number" step="0.01" value={draft.estimateSpread ?? ''} onChange={(event) => setNumber('estimateSpread', event.target.value)} /></label><label>Standard multiplier<input type="number" step="0.01" value={draft.standardMultiplier ?? ''} onChange={(event) => setNumber('standardMultiplier', event.target.value)} /></label><label>Heavy multiplier<input type="number" step="0.01" value={draft.heavyMultiplier ?? ''} onChange={(event) => setNumber('heavyMultiplier', event.target.value)} /></label><label>Extreme multiplier<input type="number" step="0.01" value={draft.extremeMultiplier ?? ''} onChange={(event) => setNumber('extremeMultiplier', event.target.value)} /></label><label>Recurring multiplier<input type="number" step="0.01" value={draft.recurringMultiplier ?? ''} onChange={(event) => setNumber('recurringMultiplier', event.target.value)} /></label><label>Travel fee amount<input type="number" value={draft.travelFeeAmount ?? ''} onChange={(event) => setNumber('travelFeeAmount', event.target.value)} /></label><label>Pricing readiness<select value={draft.pricingReadiness} onChange={(event) => setField('pricingReadiness', event.target.value)}><option>Needs operator pricing review</option><option>Ready</option><option>Blocked</option></select></label><label className="span-2">Pricing basis<textarea value={draft.pricingBasis} onChange={(event) => setField('pricingBasis', event.target.value)} /></label><label className="span-2">Change reason<textarea value={draft.changeReason} onChange={(event) => setField('changeReason', event.target.value)} /></label></div></div>
        <div className="editor-section"><div className="eyebrow">ADD-ONS</div><p className="field-help">One rule per line: name | flat or per unit | amount.</p><textarea className="addon-editor" value={draft.addOnRules.map((item) => `${item.name} | ${item.valueType} | ${item.price}`).join('\n')} onChange={(event) => setField('addOnRules', event.target.value.split('\n').filter(Boolean).map((line) => { const [name, valueType, price] = line.split('|').map((part) => part.trim()); return { name, valueType: valueType || 'flat', price: Number(price) || 0 } }))} /> </div>
        <div className="editor-section preview-section"><div><div className="eyebrow">PREVIEW DRAFT</div><p className="field-help">Test the current draft without publishing it.</p></div><div className="preview-controls"><label>Sample size<input type="number" value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} /></label><label>Condition<select value={sampleCondition} onChange={(event) => setSampleCondition(event.target.value)}><option>Standard</option><option>Heavy</option><option>Extreme</option></select></label><label>Frequency<select value={sampleFrequency} onChange={(event) => setSampleFrequency(event.target.value)}><option>One-time</option><option>Recurring</option></select></label><button className="button button-dark" onClick={runPreview}>Preview estimate</button></div>{preview && <div className="preview-result"><strong>${preview.low.toLocaleString()}–${preview.high.toLocaleString()}</strong><span>{preview.breakdown.join(' · ')}</span></div>}</div>
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

function Metric({ label, value, detail, tone }: { label: string, value: number, detail: string, tone: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong><small>{detail}</small></div>
}

function Status({ status }: { status: RequestStatus }) {
  return <span className={`status ${status.toLowerCase().replace(/ /g, '-')}`}><i />{status}</span>
}

function LeadDetail({ lead, onAdvance }: { lead: Lead, onAdvance: (lead: Lead) => void }) {
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

    {lead.scope && <div className="detail-block"><span>CUSTOMER NOTES</span><p>{lead.scope}</p></div>}

    <div className="operator-estimate">
      <div><span>ILLUSTRATIVE RANGE</span><strong>{lead.value}</strong></div>
      <p>{lead.estimate ? 'Calculated from the submitted service, size, condition, and location details.' : 'Not enough scope detail to calculate an estimate.'}</p>
      {lead.estimate && <div className="operator-inputs">{lead.estimate.inputs.map((item) => <span key={item}>{item}</span>)}</div>}
    </div>

    <div className="detail-actions">
      <span>Move request forward</span>
      <button onClick={() => onAdvance(lead)} disabled={lead.status === 'Completed'}>
        {lead.status === 'Completed' ? 'Completed' : `Next: ${NEXT_LABEL[lead.status]}`} <span>→</span>
      </button>
    </div>
  </div>
}

export default App
