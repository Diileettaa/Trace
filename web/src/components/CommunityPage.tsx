import { useCallback, useEffect, useState } from 'react'
import {
  checkWorkflow,
  getBudget,
  getNotifications,
  getScene,
  markNotificationRead,
  postDirect,
  postRoomChat,
  setRoomStatus,
  type BudgetSummary,
  type ScenePlacement,
  type TradeNotification,
} from '../api'
import IfcViewer from '../IfcViewer'
import ContactRegistration from './ContactRegistration'
import DirectMessages from './DirectMessages'
import RoomCollabPanel from './RoomCollabPanel'
import WorkTimeline from './WorkTimeline'
import RoomMediaPanel from './RoomMediaPanel'
import SharedPlanPanel from './SharedPlanPanel'
import DocsLibrary from './DocsLibrary'
import CalendarOrdersView from './CalendarOrdersView'
import OrderModal from './OrderModal'
import RoomExtrasPanel from './RoomExtrasPanel'
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
  const [mainTab, setMainTab] = useState<'3D' | '2D plan' | 'Files' | 'Schedule' | 'Calendar'>('3D')
  const [roomTab, setRoomTab] = useState<'Overview' | 'Chat' | 'Photos' | 'Schedule' | 'Extras'>('Overview')
  const [dmOpen, setDmOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budget, setBudget] = useState<BudgetSummary | null>(null)
  const [notifications, setNotifications] = useState<TradeNotification[]>([])
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [modelPlacements, setModelPlacements] = useState<ScenePlacement[]>([])
  const [guideStep, setGuideStep] = useState(() => localStorage.getItem('trace-project-guide-dismissed') === '1' ? -1 : 0)
  const [roomBlockerWarning, setRoomBlockerWarning] = useState<string>('')
  let profile: { name?: string; trade?: string } | null = null
  try { profile = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { /* profile is optional until Community */ }
  let currentPerson = ''
  try { currentPerson = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.id || '' } catch { /* profile is registered in Project */ }

  useEffect(() => { if (!profile) setProfileOpen(true) }, [])

  const refreshBudget = useCallback(async () => {
    try {
      const b = await getBudget()
      setBudget(b)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void refreshBudget()
  }, [refreshBudget, modelPath])

  useEffect(() => {
    const userTrade = profile?.trade || ''
    let cancelled = false
    async function fetchNotifs() {
      try {
        const res = await getNotifications(userTrade)
        if (!cancelled) setNotifications(res.notifications || [])
      } catch { /* ignore polling error */ }
    }
    void fetchNotifs()
    const timer = setInterval(() => { void fetchNotifs() }, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [profile?.trade])

  useEffect(() => {
    if (modelPath) {
      void getScene(modelPath).then(res => setModelPlacements(res.placements || [])).catch(() => {})
    }
  }, [modelPath])

  useEffect(() => {
    if (!selectedRoom) { setRoomBlockerWarning(''); return }
    let cancelled = false
    void checkWorkflow(selectedRoom.id, 'plumber').then(res => {
      if (!cancelled && !res.ok && res.blockers?.length) {
        setRoomBlockerWarning(res.blockers.map(b => b.reason).join(' · '))
      } else if (!cancelled) {
        setRoomBlockerWarning('')
      }
    }).catch(() => { if (!cancelled) setRoomBlockerWarning('') })
    return () => { cancelled = true }
  }, [selectedRoom, collab.status])

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
    <header className="workbench-header"><div className="workbench-project-title"><button className="workbench-back" onClick={onSwitchProject}>‹ Switch project</button><div><h1>{projectName}</h1><span title={modelPath}>{modelPath.split('/').pop() || 'No model selected'}</span></div></div><div className="workbench-header-actions"><button className="workbench-model-select" onClick={() => setBrowseModel(true)}>Change model</button><div style={{ position: 'relative' }}><button className="workbench-budget-capsule" onClick={() => setBudgetOpen(open => !open)} title="Project budget summary">💰 Budget €{(budget?.total ?? 0).toLocaleString()}</button>{budgetOpen && <><div className="budget-popover-backdrop" onClick={() => setBudgetOpen(false)} /><div className="budget-popover"><h3>Budget Breakdown</h3><div className="budget-breakdown-row"><span>Furniture & Placements</span><b>€{(budget?.furniture_total ?? 0).toLocaleString()}</b></div><div className="budget-breakdown-row"><span>Approved Extras</span><b style={{ color: '#38a169' }}>+€{(budget?.approved_change_orders ?? 0).toLocaleString()}</b></div><div className="budget-breakdown-row"><span>Pending Extras</span><b style={{ color: '#d69e2e' }}>€{(budget?.pending_change_orders ?? 0).toLocaleString()}</b></div><div className="budget-breakdown-row total"><span>Total Budget Committed</span><b>€{(budget?.total ?? 0).toLocaleString()}</b></div></div></>}</div><button className="workbench-envelope" aria-label="Private messages" onClick={() => setDmOpen(true)}>✉<span>{collab.messages.filter(m => m.thread === 'direct').length || ''}</span></button><div style={{ position: 'relative' }}><button className="workbench-bell" aria-label="Trade notifications" onClick={() => setBellOpen(open => !open)}>🔔{notifications.filter(n => !n.read).length > 0 && <span className="workbench-bell-badge">{notifications.filter(n => !n.read).length}</span>}</button>{bellOpen && <><div className="notifications-dropdown-backdrop" onClick={() => setBellOpen(false)} /><div className="notifications-dropdown"><header className="notifications-dropdown-header"><span>Notifications ({notifications.length})</span><small style={{ color: '#718096' }}>{profile?.trade || 'all'}</small></header><div className="notifications-list">{notifications.length === 0 ? <p className="dim small" style={{ padding: '12px', margin: 0 }}>No notifications yet.</p> : notifications.map(n => <button key={n.id} type="button" className={`notification-item ${!n.read ? 'unread' : ''} ${n.is_reminder ? 'reminder' : ''}`} onClick={async () => { if (!n.read) { try { await markNotificationRead(n.id); setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item)) } catch { /* proceed */ } } if (n.space_id) selectRoom({ id: n.space_id, name: n.space_id }); if (n.order_id) setMainTab('Calendar'); setBellOpen(false) }}><span>{n.is_reminder ? '⚠ ' : ''}{n.text}</span><span className="notification-item-time">{new Date(n.created_at * 1000).toLocaleString([], { dateStyle: 'short', hour: '2-digit', minute: '2-digit' })}</span></button>)}</div></div></>}</div><button className="workbench-avatar" title="Edit your identity" onClick={() => setProfileOpen(true)}>{profile?.name?.slice(0, 1).toUpperCase() || '?'}</button><span className="workbench-trade">{profile?.trade || 'Set up profile'}</span></div></header>
    <div className="workbench-grid">
      <aside className="workbench-room-tree"><h2>Building</h2>{modelPath ? <><p className="workbench-tree-node">⌄ {modelPath.split('/').pop()}</p><p className="workbench-tree-group">Rooms</p>{selectedRoom ? <button className="workbench-room-node selected" onClick={() => setRoomTab('Overview')}><i className={`room-status-dot ${collab.status[selectedRoom.id]?.status || ''}`} />{selectedRoom.name}<small>{collab.messages.filter(item => item.space_id === selectedRoom.id).length || ''}</small></button> : <p className="workbench-empty">Select a room in the model to see its details here.</p>}</> : <p className="workbench-empty">Choose a model to browse its rooms.</p>}</aside>
      <section className="workbench-center"><nav className="workbench-tabs" aria-label="Project workspace tabs">{(['3D', '2D plan', 'Files', 'Schedule', 'Calendar'] as const).map(tab => <button key={tab} className={mainTab === tab ? 'active' : ''} onClick={() => setMainTab(tab)}>{tab}</button>)}</nav>
        {mainTab === '3D' && <>{!modelPath.toLowerCase().endsWith('.ifc') ? <div className="project-model-empty">Choose a 3D model from the project library to load the building.</div> : <div className="workbench-viewport"><IfcViewer path={modelPath} guids={[]} onSelectRoom={selectRoom} onRoomAction={tab => { setRoomTab(tab); if (selectedRoom) setMainTab('3D') }} onScreenshot={(dataUrl, name, note) => onScreenshot(dataUrl, name, note)} /></div>}</>}
        {mainTab === '2D plan' && <SharedPlanPanel drawingPath={drawingPath} modelPath={modelPath} collab={collab} onChange={onChange} onScreenshot={onScreenshot} selectedRoomId={selectedRoom?.id} onRoomSelect={selectRoom} />}
        {mainTab === 'Files' && <section className="workbench-files"><div className="project-section-heading"><div><h2>Project files</h2><p className="sub">Plans, permits and reports</p></div></div><DocsLibrary selectedDocumentId={selectedDocumentId} onAskDocument={onAskDocument} /></section>}
        {mainTab === 'Schedule' && <section className="workbench-schedule"><WorkTimeline collab={collab} onChange={onChange} /></section>}
        {mainTab === 'Calendar' && <CalendarOrdersView modelPath={modelPath} onSelectRoom={id => selectRoom({ id, name: id })} onOpenOrderModal={() => setOrderModalOpen(true)} />}
      </section>
      {selectedRoom && <aside className="workbench-room-card"><div className="workbench-room-title"><div><small>ROOM DETAILS</small><h2>{selectedRoom.name}</h2></div><button aria-label="Close room" onClick={() => selectRoom(null)}>×</button></div><nav className="workbench-tabs room-tabs">{(['Overview', 'Chat', 'Photos', 'Schedule', 'Extras'] as const).map(tab => <button key={tab} className={roomTab === tab ? 'active' : ''} onClick={() => setRoomTab(tab)}>{tab}</button>)}</nav>
        {roomTab === 'Overview' && <div className="workbench-overview">
          {roomBlockerWarning && <div className="room-blocker-banner">⚠ Work sequence alert: {roomBlockerWarning}</div>}
          <p><b>Room</b><span>{selectedRoom.name}</span></p><label className="workbench-field"><b>Area m²</b><input type="number" min="0" step="0.1" placeholder="Not available" /></label><label className="workbench-field"><b>Status</b><select value={collab.status[selectedRoom.id]?.status || 'pending'} onChange={event => void setRoomStatus(selectedRoom.id, event.target.value as 'pending' | 'built' | 'missing_wall').then(onChange).catch(error => setFeedback(String(error)))}><option value="pending">Not started / pending</option><option value="built">Built</option><option value="missing_wall">Missing wall</option></select></label><div className="row" style={{ gap: '6px', marginTop: '8px' }}><button onClick={() => setRoomTab('Chat')}>Add note</button><button onClick={() => setOrderModalOpen(true)}>Order furniture</button></div></div>}
        {roomTab === 'Chat' && <RoomCollabPanel spaceId={selectedRoom.id} spaceName={selectedRoom.name} role="" collab={collab} onChange={onChange} onHighlightSpace={() => {}} />}
        {roomTab === 'Photos' && <RoomMediaPanel spaceId={selectedRoom.id} roomName={selectedRoom.name} />}
        {roomTab === 'Schedule' && <WorkTimeline collab={collab} onChange={onChange} defaultRoomId={selectedRoom.id} />}
        {roomTab === 'Extras' && <RoomExtrasPanel spaceId={selectedRoom.id} spaceName={selectedRoom.name} userTrade={profile?.trade} userName={profile?.name} onBudgetChange={refreshBudget} />}
      </aside>}
    </div>
    {profileOpen && <div className="workbench-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileOpen(false) }}><section className="workbench-dialog"><button className="workbench-dialog-close" onClick={() => setProfileOpen(false)}>×</button><h2>Your project identity</h2><p>Set your name and trade. Add contact details so teammates can reach you.</p><ContactRegistration compact onRegister={state => { onChange(state); setProfileOpen(false) }} /></section></div>}
    {dmOpen && <><button className="workbench-drawer-shade" aria-label="Close private messages" onClick={() => setDmOpen(false)} /><aside className="workbench-drawer"><header><h2>Private messages</h2><button onClick={() => setDmOpen(false)}>×</button></header><DirectMessages collab={collab} onChange={onChange} /></aside></>}
    {screenshot && <section className="workbench-shot-inbox"><div><b>Screenshot ready · {screenshot.roomName}</b><img src={screenshot.dataUrl} alt="Screenshot ready to share" />{screenshot.note && <small>{screenshot.note}</small>}</div><div className="row"><select value={target} onChange={event => setTarget(event.target.value as 'room' | 'direct')}><option value="room">Room chat</option><option value="direct">Private chat</option></select>{target === 'room' ? <input aria-label="Screenshot room ID" value={roomId} onChange={event => setRoomId(event.target.value)} placeholder="Room ID" /> : <select value={recipient} onChange={event => setRecipient(event.target.value)}><option value="">Choose contact…</option>{(collab.people || []).filter(person => person.id !== currentPerson).map(person => <option key={person.id} value={person.id}>{person.name} · {person.trade}</option>)}</select>}<input value={message} onChange={event => setMessage(event.target.value)} placeholder="Add a note…" /><button disabled={target === 'room' ? !roomId : !recipient} onClick={sendScreenshot}>Send to chat</button></div>{feedback && <p>{feedback}</p>}</section>}
    {guideStep >= 0 && <aside className="project-guide"><button className="project-guide-close" aria-label="Dismiss guide" onClick={() => { localStorage.setItem('trace-project-guide-dismissed','1'); setGuideStep(-1) }}>×</button><small>FIRST VISIT · STEP {guideStep + 1} OF 3</small><h3>{['Choose a room','Review status and photos','Leave a note or book time'][guideStep]}</h3><p>{['Select a room from the 3D model or the floor plan.','The room card shows its status, conversation and attached photos.','Use Chat to leave an update or Schedule to reserve a work slot.'][guideStep]}</p><button className="primary" onClick={() => { if (guideStep === 0) setMainTab('3D'); if (guideStep === 1) setRoomTab('Photos'); if (guideStep === 2) setRoomTab('Chat'); if (guideStep < 2) setGuideStep(guideStep + 1); else { localStorage.setItem('trace-project-guide-dismissed','1'); setGuideStep(-1) } }}>{guideStep < 2 ? 'Next step' : 'Got it'}</button></aside>}
    {orderModalOpen && <OrderModal modelPath={modelPath} spaceId={selectedRoom?.id} spaceName={selectedRoom?.name} placements={modelPlacements} onClose={() => setOrderModalOpen(false)} onOrderCreated={() => { if (mainTab === 'Calendar') setMainTab('3D'); setMainTab('Calendar') }} />}
    <DatasetBrowser open={browseModel} kind="3d" onClose={() => setBrowseModel(false)} onSelect={(item: CatalogItem) => { setSelectedRoom(null); setRoomId(''); onModelPathChange(item.path); setBrowseModel(false) }} />
  </main>
}
