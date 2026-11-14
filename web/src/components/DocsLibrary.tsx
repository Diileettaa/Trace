import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { getDocEvents, getDocVersions, getDocsMailbox, listProjectDocs, projectDocFileUrl, resolveProjectDoc, uploadProjectDoc, type DocEvent, type ProjectDocument } from '../api'

type FolderKey = 'all' | 'architecture' | 'structural' | 'hvac' | 'electrical' | 'fire' | 'permits' | 'attention'
const FOLDERS: { key: FolderKey; label: string }[] = [
  { key: 'all', label: 'All files' }, { key: 'architecture', label: 'Architecture' }, { key: 'structural', label: 'Structural' },
  { key: 'hvac', label: 'HVAC' }, { key: 'electrical', label: 'Electrical' }, { key: 'fire', label: 'Fire' },
  { key: 'permits', label: 'Permits' }, { key: 'attention', label: 'Needs attention' },
]
function profileName() { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.name || 'web' } catch { return 'web' } }
function timeAgo(value?: string | number) {
  if (!value) return 'time unknown'
  const time = typeof value === 'number' ? value * 1000 : Date.parse(value)
  if (!Number.isFinite(time)) return String(value)
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3600000))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} d ago`
  return `${Math.floor(days / 30)} mo ago`
}
function fileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'PDF'
  if (['png', 'jpg', 'jpeg', 'tif', 'tiff'].includes(ext || '')) return 'IMG'
  if (['ifc', 'dwg', 'dxf'].includes(ext || '')) return 'CAD'
  return (ext || 'FILE').slice(0, 4).toUpperCase()
}
function statusText(doc: ProjectDocument, docs: ProjectDocument[]) {
  if (doc.status === 'latest') return 'Current'
  if (doc.status === 'superseded') {
    const newer = docs.find(item => item.doc_key === doc.doc_key && item.status === 'latest')
    return `Replaced by Rev ${newer?.rev_label || 'newer version'}`
  }
  if (doc.status === 'conflict') return 'Needs a decision: two different files claim the same revision'
  if (doc.status === 'pending') return 'Waiting for approval'
  if (doc.status === 'rejected') return 'Rejected'
  return doc.status
}
function statusHint(status: string) {
  const hints: Record<string, string> = {
    latest: 'This is the current approved version.',
    superseded: 'A newer revision has replaced this file. Select the status to open that version.',
    conflict: 'Two different files claim the same revision. Choose which one to keep.',
    pending: 'This file is waiting for approval before it becomes current.',
    rejected: 'This file was rejected and remains in the project history.',
  }
  return hints[status] || 'Document filing status.'
}
function matchesFolder(doc: ProjectDocument, folder: FolderKey) {
  if (folder === 'all') return true
  if (folder === 'attention') return doc.status === 'conflict' || doc.status === 'pending'
  if (folder === 'permits') return Boolean(doc.permit)
  return doc.discipline === folder
}

export default function DocsLibrary({ selectedDocumentId = null, onAskDocument }: { selectedDocumentId?: number | null; onAskDocument?: (document: ProjectDocument) => void }) {
  const [allDocuments, setAllDocuments] = useState<ProjectDocument[]>([])
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [selected, setSelected] = useState<ProjectDocument | null>(null)
  const [versions, setVersions] = useState<ProjectDocument[]>([])
  const [events, setEvents] = useState<DocEvent[]>([])
  const [activeFolder, setActiveFolder] = useState<FolderKey>('all')
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [revision, setRevision] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [receipt, setReceipt] = useState('')
  const [dragging, setDragging] = useState(false)
  const [mailboxStatus, setMailboxStatus] = useState<'checking' | 'connected' | 'offline' | 'error'>('checking')
  const [mailboxReceiptCount, setMailboxReceiptCount] = useState(0)
  const [previewFile, setPreviewFile] = useState<{ id: number; url: string; error?: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function refresh(q = query, folder = activeFolder) {
    try {
      const all = await listProjectDocs('')
      setAllDocuments(all)
      let candidates: ProjectDocument[]
      if (folder === 'attention') {
        const [pending, conflict] = await Promise.all([listProjectDocs(q, { status: 'pending' }), listProjectDocs(q, { status: 'conflict' })])
        candidates = [...pending, ...conflict].filter((doc, index, docs) => docs.findIndex(other => other.id === doc.id) === index)
      } else if (q) {
        candidates = await listProjectDocs(q, { ...(folder !== 'all' && folder !== 'permits' ? { discipline: folder } : {}), ...(folder === 'permits' ? { permit: 'building_permit' } : {}) })
      } else {
        // GET /docs receives the selected facet; local matching keeps all categories visible even on API versions that ignore facets on a plain list.
        candidates = await listProjectDocs('', { ...(folder !== 'all' && folder !== 'permits' ? { discipline: folder } : {}), ...(folder === 'permits' ? { permit: 'building_permit' } : {}) })
      }
      const merged = candidates.filter((doc, index, docs) => docs.findIndex(other => other.id === doc.id) === index)
      const filtered = folder === 'all' ? merged : merged.filter(doc => matchesFolder(doc, folder))
      setDocuments(filtered)
      setSelected(current => filtered.find(doc => doc.id === current?.id) || filtered[0] || null)
      setFeedback('')
    } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
  }
  useEffect(() => { void refresh('') }, [activeFolder])
  useEffect(() => {
    let alive = true
    void getDocsMailbox().then(({ connected, receipts }) => {
      if (!alive) return
      setMailboxStatus(connected ? 'connected' : 'offline')
      setMailboxReceiptCount(receipts.length)
      if (connected) void refresh('')
    }).catch(() => { if (alive) setMailboxStatus('error') })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (selectedDocumentId == null) return
    setActiveFolder('all'); setQuery(''); setSearchText('')
  }, [selectedDocumentId])
  useEffect(() => {
    if (selectedDocumentId == null) return
    const target = allDocuments.find(doc => doc.id === selectedDocumentId)
    if (target) setSelected(target)
  }, [allDocuments, selectedDocumentId])
  useEffect(() => {
    if (!selected) { setVersions([]); setEvents([]); return }
    let alive = true
    void Promise.all([getDocVersions(selected.doc_key), getDocEvents(selected.id)]).then(([v, e]) => { if (alive) { setVersions(v); setEvents(e) } }).catch(error => { if (alive) setFeedback(error instanceof Error ? error.message : String(error)) })
    return () => { alive = false }
  }, [selected?.id, selected?.doc_key])
  useEffect(() => {
    if (!selected) { setPreviewFile(null); return }
    const controller = new AbortController()
    let objectUrl = ''
    const id = selected.id
    setPreviewFile(null)
    void fetch(projectDocFileUrl(id), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error(`Preview request failed (${response.status})`)
      return response.blob()
    }).then(blob => {
      objectUrl = URL.createObjectURL(blob)
      setPreviewFile({ id, url: objectUrl })
    }).catch(error => { if (!controller.signal.aborted) setPreviewFile({ id, url: '', error: error instanceof Error ? error.message : String(error) }) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [selected?.id])
  const folderCounts = useMemo(() => Object.fromEntries(FOLDERS.map(folder => [folder.key, folder.key === 'attention'
    ? allDocuments.filter(doc => doc.status === 'pending' || doc.status === 'conflict').length
    : folder.key === 'permits' ? allDocuments.filter(doc => Boolean(doc.permit)).length
      : folder.key === 'all' ? allDocuments.length : allDocuments.filter(doc => doc.discipline === folder.key).length])) as Record<FolderKey, number>, [allDocuments])

  async function upload(nextFile: File) {
    setBusy(true); setFeedback(''); setReceipt('')
    try {
      const result = await uploadProjectDoc(nextFile, title.trim(), revision.trim(), profileName())
      const first = result.results[0]
      const doc = first?.document
      const reason = first?.reason ? ` ${first.reason.replace(/[.!?]+$/, '')}.` : ''
      setReceipt(`${nextFile.name} was filed with status “${first?.status || doc?.status || 'received'}”.${reason}`)
      setActiveFolder('all')
      setQuery(''); setSearchText('')
      await refresh('', 'all')
      if (doc) setSelected(doc)
      setTitle(''); setRevision(''); setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  function acceptFiles(files: FileList | null) { if (files?.[0]) { setFile(files[0]); setReceipt('') } }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); acceptFiles(event.dataTransfer.files) }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) { acceptFiles(event.target.files) }
  async function resolve(action: 'approve' | 'make_latest' | 'reject', doc = selected) {
    if (!doc) return
    setBusy(true); setFeedback('')
    try { const updated = await resolveProjectDoc(doc.id, action); setSelected(updated); await refresh(); setFeedback(action === 'approve' ? 'Document approved.' : action === 'reject' ? 'Document rejected.' : 'This revision is now current.') }
    catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const ext = selected?.filename.split('.').pop()?.toLowerCase()
  const previewUrl = selected && previewFile?.id === selected.id ? previewFile.url : ''

  return <div className="docs-library">
    <div className="docs-mailbox-banner"><span>Send or CC files to the project mailbox and they are filed here automatically, with revision tracking.</span><small className={`docs-mailbox-status ${mailboxStatus}`}>{mailboxStatus === 'offline' ? 'Mailbox not connected yet (demo uses sample e-mails)' : mailboxStatus === 'checking' ? 'Checking mailbox connection…' : mailboxStatus === 'connected' ? `Mailbox connected${mailboxReceiptCount ? ` · ${mailboxReceiptCount} receipt${mailboxReceiptCount === 1 ? '' : 's'} filed` : ''}` : 'Mailbox status unavailable'}</small></div>
    <div className={`docs-dropzone${dragging ? ' dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (event.target === event.currentTarget) setDragging(false) }} onDrop={onDrop} onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click() }}>
      <strong>Drop drawings, permits or reports here</strong><span>or click to choose a file</span>
      <input ref={fileInput} type="file" hidden onChange={onFileChange} />
    </div>
    {file && <div className="docs-file-upload row"><strong>{file.name}</strong><input aria-label="Document title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Title (optional)" /><input aria-label="Revision" value={revision} onChange={event => setRevision(event.target.value)} placeholder="Revision (optional)" /><button disabled={busy} onClick={() => void upload(file)}>{busy ? 'Uploading…' : 'Upload file'}</button><button onClick={() => setFile(null)}>Cancel</button></div>}
    {receipt && <p className="docs-upload-receipt" role="status">{receipt}</p>}
    <div className="docs-drive-toolbar"><form className="row" onSubmit={event => { event.preventDefault(); setQuery(searchText); void refresh(searchText) }}><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search project files…" /><button>Search</button></form><div className="row"><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Cards</button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button></div></div>
    <div className="docs-drive-layout">
      <nav className="docs-folders" aria-label="Document folders"><h3>Folders</h3>{FOLDERS.map(folder => <button key={folder.key} className={activeFolder === folder.key ? 'active' : ''} onClick={() => setActiveFolder(folder.key)}><span>{folder.label}</span><span>{folderCounts[folder.key] ?? 0}</span></button>)}</nav>
      <section className={`docs-files-panel ${view}`} aria-label="Project files">
        <div className="docs-files-heading"><h3>{FOLDERS.find(folder => folder.key === activeFolder)?.label}</h3><span>{documents.length} files</span></div>
        {view === 'grid' ? <div className="docs-card-grid">{documents.map(doc => {
          const replacement = doc.status === 'superseded' ? allDocuments.find(item => item.doc_key === doc.doc_key && item.status === 'latest') : undefined
          return <article key={doc.id} className={`docs-file-card${selected?.id === doc.id ? ' selected' : ''}`} onClick={() => setSelected(doc)}>
            <div className="docs-card-top"><span className="docs-file-icon">{fileIcon(doc.filename)}</span></div>
            <strong className="docs-card-name">{doc.title || doc.filename}</strong><span className="docs-card-rev">{doc.rev_label ? `Rev ${doc.rev_label}` : 'Revision unknown'}</span>
            <span className="docs-card-meta">{doc.uploaded_by || 'Unknown uploader'} · {timeAgo(doc.uploaded_at)}</span>
            <button className={`doc-status-pill ${doc.status}`} title={statusHint(doc.status)} onClick={event => { event.stopPropagation(); if (replacement) setSelected(replacement) }}>{statusText(doc, allDocuments)}</button>
            {['pending', 'conflict'].includes(doc.status) && <div className="docs-card-actions"><button onClick={event => { event.stopPropagation(); void resolve(doc.status === 'pending' ? 'approve' : 'make_latest', doc) }}>{doc.status === 'pending' ? 'Approve' : 'Keep this one'}</button><button onClick={event => { event.stopPropagation(); void resolve('reject', doc) }}>Reject</button></div>}
            {onAskDocument && <button className="docs-ask-link" onClick={event => { event.stopPropagation(); onAskDocument(doc) }}>Ask about this drawing</button>}
          </article>
        })}</div> : <div className="docs-list-view">{documents.map(doc => <button key={doc.id} className={`docs-list-row${selected?.id === doc.id ? ' selected' : ''}`} onClick={() => setSelected(doc)}><span className="docs-file-icon">{fileIcon(doc.filename)}</span><strong>{doc.title || doc.filename}</strong><span>{doc.rev_label ? `Rev ${doc.rev_label}` : 'Revision unknown'}</span><span title={statusHint(doc.status)} className={`doc-status-pill ${doc.status}`} onClick={event => { event.stopPropagation(); const newer = allDocuments.find(item => item.doc_key === doc.doc_key && item.status === 'latest'); if (newer) setSelected(newer) }}>{statusText(doc, allDocuments)}</span><span>{doc.uploaded_by || '—'}</span><span>{timeAgo(doc.uploaded_at)}</span></button>)}</div>}
        {!documents.length && <p className="dim docs-empty">No shared files yet. Upload a project drawing or browse a library file to get started.</p>}
      </section>
      <aside className="docs-preview-panel">{selected ? <>
        <header><div><span className="docs-file-icon large">{fileIcon(selected.filename)}</span><button title={statusHint(selected.status)} className={`doc-status-pill ${selected.status}`} onClick={() => { const newer = allDocuments.find(item => item.doc_key === selected.doc_key && item.status === 'latest'); if (newer) setSelected(newer) }}>{statusText(selected, allDocuments)}</button></div><h3>{selected.title || selected.filename}</h3><p className="dim small">{selected.filename} · {selected.rev_label ? `Rev ${selected.rev_label}` : 'Revision unknown'}</p><a className="button-link" href={projectDocFileUrl(selected.id)} target="_blank" rel="noreferrer">Open / download</a></header>
        {onAskDocument && <button className="docs-ask-link" onClick={() => onAskDocument(selected)}>Ask about this drawing</button>}
        {selected.status === 'conflict' && <p className="docs-status-explanation">Needs a decision: two different files claim the same revision.</p>}
        {selected.status === 'pending' && <p className="docs-status-explanation">Waiting for approval.</p>}
        {['pending', 'conflict'].includes(selected.status) && <div className="docs-card-actions detail-actions">{selected.status === 'pending' ? <button disabled={busy} onClick={() => void resolve('approve')}>Approve</button> : <button disabled={busy} onClick={() => void resolve('make_latest')}>Keep this one</button>}<button disabled={busy} onClick={() => void resolve('reject')}>Reject</button></div>}
        {ext === 'pdf' && previewUrl ? <iframe className="docs-preview-frame" src={previewUrl} title={`Preview of ${selected.filename}`} /> : ['png', 'jpg', 'jpeg', 'tif', 'tiff'].includes(ext || '') && previewUrl ? <img className="docs-preview-image" src={previewUrl} alt={selected.filename} /> : ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff'].includes(ext || '') ? <div className="docs-preview-placeholder">{previewFile?.error || 'Loading preview…'}</div> : <div className="docs-preview-placeholder">Preview is not available for this file type.</div>}
        <h4>Version timeline</h4><ol className="docs-history">{versions.map(doc => <li key={doc.id} className={doc.id === selected.id ? 'current' : ''}><button onClick={() => setSelected(doc)}>{doc.rev_label ? `Rev ${doc.rev_label}` : 'Revision unknown'} · {statusText(doc, versions)}</button><small>{doc.filename} · {doc.uploaded_by || '—'} · {timeAgo(doc.uploaded_at)}</small></li>)}</ol>
        <h4>Activity</h4><ul className="docs-history">{events.map((item, index) => <li key={`${item.ts}-${index}`}><span>{String(item.action || item.event || 'Document event')} · {item.actor || 'system'}</span><small>{item.detail || ''} {item.ts ? `· ${timeAgo(item.ts)}` : ''}</small></li>)}</ul>
      </> : <p className="dim">Select a file to preview its contents and history.</p>}</aside>
    </div>
    {feedback && <p className={feedback.startsWith('Document ') || feedback.startsWith('This revision') ? 'dim small' : 'error'}>{feedback}</p>}
  </div>
}
