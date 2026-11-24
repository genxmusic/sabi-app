import { useState } from 'react'
import { ORANGE_REFERENCE, payLink } from '../lib/dial'
import { nle, usd, type Settings } from '../lib/supabase'

export type Method = 'orange' | 'afrimoney' | 'card'
export type PayDetails = { method: Method | ''; txn: string; payer: string }

/** Choose a payment method and show how to pay (tap-to-dial mobile money, like SmarTix, or card). */
export function PayBox({ amountUsd, rate, settings, value, onChange }: {
  amountUsd: number; rate: number; settings: Settings | null; value: PayDetails; onChange: (v: PayDetails) => void
}) {
  const [copied, setCopied] = useState(false)
  const { method } = value
  const amountNle = amountUsd * rate
  const code = method === 'orange' ? settings?.orange_code : settings?.afri_code
  const ussd = method === 'orange' ? settings?.orange_ussd : settings?.afri_ussd
  const dial = method && method !== 'card' && code ? payLink(ussd, code, amountNle, method === 'orange' ? ORANGE_REFERENCE : null) : null
  const set = (p: Partial<PayDetails>) => onChange({ ...value, ...p })
  return (
    <div className="form">
      <div className="mgrid" role="radiogroup" aria-label="Payment method">
        {([['orange', 'Orange Money', '#FF7900', 'OM', 'Pay from your Orange Money wallet'], ['afrimoney', 'Afrimoney', '#7B2D8E', 'AM', 'Pay from your Afrimoney wallet'], ['card', 'Debit or credit card', '#1395B9', 'VISA', 'Visa or Mastercard, charged as ' + usd(amountUsd)]] as const)
          .map(([v, n, c, b, sub]) => (
            <label className="m" key={v}><input type="radio" name="method" checked={method === v} onChange={() => set({ method: v, txn: '' })} />
              <span className="badge" style={{ background: c }}>{b}</span><span><b>{n}</b><br /><span className="note">{sub}</span></span></label>))}
      </div>
      {method && method !== 'card' && <div className="box">
        <b>Pay {nle(amountUsd, rate)} with {method === 'orange' ? 'Orange Money' : 'Afrimoney'}</b>
        <p className="note">Paid to Gen X Music (Sabi's parent company), merchant code <b>{code || '…'}</b>. Pay from your own account: agents can't pay a merchant code.</p>
        {dial ? <>
          <a className="btn blue" href={dial.href}>Tap to pay: {dial.code}</a>
          <p className="note">On a computer, or an iPhone that doesn't dial, type <b>{dial.code}</b> on your phone.{' '}
            <button type="button" className="linkbtn" onClick={() => navigator.clipboard?.writeText(dial.code).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy code'}</button></p>
          <ol className="how">{dial.menu && <li>The merchant menu opens. Type:</li>}{dial.steps.map(x => <li key={x}>{x}</li>)}<li>You'll get an SMS with a transaction ID. Enter it below with the number you paid from.</li></ol>
        </> : <p className="note">Mobile money is being set up. Please ask Sabi on WhatsApp.</p>}
        <label className="f"><span className="req">Transaction ID</span><input value={value.txn} onChange={e => set({ txn: e.target.value })} placeholder="From your payment SMS" /></label>
        <label className="f"><span className="req">Number you paid from</span><input type="tel" value={value.payer} onChange={e => set({ payer: e.target.value })} /></label>
      </div>}
      {method === 'card' && <div className="box">
        <b>Pay {usd(amountUsd)} by card</b>
        {settings?.card_link ? <>
          <ol className="how"><li>Open the secure card page.</li><li>Enter <b>{usd(amountUsd)}</b> as the amount and pay.</li><li>Enter the receipt number from your confirmation below.</li></ol>
          <a className="btn blue" href={settings.card_link} target="_blank" rel="noopener noreferrer">Open card payment page</a>
          <label className="f"><span className="req">Card receipt number</span><input value={value.txn} onChange={e => set({ txn: e.target.value })} /></label>
        </> : <p className="note">Card payments are being set up. Please use Orange Money or Afrimoney for now.</p>}
      </div>}
    </div>
  )
}
