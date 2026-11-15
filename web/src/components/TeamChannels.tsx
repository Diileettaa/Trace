import { useEffect, useMemo, useState } from 'react'
import { postRoomChat } from '../api'
import type { CollabState } from '../types'

type Channel = { id: string; label: string; description: string; icon: string }
type ChannelExample = { author: string; role: string; text: string; time: string }

const CHANNELS: Channel[] = [
  { id: 'project-updates', label: 'Project updates', description: 'Construction progress, hand-offs and decisions for everyone.', icon: '●' },
  { id: 'architecture', label: 'Architecture', description: 'Layout, walls, finishes and design coordination.', icon: '⌑' },
  { id: 'structure', label: 'Structure', description: 'Load-bearing work, concrete, steel and site changes.', icon: '▦' },
  { id: 'mep', label: 'MEP & plumbing', description: 'Water, sanitary fixtures, HVAC and routing.', icon: '≈' },
  { id: 'electrical', label: 'Electrical', description: 'Power, lighting, controls and inspection updates.', icon: 'ϟ' },
  { id: 'permits', label: 'Permits & policy', description: 'Government notices, approvals and current requirements.', icon: '▤' },
]

const channelSpaceId = (id: string) => `channel:${id}`
const displayPerson = (state: CollabState, id?: string) => state.people?.find(person => person.id === id)?.name || id || 'Team member'
const EXAMPLES: Record<string, ChannelExample[]> = {
  'project-updates': [
    { author: 'Site lead', role: 'daily log', time: 'Example · 08:15', text: 'MOCK DATA — North stair core wall completed. Electrical sleeve check is booked before the next pour.' },
    { author: 'Project manager', role: 'decision', time: 'Example · 14:30', text: 'MOCK DATA — Level 02 ceiling work moves to Thursday after the plumbing pressure test.' },
  ],
  architecture: [{ author: 'Architect', role: 'design review', time: 'Example · 10:00', text: 'MOCK DATA — Confirm bathroom door swing against the latest floor plan before framing closes.' }],
  structure: [{ author: 'Structural engineer', role: 'site observation', time: 'Example · 11:20', text: 'MOCK DATA — Concrete pour postponed for weather. New pour slot and inspection time must be confirmed in Schedule.' }],
  mep: [{ author: 'Plumbing lead', role: 'coordination', time: 'Example · 09:40', text: 'MOCK DATA — Bathroom 2.01 rough-in is complete; keep the floor finish crew out until the pressure-test record is filed.' }],
  electrical: [{ author: 'Electrical lead', role: 'blocker', time: 'Example · 13:10', text: 'MOCK DATA — Cable route crosses the proposed duct path in Room 3.02. Please resolve before ceiling closure.' }],
  permits: [{ author: 'Permit coordinator', role: 'approval', time: 'Example · 15:00', text: 'MOCK DATA — New fire-egress notice received. Upload the official PDF to Files and assign an owner for review.' }],
}

/** Public, discipline-oriented discussion streams backed by the existing room-message store. */
export default function TeamChannels({ collab, onChange, onOpenFiles }: { collab: CollabState; onChange: (state: CollabState) => void; onOpenFiles: () => void }) {
  const [channelId, setChannelId] = useState(CHANNELS[0].id)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const channel = CHANNELS.find(item => item.id === channelId) || CHANNELS[0]
  const messages = useMemo(() => collab.messages.filter(message => message.space_id === channelSpaceId(channel.id)), [channel.id, collab.messages])
  const examples = EXAMPLES[channel.id] || []

  useEffect(() => { setText(''); setError('') }, [channel.id])

  async function postUpdate() {
    const value = text.trim()
    if (!value) return
    let profile: { id?: string; trade?: string } | null = null
    try { profile = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { /* user can register from the header */ }
    if (!profile?.id) { setError('Set up your name and contact details before posting an update.'); return }
    try {
      onChange(await postRoomChat(channelSpaceId(channel.id), value, profile.id, profile.trade || ''))
      setText('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  return <section className="team-community">
    <aside className="team-channel-list" aria-label="Engineering communication channels">
      <div><small>COMMUNITY</small><h2>Team channels</h2></div>
      {CHANNELS.map(item => <button type="button" key={item.id} className={item.id === channel.id ? 'active' : ''} onClick={() => setChannelId(item.id)}>
        <span className="team-channel-icon" aria-hidden="true">{item.icon}</span><span><b>{item.label}</b><small>{collab.messages.filter(message => message.space_id === channelSpaceId(item.id)).length || ''}</small></span>
      </button>)}
    </aside>
    <div className="team-channel-thread">
      <header><div><small>PUBLIC CHANNEL</small><h2># {channel.label}</h2><p>{channel.description}</p></div><button type="button" className="team-file-button" onClick={onOpenFiles}>Share file or policy ↗</button></header>
      <div className="team-channel-note"><b>Channel guide</b> — post one clear progress update, decision or blocker; keep the approved drawing or policy in <b>Files</b> and link the outcome here. This keeps the latest field context visible without turning chat into a document archive.</div>
      <div className="team-message-list" aria-live="polite">
        {messages.length ? messages.map((message, index) => <article key={message.id || `${message.ts}-${index}`}>
          <div className="team-message-avatar">{displayPerson(collab, message.author).slice(0, 1).toUpperCase()}</div><div><b>{displayPerson(collab, message.author)}</b><small>{message.role || 'team'} · {new Date(message.ts * 1000).toLocaleString()}</small><p>{message.text}</p></div>
        </article>) : examples.map((example, index) => <article className="team-message-example" key={`${channel.id}-${index}`}><div className="team-message-avatar">{example.author.slice(0, 1).toUpperCase()}</div><div><b>{example.author}</b><small>{example.role} · {example.time}</small><p>{example.text}</p></div></article>)}
        {!messages.length && <p className="team-empty">Examples above are illustrative. Post a real completed wall, open issue, policy change or coordination decision when work starts.</p>}
      </div>
      <div className="team-compose"><textarea value={text} onChange={event => setText(event.target.value)} placeholder={`Post an update to # ${channel.label}…`} /><button type="button" onClick={() => void postUpdate()}>Post update</button></div>
      {error && <p className="error">{error}</p>}
    </div>
  </section>
}
