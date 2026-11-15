import { useEffect, useState } from 'react'
import { getCollab } from '../api'
import type { CollabState } from '../types'
import ContactRegistration from './ContactRegistration'
import CommunityFilesPanel from './CommunityFilesPanel'
import DirectMessages from './DirectMessages'
import TeamChannels from './TeamChannels'
import WorkTimeline from './WorkTimeline'

type Tab = 'Channels' | 'Schedule' | 'Files' | 'Private messages'

/** Standalone Community: deliberately independent of the unfinished 3D project workbench. */
export default function CommunityHub({ onBack }: { onBack: () => void }) {
  const [collab, setCollab] = useState<CollabState>({ status: {}, messages: [] })
  const [tab, setTab] = useState<Tab>('Channels')
  const [recipient, setRecipient] = useState('')

  useEffect(() => { void getCollab().then(setCollab).catch(() => {}) }, [])
  const openDirect = (personId: string) => { setRecipient(personId); setTab('Private messages') }

  return <main className="community-hub">
    <header className="community-hub-header"><div><small>TRACE COMMUNITY</small><h1>Coordinate the work, not just the drawings.</h1><p>Shared discipline updates, current files, private conversations and area-aware work time.</p></div><button type="button" onClick={onBack}>← Back to Trace</button></header>
    <div className="community-hub-layout">
      <aside className="community-hub-sidebar"><ContactRegistration compact onRegister={setCollab} /><nav aria-label="Community sections">{(['Channels', 'Schedule', 'Files', 'Private messages'] as Tab[]).map(item => <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav><p>Scheduling only flags overlaps in the same room or work area. Contact the existing reservation holder before agreeing an overlap.</p></aside>
      <section className="community-hub-main">
        {tab === 'Channels' && <TeamChannels collab={collab} onChange={setCollab} onOpenFiles={() => setTab('Files')} />}
        {tab === 'Schedule' && <WorkTimeline collab={collab} onChange={setCollab} onOpenDirect={openDirect} />}
        {tab === 'Files' && <CommunityFilesPanel onBack={() => setTab('Channels')} />}
        {tab === 'Private messages' && <DirectMessages collab={collab} onChange={setCollab} initialRecipient={recipient} />}
      </section>
    </div>
  </main>
}
