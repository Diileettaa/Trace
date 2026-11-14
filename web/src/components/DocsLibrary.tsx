import { useEffect, useState, type FormEvent } from 'react'
import { getDocEvents, getDocVersions, listProjectDocs, projectDocFileUrl, resolveProjectDoc, uploadProjectDoc, type DocEvent, type ProjectDocument } from '../api'

function profileName() { try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.name || 'web' } catch { return 'web' } }
function stamp(value?: string | number) { if (!value) return '—'; const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString() }
export default function DocsLibrary() {
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [selected, setSelected] = useState<ProjectDocument | null>(null)
  const [versions, setVersions] = useState<ProjectDocument[]>([])
  const [events, setEvents] = useState<DocEvent[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [title, setTitle] = useState('')
  const [revision, setRevision] = useState('')
  async function refresh(q = query) {
    try { const next = await listProjectDocs(q); setDocuments(next); if (selected) setSelected(next.find(doc => doc.id === selected.id) || null); setFeedback('') }
    catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
  }
  useEffect(() => { void refresh('') }, [])
  useEffect(() => {
    if (!selected) { setVersions([]); setEvents([]); return }
    let alive = true
    void Promise.all([getDocVersions(selected.doc_key), getDocEvents(selected.id)]).then(([v, e]) => { if (alive) { setVersions(v); setEvents(e) } }).catch(error => { if (alive) setFeedback(error instanceof Error ? error.message : String(error)) })
    return () => { alive = false }
  }, [selected?.id, selected?.doc_key])
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const file = (new FormData(form).get('file')) as File
    if (!file || !file.size) return
    setBusy(true); setFeedback('')
    try { const result = await uploadProjectDoc(file, title.trim(), revision.trim(), profileName()); const doc = result.results[0]?.document; await refresh(''); if (doc) setSelected(doc); setTitle(''); setRevision(''); form.reset(); setFeedback('File added to the project library.') }
    catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  async function resolve(action: 'approve' | 'make_latest' | 'reject') {
    if (!selected) return
    setBusy(true); setFeedback('')
    try { const doc = await resolveProjectDoc(selected.id, action); setSelected(doc); await refresh(); setFeedback(`Document ${action.replace('_', ' ')}d.`) }
    catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  return <div className="docs-library">
    <p className="docs-mail-notice">Files sent to the project mailbox are filed here automatically</p>
    <form className="docs-upload" onSubmit={upload}>
      <label>Upload project file<input type="file" name="file" required /></label>
      <input aria-label="Document title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Title (optional)" />
      <input aria-label="Revision" value={revision} onChange={event => setRevision(event.target.value)} placeholder="Revision (optional)" />
      <button disabled={busy}>{busy ? 'Working…' : 'Upload'}</button>
    </form>
    <div className="docs-library-grid">
      <section className="docs-list-panel"><form className="row" onSubmit={event => { event.preventDefault(); void refresh() }}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search project files…" /><button>Search</button></form>
        <div className="docs-table-wrap"><table className="docs-table"><thead><tr><th>File</th><th>Rev</th><th>Status</th><th>Discipline</th><th>Uploader</th><th>Uploaded</th></tr></thead><tbody>
          {documents.map(doc => <tr key={doc.id} className={`${selected?.id === doc.id ? 'selected ' : ''}doc-status-${doc.status}`} onClick={() => setSelected(doc)}><td><strong>{doc.title || doc.filename}</strong><small>{doc.filename}{doc.source === 'mail' && doc.email_subject ? ` · ${doc.email_subject}` : ''}</small></td><td>{doc.rev_label || '—'}</td><td><span className={`doc-status-pill ${doc.status}`}>{doc.status}</span></td><td>{doc.discipline || '—'}</td><td>{doc.uploaded_by || '—'}</td><td>{stamp(doc.uploaded_at)}</td></tr>)}
          {!documents.length && <tr><td colSpan={6} className="dim">No project files found.</td></tr>}
        </tbody></table></div>
      </section>
      <aside className="docs-detail-panel">{selected ? <>
        <header><div><span className={`doc-status-pill ${selected.status}`}>{selected.status}</span><h3>{selected.title || selected.filename}</h3><p className="dim small">{selected.filename} · {selected.rev_label || 'Revision not identified'}</p></div><a className="button-link" href={projectDocFileUrl(selected.id)}>Download</a></header>
        {['pending', 'conflict'].includes(selected.status) && <div className="row docs-actions"><button disabled={busy} onClick={() => void resolve('approve')}>Approve</button><button disabled={busy} onClick={() => void resolve('make_latest')}>Make latest</button><button disabled={busy} onClick={() => void resolve('reject')}>Reject</button></div>}
        <h4>Version history</h4><ul className="docs-history">{versions.map(doc => <li key={doc.id} className={doc.id === selected.id ? 'current' : ''}><span>{doc.rev_label || 'Revision unknown'} · {doc.status}</span><small>{doc.filename} · {doc.uploaded_by || '—'} · {stamp(doc.uploaded_at)}</small><a href={projectDocFileUrl(doc.id)}>Download version</a></li>)}{!versions.length && <li className="dim">No version history.</li>}</ul>
        <h4>Audit events</h4><ul className="docs-history">{events.map((item, index) => <li key={`${item.ts}-${index}`}><span>{String(item.action || item.event || 'Document event')} · {item.actor || 'system'}</span><small>{stamp(item.ts)}{item.detail ? ` · ${item.detail}` : ''}</small></li>)}{!events.length && <li className="dim">No audit events.</li>}</ul>
      </> : <p className="dim">Select a document to inspect its revisions and activity.</p>}</aside>
    </div>
    {feedback && <p className={feedback.includes('added') || feedback.includes('Document ') ? 'dim small' : 'error'}>{feedback}</p>}
  </div>
}
