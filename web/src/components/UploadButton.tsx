import { useRef, useState } from 'react'
import { uploadDrawing, type UploadResult } from '../api'

/** "Upload your own drawing": PDF, PNG, JPG or IFC. Calls onUploaded with the server path. */
export default function UploadButton({ onUploaded }: { onUploaded: (r: UploadResult) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const r = await uploadDrawing(file)
      setLast(r.name)
      onUploaded(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="upload-drawing">
      <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.ifc" hidden
        onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : 'Upload your own drawing'}
      </button>
      <span className="upload-hint">
        {error ? <span className="upload-error">{error}</span>
          : last ? <>Using <b>{last}</b></> : 'PDF, PNG, JPG or IFC · max 50 MB'}
      </span>
    </div>
  )
}
