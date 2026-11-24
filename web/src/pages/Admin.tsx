import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useApp } from '../lib/store'
import { CATEGORIES, day, errText, supabase, type Category, type Option, type Order, type OrderStatus, type Profile, type Service, type Settings } from '../lib/supabase'
import { OrderCard } from './Orders'

const FILTERS: [string, OrderStatus[]][] = [
  ['To check', ['payment_submitted']], ['Quotes', ['quote_requested']], ['Active', ['paid', 'in_progress']],
  ['Done', ['completed']], ['Rejected or cancelled', ['rejected', 'cancelled']],
]

function AdminOrders() {
  const [tab, setTab] = useState(0)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [q, setQ] = useState(''); const [err, setErr] = useState('')
  async function load() {
    const { data, error } = await supabase.from('orders').select('*, order_items(*), profiles!orders_customer_id_fkey(full_name, business, email, phone)')
      .in('status', FILTERS[tab][1]).order('created_at', { ascending: false }).limit(200)
    if (error) setErr(errText(error)); setOrders((data ?? []) as Order[])
  }
  useEffect(() => { setOrders(null); load() }, [tab])
  async function act(o: Order, status: OrderStatus) {
    setErr('')
    const { error } = await supabase.rpc('set_order_status', { p_order: o.id, p_status: status, p_note: notes[o.id] || null })
    if (error) setErr(errText(error)); else load()
  }
  const term = q.trim().toLowerCase()
  const shown = (orders ?? []).filter(o => !term || [o.ref, o.txn_id, o.payer_number, o.profiles?.full_name, o.profiles?.business, o.profiles?.phone, o.profiles?.email].some(v => v?.toLowerCase().includes(term)))
  const actions: Partial<Record<OrderStatus, [OrderStatus, string, string?][]>> = {
    payment_submitted: [['paid', 'Payment received'], ['rejected', 'Payment not found', 'ghost']],
    quote_requested: [['in_progress', 'Quote accepted, start work'], ['cancelled', 'Cancel', 'ghost']],
    paid: [['in_progress', 'Start work'], ['completed', 'Mark completed', 'ghost']],
    in_progress: [['completed', 'Mark completed'], ['cancelled', 'Cancel', 'ghost']],
    rejected: [['payment_submitted', 'Check again', 'ghost']],
  }
  return (
    <>
      <div className="chips">{FILTERS.map(([n], i) => <button key={n} className="chip" aria-pressed={tab === i} onClick={() => setTab(i)}>{n}</button>)}</div>
      <label className="f mt">Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Reference, transaction ID, name or phone" /></label>
      {err && <p className="err">{err}</p>}
      {!orders ? <p>Loading…</p> : !shown.length ? <p className="muted">Nothing here.</p> : <div className="stackgap mt">{shown.map(o => (
        <OrderCard key={o.id} o={o}>
          {actions[o.status] && <>
            <label className="f">Note to customer (optional)<input value={notes[o.id] ?? ''} onChange={e => setNotes({ ...notes, [o.id]: e.target.value })} /></label>
            <div className="row">{actions[o.status]!.map(([s, label, cls]) => <button key={s} className={'btn ' + (cls ?? '')} onClick={() => act(o, s)}>{label}</button>)}</div>
          </>}
        </OrderCard>))}</div>}
    </>
  )
}

function AdminServices() {
  const { services, reloadCatalogue } = useApp()
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  async function run(p: PromiseLike<{ error: unknown }>) {
    setErr(''); setMsg('')
    const { error } = await p
    if (error) setErr(errText(error)); else { setMsg('Saved.'); reloadCatalogue() }
  }
  const saveService = (s: Service, patch: Partial<Service>) => run(supabase.from('services').update(patch).eq('id', s.id))
  const saveOption = (o: Option, patch: Partial<Option>) => run(supabase.from('service_options').update(patch).eq('id', o.id))
  const addOption = (s: Service) => run(supabase.from('service_options').insert({ service_id: s.id, name: 'New package', sort: s.service_options.length + 1 }))
  const addService = () => run(supabase.from('services').insert({ category: 'digital', name: 'New service', active: false, sort: (services.at(-1)?.sort ?? 0) + 10 }))
  return (
    <>
      <p className="muted">Prices are in US dollars; customers see leones at the rate in Settings. Changes go live straight away. Hidden services stay on past orders.</p>
      {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      <div className="stackgap">{services.map(s => (
        <article className="ordercard" key={s.id}>
          <div className="grid2">
            <label className="f">Service name<input defaultValue={s.name} onBlur={e => e.target.value !== s.name && saveService(s, { name: e.target.value })} /></label>
            <label className="f">Category<select value={s.category} onChange={e => saveService(s, { category: e.target.value as Category })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className="f">Description<textarea rows={2} defaultValue={s.description ?? ''} onBlur={e => e.target.value !== (s.description ?? '') && saveService(s, { description: e.target.value })} /></label>
          <div className="row">
            <label className="check"><input type="checkbox" checked={s.active} onChange={e => saveService(s, { active: e.target.checked })} /> Shown to customers</label>
            <label className="check"><input type="checkbox" checked={s.per_person} onChange={e => saveService(s, { per_person: e.target.checked })} /> Priced per person (paid in full)</label>
          </div>
          <div className="scroll"><table className="tbl"><thead><tr><th>Package</th><th>Subtitle</th><th>One-off US$</th><th>Monthly US$</th><th>Quote only</th><th>Shown</th></tr></thead>
            <tbody>{s.service_options.map(o => (
              <tr key={o.id}>
                <td><input defaultValue={o.name} onBlur={e => e.target.value !== o.name && saveOption(o, { name: e.target.value })} /></td>
                <td><input defaultValue={o.subtitle ?? ''} onBlur={e => e.target.value !== (o.subtitle ?? '') && saveOption(o, { subtitle: e.target.value })} /></td>
                <td><input type="number" min={0} step="0.01" defaultValue={o.price_usd} onBlur={e => +e.target.value !== Number(o.price_usd) && saveOption(o, { price_usd: +e.target.value })} /></td>
                <td><input type="number" min={0} step="0.01" defaultValue={o.monthly_usd} onBlur={e => +e.target.value !== Number(o.monthly_usd) && saveOption(o, { monthly_usd: +e.target.value })} /></td>
                <td><input type="checkbox" checked={o.is_quote} onChange={e => saveOption(o, { is_quote: e.target.checked })} /></td>
                <td><input type="checkbox" checked={o.active} onChange={e => saveOption(o, { active: e.target.checked })} /></td>
              </tr>))}</tbody></table></div>
          <button className="btn ghost" onClick={() => addOption(s)}>Add a package</button>
        </article>))}</div>
      <button className="btn mt" onClick={addService}>Add a service</button>
    </>
  )
}

function AdminCustomers() {
  const { profile } = useApp()
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [q, setQ] = useState(''); const [who, setWho] = useState(''); const [role, setRole] = useState('staff')
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  const load = () => supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500).then(({ data }) => setRows((data ?? []) as Profile[]))
  useEffect(() => { load() }, [])
  async function setR() {
    setErr(''); setMsg('')
    const { error } = await supabase.rpc('set_role', { p_who: who, p_role: role })
    if (error) setErr(errText(error)); else { setMsg('Done.'); setWho(''); load() }
  }
  const term = q.trim().toLowerCase()
  const shown = (rows ?? []).filter(p => !term || [p.full_name, p.business, p.phone, p.email, p.location].some(v => v?.toLowerCase().includes(term)))
  return (
    <>
      {profile?.role === 'admin' && <div className="box">
        <b>Staff and admins</b><p className="note">Staff can check payments and update orders. Admins can also edit services, settings and roles.</p>
        <div className="row"><input className="grow inp" value={who} onChange={e => setWho(e.target.value)} placeholder="Their email or phone number" />
          <select className="inp" value={role} onChange={e => setRole(e.target.value)}><option value="staff">Staff</option><option value="admin">Admin</option><option value="customer">Customer</option></select>
          <button className="btn" onClick={setR}>Set role</button></div>
        {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      </div>}
      <label className="f mt">Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, business, phone or email" /></label>
      {!rows ? <p>Loading…</p> : <div className="scroll mt"><table className="tbl">
        <thead><tr><th>Name</th><th>Business</th><th>Phone</th><th>Email</th><th>Town</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>{shown.map(p => <tr key={p.id}><td>{p.full_name}</td><td>{p.business}</td><td className="nowrap">{p.phone ? '+' + p.phone.replace(/\D/g, '') : ''}</td><td>{p.email}</td><td>{p.location}</td><td>{p.role}</td><td className="nowrap">{day(p.created_at)}</td></tr>)}</tbody>
      </table><p className="note">{shown.length} accounts</p></div>}
    </>
  )
}

function AdminSettings() {
  const { settings, reloadCatalogue } = useApp()
  const [f, setF] = useState<Settings | null>(settings)
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  useEffect(() => setF(settings), [settings])
  if (!f) return <p>Loading…</p>
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  async function save() {
    setErr(''); setMsg('')
    const { error } = await supabase.from('settings').update({
      nle_per_usd: Number(f!.nle_per_usd), rate_date: f!.rate_date, deposit_pct: Number(f!.deposit_pct),
      whatsapp: f!.whatsapp?.replace(/\D/g, '') || null, email: f!.email?.trim() || null,
      orange_code: f!.orange_code?.trim() || null, afri_code: f!.afri_code?.trim() || null,
      orange_ussd: f!.orange_ussd, afri_ussd: f!.afri_ussd, card_link: f!.card_link?.trim() || null, updated_at: new Date().toISOString(),
    }).eq('id', 1)
    if (error) setErr(errText(error)); else { setMsg('Saved.'); reloadCatalogue() }
  }
  return (
    <div className="form">
      <div className="grid2">
        <label className="f">Leones per US$<input type="number" step="0.01" value={f.nle_per_usd} onChange={set('nle_per_usd')} /></label>
        <label className="f">Rate date<input type="date" value={f.rate_date} onChange={set('rate_date')} /></label>
        <label className="f">Deposit on setup work (%)<input type="number" min={0} max={100} value={f.deposit_pct} onChange={set('deposit_pct')} /></label>
        <label className="f">WhatsApp number (with 232)<input value={f.whatsapp ?? ''} onChange={set('whatsapp')} /></label>
        <label className="f">Email<input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        <label className="f">Orange Money merchant code<input value={f.orange_code ?? ''} onChange={set('orange_code')} /></label>
        <label className="f">Orange Money dial code<input value={f.orange_ussd} onChange={set('orange_ussd')} /></label>
        <label className="f">Afrimoney merchant code<input value={f.afri_code ?? ''} onChange={set('afri_code')} /></label>
        <label className="f">Afrimoney dial code<input value={f.afri_ussd} onChange={set('afri_ussd')} /></label>
      </div>
      <label className="f">Stripe card payment link (customer chooses amount, US$)<input value={f.card_link ?? ''} onChange={set('card_link')} placeholder="https://buy.stripe.com/..." /></label>
      {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      <button className="btn" onClick={save}>Save settings</button>
    </div>
  )
}

export default function Admin() {
  const { profile } = useApp()
  const admin = profile?.role === 'admin'
  return (
    <section className="band"><div className="wrap">
      <h1>Sabi admin</h1>
      <nav className="tabs"><NavLink to="/admin" end>Orders</NavLink><NavLink to="/admin/customers">Customers</NavLink>
        {admin && <NavLink to="/admin/services">Services</NavLink>}{admin && <NavLink to="/admin/settings">Settings</NavLink>}</nav>
      <Routes>
        <Route index element={<AdminOrders />} />
        <Route path="customers" element={<AdminCustomers />} />
        {admin && <Route path="services" element={<AdminServices />} />}
        {admin && <Route path="settings" element={<AdminSettings />} />}
      </Routes>
    </div></section>
  )
}

