import { useState } from 'react'
import { Link } from 'react-router-dom'
import { priceCart, useApp } from '../lib/store'
import { CATEGORIES, nle, type Category, type Option, type Service } from '../lib/supabase'

const ICON: Record<Category, string> = {
  digital: 'M6 8h22v16H6z M12 28h10',
  ai: 'M6 8h22v14H14l-6 5v-5H6z',
  security: 'M17 4 28 8v8c0 7-5 11-11 14C11 27 6 23 6 16V8z',
  support: 'M17 7a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M17 11v6l4 3',
  training: 'M4 12 17 6l13 6-13 6z M10 16v6c4 3 10 3 14 0v-6',
  projects: 'M7 26V16M14 26V10M21 26V18M28 26V7',
}

function priceLabel(o: Option, per: boolean, rate: number) {
  if (o.is_quote) return 'Free quote'
  const a = Number(o.price_usd) ? nle(o.price_usd, rate) + (per ? '/person' : '') : ''
  const m = Number(o.monthly_usd) ? nle(o.monthly_usd, rate) + '/mo' : ''
  return [a, m].filter(Boolean).join(' + ')
}

function ServiceCard({ s, rate }: { s: Service; rate: number }) {
  const { cart, setCart } = useApp()
  const opts = s.service_options.filter(o => o.active)
  const [pick, setPick] = useState(opts[0]?.id)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const allQuote = opts.every(o => o.is_quote)
  function add() {
    if (!pick) return
    const ex = cart.find(l => l.option_id === pick)
    setCart(ex ? cart.map(l => l === ex ? { ...l, qty: s.per_person ? l.qty + qty : 1 } : l) : [...cart, { option_id: pick, qty: s.per_person ? qty : 1 }])
    setAdded(true); setTimeout(() => setAdded(false), 1200)
  }
  return (
    <article className="svc">
      <div className="row"><div className="ic"><svg width="34" height="34" viewBox="0 0 34 34"><path d={ICON[s.category]} fill="none" stroke="#fff" strokeWidth="2.5" /></svg></div><span className="cat">{CATEGORIES[s.category]}</span></div>
      <h3>{s.name}</h3>{s.description && <p className="muted">{s.description}</p>}
      <div className="opts">{opts.map(o => (
        <label key={o.id} className="opt"><input type="radio" name={'o-' + s.id} checked={pick === o.id} onChange={() => setPick(o.id)} />
          <span className="l"><b>{o.name}</b>{o.subtitle && <small>{o.subtitle}</small>}</span><span className="pr">{priceLabel(o, s.per_person, rate)}</span></label>
      ))}</div>
      <div className="row">
        {s.per_person && <label className="qty">People <input type="number" min={1} max={200} value={qty} onChange={e => setQty(Math.max(1, Math.min(200, +e.target.value || 1)))} /></label>}
        <button className="btn grow" onClick={add}>{added ? 'Added ✓' : allQuote ? 'Request a quote' : 'Add to order'}</button>
      </div>
    </article>
  )
}

export default function Home() {
  const { services, settings, cart } = useApp()
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const rate = Number(settings?.nle_per_usd ?? 0)
  const t = priceCart(cart, services, settings?.deposit_pct ?? 50)
  const shown = services.filter(s => s.active && (filter === 'all' || s.category === filter))
  return (
    <>
      <section className="band hero"><div className="wrap">
        <h1>Smart tech. <em>Safe business.</em></h1>
        <p>IT, AI and security for businesses in Sierra Leone. Choose what you need, pay with Orange Money, Afrimoney or card, and we get to work.</p>
        <div className="row"><a className="btn" href="#services">Choose services</a><a className="btn ghost" href="#pay">How payment works</a></div>
      </div></section>

      <section className="band" id="services"><div className="wrap">
        <div className="head"><div><h2>Our services</h2>{rate > 0 && <p className="note">Prices in leones at NLe{rate} to US$1. Card payments are charged in US dollars.</p>}</div>
          <div className="chips">{(['all', ...Object.keys(CATEGORIES)] as (Category | 'all')[]).map(k => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : CATEGORIES[k]}</button>))}</div>
        </div>
        {!services.length ? <p className="muted">Loading services…</p> : <div className="grid">{shown.map(s => <ServiceCard key={s.id} s={s} rate={rate} />)}</div>}
      </div></section>

      <section className="band soft" id="pay"><div className="wrap">
        <h2>How payment works</h2>
        <div className="steps">
          <div className="step"><b>1. Choose</b>Pick your services. Security and big projects start with a free quote.</div>
          <div className="step"><b>2. Sign in</b>Create a free account with your phone number or email.</div>
          <div className="step"><b>3. Pay today's amount</b>Setup work: {settings?.deposit_pct ?? 50}% deposit now, balance when done. Monthly plans: first month in advance.</div>
          <div className="step"><b>4. We confirm</b>Enter your Orange Money, Afrimoney or card transaction ID. Sabi checks it and you see the update in My orders.</div>
        </div>
      </div></section>

      {cart.length > 0 && <div className="bar"><div className="wrap row between">
        <span><b>{cart.length} {cart.length === 1 ? 'item' : 'items'}</b> · Pay today <b>{nle(t.today, rate)}</b></span>
        <Link className="btn" to="/checkout">Review and pay</Link></div></div>}
    </>
  )
}
