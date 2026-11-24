import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store'
import { day, errText, METHOD, nle, STATUS, supabase, type Order } from '../lib/supabase'

export function OrderCard({ o, children }: { o: Order; children?: React.ReactNode }) {
  const r = Number(o.nle_per_usd)
  return (
    <article className="ordercard">
      <div className="row between"><b className="refsm">{o.ref}</b><span className={'status s-' + o.status}>{STATUS[o.status]}</span></div>
      <p className="note">{day(o.created_at)}{o.address ? ' · ' + o.address : ''}</p>
      {o.profiles && <p><b>{o.profiles.full_name || 'No name'}</b>{o.profiles.business ? ' · ' + o.profiles.business : ''}<br /><span className="note">{[o.profiles.phone && '+' + o.profiles.phone.replace(/\D/g, ''), o.profiles.email].filter(Boolean).join(' · ')}</span></p>}
      <ul className="lines">{o.order_items.map(i => <li key={i.id}>{i.service_name}: {i.option_name}{i.qty > 1 ? ' × ' + i.qty : ''}{i.is_quote ? ' (quote)' : ''}</li>)}</ul>
      {Number(o.pay_today_usd) > 0 && <p>Paid today: <b>{nle(o.pay_today_usd, r)}</b> by {o.method ? METHOD[o.method] : ''} · ID <b>{o.txn_id}</b>{o.payer_number ? ' from ' + o.payer_number : ''}
        {Number(o.balance_usd) > 0 && <><br />Balance on completion: {nle(o.balance_usd, r)}</>}
        {Number(o.monthly_usd) > 0 && <><br />Monthly: {nle(o.monthly_usd, r)}</>}</p>}
      {o.notes && <p className="note">Notes: {o.notes}</p>}
      {o.admin_note && <p className="adminnote">Sabi: {o.admin_note}</p>}
      {children}
    </article>
  )
}

export default function Orders() {
  const { session } = useApp()
  const [orders, setOrders] = useState<Order[] | null>(null); const [err, setErr] = useState('')
  useEffect(() => {
    if (!session) return
    supabase.from('orders').select('*, order_items(*)').eq('customer_id', session.user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(errText(error)); setOrders((data ?? []) as Order[]) })
  }, [session])
  return (
    <section className="band"><div className="wrap narrow">
      <h1>My orders</h1>
      {err && <p className="err">{err}</p>}
      {!orders ? <p>Loading…</p> : !orders.length ? <p>No orders yet. <Link to="/">Choose services</Link></p>
        : <div className="stackgap">{orders.map(o => <OrderCard key={o.id} o={o} />)}</div>}
    </div></section>
  )
}
