import { useState } from 'react'
import { postDirect, postRoomChat } from '../api'
import ContactRegistration from './ContactRegistration'
import DirectMessages from './DirectMessages'
import RoomCollabPanel from './RoomCollabPanel'
import WorkTimeline from './WorkTimeline'
import type { CollabState } from '../types'

interface Props {
  collab: CollabState
  onChange: (state: CollabState) => void
  screenshot: { dataUrl: string; roomName: string; note: string } | null
}

export default function CommunityPage({ collab, onChange, screenshot }: Props) {
  const [roomId, setRoomId] = useState('')
  const [roomName, setRoomName] = useState('')
  const [recipient, setRecipient] = useState('')
  const [target, setTarget] = useState<'room' | 'direct'>('room')
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState('')
  let currentPerson = ''
  try { currentPerson = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.id || '' } catch { /* profile is registered in this page */ }
  async function sendScreenshot() {
    if (!screenshot) return
    let me: { id: string; trade: string } | null = null
    try { me = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { /* profile is registered in this page */ }
    if (!me) { setFeedback('Register your contact above before sharing.'); return }
    try {
      const text = message.trim() || screenshot.note || `3D screenshot · ${screenshot.roomName}`
      const next = target === 'room'
        ? await postRoomChat(roomId, text, me.id, me.trade, screenshot.dataUrl)
        : await postDirect(recipient, text, me.id, screenshot.dataUrl)
      onChange(next); setMessage(''); setFeedback('Screenshot shared successfully.')
    } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
  }
  return <main className="community-page">
    <header className="community-heading"><div><h1>Community</h1><p className="sub">Team contacts, room conversations, private messages and the shared work timeline.</p></div><span className="demo-schedule">Demo schedule</span></header>
    <div className="community-grid">
      <div className="community-column">
        <ContactRegistration onRegister={onChange} />
        <DirectMessages collab={collab} onChange={onChange} />
        <section className="collab room-community">
          <h3>Room chat</h3>
          <div className="row"><label>Room ID<input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Select or enter a room ID" /></label><label>Room name<input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Optional display name" /></label></div>
          {roomId && <RoomCollabPanel spaceId={roomId} spaceName={roomName || roomId} role="" collab={collab} onChange={onChange} onHighlightSpace={() => {}} />}
        </section>
      </div>
      <div className="community-column">
        <WorkTimeline collab={collab} onChange={onChange} />
        <section className="collab screenshot-community">
          <h3>Share a 3D screenshot</h3>
          {screenshot ? <><p className="dim small">Screenshot ready · {screenshot.roomName}{screenshot.note && ` · “${screenshot.note}”`}</p><img className="community-screenshot" src={screenshot.dataUrl} alt="Annotated 3D room screenshot" />
            <div className="row"><select value={target} onChange={e => setTarget(e.target.value as 'room' | 'direct')}><option value="room">Room chat</option><option value="direct">Private chat</option></select>
              {target === 'room' ? <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Room ID" /> : <select value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Choose contact…</option>{(collab.people || []).filter(p => p.id !== currentPerson).map(p => <option key={p.id} value={p.id}>{p.name} · {p.trade}</option>)}</select>}</div>
            <div className="row"><input value={message} onChange={e => setMessage(e.target.value)} placeholder={screenshot.note || 'Message with screenshot'} /><button disabled={target === 'room' ? !roomId : !recipient} onClick={sendScreenshot}>Send to chat</button></div>
            {feedback && <p className={feedback.includes('successfully') ? 'dim small' : 'error'}>{feedback}</p>}
          </> : <p className="dim small">Take a screenshot in the 3D view from Ask, then open Community to share it with a note.</p>}
        </section>
      </div>
    </div>
  </main>
}
