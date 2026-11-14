import { useState } from 'react'
import type { CollabState } from '../types'

export interface TreeEntry {
  index: number // index into the source list shown on the drawing
  name: string
  category?: string
  storey?: string
  space_id?: string
  space_name?: string
  guid?: string
}

interface Props {
  entries: TreeEntry[]
  collab: CollabState
  selected: number | null
  selectedGuid?: string | null
  activeSpace: string | null
  onSelectElement: (index: number, entry?: TreeEntry) => void
  onSelectSpace: (spaceId: string, spaceName: string) => void
}

const NO_STOREY = 'Drawing'
const NO_SPACE = '(no room)'

/** Module 2: Building -> Storey -> Room -> numbered elements. Click a room to scope questions to it. */
export default function SpaceTree({ entries, collab, selected, selectedGuid, activeSpace, onSelectElement, onSelectSpace }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  if (entries.length === 0) return <p className="dim small">No elements yet. Click "Scan &amp; number all elements" or ask a question first.</p>

  const tree = new Map<string, Map<string, TreeEntry[]>>()
  for (const e of entries) {
    const st = e.storey || NO_STOREY
    const sp = e.space_id || NO_SPACE
    if (!tree.has(st)) tree.set(st, new Map())
    const rooms = tree.get(st)!
    if (!rooms.has(sp)) rooms.set(sp, [])
    rooms.get(sp)!.push(e)
  }
  const toggle = (k: string) => setClosed((c) => ({ ...c, [k]: !c[k] }))

  return (
    <ul className="tree">
      {[...tree.entries()].map(([storey, rooms]) => (
        <li key={storey}>
          <span className="tree-node" onClick={() => toggle(storey)}>{closed[storey] ? '▸' : '▾'} {storey}</span>
          {!closed[storey] && (
            <ul>
              {[...rooms.entries()].map(([spaceId, items]) => {
                const name = items[0].space_name || spaceId
                const key = `${storey}/${spaceId}`
                const st = collab.status[spaceId]?.status
                const counts = items.reduce<Record<string, number>>((a, i) => {
                  const c = i.category || 'other'
                  a[c] = (a[c] ?? 0) + 1
                  return a
                }, {})
                return (
                  <li key={spaceId}>
                    <span className={`tree-node room ${activeSpace === spaceId ? 'on' : ''}`}>
                      <span onClick={() => toggle(key)}>{closed[key] ? '▸' : '▾'}</span>{' '}
                      <span onClick={() => spaceId !== NO_SPACE && onSelectSpace(spaceId, name)}>
                        {name} <span className="dim">({Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ')})</span>
                      </span>
                      {st && <span className={`tag ${st}`}>{st.replace('_', ' ')}</span>}
                    </span>
                    {!closed[key] && (
                      <ul>
                        {items.map((i, leafIdx) => {
                          const isSel = (i.index >= 0 && selected === i.index) || (!!i.guid && selectedGuid === i.guid)
                          return (
                            <li key={`${i.index}-${leafIdx}`} className={`tree-leaf ${isSel ? 'on' : ''}`}
                              onClick={() => onSelectElement(i.index, i)}>
                              {i.name}
                              {i.guid && <span className="dim small" title={i.guid}> ({i.guid.slice(0, 8)}…)</span>}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
