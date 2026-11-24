import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { CATEGORIES, type Category, type Service } from '../lib/supabase'

const ICON: Record<Category, string> = {
  digital: 'M6 8h22v16H6z M12 28h10',
  ai: 'M6 8h22v14H14l-6 5v-5H6z',
  security: 'M17 4 28 8v8c0 7-5 11-11 14C11 27 6 23 6 16V8z',
  support: 'M17 7a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M17 11v6l4 3',
  training: 'M4 12 17 6l13 6-13 6z M10 16v6c4 3 10 3 14 0v-6',
  projects: 'M7 26V16M14 26V10M21 26V18M28 26V7',
}

function ServiceCard({ s }: { s: Service }) {
  const { picked, setPicked } = useApp()
  const nav = useNavigate()
  const on = picked.includes(s.id)
  const toggle = () => setPicked(on ? picked.filter(x => x !== s.id) : [...picked, s.id])
  return (
    <article className={'svc' + (on ? ' picked' : '')}>
      <div className="row"><div className="ic"><svg width="34" height="34" viewBox="0 0 34 34"><path d={ICON[s.category]} fill="none" stroke="#fff" strokeWidth="2.5" /></svg></div><span className="cat">{CATEGORIES[s.category]}</span></div>
      <h3>{s.name}</h3>{s.description && <p className="muted">{s.description}</p>}
      <div className="row mtauto">
        <button className="btn grow" onClick={() => { if (!on) setPicked([...picked, s.id]); nav('/quote') }}>Get a quote</button>
        <label className="check"><input type="checkbox" checked={on} onChange={toggle} /> Add to my request</label>
      </div>
    </article>
  )
}

export default function Home() {
  const { services, picked } = useApp()
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const shown = services.filter(s => s.active && (filter === 'all' || s.category === filter))
  return (
    <>
      <section className="band hero"><div className="wrap">
        <h1>Smart tech. <em>Safe business.</em></h1>
        <p>IT, AI and security for businesses in Sierra Leone. Tell us what you need, get a clear quote, and pay with Orange Money, Afrimoney or card.</p>
        <div className="row"><a className="btn" href="#services">Choose a service</a><a className="btn ghost" href="#how">How it works</a></div>
      </div></section>

      <section className="band" id="services"><div className="wrap">
        <div className="head"><div><h2>Our services</h2><p className="note">Every job is different, so every quote is made for you. Pick one or more services and tell us about your business.</p></div>
          <div className="chips">{(['all', ...Object.keys(CATEGORIES)] as (Category | 'all')[]).map(k => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : CATEGORIES[k]}</button>))}</div>
        </div>
        {!services.length ? <p className="muted">Loading services…</p> : <div className="grid">{shown.map(s => <ServiceCard key={s.id} s={s} />)}</div>}
      </div></section>

      <section className="band soft" id="how"><div className="wrap">
        <h2>How it works</h2>
        <div className="steps">
          <div className="step"><b>1. Tell us what you need</b>Pick a service and answer a few quick questions about your business.</div>
          <div className="step"><b>2. Our assistant checks the details</b>It may ask one or two follow-up questions so nothing is missed.</div>
          <div className="step"><b>3. Get your quote</b>Sabi reviews your request and prepares your quote. You'll see it in My orders.</div>
          <div className="step"><b>4. Accept and pay</b>Pay the deposit with Orange Money, Afrimoney or card, and we book your start date.</div>
        </div>
      </div></section>

      {picked.length > 0 && <div className="bar"><div className="wrap row between">
        <span><b>{picked.length} {picked.length === 1 ? 'service' : 'services'}</b> in your request</span>
        <Link className="btn" to="/quote">Continue</Link></div></div>}
    </>
  )
}
