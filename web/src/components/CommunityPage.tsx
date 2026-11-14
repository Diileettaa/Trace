import { useCallback, useEffect, useState } from 'react'
import { postDirect, postRoomChat, setRoomStatus } from '../api'
import IfcViewer from '../IfcViewer'
import ContactRegistration from './ContactRegistration'
import DirectMessages from './DirectMessages'
import RoomCollabPanel from './RoomCollabPanel'
import WorkTimeline from './WorkTimeline'
import RoomMediaPanel from './RoomMediaPanel'
import SharedPlanPanel from './SharedPlanPanel'
import DocsLibrary from './DocsLibrary'
import { DatasetBrowser, type CatalogItem } from './DatasetBrowser'
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
  projectName: string
  onSwitchProject: () => void
}

export default function CommunityPage({ collab, onChange, screenshot, onScreenshot, modelPath, drawingPath, onModelPathChange, selectedDocumentId, onAskDocument, projectName, onSwitchProject }: Props) {
  const [roomId, setRoomId] = useState('')
  const [recipient, setRecipient] = useState('')
  const [target, setTarget] = useState<'room' | 'direct'>('room')
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<{ id: string; name: string } | null>(null)
  const [browseModel, setBrowseModel] = useState(false)
  const [mainTab, setMainTab] = useState<'3D' | '2D plan' | 'Files' | 'Schedule'>('3D')
  const [roomTab, setRoomTab] = useState<'Overview' | 'Chat' | 'Photos' | 'Schedule'>('Overview')
  const [dmOpen, setDmOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(() => localStorage.getItem('trace-project-guide-dismissed') === '1' ? -1 : 0)
  let profile: { name?: string; trade?: string } | null = null
  try { profile = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { /* profile is optional until Community */ }
  let currentPerson = ''
  try { currentPerson = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.id || '' } catch { /* profile is registered in Project */ }

  useEffect(() => { if (!profile) setProfileOpen(true) }, [])

  const selectRoom = useCallback((room: { id: string; name: string } | null) => {
    setSelectedRoom(room)
    setRoomId(room?.id || '')
    if (room) setRoomTab('Overview')
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

  return <main className="project-workbench">
    <header className="workbench-header"><div className="workbench-project-title"><button className="workbench-back" onClick={onSwitchProject}>‹ Switch project</button><div><h1>{projectName}</h1><span title={modelPath}>{modelPath.split('/').pop() || 'No model selected'}</span></div></div><div className="workbench-header-actions"><button className="workbench-model-select" onClick={() => setBrowseModel(true)}>Change model</button><button className="workbench-envelope" aria-label="Private messages" onClick={() => setDmOpen(true)}>✉<span>{collab.messages.filter(m => m.thread === 'direct').length || ''}</span></button><button className="workbench-avatar" title="Edit your identity" onClick={() => setProfileOpen(true)}>{profile?.name?.slice(0, 1).toUpperCase() || '?'}</button><span className="workbench-trade">{profile?.trade || 'Set up profile'}</span></div></header>
    <div className="workbench-grid">
      <aside className="workbench-room-tree"><h2>Building</h2>{modelPath ? <><p className="workbench-tree-node">⌄ {modelPath.split('/').pop()}</p><p className="workbench-tree-group">Rooms</p>{selectedRoom ? <button className="workbench-room-node selected" onClick={() => setRoomTab('Overview')}><i className={`room-status-dot ${collab.status[selectedRoom.id]?.status || ''}`} />{selectedRoom.name}<small>{collab.messages.filter(item => item.space_id === selectedRoom.id).length || ''}</small></button> : <p className="workbench-empty">Select a room in the model to see its details here.</p>}</> : <p className="workbench-empty">Choose a model to browse its rooms.</p>}</aside>
      <section className="workbench-center"><nav className="workbench-tabs" aria-label="Project workspace tabs">{(['3D', '2D plan', 'Files', 'Schedule'] as const).map(tab => <button key={tab} className={mainTab === tab ? 'active' : ''} onClick={() => setMainTab(tab)}>{tab}</button>)}</nav>
        {mainTab === '3D' && <>{!modelPath.toLowerCase().endsWith('.ifc') ? <div className="project-model-empty">Choose a 3D model from the project library to load the building.</div> : <div className="workbench-viewport"><IfcViewer path={modelPath} guids={[]} onSelectRoom={selectRoom} onRoomAction={tab => { setRoomTab(tab); if (selectedRoom) setMainTab('3D') }} onScreenshot={(dataUrl, name, note) => onScreenshot(dataUrl, name, note)} /></div>}</>}
        {mainTab === '2D plan' && <SharedPlanPanel drawingPath={drawingPath} modelPath={modelPath} collab={collab} onChange={onChange} onScreenshot={onScreenshot} selectedRoomId={selectedRoom?.id} onRoomSelect={selectRoom} />}
        {mainTab === 'Files' && <section className="workbench-files"><div className="project-section-heading"><div><h2>Project files</h2><p className="sub">Plans, permits and reports</p></div></div><DocsLibrary selectedDocumentId={selectedDocumentId} onAskDocument={onAskDocument} /></section>}
        {mainTab === 'Schedule' && <section className="workbench-schedule"><WorkTimeline collab={collab} onChange={onChange} /></section>}
      </section>
      {selectedRoom && <aside className="workbench-room-card"><div className="workbench-room-title"><div><small>ROOM DETAILS</small><h2>{selectedRoom.name}</h2></div><button aria-label="Close room" onClick={() => selectRoom(null)}>×</button></div><nav className="workbench-tabs room-tabs">{(['Overview', 'Chat', 'Photos', 'Schedule'] as const).map(tab => <button key={tab} className={roomTab === tab ? 'active' : ''} onClick={() => setRoomTab(tab)}>{tab}</button>)}</nav>
        {roomTab === 'Overview' && <div className="workbench-overview"><p><b>Room</b><span>{selectedRoom.name}</span></p><label className="workbench-field"><b>Area m²</b><input type="number" min="0" step="0.1" placeholder="Not available" /></label><label className="workbench-field"><b>Status</b><select value={collab.status[selectedRoom.id]?.status || 'pending'} onChange={event => void setRoomStatus(selectedRoom.id, event.target.value as 'pending' | 'built' | 'missing_wall').then(onChange).catch(error => setFeedback(String(error)))}><option value="pending">Not started / pending</option><option value="built">Built</option><option value="missing_wall">Missing wall</option></select></label><button onClick={() => setRoomTab('Chat')}>Add a room note</button></div>}
        {roomTab === 'Chat' && <RoomCollabPanel spaceId={selectedRoom.id} spaceName={selectedRoom.name} role="" collab={collab} onChange={onChange} onHighlightSpace={() => {}} />}
        {roomTab === 'Photos' && <RoomMediaPanel spaceId={selectedRoom.id} roomName={selectedRoom.name} />}
        {roomTab === 'Schedule' && <WorkTimeline collab={collab} onChange={onChange} />}
      </aside>}
    </div>
    {profileOpen && <div className="workbench-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileOpen(false) }}><section className="workbench-dialog"><button className="workbench-dialog-close" onClick={() => setProfileOpen(false)}>×</button><h2>Your project identity</h2><p>Set your name and trade. Add contact details so teammates can reach you.</p><ContactRegistration compact onRegister={state => { onChange(state); setProfileOpen(false) }} /></section></div>}
    {dmOpen && <><button className="workbench-drawer-shade" aria-label="Close private messages" onClick={() => setDmOpen(false)} /><aside className="workbench-drawer"><header><h2>Private messages</h2><button onClick={() => setDmOpen(false)}>×</button></header><DirectMessages collab={collab} onChange={onChange} /></aside></>}
    {screenshot && <section className="workbench-shot-inbox"><div><b>Screenshot ready · {screenshot.roomName}</b><img src={screenshot.dataUrl} alt="Screenshot ready to share" />{screenshot.note && <small>{screenshot.note}</small>}</div><div className="row"><select value={target} onChange={event => setTarget(event.target.value as 'room' | 'direct')}><option value="room">Room chat</option><option value="direct">Private chat</option></select>{target === 'room' ? <input aria-label="Screenshot room ID" value={roomId} onChange={event => setRoomId(event.target.value)} placeholder="Room ID" /> : <select value={recipient} onChange={event => setRecipient(event.target.value)}><option value="">Choose contact…</option>{(collab.people || []).filter(person => person.id !== currentPerson).map(person => <option key={person.id} value={person.id}>{person.name} · {person.trade}</option>)}</select>}<input value={message} onChange={event => setMessage(event.target.value)} placeholder="Add a note…" /><button disabled={target === 'room' ? !roomId : !recipient} onClick={sendScreenshot}>Send to chat</button></div>{feedback && <p>{feedback}</p>}</section>}
    {guideStep >= 0 && <aside className="project-guide"><button className="project-guide-close" aria-label="Dismiss guide" onClick={() => { localStorage.setItem('trace-project-guide-dismissed','1'); setGuideStep(-1) }}>×</button><small>FIRST VISIT · STEP {guideStep + 1} OF 3</small><h3>{['Choose a room','Review status and photos','Leave a note or book time'][guideStep]}</h3><p>{['Select a room from the 3D model or the floor plan.','The room card shows its status, conversation and attached photos.','Use Chat to leave an update or Schedule to reserve a work slot.'][guideStep]}</p><button className="primary" onClick={() => { if (guideStep === 0) setMainTab('3D'); if (guideStep === 1) setRoomTab('Photos'); if (guideStep === 2) setRoomTab('Chat'); if (guideStep < 2) setGuideStep(guideStep + 1); else { localStorage.setItem('trace-project-guide-dismissed','1'); setGuideStep(-1) } }}>{guideStep < 2 ? 'Next step' : 'Got it'}</button></aside>}
    <DatasetBrowser open={browseModel} kind="3d" onClose={() => setBrowseModel(false)} onSelect={(item: CatalogItem) => { setSelectedRoom(null); setRoomId(''); onModelPathChange(item.path); setBrowseModel(false) }} />
  </main>
}
