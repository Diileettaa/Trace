import { useEffect, useState, type FormEvent } from 'react'
import { getRoomMedia, roomMediaUrl, uploadRoomMedia } from '../api'
import type { RoomMedia } from '../types'

function profile(): { id: string; trade: string } | null {
  try { return JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { return null }
}

export default function RoomMediaPanel({ spaceId, roomName }: { spaceId: string; roomName: string }) {
  const [records, setRecords] = useState<RoomMedia[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const me = profile()

  async function refresh() {
    try { setRecords(await getRoomMedia(spaceId)); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => { setRecords([]); void refresh() }, [spaceId])

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fileInput = form.elements.namedItem('room-media-file') as HTMLInputElement | null
    const file = fileInput?.files?.[0]
    if (!file || !me) return
    setBusy(true); setError('')
    try {
      await uploadRoomMedia(spaceId, me.id, me.trade, note, file)
      setNote(''); form.reset(); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return <aside className="room-media-sidebar" aria-label={`${roomName} notes and media`}>
    <div className="room-media-heading"><div><h3>{roomName} · Room log</h3><p>Notes, photos and videos for this room</p></div><span>{records.length}</span></div>
    {me ? <form className="room-media-upload" onSubmit={upload}>
      <label>Attach photo, video or PDF<input name="room-media-file" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime,application/pdf,.jpg,.jpeg,.png,.mp4,.mov,.pdf" required /></label>
      <input aria-label="Media note" value={note} onChange={event => setNote(event.target.value)} placeholder="Add a note (optional)" />
      <button disabled={busy}>{busy ? 'Uploading…' : 'Add to room'}</button>
    </form> : <p className="dim small">Register a contact to add room media.</p>}
    {error && <p className="error">{error}</p>}
    <div className="room-media-list">
      {records.length ? records.map(record => <article className="room-media-record" key={record.id}>
        {record.kind === 'image' ? <a href={roomMediaUrl(record.id)} target="_blank" rel="noreferrer"><img src={roomMediaUrl(record.id)} alt={record.note || `${roomName} photo`} loading="lazy" /></a>
          : record.kind === 'video' ? <video controls preload="metadata" src={roomMediaUrl(record.id)} />
          : record.kind === 'pdf' ? <a href={roomMediaUrl(record.id)} target="_blank" rel="noreferrer">Open attached PDF</a> : null}
        {record.note && <p>{record.note}</p>}
        <small>{record.author || 'Unknown'}{record.role ? ` · ${record.role}` : ''} · {new Date(record.created_at).toLocaleString()}</small>
      </article>) : !error ? <p className="dim small">No notes or media for this room yet.</p> : null}
    </div>
  </aside>
}
