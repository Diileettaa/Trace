import { useEffect, useMemo, useState } from 'react'
import { postRoomChat } from '../api'
import type { CollabState } from '../types'

type Channel = { id: string; label: string; description: string; icon: string }

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

/** Public, discipline-oriented discussion streams backed by the existing room-message store. */
export default function TeamChannels({ collab, onChange, onOpenFiles }: { collab: CollabState; onChange: (state: CollabState) => void; onOpenFiles: () => void }) {
  const [channelId, setChannelId] = useState(CHANNELS[0].id)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const channel = CHANNELS.find(item => item.id === channelId) || CHANNELS[0]
  const messages = useMemo(() => collab.messages.filter(message => message.space_id === channelSpaceId(channel.id)), [channel.id, collab.messages])

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
      <div className="team-channel-note">Upload drawings, government policies, feasibility notes and revised design files in <b>Files</b>; then post the decision or progress update here so every trade sees it.</div>
      <div className="team-message-list" aria-live="polite">
        {messages.length ? messages.map((message, index) => <article key={message.id || `${message.ts}-${index}`}>
          <div className="team-message-avatar">{displayPerson(collab, message.author).slice(0, 1).toUpperCase()}</div><div><b>{displayPerson(collab, message.author)}</b><small>{message.role || 'team'} · {new Date(message.ts * 1000).toLocaleString()}</small><p>{message.text}</p></div>
        </article>) : <p className="team-empty">No updates in this channel yet. Post a completed wall, an open issue, a policy change or a coordination decision.</p>}
      </div>
      <div className="team-compose"><textarea value={text} onChange={event => setText(event.target.value)} placeholder={`Post an update to # ${channel.label}…`} /><button type="button" onClick={() => void postUpdate()}>Post update</button></div>
      {error && <p className="error">{error}</p>}
    </div>
  </section>
}
