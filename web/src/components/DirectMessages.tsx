import { useEffect, useMemo, useRef, useState } from 'react'
import { postDirect } from '../api'
import type { CollabState } from '../types'

export default function DirectMessages({ collab, onChange, initialRecipient = '' }: { collab: CollabState; onChange: (state: CollabState) => void; initialRecipient?: string }) {
  const me = useMemo(() => { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') as { id: string } | null } catch { return null } }, [])
  const contacts = (collab.people || []).filter(p => p.id !== me?.id)
  const [recipient, setRecipient] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (initialRecipient) setRecipient(initialRecipient)
  }, [initialRecipient])
  useEffect(() => {
    const open = (event: Event) => { setRecipient((event as CustomEvent<string>).detail); section.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
    window.addEventListener('trace-open-direct', open)
    return () => window.removeEventListener('trace-open-direct', open)
  }, [])
  const messages = collab.messages.filter(m => m.thread === 'direct' && [m.author, m.recipient].includes(me?.id || '') && [m.author, m.recipient].includes(recipient))
  async function send() {
    if (!recipient || !me || !text.trim()) return
    try { onChange(await postDirect(recipient, text, me.id)); setText(''); setError('') } catch (e) { setError(String(e)) }
  }
  return <section className="collab" ref={section}>
    <h3>Private messages</h3>
    <select value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Choose a team contact…</option>{contacts.map(p => <option key={p.id} value={p.id}>{p.name} · {p.trade}</option>)}</select>
    {recipient && <ul className="msgs">{messages.map((m, i) => <li key={m.id || i}><span className="dim">{collab.people?.find(p => p.id === m.author)?.name || m.author} · {new Date(m.ts * 1000).toLocaleString()}</span><br />{m.text}{m.attachment && <img className="chat-attachment" src={m.attachment} alt="Shared screenshot" />}</li>)}</ul>}
    <div className="row"><input value={text} onChange={e => setText(e.target.value)} placeholder="Private message…" /><button disabled={!me || !recipient} onClick={send}>Send</button></div>
    {!me && <p className="dim small">Register your contact above to use private messages.</p>}{error && <p className="error">{error}</p>}
  </section>
}
