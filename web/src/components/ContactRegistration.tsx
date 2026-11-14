import { useEffect, useState, type FormEvent } from 'react'
import { getPeople, registerPerson } from '../api'
import type { CollabPerson } from '../types'

const TRADES = ['architect', 'electrician', 'plumber', 'floor', 'wall', 'owner']
export default function ContactRegistration() {
  const [people, setPeople] = useState<CollabPerson[]>([])
  const [profile, setProfile] = useState<CollabPerson | null>(() => {
    try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { return null }
  })
  const [form, setForm] = useState({ name: '', trade: 'architect', email: '', phone: '' })
  const [error, setError] = useState('')
  useEffect(() => { getPeople().then(setPeople).catch(() => {}) }, [])
  async function save(event: FormEvent) {
    event.preventDefault(); setError('')
    try {
      const saved = await registerPerson(form)
      localStorage.setItem('trace-collab-profile', JSON.stringify(saved)); setProfile(saved)
      setPeople(await getPeople())
    } catch (e) { setError(String(e)) }
  }
  return <section className="collab contact-card">
    <h3>Team contacts</h3>
    {profile ? <div className="small">Signed in as <b>{profile.name}</b> · {profile.trade} <button onClick={() => setProfile(null)}>Edit contact</button></div> : <form onSubmit={save} className="contact-form">
      <label>Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Trade<select value={form.trade} onChange={e => setForm({ ...form, trade: e.target.value })}>{TRADES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label>Phone<input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
      <button className="primary">Register contact</button>{error && <span className="error">{error}</span>}
    </form>}
    <ul className="msgs">{people.map(p => <li key={p.id}><b>{p.name}</b> · {p.trade} · <a href={`mailto:${p.email}`}>{p.email}</a> · {p.phone}</li>)}</ul>
  </section>
}
