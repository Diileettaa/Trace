import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import * as OBC from '@thatopen/components'
import * as THREE from 'three'
import { RenderedFaces } from '@thatopen/fragments'
import { deleteScenePlacement, fileUrl, getScene, saveScenePlacement, type ScenePlacement } from './api'
import FurnitureCatalogModal, { type FurnitureProduct } from './components/FurnitureCatalogModal'
import catalogUrl from './catalog.json?url'
import {
  BuildingExplorer,
  applyBuildingVisibility,
  applyStoreyCut,
  classifyModelTrades,
  applyTradeColors,
  allModelLocalIds,
  createInitialTrades,
  loadStoreys,
  loadIfcClassItems,
  type StoreyInfo,
  type TradeKey,
  type TradesState,
} from './viewer3d'
import type { FragmentsModel } from '@thatopen/fragments'

interface Props {
  path: string
  guids: string[]
  selectedGuid?: string | null
  onSelectGuid?: (guid: string) => void
  onPlacementsChange?: (placements: PlacedProduct[]) => void
  onScreenshot?: (dataUrl: string, roomName: string, note: string) => void
  onSelectRoom?: (room: { id: string; name: string } | null) => void
}

export interface PlacedProduct {
  instanceId: string
  catalogId: string
  name: string
  width_mm: number
  depth_mm: number
  height_mm: number
  price_eur: number
  material: string
  color_hex: string
  mount: 'floor' | 'ceiling' | 'wall'
  rotationDeg: number
  position?: [number, number, number]
  space_id?: string | null
}

type CatalogProduct = FurnitureProduct

interface RoomOption {
  key: string
  modelId: string
  localId: number
  name: string
  guid: string
  box: THREE.Box3
}

interface IfcElementInfo {
  localId: number
  modelId: string
  guid: string
  category: string
  name: string
  type: string
  storey: string
  room: string
  dimensions: [number, number, number]
}

function readProperty(data: Record<string, unknown>, key: string): string {
  const raw = data[key]
  if (raw && typeof raw === 'object' && 'value' in raw) return String((raw as { value: unknown }).value ?? '')
  return raw === undefined || raw === null ? '' : String(raw)
}

function friendlyIfcCategory(category: string): string {
  const name = category.replace(/^Ifc/i, '').replace(/StandardCase$/i, '')
  const known: Record<string, string> = {
    Wall: 'Wall', Slab: 'Slab', Column: 'Column', Beam: 'Beam', Door: 'Door', Window: 'Window',
    Roof: 'Roof', Space: 'Room', Furniture: 'Furniture', FurnishingElement: 'Furniture',
    PipeSegment: 'Pipe', PipeFitting: 'Pipe fitting', FlowTerminal: 'Fixture', SanitaryTerminal: 'Sanitary fixture',
    LightFixture: 'Light fixture', Outlet: 'Electrical outlet', Stair: 'Stair', Railing: 'Railing',
  }
  return known[name] || name.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Building element'
}

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>
type ViewerEngine = { components: OBC.Components; world: World; fragments: OBC.FragmentsManager }

const HIGHLIGHT = { color: new THREE.Color('#E9B949'), renderedFaces: RenderedFaces.TWO, opacity: 1, transparent: false }
const FOCUS_HIGHLIGHT = { color: new THREE.Color('#202427'), renderedFaces: RenderedFaces.TWO, opacity: 1, transparent: false }

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class IfcErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error } }
  render() {
    if (this.state.hasError) return <div className="viewer empty" style={{ padding: 24, textAlign: 'center' }}>
      <div className="error" style={{ marginBottom: 12 }}>3D rendering encountered an error: {this.state.error?.message || 'Unknown error'}</div>
      <button onClick={() => this.setState({ hasError: false, error: null })}>Reload 3D view</button>
    </div>
    return this.props.children
  }
}

function makePlaceholder(product: CatalogProduct, instanceId: string) {
  const group = new THREE.Group()
  group.name = instanceId
  const w = product.width_mm / 1000
  const d = product.depth_mm / 1000
  const h = product.height_mm / 1000
  const color = product.color_hex
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72 })
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), roughness: 0.8 })
  const glass = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.34, roughness: 0.2 })
  const box = (width: number, depth: number, height: number, x: number, y: number, z: number, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, depth, height), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  const cylinder = (radius: number, height: number, x: number, y: number, z: number, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), mat)
    mesh.rotation.x = Math.PI / 2 // IFC models use Z as the vertical axis.
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    group.add(mesh)
  }

  switch (product.category) {
    case 'table':
      box(w, d, h * 0.08, 0, 0, h * 0.43)
      for (const x of [-w * 0.42, w * 0.42]) for (const y of [-d * 0.4, d * 0.4]) box(w * 0.055, d * 0.055, h * 0.86, x, y, -h * 0.03, accent)
      break
    case 'chair':
      box(w * 0.92, d * 0.82, h * 0.1, 0, -d * 0.04, -h * 0.02)
      box(w * 0.9, d * 0.08, h * 0.45, 0, d * 0.37, h * 0.19, accent)
      for (const x of [-w * 0.38, w * 0.38]) for (const y of [-d * 0.32, d * 0.32]) box(w * 0.07, d * 0.07, h * 0.46, x, y, -h * 0.27, accent)
      break
    case 'lamp':
      if (product.mount === 'ceiling') {
        box(w * 0.035, d * 0.035, h * 0.65, 0, 0, h * 0.18, accent)
        cylinder(Math.min(w, d) * 0.46, h * 0.24, 0, 0, -h * 0.25)
      } else if (product.mount === 'wall') {
        box(w * 0.7, d * 0.2, h * 0.72, 0, 0, 0, glass)
        box(w * 0.76, d * 0.18, h * 0.08, 0, 0, -h * 0.42, accent)
      } else {
        cylinder(Math.min(w, d) * 0.38, h * 0.08, 0, 0, -h * 0.46, accent)
        box(w * 0.045, d * 0.045, h * 0.75, 0, 0, -h * 0.05, accent)
        cylinder(Math.min(w, d) * 0.42, h * 0.22, 0, 0, h * 0.34)
      }
      break
    case 'toilet':
      box(w * 0.62, d * 0.55, h * 0.48, 0, -d * 0.12, -h * 0.23)
      cylinder(w * 0.39, h * 0.09, 0, -d * 0.05, -h * 0.01)
      box(w * 0.65, d * 0.12, h * 0.32, 0, d * 0.37, h * 0.13, accent)
      break
    case 'sink':
      box(w, d, h * 0.12, 0, 0, h * 0.36, accent)
      box(w * 0.5, d * 0.42, h * 0.12, 0, 0, h * 0.48)
      box(w * 0.08, d * 0.08, h * 0.64, 0, 0, -h * 0.01, accent)
      break
    case 'shower':
      box(w, d, h * 0.045, 0, 0, -h * 0.47, accent)
      box(w * 0.035, d, h * 0.92, w * 0.48, 0, 0, glass)
      box(w, d * 0.035, h * 0.92, 0, -d * 0.48, 0, glass)
      break
    case 'bathtub':
      box(w, d, h * 0.62, 0, 0, -h * 0.12, accent)
      box(w * 0.84, d * 0.76, h * 0.48, 0, 0, -h * 0.03, material)
      break
    case 'bed':
      box(w * 0.96, d * 0.96, h * 0.12, 0, 0, -h * 0.35, accent)
      box(w, d * 0.8, h * 0.28, 0, 0, -h * 0.12)
      box(w, d * 0.08, h * 0.68, 0, d * 0.44, h * 0.12, accent)
      box(w * 0.38, d * 0.2, h * 0.07, -w * 0.23, d * 0.3, h * 0.05, glass)
      box(w * 0.38, d * 0.2, h * 0.07, w * 0.23, d * 0.3, h * 0.05, glass)
      break
    case 'sofa':
      box(w, d * 0.62, h * 0.36, 0, -d * 0.13, -h * 0.18, accent)
      box(w * 0.95, d * 0.2, h * 0.58, 0, d * 0.37, 0, accent)
      box(w * 0.12, d * 0.82, h * 0.52, -w * 0.44, -d * 0.05, -h * 0.05)
      box(w * 0.12, d * 0.82, h * 0.52, w * 0.44, -d * 0.05, -h * 0.05)
      break
    case 'kitchen':
      box(w, d, h * 0.18, 0, 0, h * 0.38)
      box(w * 0.92, d * 0.9, h * 0.68, 0, 0, -h * 0.04, accent)
      break
    case 'cabinet':
      box(w, d, h, 0, 0, 0, accent)
      box(w * 0.035, d * 0.04, h * 0.1, 0, -d * 0.53, 0)
      break
    default:
      box(w, d, h, 0, 0, 0)
  }
  return group
}

function makeCatalogThumbnailModel(product: FurnitureProduct) {
  return makePlaceholder(product, `catalog-${product.id}`)
}

function IfcViewerInner({ path, guids, selectedGuid, onPlacementsChange, onScreenshot, onSelectRoom }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<ViewerEngine | null>(null)
  const placementsRef = useRef(new Map<string, THREE.Group>())
  const placedRef = useRef<PlacedProduct[]>([])
  const sceneVersionRef = useRef(0)
  const dragRef = useRef<{ id: string; plane: THREE.Plane } | null>(null)
  const draggedRef = useRef(false)
  const [status, setStatus] = useState('')
  const [modelReady, setModelReady] = useState(false)
  const [catalog, setCatalog] = useState<CatalogProduct[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [selectedRoomKey, setSelectedRoomKey] = useState('')
  const [screenshotNote, setScreenshotNote] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [placed, setPlaced] = useState<PlacedProduct[]>([])
  const [selectedPlacementId, setSelectedPlacementId] = useState('')
  const [selectedElement, setSelectedElement] = useState<IfcElementInfo | null>(null)
  const [storeys, setStoreys] = useState<StoreyInfo[]>([])
  const [selectedStoreyId, setSelectedStoreyId] = useState<string | null>(null)
  const [trades, setTrades] = useState<TradesState>(createInitialTrades)
  const [allLocalIds, setAllLocalIds] = useState<number[]>([])
  const [explorerReady, setExplorerReady] = useState(false)
  const modelRef = useRef<FragmentsModel | null>(null)
  const classByLocalIdRef = useRef(new Map<number, string>())

  useEffect(() => {
    let cancelled = false
    fetch(catalogUrl).then((response) => response.json() as Promise<CatalogProduct[]>).then((items) => {
      if (!cancelled) { setCatalog(items); setSelectedProductId(items[0]?.id ?? '') }
    }).catch(() => { if (!cancelled) setStatus('Demo catalog could not be loaded.') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!box.current) return
    let cancelled = false
    setModelReady(false)
    setRooms([])
    setSelectedRoomKey('')
    setSelectedElement(null)
    setPlaced([])
    setStoreys([])
    setSelectedStoreyId(null)
    setTrades(createInitialTrades())
    setAllLocalIds([])
    setExplorerReady(false)
    modelRef.current = null
    placementsRef.current.clear()
    placedRef.current = []
    sceneVersionRef.current = 0
    onPlacementsChange?.([])

    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) { setStatus('WebGL is not available in your browser.'); return }
    } catch { setStatus('WebGL check failed.'); return }

    let components: OBC.Components | null = null
    ;(async () => {
      try {
        components = new OBC.Components()
        const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>()
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = new THREE.Color('#F7F6F2')
        world.renderer = new OBC.SimpleRenderer(components, box.current!, { preserveDrawingBuffer: true })
        world.camera = new OBC.SimpleCamera(components)
        components.init()
        world.camera.controls.minDistance = 0.02
        world.camera.controls.mouseButtons.wheel = world.camera.controls.mouseButtons.middle
        const grid = components.get(OBC.Grids).create(world)
        grid.visible = false

        const fragments = components.get(OBC.FragmentsManager)
        engine.current = { components, world, fragments }
        setStatus('Loading 3D engine…')
        fragments.init(await OBC.FragmentsManager.getWorker())
        world.camera.controls.addEventListener('rest', () => fragments.core.update(true))
        fragments.list.onItemSet.add(({ value: model }) => {
          modelRef.current = model
          model.useCamera(world.camera.three)
          world.scene.three.add(model.object)
          fragments.core.update(true)
        })

        const loader = components.get(OBC.IfcLoader)
        await loader.setup({
          autoSetWasm: false,
          // web-ifc wasm files are served as static files from web/public/wasm/ (copied from node_modules/web-ifc)
          customLocateFileHandler: (url: string) => {
            if (url.includes('web-ifc-mt.wasm')) return '/wasm/web-ifc-mt.wasm'
            if (url.includes('web-ifc.wasm')) return '/wasm/web-ifc.wasm'
            return url
          },
        })
        loader.settings.wasm.path = '/wasm/'
        loader.settings.wasm.absolute = true
        setStatus('Downloading model…')
        const res = await fetch(fileUrl(path))
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch ${path}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        setStatus('Converting IFC (may take tens of seconds for large models)…')
        const loadedModel = await loader.load(bytes, true, path)
        if (cancelled) return
        modelRef.current = loadedModel
        const [allByClass, nextStoreys] = await Promise.all([
          loadIfcClassItems(loadedModel),
          loadStoreys(loadedModel),
        ])
        if (cancelled) return
        classByLocalIdRef.current = new Map(Object.entries(allByClass).flatMap(([className, ids]) => ids.map((id) => [id, className] as const)))
        const nextTrades = classifyModelTrades(loadedModel, allByClass)
        await applyTradeColors(loadedModel, nextTrades)
        const ids = new Set(allModelLocalIds(allByClass))
        for (const id of await loadedModel.getLocalIds()) ids.add(id)
        for (const storey of nextStoreys) {
          ids.add(storey.localId)
          for (const id of storey.itemIds) ids.add(id)
        }
        setStoreys(nextStoreys)
        setSelectedStoreyId(null)
        setTrades(nextTrades)
        setAllLocalIds([...ids])
        setExplorerReady(true)

        try {
          const byCategory = await loadedModel.getItemsOfCategories([/IFCSPACE/i])
          const spaceIds = [...new Set(Object.values(byCategory).flat())]
          if (spaceIds.length) {
            const [data, boxes, guidsById] = await Promise.all([
              loadedModel.getItemsData(spaceIds), loadedModel.getBoxes(spaceIds), loadedModel.getGuidsByLocalIds(spaceIds),
            ])
            if (cancelled) return
            const nextRooms = spaceIds.flatMap((localId, index) => {
              const attributes = data[index] ?? {}
              const name = String((attributes.Name as { value?: unknown } | undefined)?.value ?? `Room ${localId}`)
              const roomBox = boxes[index]
              if (!roomBox || roomBox.isEmpty()) return []
              return [{ key: `${loadedModel.modelId}:${localId}`, modelId: loadedModel.modelId, localId, name,
                guid: guidsById[index] ?? '', box: roomBox }]
            })
            setRooms(nextRooms)
            if (nextRooms.length) {
              setSelectedRoomKey(nextRooms[0].key)
              onSelectRoom?.({ id: nextRooms[0].name, name: nextRooms[0].name })
            }
          }
        } catch (error) { console.warn('Could not list IFC spaces:', error) }

        await world.camera.fitToItems()
        const modelBounds = new THREE.Box3().setFromObject(loadedModel.object)
        const modelDiameter = Math.max(modelBounds.getSize(new THREE.Vector3()).length(), 0.1)
        world.camera.controls.maxDistance = modelDiameter * 3
        world.camera.enabled = true
        world.camera.controls.enabled = true
        setStatus('')
        setModelReady(true)
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!cancelled) setStatus(`3D loading failed: ${msg}`)
      }
    })()

    return () => {
      cancelled = true
      engine.current = null
      if (components) { try { components.dispose() } catch { /* best effort */ } }
    }
  }, [path])

  useEffect(() => {
    const current = engine.current
    const model = modelRef.current
    if (!current || !model || !explorerReady) return
    const selectedStorey = selectedStoreyId ? storeys.find((item) => item.id === selectedStoreyId) ?? null : null
    applyStoreyCut(current.components, current.world, model, selectedStorey)
    void (async () => {
      await applyTradeColors(model, trades)
      await applyBuildingVisibility(model, storeys, selectedStoreyId, trades, allLocalIds)
    })()
  }, [allLocalIds, explorerReady, selectedStoreyId, storeys, trades])

  function toggleTrade(key: TradeKey, enabled: boolean) {
    setTrades((current) => ({ ...current, [key]: { ...current[key], enabled } }))
  }

  function selectRoom(key: string) {
    setSelectedRoomKey(key)
    const room = rooms.find((candidate) => candidate.key === key)
    onSelectRoom?.(room ? { id: room.name, name: room.name } : null)
  }

  useEffect(() => {
    const e = engine.current
    if (!e || status || !modelReady) return
    let cancelled = false
    ;(async () => {
      try {
        await e.fragments.resetHighlight()
        if (cancelled) return
        if (guids.length) {
          const items = await e.fragments.guidsToModelIdMap(guids)
          if (Object.keys(items).length) await e.fragments.highlight(HIGHLIGHT, items)
        }
        const elementGuid = selectedGuid || selectedElement?.guid
        if (elementGuid) {
          const selected = await e.fragments.guidsToModelIdMap([elementGuid])
          if (Object.keys(selected).length) {
            await e.fragments.highlight(FOCUS_HIGHLIGHT, selected)
            if (selectedGuid) {
              await e.world.camera.fitToItems(selected)
              e.world.camera.enabled = true
              e.world.camera.controls.enabled = true
              await e.fragments.core.update(true)
              return
            }
          }
        }
        if (guids.length && !selectedElement) {
          const items = await e.fragments.guidsToModelIdMap(guids)
          if (Object.keys(items).length) {
            await e.world.camera.fitToItems(items)
            e.world.camera.enabled = true
            e.world.camera.controls.enabled = true
          }
        }
        await e.fragments.core.update(true)
      } catch (error) { console.warn('Failed to update 3D highlights:', error) }
    })()
    return () => { cancelled = true }
  }, [guids, selectedGuid, selectedElement?.guid, status, modelReady])

  function notifyPlacementChange(next: PlacedProduct[]) {
    placedRef.current = next
    setPlaced(next)
    onPlacementsChange?.(next)
  }

  function sceneRecord(placement: PlacedProduct, group: THREE.Group): ScenePlacement {
    let author = ''; let role = ''
    try { const person = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null'); author = person?.id || ''; role = person?.trade || '' } catch { /* anonymous demo placement */ }
    return { ...placement, position: [group.position.x, group.position.y, group.position.z],
      space_id: group.userData.spaceId || null, author, role }
  }

  async function persistPlacement(placement: PlacedProduct, group: THREE.Group) {
    try {
      const result = await saveScenePlacement(path, sceneRecord(placement, group))
      sceneVersionRef.current = Math.max(sceneVersionRef.current, result.version)
    } catch (error) { console.warn('Could not save shared 3D placement:', error) }
  }

  function drawScenePlacements(records: ScenePlacement[]) {
    const e = engine.current
    if (!e) return
    for (const group of placementsRef.current.values()) {
      e.world.scene.three.remove(group)
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
      })
    }
    placementsRef.current.clear()
    const next: PlacedProduct[] = []
    for (const record of records) {
      const product = catalog.find((candidate) => candidate.id === record.catalogId)
      if (!product) continue
      const group = makePlaceholder(product, record.instanceId)
      const position = record.position || [0, 0, 0]
      group.position.set(position[0], position[1], position[2])
      group.rotation.z = (record.rotationDeg || 0) * Math.PI / 180
      group.userData.floorZ = position[2]
      group.userData.spaceId = record.space_id || ''
      group.userData.roomName = record.space_id || ''
      e.world.scene.three.add(group)
      placementsRef.current.set(record.instanceId, group)
      const placedProduct: PlacedProduct = {
        instanceId: record.instanceId, catalogId: record.catalogId, name: record.name,
        width_mm: record.width_mm, depth_mm: record.depth_mm, height_mm: record.height_mm,
        price_eur: record.price_eur ?? product.price_eur, material: record.material || product.material,
        color_hex: record.color_hex || product.color_hex, mount: record.mount, rotationDeg: record.rotationDeg || 0,
        position: [position[0], position[1], position[2]], space_id: record.space_id,
      }
      next.push(placedProduct)
    }
    notifyPlacementChange(next)
    setSelectedPlacementId((current) => next.some((placement) => placement.instanceId === current) ? current : '')
  }

  useEffect(() => {
    if (!modelReady || !catalog.length) return
    let cancelled = false
    let timer: number | undefined
    const poll = async (initial = false) => {
      try {
        const snapshot = await getScene(path, initial ? undefined : sceneVersionRef.current)
        if (cancelled) return
        if (initial || snapshot.changed) drawScenePlacements(snapshot.placements || [])
        sceneVersionRef.current = snapshot.version
      } catch (error) { if (!cancelled) console.warn('Could not load shared 3D scene:', error) }
      if (!cancelled) timer = window.setTimeout(() => { void poll(false) }, 3000)
    }
    void poll(true)
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer) }
  }, [catalog, modelReady, path])

  function addProduct(productId = selectedProductId) {
    const e = engine.current
    const room = rooms.find((candidate) => candidate.key === selectedRoomKey)
    const product = catalog.find((candidate) => candidate.id === productId)
    if (!e || !room || !product) return
    const instanceId = crypto.randomUUID()
    const group = makePlaceholder(product, instanceId)
    const { min, max } = room.box
    const depth = product.depth_mm / 1000
    const height = product.height_mm / 1000
    const centerX = (min.x + max.x) / 2
    const centerY = (min.y + max.y) / 2
    const z = product.mount === 'ceiling' ? max.z - height / 2 : min.z + height / 2
    if (product.mount === 'wall') group.position.set(min.x + depth / 2, centerY, min.z + height / 2)
    else group.position.set(centerX, centerY, z)
    group.userData.floorZ = min.z + height / 2
    group.userData.roomName = room.name
    group.userData.spaceId = room.name
    e.world.scene.three.add(group)
    placementsRef.current.set(instanceId, group)
    const placement: PlacedProduct = {
      instanceId, catalogId: product.id, name: product.name,
      width_mm: product.width_mm, depth_mm: product.depth_mm, height_mm: product.height_mm,
      price_eur: product.price_eur, material: product.material, color_hex: product.color_hex,
      mount: product.mount, rotationDeg: 0, position: [group.position.x, group.position.y, group.position.z], space_id: room.name,
    }
    setSelectedPlacementId(instanceId)
    notifyPlacementChange([...placed, placement])
    void persistPlacement(placement, group)
  }

  function removeProduct() {
    const e = engine.current
    const group = placementsRef.current.get(selectedPlacementId)
    if (group) {
      e?.world.scene.three.remove(group)
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose() }
      })
      placementsRef.current.delete(selectedPlacementId)
      const instanceId = selectedPlacementId
      let author = ''
      try { author = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null')?.id || '' } catch { /* anonymous demo placement */ }
      void deleteScenePlacement(path, instanceId, author).then((result) => { sceneVersionRef.current = Math.max(sceneVersionRef.current, result.version) })
        .catch((error) => console.warn('Could not delete shared 3D placement:', error))
      const next = placed.filter((item) => item.instanceId !== selectedPlacementId)
      notifyPlacementChange(next)
      setSelectedPlacementId('')
    }
  }

  function rotateProduct() {
    const group = placementsRef.current.get(selectedPlacementId)
    if (!group) return
    group.rotation.z += Math.PI / 2
    const next = placed.map((item) => item.instanceId === selectedPlacementId
      ? { ...item, rotationDeg: (item.rotationDeg + 90) % 360 } : item)
    notifyPlacementChange(next)
    const product = next.find((item) => item.instanceId === selectedPlacementId)
    if (product) void persistPlacement(product, group)
  }

  function fitModel() {
    const e = engine.current
    if (!e) return
    const bounds = new THREE.Box3().setFromObject(e.world.scene.three)
    const diameter = Math.max(bounds.getSize(new THREE.Vector3()).length(), 0.1)
    e.world.camera.controls.maxDistance = diameter * 3
    void e.world.camera.fitToItems()
  }

  async function zoomToSelection() {
    const e = engine.current
    if (!e) return
    const focusGuid = selectedGuid || selectedElement?.guid
    if (focusGuid) {
      const items = await e.fragments.guidsToModelIdMap([focusGuid])
      if (Object.keys(items).length) { await e.world.camera.fitToItems(items); return }
    }
    const selectedGroup = placementsRef.current.get(selectedPlacementId)
    const room = rooms.find((candidate) => candidate.key === selectedRoomKey)
    let bounds = selectedGroup
      ? new THREE.Box3().setFromObject(selectedGroup)
      : room?.box
    if (!selectedGroup && selectedElement) {
      const model = [...e.fragments.list.values()].find((candidate) => candidate.modelId === selectedElement.modelId)
      if (model) bounds = (await model.getBoxes([selectedElement.localId]))[0] || bounds
    }
    if (!bounds || bounds.isEmpty()) return
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const distance = Math.max(size.length() * 1.8, 0.12)
    const direction = new THREE.Vector3(1, -1, 0.8).normalize().multiplyScalar(distance)
    await e.world.camera.controls.setLookAt(
      center.x + direction.x, center.y + direction.y, center.z + direction.z,
      center.x, center.y, center.z, true,
    )
  }

  function screenshot() {
    const renderer = engine.current?.world.renderer
    if (!renderer) return
    renderer.three.render(engine.current!.world.scene.three, engine.current!.world.camera.three)
    const source = renderer.three.domElement
    const annotated = document.createElement('canvas')
    annotated.width = source.width; annotated.height = source.height
    const context = annotated.getContext('2d')
    if (!context) return
    context.drawImage(source, 0, 0)
    const note = screenshotNote.trim()
    if (note) {
      const band = Math.max(52, Math.round(annotated.height * 0.075))
      context.fillStyle = 'rgba(18, 24, 32, 0.82)'; context.fillRect(0, annotated.height - band, annotated.width, band)
      context.fillStyle = '#fff'; context.font = `600 ${Math.max(18, Math.round(band * 0.38))}px system-ui, sans-serif`
      context.textBaseline = 'middle'; context.fillText(note.slice(0, 240), 20, annotated.height - band / 2, annotated.width - 40)
    }
    const dataUrl = annotated.toDataURL('image/png')
    const roomName = rooms.find((room) => room.key === selectedRoomKey)?.name ?? 'Selected room'
    onScreenshot?.(dataUrl, roomName, note)
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'trace-room-layout.png'
    link.click()
  }

  useEffect(() => {
    const e = engine.current
    const renderer = e?.world.renderer
    const canvas = renderer?.three.domElement
    if (!e || !renderer || !canvas || !modelReady) return
    const raycaster = new THREE.Raycaster()
    const point = new THREE.Vector2()
    let lastHoverAt = 0
    const inspectElement = async (model: FragmentsModel, localId: number, focus = false) => {
      try {
        const [rawData, boxes, guids] = await Promise.all([
          model.getItemsData([localId]), model.getBoxes([localId]), model.getGuidsByLocalIds([localId]),
        ])
        const data = (rawData[0] || {}) as Record<string, unknown>
        const category = classByLocalIdRef.current.get(localId) || readProperty(data, 'type') || readProperty(data, 'ifcClass') || 'IfcBuildingElement'
        const friendly = friendlyIfcCategory(category)
        const name = readProperty(data, 'Name') || readProperty(data, 'LongName') || `${friendly} ${localId}`
        const type = readProperty(data, 'ObjectType') || readProperty(data, 'PredefinedType') || readProperty(data, 'ElementType') || friendly
        const bounds = boxes[0]
        const size = bounds && !bounds.isEmpty() ? bounds.getSize(new THREE.Vector3()) : new THREE.Vector3()
        const center = bounds && !bounds.isEmpty() ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3()
        const room = rooms.find((candidate) => candidate.modelId === model.modelId && (candidate.localId === localId || candidate.box.containsPoint(center)))
        const storey = storeys.find((candidate) => candidate.itemIds.includes(localId))
        const guid = guids[0] || ''
        setSelectedElement({ localId, modelId: model.modelId, guid, category: friendly, name, type,
          storey: storey?.name || 'Unknown', room: room?.name || 'Unknown',
          dimensions: [size.x, size.y, size.z] })
        if (room && room.key !== selectedRoomKey) selectRoom(room.key)
        if (focus && bounds && !bounds.isEmpty()) {
          const target = bounds.getCenter(new THREE.Vector3())
          const distance = Math.max(bounds.getSize(new THREE.Vector3()).length() * 1.8, 0.12)
          const offset = new THREE.Vector3(1, -1, 0.8).normalize().multiplyScalar(distance)
          await e.world.camera.controls.setLookAt(target.x + offset.x, target.y + offset.y, target.z + offset.z,
            target.x, target.y, target.z, true)
        }
      } catch (error) { console.warn('Could not inspect IFC element:', error) }
    }
    const onPointerDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(point, e.world.camera.three)
      const hit = raycaster.intersectObjects([...placementsRef.current.values()], true)[0]
      if (!hit) return
      let node: THREE.Object3D | null = hit.object
      while (node && !placementsRef.current.has(node.name)) node = node.parent
      if (!node) return
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = { id: node.name, plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -node.position.z) }
      draggedRef.current = false
      setSelectedPlacementId(node.name)
      canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) {
        const now = performance.now()
        if (now - lastHoverAt < 180) return
        lastHoverAt = now
        const rect = canvas.getBoundingClientRect()
        point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
        raycaster.setFromCamera(point, e.world.camera.three)
        const hoverPoint = point.clone()
        void (async () => {
          for (const model of e.fragments.list.values()) {
            try {
              const hit = await model.raycast({ camera: e.world.camera.three, mouse: hoverPoint, dom: canvas })
              if (!hit) continue
              const data = (await model.getItemsData([hit.localId]))[0] as Record<string, unknown> | undefined
              const category = classByLocalIdRef.current.get(hit.localId) || 'IfcBuildingElement'
              canvas.title = `${friendlyIfcCategory(category)} · ${readProperty(data || {}, 'Name') || 'Unnamed element'}`
              return
            } catch { /* No hover hit is a normal pointer position. */ }
          }
          canvas.title = ''
        })()
        return
      }
      const rect = canvas.getBoundingClientRect()
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(point, e.world.camera.three)
      const intersection = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3())
      const group = placementsRef.current.get(drag.id)
      if (intersection && group) {
        group.position.x = intersection.x
        group.position.y = intersection.y
        draggedRef.current = true
        renderer.needsUpdate = true
      }
    }
    const onPointerUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      if (drag && draggedRef.current) {
        const group = placementsRef.current.get(drag.id)
        const product = placedRef.current.find((item) => item.instanceId === drag.id)
        if (group && product) {
          const next = placedRef.current.map((item) => item.instanceId === drag.id
            ? { ...item, position: [group.position.x, group.position.y, group.position.z] as [number, number, number] } : item)
          notifyPlacementChange(next)
          void persistPlacement(product, group)
        }
      }
      setTimeout(() => { draggedRef.current = false }, 0)
    }
    const onClick = async (event: MouseEvent) => {
      if (draggedRef.current) return
      const rect = canvas.getBoundingClientRect()
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(point, e.world.camera.three)
      const clickPoint = point.clone()
      if (raycaster.intersectObjects([...placementsRef.current.values()], true).length) return
      for (const model of e.fragments.list.values()) {
        try {
          const hit = await model.raycast({ camera: e.world.camera.three, mouse: clickPoint, dom: canvas })
          if (!hit) continue
          await inspectElement(model, hit.localId)
          break
        } catch { /* A click outside model geometry is not a room selection. */ }
      }
    }
    const onDoubleClick = async (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(point, e.world.camera.three)
      const doubleClickPoint = point.clone()
      for (const model of e.fragments.list.values()) {
        try {
          const hit = await model.raycast({ camera: e.world.camera.three, mouse: doubleClickPoint, dom: canvas })
          if (!hit) continue
          await inspectElement(model, hit.localId, true)
          return
        } catch { /* Ignore empty double-clicks. */ }
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('pointerup', onPointerUp, true)
    canvas.addEventListener('pointercancel', onPointerUp, true)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('dblclick', onDoubleClick)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('pointerup', onPointerUp, true)
      canvas.removeEventListener('pointercancel', onPointerUp, true)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('dblclick', onDoubleClick)
    }
  }, [modelReady, onSelectRoom, rooms])

  return <div className="viewer">
    <BuildingExplorer
      storeys={storeys}
      selectedStoreyId={selectedStoreyId}
      onSelectStorey={(id) => setSelectedStoreyId(id)}
      trades={trades}
      onToggleTrade={toggleTrade}
      disabled={!modelReady || !explorerReady}
    />
    <div className="viewer-bar furniture-bar">
      <span className="path">{path}</span>
      <span className="catalog-label">Demo catalog</span>
      {guids.length > 0 && <span>{guids.length} element{guids.length === 1 ? '' : 's'} highlighted</span>}
      {selectedGuid && <span className="dim"> · Focused: {selectedGuid.slice(0, 8)}…</span>}
      <button disabled={!modelReady} onClick={fitModel}>Fit</button>
      <button disabled={!modelReady || (!selectedGuid && !selectedElement && !selectedPlacementId && !selectedRoomKey)} onClick={() => void zoomToSelection()}>Zoom to selection</button>
      <label className="furniture-room-select">Room
        <select aria-label="Room" value={selectedRoomKey} onChange={(event) => selectRoom(event.target.value)}>
          <option value="">Select a room…</option>
          {rooms.map((room) => <option key={room.key} value={room.key}>{room.name}</option>)}
        </select>
        <small>Determines where furniture is placed; it does not change the catalog.</small>
      </label>
      <button disabled={!selectedRoomKey || !modelReady} onClick={() => setCatalogOpen(true)}>Add furniture</button>
      <button disabled={!placed.length} onClick={rotateProduct}>Rotate 90°</button>
      <button disabled={!selectedPlacementId} onClick={removeProduct}>Delete</button>
      <span className="dim small">{placed.length} placed</span>
      <input aria-label="Screenshot note" value={screenshotNote} onChange={event => setScreenshotNote(event.target.value)} placeholder="Screenshot note…" />
      <button disabled={!modelReady} onClick={screenshot}>Screenshot</button>
    </div>
    {status && <div className="status">{status}</div>}
    {selectedRoomKey && <div className="status room-hint">Selected room: {rooms.find((room) => room.key === selectedRoomKey)?.name ?? 'IfcSpace'} · click a room in the model to change selection</div>}
    <div className="three" ref={box}>
      {selectedElement && <aside className="ifc-info-card" aria-label="Selected IFC element details">
        <div className="ifc-info-heading"><div><span>{selectedElement.category}</span><h3>{selectedElement.name}</h3></div>
          <button aria-label="Close element details" onClick={() => setSelectedElement(null)}>×</button></div>
        <dl>
          <dt>Type</dt><dd>{selectedElement.type}</dd>
          <dt>Storey</dt><dd>{selectedElement.storey}</dd>
          <dt>Room</dt><dd>{selectedElement.room}</dd>
          <dt>Dimensions</dt><dd>{selectedElement.dimensions.map((value) => `${value.toFixed(2)} m`).join(' × ')}</dd>
          <dt>GUID</dt><dd className="ifc-guid">{selectedElement.guid || 'Unavailable'}</dd>
        </dl>
        <small>Double-click the element to zoom in.</small>
      </aside>}
    </div>
    {catalogOpen && <FurnitureCatalogModal products={catalog}
      roomName={rooms.find((room) => room.key === selectedRoomKey)?.name || 'No room selected'}
      createModel={makeCatalogThumbnailModel}
      onPlace={(product) => { setSelectedProductId(product.id); addProduct(product.id); setCatalogOpen(false) }}
      onClose={() => setCatalogOpen(false)} />}
  </div>
}

/** IFC model viewer with evidence highlighting and a furniture demo placement layer. */
export default function IfcViewer(props: Props) {
  return <IfcErrorBoundary><IfcViewerInner {...props} /></IfcErrorBoundary>
}
