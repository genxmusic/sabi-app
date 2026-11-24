/**
 * "Keep me signed in" (same as SmarTix). Ticked: stays signed in until Sign out.
 * Not ticked: signed out after 30 minutes without activity (15 for Sabi staff and admins),
 * or when the browser is closed.
 */
import { useEffect } from 'react'
import { supabase } from './supabase'
import { useApp } from './store'

const KEEP = 'sabi.keep', LAST = 'sabi.lastActive', ALIVE = 'sabi.alive', OUT = 'sabi.timedOut'
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* */ } },
}
const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k) } catch { /* */ } },
}

export const keepSignedIn = () => ls.get(KEEP) !== '0'

/** Called when the code is asked for and when it is typed */
export function startSignIn(keep: boolean) { ls.set(KEEP, keep ? '1' : '0'); ls.set(LAST, String(Date.now())); ss.set(ALIVE, '1') }

/** Shown once on the sign-in page after an automatic sign-out */
export function takeSignOutReason() { const r = ls.get(OUT); ls.del(OUT); return r }

// Arriving from the sign-in email link counts as this browser session's start
if (typeof location !== 'undefined' && (/access_token=|type=magiclink/.test(location.hash) || /[?&](code|token_hash)=/.test(location.search))) {
  ss.set(ALIVE, '1'); ls.set(LAST, String(Date.now()))
}

const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sabi-session') : null
channel?.addEventListener('message', e => { if (e.data === 'ping' && ss.get(ALIVE)) channel.postMessage('pong') })

async function endSession(reason: string) {
  ss.del(ALIVE); ls.set(OUT, reason)
  await supabase.auth.signOut({ scope: 'local' })
}

/** Mounted once in the app */
export function SessionGuard() {
  const { session, profile } = useApp()
  const minutes = profile && profile.role !== 'customer' ? 15 : 30

  // New browser session without "Keep me signed in" = the browser was closed. Another open tab answers the ping.
  useEffect(() => {
    if (!session || keepSignedIn() || ss.get(ALIVE)) return
    let answered = false
    const hear = (e: MessageEvent) => { if (e.data === 'pong') answered = true }
    channel?.addEventListener('message', hear); channel?.postMessage('ping')
    const t = setTimeout(() => { channel?.removeEventListener('message', hear); if (answered) ss.set(ALIVE, '1'); else endSession('closed') }, 400)
    return () => { clearTimeout(t); channel?.removeEventListener('message', hear) }
  }, [session])

  // Inactivity: any tap, key, scroll or return to the page counts as activity
  useEffect(() => {
    if (!session || keepSignedIn()) return
    const limit = minutes * 60_000
    let lastWrite = 0
    const check = () => { const last = Number(ls.get(LAST) || 0); if (last && Date.now() - last > limit) endSession(String(minutes)) }
    const active = () => {
      if (document.visibilityState === 'hidden') return
      check()
      const now = Date.now(); if (now - lastWrite > 15_000) { lastWrite = now; ls.set(LAST, String(now)) }
    }
    if (!ls.get(LAST)) ls.set(LAST, String(Date.now()))
    check()
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach(ev => window.addEventListener(ev, active, { passive: true }))
    document.addEventListener('visibilitychange', active)
    const timer = setInterval(check, 20_000)
    return () => { events.forEach(ev => window.removeEventListener(ev, active)); document.removeEventListener('visibilitychange', active); clearInterval(timer) }
  }, [session, minutes])

  return null
}
