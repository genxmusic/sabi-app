import type { ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import Login from './pages/Login'
import Quote from './pages/Quote'
import Orders from './pages/Orders'
import Account from './pages/Account'
import Admin from './pages/Admin'
import { SessionGuard } from './lib/sessionGuard'

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className={'logo' + (light ? ' light' : '')} aria-label="Sabi home">
      <b>sab<span className="idot">ı<svg width="13" height="15" viewBox="0 0 13 15"><path d="M6.5 0 13 2.4v5c0 3.6-2.6 6.3-6.5 7.6C2.6 13.7 0 11 0 7.4v-5Z" fill="#F16C21" /><circle cx="6.5" cy="6" r="1.6" fill="#0D3D54" /><path d="M5.8 7h1.4l.4 3H5.4Z" fill="#0D3D54" /></svg></span></b>
      <small>IT &amp; SECURITY SOLUTIONS</small>
    </Link>
  )
}

function RequireSignIn({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const { session, profile, ready } = useApp()
  const loc = useLocation()
  if (!ready) return <div className="band wrap">Loading…</div>
  if (!session) return <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname)} replace />
  if (staff && !profile) return <div className="band wrap">Loading…</div>
  if (staff && profile?.role === 'customer') return <div className="band wrap"><h1>Staff only</h1><p>This page is for Sabi staff.</p></div>
  return <>{children}</>
}

export default function App() {
  const { session, profile, picked, settings } = useApp()
  const isStaff = profile?.role === 'staff' || profile?.role === 'admin'
  return (
    <>
      <SessionGuard />
      <header className="top"><div className="nav">
        <Logo light />
        <nav>
          <NavLink to="/" end>Services</NavLink>
          {session && <NavLink to="/orders">My orders</NavLink>}
          {isStaff && <NavLink to="/admin">Admin</NavLink>}
          {session ? <NavLink to="/account">Account</NavLink> : <NavLink to="/login">Sign in</NavLink>}
        </nav>
        <Link className="btn cartbtn" to="/quote">Get a quote{picked.length > 0 && <span>{picked.length}</span>}</Link>
      </div></header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/quote" element={<Quote />} />
          <Route path="/checkout" element={<Navigate to="/quote" replace />} />
          <Route path="/orders" element={<RequireSignIn><Orders /></RequireSignIn>} />
          <Route path="/account" element={<RequireSignIn><Account /></RequireSignIn>} />
          <Route path="/admin/*" element={<RequireSignIn staff><Admin /></RequireSignIn>} />
          <Route path="*" element={<div className="band wrap"><h1>Page not found</h1><Link to="/">Back to services</Link></div>} />
        </Routes>
      </main>
      <footer className="band foot"><div className="wrap footgrid">
        <div><Logo light /><p>Smart tech. Safe business.<br />Freetown, Sierra Leone</p></div>
        <div>
          {settings?.whatsapp && <p>WhatsApp: <a href={'https://wa.me/' + settings.whatsapp.replace(/\D/g, '')}>+{settings.whatsapp.replace(/\D/g, '')}</a></p>}
          {settings?.email && <p>Email: {settings.email}</p>}
          <p>Wi sabi tech.</p>
          {session && <button className="linkbtn" onClick={() => supabase.auth.signOut()}>Sign out</button>}
        </div>
      </div></footer>
    </>
  )
}
