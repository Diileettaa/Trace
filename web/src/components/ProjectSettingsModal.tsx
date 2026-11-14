import { useState } from 'react'
import { updateProjectSettings, type ProjectSettings } from '../api'

interface Props {
  settings: ProjectSettings
  onClose: () => void
  onSave: (updated: ProjectSettings) => void
}

export default function ProjectSettingsModal({ settings, onClose, onSave }: Props) {
  const [buildingType, setBuildingType] = useState(settings.building_type || 'historic')
  const [ownerView, setOwnerView] = useState(settings.owner_view || 'everything')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const updated = await updateProjectSettings({
        building_type: buildingType,
        owner_view: ownerView,
      })
      onSave(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="workbench-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <section className="workbench-dialog">
        <button className="workbench-dialog-close" aria-label="Close" onClick={onClose}>×</button>
        <h2>Project Collaboration Settings</h2>
        <p className="sub">Configure building discipline rules and owner privacy boundaries.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <b>Building Type & Code</b>
            <select
              value={buildingType}
              onChange={e => setBuildingType(e.target.value as 'historic' | 'new' | 'renovation')}
              style={{ padding: '8px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="historic">Historic building (Strict preservation rules)</option>
              <option value="new">New construction (Standard modular sequence)</option>
              <option value="renovation">Renovation (Selective wall & MEP phases)</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <b>Owner View Filter (Client Visibility)</b>
            <select
              value={ownerView}
              onChange={e => setOwnerView(e.target.value as 'everything' | 'final_and_questions')}
              style={{ padding: '8px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="everything">Everything (Full internal trade chatter and raw schedules)</option>
              <option value="final_and_questions">Final & Questions (Streamlined: status, photos, decisions only)</option>
            </select>
            <small style={{ color: '#718096', fontSize: '11px', lineHeight: 1.4 }}>
              When set to <em>Final & Questions</em>, owners see only approved room status, inspection photos,
              and pending items requiring their formal decision (change orders & conflicts).
            </small>
          </label>

          {error && <div className="form-blocker-warning">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
