import { useCallback, useEffect, useState } from 'react'
import { postDirect, postRoomChat } from '../api'
import IfcViewer from '../IfcViewer'
import ContactRegistration from './ContactRegistration'
import DirectMessages from './DirectMessages'
import RoomCollabPanel from './RoomCollabPanel'
import WorkTimeline from './WorkTimeline'
import RoomMediaPanel from './RoomMediaPanel'
import SharedPlanPanel from './SharedPlanPanel'
import DocsLibrary from './DocsLibrary'
import type { CollabState } from '../types'
import type { ProjectDocument } from '../api'

interface Props {
  collab: CollabState
  onChange: (state: CollabState) => void
  screenshot: { dataUrl: string; roomName: string; note: string } | null
  onScreenshot: (dataUrl: string, roomName: string, note: string) => void
  modelPath: string
  drawingPath: string
  onModelPathChange: (path: string) => void
  selectedDocumentId: number | null
  onAskDocument: (document: ProjectDocument) => void
}

export default function CommunityPage({ collab, onChange, screenshot, onScreenshot, modelPath, drawingPath, onModelPathChange, selectedDocumentId, onAskDocument }: Props) {
  const [roomId, setRoomId] = useState('')
  const [roomName, setRoomName] = useState('')
  const [recipient, setRecipient] = useState('')
  const [target, setTarget] = useState<'room' | 'direct'>('room')
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState('')
  const [modelDraft, setModelDraft] = useState(modelPath.toLowerCase().endsWith('.ifc') ? modelPath : '')
  const [selectedRoom, setSelectedRoom] = useState<{ id: string; name: string } | null>(null)
  let currentPerson = ''
  try { currentPerson = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.id || '' } catch { /* profile is registered in Project */ }

  useEffect(() => {
    if (modelPath.toLowerCase().endsWith('.ifc')) setModelDraft(modelPath)
  }, [modelPath])

  const selectRoom = useCallback((room: { id: string; name: string } | null) => {
    setSelectedRoom(room)
    setRoomId(room?.id || '')
    setRoomName(room?.name || '')
  }, [])

  async function sendScreenshot() {
    if (!screenshot) return
    let me: { id: string; trade: string } | null = null
    try { me = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { /* profile is registered in Project */ }
    if (!me) { setFeedback('Register your contact above before sharing.'); return }
    try {
      const text = message.trim() || screenshot.note || `3D screenshot · ${screenshot.roomName}`
      const next = target === 'room'
        ? await postRoomChat(roomId, text, me.id, me.trade, screenshot.dataUrl)
        : await postDirect(recipient, text, me.id, screenshot.dataUrl)
      onChange(next); setMessage(''); setFeedback('Screenshot shared successfully.')
    } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
  }

  return <main className="project-page">
    <header className="community-heading"><div><h1>Project</h1><p className="sub">A shared place for the model, team conversations and project files.</p></div><span className="demo-schedule">Demo project</span></header>
    <div className="project-grid">
      <SharedPlanPanel drawingPath={drawingPath} modelPath={modelPath} collab={collab} onChange={onChange} onScreenshot={onScreenshot} />
      <section className="project-section shared-model-section">
        <div className="project-section-heading"><div><h2>Shared 3D model</h2><p className="sub">Select a room in the model to start its conversation.</p></div></div>
        <div className="row project-model-picker">
          <input aria-label="Shared IFC model path" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} placeholder="data/ifc_models/model.ifc" />
          <button className="primary" disabled={!modelDraft.trim().toLowerCase().endsWith('.ifc')} onClick={() => {
            setSelectedRoom(null); setRoomId(''); setRoomName(''); onModelPathChange(modelDraft.trim())
          }}>Load model</button>
        </div>
        {modelPath.toLowerCase().endsWith('.ifc') ? <div className="project-shared-layout">
          <div className="project-model-viewer"><IfcViewer path={modelPath} guids={[]} onSelectRoom={selectRoom}
            onScreenshot={(dataUrl, name, note) => onScreenshot(dataUrl, name, note)} /></div>
          {selectedRoom ? <RoomMediaPanel spaceId={selectedRoom.id} roomName={selectedRoom.name} />
            : <aside className="room-media-sidebar room-media-empty">Select a room in the model to view its notes and media.</aside>}
        </div> : <div className="project-model-empty">Load an IFC model path to share an interactive room view with the team.</div>}
      </section>

      <div className="project-side">
        <section className="project-section communication-section">
          <div className="project-section-heading"><div><h2>Communication</h2><p className="sub">Contacts, room chat, private messages and the shared timeline.</p></div></div>
          <ContactRegistration onRegister={onChange} />
          <div className="project-communication-grid">
            <DirectMessages collab={collab} onChange={onChange} />
            <section className="collab room-community">
              <h3>Room chat{roomName ? ` · ${roomName}` : ''}</h3>
              {roomId ? <RoomCollabPanel spaceId={roomId} spaceName={roomName || roomId} role="" collab={collab} onChange={onChange} onHighlightSpace={() => {}} />
                : <p className="dim small">Select a room in the shared model to open its chat.</p>}
            </section>
            <WorkTimeline collab={collab} onChange={onChange} />
            <section className="collab screenshot-community">
              <h3>Share a 3D screenshot</h3>
              {screenshot ? <><p className="dim small">Screenshot ready · {screenshot.roomName}{screenshot.note && ` · “${screenshot.note}”`}</p><img className="community-screenshot" src={screenshot.dataUrl} alt="Annotated 3D room screenshot" />
                <div className="row"><select value={target} onChange={event => setTarget(event.target.value as 'room' | 'direct')}><option value="room">Room chat</option><option value="direct">Private chat</option></select>
                  {target === 'room' ? <input aria-label="Screenshot room ID" value={roomId} onChange={event => setRoomId(event.target.value)} placeholder="Room ID" /> : <select value={recipient} onChange={event => setRecipient(event.target.value)}><option value="">Choose contact…</option>{(collab.people || []).filter(person => person.id !== currentPerson).map(person => <option key={person.id} value={person.id}>{person.name} · {person.trade}</option>)}</select>}</div>
                <div className="row"><input value={message} onChange={event => setMessage(event.target.value)} placeholder={screenshot.note || 'Message with screenshot'} /><button disabled={target === 'room' ? !roomId : !recipient} onClick={sendScreenshot}>Send to chat</button></div>
                {feedback && <p className={feedback.includes('successfully') ? 'dim small' : 'error'}>{feedback}</p>}
              </> : <p className="dim small">Take a screenshot in the 3D view from Ask or Project, then share it with a note.</p>}
            </section>
          </div>
        </section>

      </div>
    </div>
    <section className="project-section project-files-section">
      <div className="project-section-heading"><div><h2>Shared files</h2><p className="sub">Project drawings, permits and reports</p></div></div>
      <DocsLibrary selectedDocumentId={selectedDocumentId} onAskDocument={onAskDocument} />
    </section>
  </main>
}
