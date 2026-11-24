import { useEffect, useRef } from 'react'

/** Cloudflare Turnstile bot check on sign-in (same as SmarTix). Off until VITE_TURNSTILE_SITE_KEY is set in Vercel. */
export const TURNSTILE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''

type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void }
declare global { interface Window { turnstile?: TS } }

let loading: Promise<void> | null = null
function loadScript() {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true; s.onload = () => ok(); s.onerror = () => fail(new Error('Bot check did not load'))
    document.head.appendChild(s)
  })
  return loading
}

/** Shows the check and hands back a one-time token. `resetKey` changes → fresh check. */
export function BotCheck({ onToken, resetKey = 0 }: { onToken: (t: string) => void; resetKey?: number }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!TURNSTILE_KEY || !el.current) return
    let id: string | undefined; let live = true
    loadScript().then(() => {
      if (!live || !el.current || !window.turnstile) return
      id = window.turnstile.render(el.current, {
        sitekey: TURNSTILE_KEY, theme: 'auto', size: 'flexible',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
      })
    }).catch(() => onToken(''))
    return () => { live = false; if (id && window.turnstile) window.turnstile.remove(id) }
  }, [onToken, resetKey])
  if (!TURNSTILE_KEY) return null
  return <div ref={el} style={{ minHeight: 65 }} />
}
