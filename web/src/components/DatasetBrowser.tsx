import { useEffect, useMemo, useState } from 'react'
import { drawingUrl } from '../api'

export interface CatalogItem { path: string; label: string; kind: string; size_kb?: number; questions?: number }
export interface CatalogGroup { name: string; count: number; items: CatalogItem[] }
export interface CatalogSource { source: string; label: string; description: string; license: string; count: number; groups: CatalogGroup[] }
export interface CatalogProject { id: string; title: string; subtitle: string; description: string; model: string | null; plan: string | null; demo_data: boolean }
interface Catalog { featured: string[]; projects: CatalogProject[]; sources: CatalogSource[] }

const FALLBACK_CATALOG: Catalog = {
  featured: ['data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc', 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf', 'data/swiss_dwellings/site1000_bldg2082_floor9385.pdf', 'data/ifc_bench/ac20_arc.ifc'],
  projects: [
    { id: 'esplanades', title: 'Apartment building, Tallinn', subtitle: 'BIM model + floor plan · demo team data', description: 'Six-storey residential building. Explore the model, room status, notes and photos.', model: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc', plan: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf', demo_data: true },
    { id: 'swiss', title: 'Swiss apartment floor', subtitle: 'Vector floor plan · exact areas', description: 'Two apartments on one floor with room areas and fixtures.', model: null, plan: 'data/swiss_dwellings/site1000_bldg2082_floor9385.pdf', demo_data: true },
    { id: 'fzk', title: 'Family house (FZK-Haus)', subtitle: 'Small BIM model · walk through', description: 'Explore two storeys, rooms and walk mode.', model: 'data/ifc_bench/ac20_arc.ifc', plan: null, demo_data: false },
    { id: 'clinic', title: 'Clinic – plumbing', subtitle: 'BIM model · one trade only', description: 'Pipes and sanitary fixtures of a medical clinic.', model: 'data/ifc_models/bsc-clinic_clinic-plumbing.ifc', plan: null, demo_data: false },
  ],
  sources: [
    { source: 'ifc_models', label: 'BIM models', description: '3D building models and plan sheets', license: 'See the data source license', count: 2, groups: [{ name: 'Apartment building, Tallinn', count: 2, items: [
      { path: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc', label: '3D model', kind: '3d' }, { path: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf', label: 'Plan 04 · 4th floor', kind: 'plan' },
    ] }] },
    { source: 'swiss_dwellings', label: 'Swiss apartments', description: 'Vector floor plans by building and floor', license: 'See the data source license', count: 1, groups: [{ name: 'Site 1000 · Building 2082', count: 1, items: [{ path: 'data/swiss_dwellings/site1000_bldg2082_floor9385.pdf', label: 'Floor 9385', kind: 'plan' }] }] },
    { source: 'ifc_bench', label: 'BIM model benchmarks', description: 'Additional IFC models', license: 'See the data source license', count: 1, groups: [{ name: 'FZK-Haus', count: 1, items: [{ path: 'data/ifc_bench/ac20_arc.ifc', label: '3D model', kind: '3d' }] }] },
  ],
}

export async function loadCatalog(): Promise<Catalog> {
  const response = await fetch('/api/catalog')
  if (!response.ok) return FALLBACK_CATALOG
  return response.json()
}

function itemLabel(item: CatalogItem) { return item.path.split('/').pop() || item.path }

export function DatasetBrowser({ open, onClose, onSelect, kind }: { open: boolean; onClose: () => void; onSelect: (item: CatalogItem) => void; kind?: '3d' | 'plan' }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [source, setSource] = useState<CatalogSource | null>(null)
  const [group, setGroup] = useState<CatalogGroup | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open && !catalog) void loadCatalog().then(setCatalog).catch(e => setError(String(e))) }, [open, catalog])
  useEffect(() => { if (!open) { setSource(null); setGroup(null); setQuery('') } }, [open])
  const allItems = useMemo(() => (catalog?.sources || []).flatMap(s => s.groups.flatMap(g => g.items.map(item => ({ item, source: s, group: g })))), [catalog])
  const matches = query.trim() ? allItems.filter(x => `${x.item.path} ${x.item.label} ${x.group.name} ${x.source.label}`.toLowerCase().includes(query.toLowerCase()) && (!kind || x.item.kind === kind)) : []
  if (!open) return null
  const featured = (catalog?.featured || []).map(path => allItems.find(x => x.item.path === path)?.item).filter((x): x is CatalogItem => !!x && (!kind || x.kind === kind))
  return <div className="dataset-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className="dataset-modal" role="dialog" aria-modal="true" aria-label="Browse drawings and models">
    <header><div><h2>Choose a drawing or model</h2><p>Browse the demo data library.</p></div><button onClick={onClose} aria-label="Close">×</button></header>
    <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search files, projects, sources…" />
    <div className="dataset-breadcrumb"><button onClick={() => { setSource(null); setGroup(null) }}>Sources</button>{source && <> › <button onClick={() => setGroup(null)}>{source.label}</button></>}{group && <> › {group.name}</>}</div>
    {error ? <p className="error">{error}</p> : !catalog ? <p>Loading library…</p> : query.trim() ? <div className="dataset-list">{matches.map(({ item, source: s }) => <button key={item.path} onClick={() => onSelect(item)}><span>{item.kind === '3d' ? '⬡' : '▧'} {item.label || itemLabel(item)}</span><small>{s.label} · {item.questions || 0} sample questions</small></button>)}</div> : <>
      {!source && <><h3>Featured</h3><div className="dataset-featured">{featured.map(item => <button key={item.path} onClick={() => onSelect(item)}><span>{item.kind === '3d' ? '⬡' : '▧'}</span><strong>{item.label || itemLabel(item)}</strong><small>{item.path}</small></button>)}</div><div className="dataset-list">{catalog.sources.map(s => <button key={s.source} onClick={() => setSource(s)}><strong>📁 {s.label}</strong><small>{s.description} · {s.count} files</small><small className="dataset-license">{s.license || 'License information unavailable'}</small></button>)}</div></>}
      {source && !group && <div className="dataset-list">{source.groups.map(g => <button key={g.name} onClick={() => setGroup(g)}><strong>📁 {g.name}</strong><small>{g.count} files</small><small className="dataset-license">{source.license || 'License information unavailable'}</small></button>)}</div>}
      {source && group && <div className="dataset-list dataset-file-list">{group.items.filter(item => !kind || item.kind === kind).map(item => <button key={item.path} onClick={() => onSelect(item)}><span>{item.kind === '3d' ? '⬡' : '▧'} {item.label || itemLabel(item)}</span><small>{item.kind === '3d' ? '3D model' : `${item.size_kb ?? '—'} KB`} · {item.questions || 0} sample questions</small>{item.kind === 'plan' && <img loading="lazy" src={drawingUrl(item.path)} alt="" />}</button>)}</div>}
    </>}
  </section></div>
}

export function CatalogProjects({ onOpen, onBrowse }: { onOpen: (project: CatalogProject) => void; onBrowse: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void loadCatalog().then(setCatalog).catch(e => setError(String(e))) }, [])
  const last = localStorage.getItem('trace-last-project')
  const projects = [...(catalog?.projects || [])].sort((a, b) => Number(b.id === last) - Number(a.id === last))
  const fallbackPlan: Record<string, string> = { esplanades: 'data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf', swiss: 'data/swiss_dwellings/site1000_bldg2082_floor9385.pdf' }
  return <section className="project-picker"><div className="project-picker-heading"><p className="eyebrow">YOUR PROJECTS</p><h1>Choose a project</h1><p>Open a ready-to-explore workspace. Nothing loads until you choose.</p></div>{error && <p className="error">{error}</p>}<div className="project-cards">{projects.map(project => { const thumbnail = project.plan || fallbackPlan[project.id]; return <article className="project-choice" key={project.id}><div className="project-choice-thumb">{thumbnail ? <img loading="eager" decoding="sync" src={drawingUrl(thumbnail)} alt={`${project.title} preview`} onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('thumb-fallback') }} /> : <span>⬡</span>}</div><div className="project-choice-copy"><div className="project-choice-tags">{project.demo_data && <span>Demo data</span>}{project.id === last && <span>Continue</span>}</div><h2>{project.title}</h2><p className="sub">{project.subtitle}</p><p>{project.description}</p><button className="primary" onClick={() => { localStorage.setItem('trace-last-project', project.id); onOpen(project) }}>Open</button></div></article> })}</div><button className="project-browse-all" onClick={onBrowse}>Or browse all drawings…</button></section>
}
