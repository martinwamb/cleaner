import { FormEvent, useEffect, useMemo, useState } from 'react'

type View = 'home' | 'services' | 'service-area' | 'about' | 'faqs' | 'request' | 'operations'
type RequestStatus = 'New' | 'Under Review' | 'Quote Sent' | 'Awaiting Customer' | 'Confirmed' | 'Completed' | 'Cancelled'

type Service = {
  id: string
  name: string
  description: string
  buyers: string
  color: string
}

type Estimate = {
  low: number
  high: number
  breakdown: string[]
  inputs: string[]
}

type Lead = {
  id: string
  customer: string
  organization: string
  service: string
  property: string
  location: string
  timing: string
  status: RequestStatus
  priority: 'High' | 'Normal'
  value: string
  estimate?: Estimate
  created: string
}

const services: Service[] = [
  { id: 'turnover', name: 'Apartment turnover', description: 'Reliable reset cleaning between tenants, listings, and occupancy windows.', buyers: 'Property managers and landlords', color: 'sage' },
  { id: 'move', name: 'Move-in / move-out', description: 'A clear reset for the handoff between one resident and the next.', buyers: 'Property owners, managers, and realtors', color: 'gold' },
  { id: 'deep', name: 'Deep cleaning', description: 'A detailed clean for homes, offices, and spaces that need a fresh start.', buyers: 'Owners and business operators', color: 'clay' },
  { id: 'janitorial', name: 'Janitorial and facility care', description: 'Repeatable service that keeps active facilities ready for teams and visitors.', buyers: 'Facility managers and business operators', color: 'ink' },
  { id: 'construction', name: 'Post-construction cleanup', description: 'Dust, debris, and final-detail cleaning to help a project become move-in ready.', buyers: 'Contractors and developers', color: 'gold' },
  { id: 'commercial', name: 'Commercial cleaning', description: 'Consistent recurring service for the spaces your team or customers rely on.', buyers: 'Business owners and operators', color: 'ink' },
  { id: 'disinfection', name: 'Disinfection and sanitation', description: 'Targeted cleaning for spaces that need a higher standard of surface care.', buyers: 'Businesses, property managers, and operators', color: 'sage' },
  { id: 'emergency', name: 'Emergency and disaster cleanup', description: 'Coordinated cleanup after an unexpected event has disrupted a space.', buyers: 'Owners, managers, and operators', color: 'clay' },
  { id: 'cleanroom', name: 'Clean-room cleaning', description: 'Specialty cleaning for controlled environments and strict operating requirements.', buyers: 'Qualified facility operators', color: 'gold' },
  { id: 'carpet', name: 'Carpet and upholstery cleaning', description: 'Focused care for fabric surfaces that need a deeper reset.', buyers: 'Owners, managers, and business operators', color: 'sage' },
  { id: 'detail', name: 'Windows, cabinets, and appliances', description: 'Detail services that complete a turnover, deep clean, or property presentation.', buyers: 'Owners, managers, realtors, and operators', color: 'ink' },
]

// Pricing remains configurable until approved commercial rate cards are entered.
const pricingConfig = {
  'Apartment turnover': { base: 180, sizeRate: 48, minimum: 240, condition: { standard: 1, heavy: 1.25, extreme: 1.5 } },
  'Deep cleaning': { base: 150, sizeRate: 42, minimum: 180, condition: { standard: 1, heavy: 1.25, extreme: 1.5 } },
  'Post-construction cleanup': { base: 280, sizeRate: 0.22, minimum: 450, condition: { standard: 1, heavy: 1.2, extreme: 1.4 } },
  'Commercial cleaning': { base: 220, sizeRate: 0.18, minimum: 280, condition: { standard: 1, heavy: 1.2, extreme: 1.35 } },
} as const

const formatCurrency = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`

function calculateEstimate(service: string, property: string, size: string, condition: string, frequency: string, addOns: string, location: string): Estimate | null {
  const config = pricingConfig[service as keyof typeof pricingConfig]
  if (!config || !size) return null
  const sizeNumber = Number(size)
  if (!Number.isFinite(sizeNumber) || sizeNumber <= 0) return null
  const conditionKey = condition as keyof typeof config.condition
  const multiplier = config.condition[conditionKey] ?? 1
  const isConstruction = service === 'Post-construction cleanup'
  const base = isConstruction ? config.base + sizeNumber * config.sizeRate : config.base + sizeNumber * config.sizeRate
  const addOnTotal = addOns ? addOns.split(', ').reduce((total, item) => total + (item === 'Inside appliances' ? 45 : item === 'Interior windows' ? 35 : item === 'Inside cabinets' ? 55 : 0), 0) : 0
  const travel = location.toLowerCase().includes('minneapolis') || location.toLowerCase().includes('st. louis park') || location.toLowerCase().includes('edina') ? 0 : 35
  const recurringDiscount = frequency === 'Recurring' ? 0.9 : 1
  const total = Math.max(config.minimum, base * multiplier * recurringDiscount + addOnTotal + travel)
  const spread = service === 'Commercial cleaning' || service === 'Post-construction cleanup' ? 0.18 : 0.15
  return {
    low: total * (1 - spread),
    high: total * (1 + spread),
    breakdown: [
      `${formatCurrency(config.base)} base service`,
      `${formatCurrency(sizeNumber * config.sizeRate)} size allowance`,
      condition !== 'Standard' ? `${condition} condition adjustment` : 'Standard condition',
      addOnTotal ? `${formatCurrency(addOnTotal)} selected add-ons` : 'No add-ons',
      travel ? `${formatCurrency(travel)} travel allowance` : 'Local service area',
      frequency === 'Recurring' ? '10% recurring-service adjustment' : 'One-time service',
    ],
    inputs: [`${service}`, `${property}`, `${size} ${isConstruction ? 'sq ft' : 'rooms'}`, `${condition} condition`, `${frequency} service`, location || 'Twin Cities'],
  }
}

const initialLeads: Lead[] = [
  { id: 'REQ-1048', customer: 'Maya Thompson', organization: 'North Loop Properties', service: 'Apartment turnover', property: '12-unit apartment', location: 'Minneapolis, 55401', timing: 'Aug 22-24', status: 'New', priority: 'High', value: '$650-900', estimate: calculateEstimate('Apartment turnover', 'Apartment or multifamily', '12', 'Heavy', 'One-time', '', 'Minneapolis, 55401') ?? undefined, created: 'Today, 9:42 AM' },
  { id: 'REQ-1047', customer: 'Evan Brooks', organization: 'Brooks Construction', service: 'Post-construction cleanup', property: 'Townhome development', location: 'St. Louis Park, 55416', timing: 'Aug 28', status: 'Under Review', priority: 'Normal', value: '$1,200-1,600', estimate: calculateEstimate('Post-construction cleanup', 'Construction project', '4800', 'Heavy', 'One-time', '', 'St. Louis Park, 55416') ?? undefined, created: 'Yesterday' },
  { id: 'REQ-1046', customer: 'Priya Shah', organization: 'Shah & Co.', service: 'Commercial cleaning', property: 'Small office', location: 'Edina, 55424', timing: 'Recurring, weekly', status: 'Quote Sent', priority: 'High', value: '$480/mo', estimate: calculateEstimate('Commercial cleaning', 'Office or commercial space', '1200', 'Standard', 'Recurring', '', 'Edina, 55424') ?? undefined, created: 'Aug 15' },
  { id: 'REQ-1045', customer: 'Marcus Lee', organization: 'Lee Homes', service: 'Deep cleaning', property: 'Single-family home', location: 'Richfield, 55423', timing: 'Aug 20', status: 'Confirmed', priority: 'Normal', value: '$320-450', estimate: calculateEstimate('Deep cleaning', 'Single-family home', '6', 'Standard', 'One-time', '', 'Richfield, 55423') ?? undefined, created: 'Aug 14' },
]

function App() {
  const [view, setView] = useState<View>('home')
  const [requestedService, setRequestedService] = useState('')
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('fieldhouse-leads')
      return saved ? JSON.parse(saved) : initialLeads
    } catch {
      return initialLeads
    }
  })
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    localStorage.setItem('fieldhouse-leads', JSON.stringify(leads))
  }, [leads])

  const openRequest = (service?: string) => {
    setNotice('')
    setRequestedService(service || '')
    setView('request')
  }

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const service = String(data.get('service') || 'Cleaning service')
    const property = String(data.get('property') || 'Property')
    const size = String(data.get('size') || '')
    const condition = String(data.get('condition') || 'Standard')
    const frequency = String(data.get('frequency') || 'One-time')
    const addOns = String(data.get('addOns') || '')
    const location = String(data.get('location') || 'Twin Cities')
    const estimate = calculateEstimate(service, property, size, condition, frequency, addOns, location)
    const newLead: Lead = {
      id: `REQ-${1050 + leads.length}`,
      customer: String(data.get('name') || 'New customer'),
      organization: String(data.get('organization') || 'Independent request'),
      service,
      property,
      location,
      timing: String(data.get('timing') || 'Flexible'),
      status: 'New',
      priority: 'Normal',
      value: estimate ? `${formatCurrency(estimate.low)}-${formatCurrency(estimate.high)}` : 'To be estimated',
      estimate: estimate ?? undefined,
      created: 'Just now',
    }
    setLeads((current) => [newLead, ...current])
    setNotice('Request received. The operator will review the details and follow up with a quote.')
    event.currentTarget.reset()
    setView('request')
  }

  const updateLead = (id: string, status: RequestStatus) => {
    setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, status } : lead))
    setSelectedLead((current) => current ? { ...current, status } : current)
    setNotice(`Request ${id} moved to ${status}.`)
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
           <button className={view === 'about' ? 'active' : ''} onClick={() => setView('about')}>About</button>
           <button className={view === 'faqs' ? 'active' : ''} onClick={() => setView('faqs')}>FAQs</button>
        </nav>
        <div className="topbar-actions">
          <button className="text-button" onClick={() => setView('operations')}>Operator workspace</button>
           <button className="button button-dark compact" onClick={() => openRequest()}>Request a quote <span>↗</span></button>
        </div>
      </header>

      {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}

      {view === 'home' && <Home onRequest={openRequest} onServices={() => setView('services')} />}
      {view === 'services' && <Services onRequest={openRequest} />}
      {view === 'service-area' && <InfoPage eyebrow="SERVICE AREA" title="Local work, clearly scoped." body="We serve customers across Minneapolis and the wider Twin Cities metro. Share the address or neighborhood in your request so the operator can confirm service eligibility and timing." onRequest={openRequest} />}
      {view === 'about' && <InfoPage eyebrow="ABOUT FIELDHOUSE" title="A dependable partner for the spaces that matter." body="Fieldhouse helps owners, managers, operators, realtors, and contractors turn cleaning needs into clear scopes, reliable plans, and repeat work." onRequest={openRequest} />}
      {view === 'faqs' && <FaqPage onRequest={openRequest} />}
      {view === 'request' && <QuoteRequest onSubmit={submitRequest} onBack={() => setView('home')} notice={notice} initialService={requestedService} />}
      {view === 'operations' && <Operations leads={leads} selectedLead={selectedLead} onSelect={setSelectedLead} onUpdate={updateLead} />}

      <footer className="footer"><span>Fieldhouse cleaning platform</span><span>Minneapolis · Twin Cities metro</span><span>Payments handled offline</span></footer>
    </div>
  )
}

function Home({ onRequest, onServices }: { onRequest: () => void, onServices: () => void }) {
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
     <section className="section page-width"><div className="section-heading"><div><div className="eyebrow">FEATURED SERVICES</div><h2>A clean start for<br /><i>different kinds</i> of work.</h2></div><p>From turnovers to active facilities, choose the service that fits the property, project, or operating need. We will review the scope before confirming the work.</p></div><div className="service-grid">{services.slice(0, 3).map((service, index) => <ServiceCard key={service.id} service={service} index={index} onRequest={onRequest} />)}</div><button className="services-link" onClick={onServices}>See all services <span>↗</span></button></section>
    <section className="process-section"><div className="page-width process"><div><div className="eyebrow">HOW IT WORKS</div><h2>From request<br />to <i>ready.</i></h2></div><div className="process-steps"><div><span>01</span><h3>Tell us about the space</h3><p>Share the property, service, and timing. A few useful details help us understand the job.</p></div><div><span>02</span><h3>We review the scope</h3><p>An operator reviews your request and follows up with a clear quote or a clarifying question.</p></div><div><span>03</span><h3>We make a plan</h3><p>Once the scope works for everyone, we confirm the time and get to work.</p></div></div></div></section>
    <section className="closing-cta page-width"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Let's talk about<br /><i>your space.</i></h2></div><button className="button button-light" onClick={onRequest}>Request a quote <span>↗</span></button></section>
  </main>
}

function InfoPage({ eyebrow, title, body, onRequest }: { eyebrow: string, title: string, body: string, onRequest: () => void }) {
  return <main className="page-width inner-page"><div className="eyebrow">{eyebrow}</div><div className="inner-title"><h1>{title}</h1><p>{body}</p></div><button className="button button-dark" onClick={onRequest}>Request a quote <span>↗</span></button></main>
}

function FaqPage({ onRequest }: { onRequest: () => void }) {
  const faqs = [
    ['Is my preferred date confirmed when I submit?', 'No. Your preferred timing is a request. The operator confirms availability before a booking becomes confirmed.'],
    ['How is the estimate used?', 'The estimate range is based on the information you provide. The operator reviews the scope and confirms the final quote.'],
    ['Do you take payment online?', 'No. Payments are handled offline after the scope and booking are confirmed.'],
    ['What if my service or location is unusual?', 'Tell us what you need and where the work is. The operator can review the request and ask a clarifying question.'],
  ]
  return <main className="page-width inner-page"><div className="eyebrow">FREQUENTLY ASKED QUESTIONS</div><div className="inner-title"><h1>Clear answers<br /><i>before you start.</i></h1><p>These answers explain how requests, estimates, timing, and payment work.</p></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><button className="button button-dark" onClick={onRequest}>Request a quote <span>↗</span></button></main>
}

function Services({ onRequest }: { onRequest: (service?: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', 'Property', 'Facility', 'Project', 'Specialty']
  const categoryByService: Record<string, string> = { turnover: 'Property', move: 'Property', deep: 'Property', janitorial: 'Facility', commercial: 'Facility', construction: 'Project', emergency: 'Project', disinfection: 'Specialty', cleanroom: 'Specialty', carpet: 'Specialty', detail: 'Specialty' }
  const visibleServices = services.filter((service) => {
    const matchesCategory = category === 'All' || categoryByService[service.id] === category
    const searchText = `${service.name} ${service.description} ${service.buyers}`.toLowerCase()
    return matchesCategory && searchText.includes(query.toLowerCase().trim())
  })
  return <main className="page-width inner-page"><div className="eyebrow">SERVICE CATALOG</div><div className="inner-title"><h1>Services for<br /><i>the work ahead.</i></h1><p>Practical cleaning services for the properties, facilities, projects, and operating teams that keep work moving.</p></div><div className="catalog-tools"><label>Search services<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by service or need" /></label><label>Filter by work type<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="service-list">{visibleServices.map((service, index) => <ServiceCard key={service.id} service={service} index={index} onRequest={onRequest} large />)}{visibleServices.length === 0 && <p className="empty-catalog">No services match those filters. Try a broader search.</p>}</div></main>
}

function ServiceCard({ service, index, onRequest, large = false }: { service: Service, index: number, onRequest: (service?: string) => void, large?: boolean }) {
  return <article className={`service-card ${service.color} ${large ? 'large' : ''}`}><div className="service-number">0{index + 1}</div><div className="service-card-main"><div><h3>{service.name}</h3><p>{service.description}</p></div><div className="service-bottom"><span>Best for: <strong>{service.buyers}</strong></span><button onClick={() => onRequest(service.name)}>{large ? 'Request for Service' : 'Request a quote'} <span>↗</span></button></div></div><div className="service-icon">{service.id === 'turnover' ? '↻' : service.id === 'deep' ? '✦' : service.id === 'construction' ? '⌂' : '▦'}</div></article>
}

function QuoteRequest({ onSubmit, onBack, notice, initialService }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void, onBack: () => void, notice: string, initialService?: string }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  useEffect(() => {
    if (!initialService) return
    const serviceSelect = document.querySelector<HTMLSelectElement>('select[name="service"]')
    if (serviceSelect) serviceSelect.value = initialService
  }, [initialService])

  const updateEstimate = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget)
    setEstimate(calculateEstimate(String(data.get('service') || ''), String(data.get('property') || ''), String(data.get('size') || ''), String(data.get('condition') || 'Standard'), String(data.get('frequency') || 'One-time'), String(data.get('addOns') || ''), String(data.get('location') || '')))
  }

  return <main className="page-width quote-page"><button className="back-link" onClick={onBack}>← Back to website</button><div className="quote-layout"><div className="quote-intro"><div className="eyebrow">START WITH THE DETAILS</div><h1>Request a<br /><i>quote.</i></h1><p>Tell us enough to understand the space. An operator will review your request and follow up with a quote or a quick question.</p><div className="quote-aside"><span>Good to know</span><p>Preferred dates are requests, not confirmed bookings. We will confirm availability with you.</p></div></div><form className="quote-form" onSubmit={onSubmit} onChange={updateEstimate}><div className="form-section"><span className="form-step">01 / 05</span><h2>What needs cleaning?</h2><label>Service<select name="service" required defaultValue=""><option value="" disabled>Select a working service</option>{services.map((service) => <option key={service.id}>{service.name}</option>)}</select></label><label>Property type<select name="property" required defaultValue=""><option value="" disabled>Choose a property type</option><option>Apartment or multifamily</option><option>Single-family home</option><option>Office or commercial space</option><option>Construction project</option></select></label><div className="two-col"><label>Approx. rooms, units, or sq ft<input name="size" type="number" min="1" required placeholder="e.g. 6" /></label><label>Condition<select name="condition" defaultValue="Standard"><option>Standard</option><option>Heavy</option><option>Extreme</option></select></label></div></div><div className="form-section"><span className="form-step">02 / 05</span><h2>Where is the work?</h2><label>Address or neighborhood<input name="location" required placeholder="e.g. North Loop, Minneapolis" /></label><label>What should we know?<textarea name="scope" placeholder="Surfaces, access notes, special requirements..." rows={3} /></label></div><div className="form-section"><span className="form-step">03 / 05</span><h2>Shape the estimate</h2><label>Service frequency<select name="frequency" defaultValue="One-time"><option>One-time</option><option>Recurring</option></select></label><label>Add-on work<select name="addOns" defaultValue=""><option value="">No add-ons</option><option>Inside appliances</option><option>Interior windows</option><option>Inside cabinets</option></select></label></div><div className="estimate-card">{estimate ? <><div><span className="estimate-label">ILLUSTRATIVE ESTIMATE</span><strong>{formatCurrency(estimate.low)} - {formatCurrency(estimate.high)}</strong><small>Non-binding range based on the details provided.</small></div><div className="estimate-breakdown">{estimate.breakdown.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div></> : <><span className="estimate-label">YOUR ESTIMATE WILL APPEAR HERE</span><p>Choose a service and enter an approximate size to see an illustrative range.</p></>}</div><div className="form-section contact-section"><span className="form-step">04 / 05</span><h2>When would help?</h2><label>Preferred timing<input name="timing" placeholder="e.g. August 22-24, flexible" /></label></div><div className="form-section"><span className="form-step">05 / 05</span><h2>How can we reach you?</h2><div className="two-col"><label>Name<input name="name" required placeholder="Your name" /></label><label>Organization<input name="organization" placeholder="Company or property name" /></label></div><div className="two-col"><label>Email<input name="email" type="email" required placeholder="you@example.com" /></label><label>Phone<input name="phone" placeholder="(612) 555-0148" /></label></div></div><button className="button button-dark submit-button" type="submit">Send request <span>↗</span></button>{notice && <p className="form-success">✓ {notice}</p>}</form></div></main>
}

function Operations({ leads, selectedLead, onSelect, onUpdate }: { leads: Lead[], selectedLead: Lead | null, onSelect: (lead: Lead | null) => void, onUpdate: (id: string, status: RequestStatus) => void }) {
  const counts = useMemo(() => ({ new: leads.filter((lead) => lead.status === 'New').length, quotes: leads.filter((lead) => lead.status === 'Quote Sent').length, confirmed: leads.filter((lead) => lead.status === 'Confirmed').length }), [leads])
  return <main className="ops-page"><div className="ops-header page-width"><div><div className="eyebrow">OPERATOR WORKSPACE <span className="live-dot" /> LOCAL PROTOTYPE</div><h1>Good morning, operator.</h1><p>Here is what needs your attention across the pipeline.</p></div><button className="button button-dark" onClick={() => onSelect(null)}>+ New request</button></div><div className="page-width metric-grid"><Metric label="New requests" value={String(counts.new).padStart(2, '0')} detail="Needs first review" tone="clay" /><Metric label="Quotes to follow up" value={String(counts.quotes).padStart(2, '0')} detail="Waiting on customer" tone="gold" /><Metric label="Confirmed work" value={String(counts.confirmed).padStart(2, '0')} detail="Upcoming bookings" tone="sage" /><Metric label="Repeat customers" value="08" detail="Active relationship" tone="ink" /></div><div className="ops-content page-width"><section className="request-panel"><div className="panel-heading"><div><div className="eyebrow">INBOUND PIPELINE</div><h2>Requests</h2></div><div className="filter-pills"><button className="selected">All <span>{leads.length}</span></button><button>New <span>{counts.new}</span></button><button>Upcoming <span>{counts.confirmed}</span></button></div></div><div className="request-table">{leads.map((lead) => <button className={`request-row ${selectedLead?.id === lead.id ? 'row-selected' : ''}`} key={lead.id} onClick={() => onSelect(lead)}><span className="request-id">{lead.id}<small>{lead.created}</small></span><span className="request-customer"><strong>{lead.customer}</strong><small>{lead.organization}</small></span><span className="request-service"><strong>{lead.service}</strong><small>{lead.property} · {lead.location}</small></span><span className={`priority ${lead.priority.toLowerCase()}`}>{lead.priority}</span><Status status={lead.status} /></button>)}</div></section><aside className="detail-panel">{selectedLead ? <LeadDetail lead={selectedLead} onUpdate={onUpdate} /> : <div className="empty-detail"><div className="empty-icon">↗</div><h3>Select a request</h3><p>Review scope, prepare a quote, and keep the next action moving.</p></div>}</aside></div></main>
}

function Metric({ label, value, detail, tone }: { label: string, value: string, detail: string, tone: string }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function Status({ status }: { status: RequestStatus }) { return <span className={`status ${status.toLowerCase().replace(' ', '-')}`}><i />{status}</span> }
function LeadDetail({ lead, onUpdate }: { lead: Lead, onUpdate: (id: string, status: RequestStatus) => void }) { return <div className="lead-detail"><div className="detail-top"><span className="request-id">{lead.id}<small>{lead.created}</small></span><Status status={lead.status} /></div><h2>{lead.customer}</h2><p className="detail-org">{lead.organization}</p><div className="detail-block"><span>REQUESTED SERVICE</span><strong>{lead.service}</strong><p>{lead.property}</p></div><div className="detail-block"><span>LOCATION</span><strong>{lead.location}</strong><p>Preferred timing: {lead.timing}</p></div><div className="operator-estimate"><div><span>ILLUSTRATIVE RANGE</span><strong>{lead.value}</strong></div><p>{lead.estimate ? 'Calculated from the submitted service, size, condition, and location details.' : 'Add scope details to calculate an estimate.'}</p>{lead.estimate && <div className="operator-inputs">{lead.estimate.inputs.map((input) => <span key={input}>{input}</span>)}</div>}<button>Adjust final quote <span>↗</span></button></div><div className="detail-actions"><span>Move request forward</span><button onClick={() => onUpdate(lead.id, lead.status === 'New' ? 'Under Review' : lead.status === 'Under Review' ? 'Quote Sent' : lead.status === 'Quote Sent' ? 'Confirmed' : 'Completed')}>{lead.status === 'Confirmed' ? 'Mark completed' : 'Next: ' + (lead.status === 'New' ? 'Review request' : lead.status === 'Under Review' ? 'Send quote' : lead.status === 'Quote Sent' ? 'Confirm booking' : 'Complete service')} <span>→</span></button></div><button className="secondary-action">Open customer history <span>↗</span></button></div> }

export default App
