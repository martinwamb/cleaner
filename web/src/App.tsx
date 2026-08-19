import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  advanceRequest,
  ApiError,
  getCatalog,
  getEstimate,
  getRequests,
  getSession,
  login,
  logout,
  submitQuote,
  type Catalog,
  type Estimate,
  type Lead,
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

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((error: ApiError) => setCatalogError(error.message))
  }, [])

  const openRequest = (service?: string) => {
    setNotice('')
    setRequestedService(service || '')
    setView('request')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} aria-label="Return to home">
          <span className="brand-mark">fh</span>
          <span><strong>fieldhouse</strong><small>cleaning platform</small></span>
        </button>
        <nav className="public-nav" aria-label="Public navigation">
          <button className={view === 'services' ? 'active' : ''} onClick={() => setView('services')}>Services</button>
          <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>Home</button>
        </nav>
        <div className="topbar-actions">
          <button className="text-button" onClick={() => setView('operations')}>Operator workspace</button>
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

      {view === 'home' && <Home services={catalog?.services ?? []} onRequest={openRequest} onServices={() => setView('services')} />}
      {view === 'services' && <Services services={catalog?.services ?? []} onRequest={openRequest} />}
      {view === 'request' && <QuoteRequest catalog={catalog} onBack={() => setView('home')} initialService={requestedService} />}
      {view === 'operations' && <Operations onNotice={setNotice} />}

      <footer className="footer">
        <span>Fieldhouse is a working prototype.</span>
        <span>Minneapolis · Twin Cities metro</span>
        <span>Payments handled offline</span>
      </footer>
    </div>
  )
}

function Home({ services, onRequest, onServices }: { services: Service[], onRequest: () => void, onServices: () => void }) {
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
      <div className="service-grid">{services.slice(0, 3).map((service, index) => <ServiceCard key={service.id} service={service} index={index} onRequest={onRequest} />)}</div>
      <button className="services-link" onClick={onServices}>See all services <span>↗</span></button>
    </section>
    <section className="process-section"><div className="page-width process"><div><div className="eyebrow">HOW IT WORKS</div><h2>From request<br />to <i>ready.</i></h2></div><div className="process-steps"><div><span>01</span><h3>Tell us about the space</h3><p>Share the property, service, and timing. A few useful details help us understand the job.</p></div><div><span>02</span><h3>We review the scope</h3><p>An operator reviews your request and follows up with a clear quote or a clarifying question.</p></div><div><span>03</span><h3>We make a plan</h3><p>Once the scope works for everyone, we confirm the time and get to work.</p></div></div></div></section>
    <section className="closing-cta page-width"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Let's talk about<br /><i>your space.</i></h2></div><button className="button button-light" onClick={onRequest}>Request a quote <span>↗</span></button></section>
  </main>
}

// Only ids the catalog actually serves. A service with no entry still appears
// under "All"; categories are derived from the services present so a filter
// option can never render an always-empty list.
const CATEGORY_BY_SERVICE: Record<string, string> = {
  turnover: 'Property',
  deep: 'Property',
  commercial: 'Facility',
  construction: 'Project',
}

function Services({ services, onRequest }: { services: Service[], onRequest: (service?: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = useMemo(
    () => ['All', ...new Set(services.map((service) => CATEGORY_BY_SERVICE[service.id]).filter(Boolean))],
    [services],
  )
  const visibleServices = services.filter((service) => {
    const matchesCategory = category === 'All' || CATEGORY_BY_SERVICE[service.id] === category
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
  const icon = service.id === 'turnover' ? '↻' : service.id === 'deep' ? '✦' : service.id === 'construction' ? '⌂' : '▦'
  return <article className={`service-card ${service.color} ${large ? 'large' : ''}`}>
    <div className="service-number">{String(index + 1).padStart(2, '0')}</div>
    <div className="service-card-main">
      <div><h3>{service.name}</h3><p>{service.description}</p></div>
      <div className="service-bottom"><span>Best for: <strong>{service.buyers}</strong></span><button onClick={() => onRequest(service.name)}>{large ? 'Request for Service' : 'Request a quote'} <span>↗</span></button></div>
    </div>
    <div className="service-icon">{icon}</div>
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
        <button className="button button-quiet" onClick={load}>Refresh</button>
        <button className="button button-dark" onClick={signOut}>Sign out</button>
      </div>
    </div>

    {error && <div className="page-width form-errors" role="alert"><p>{error}</p></div>}

    <div className="page-width metric-grid">
      <Metric label="New requests" value={counts.new} detail="Needs first review" tone="clay" />
      <Metric label="Quotes to follow up" value={counts.quotes} detail="Waiting on customer" tone="gold" />
      <Metric label="Confirmed work" value={counts.confirmed} detail="Upcoming bookings" tone="sage" />
      <Metric label="Completed" value={counts.completed} detail="Closed this pipeline" tone="ink" />
    </div>

    <div className="ops-content page-width">
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
    </div>
  </main>
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
