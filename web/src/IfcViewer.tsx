import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import * as OBC from '@thatopen/components'
import * as THREE from 'three'
import { englishRoomName, storeyEnglish } from './roomNames'
import { RenderedFaces } from '@thatopen/fragments'
import { deleteScenePlacement, fileUrl, getScene, getRoomMedia, postRoomChat, saveScenePlacement, type ScenePlacement } from './api'
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
  applyExplodedView,
  type StoreyInfo,
  type TradeKey,
  type TradesState,
} from './viewer3d'
import type { FragmentsModel } from '@thatopen/fragments'
import type { CollabState, RoomStatus } from './types'

interface Props {
  path: string
  guids: string[]
  selectedGuid?: string | null
  onSelectGuid?: (guid: string) => void
  onPlacementsChange?: (placements: PlacedProduct[]) => void
  onScreenshot?: (dataUrl: string, roomName: string, note: string) => void
  onSelectRoom?: (room: { id: string; name: string } | null) => void
  onRoomAction?: (tab: 'Chat' | 'Photos' | 'Schedule') => void
  previewRoomGuid?: string
  previewRoomStatus?: RoomStatus | null
  collab?: CollabState
  onCollabChange?: (state: CollabState) => void
  /** Gigi Interior 3D: an IfcSpace GlobalId to isolate. */
  isolateSpaceGuid?: string | null
  /** Evidence labels supplied by the Ask adapter. */
  elementTags?: { guid: string; code: string; verified: boolean; issue?: boolean }[]
  /** Measured fixture-to-wall distances in millimetres. */
  clearances?: { guid: string; left?: number; right?: number; front?: number; rear?: number }
  /** Room dimensions in metres, supplied by the Gigi Real3D adapter. */
  roomDims?: { L?: number; B?: number; H?: number }
  storeyId?: string | null
  onStoreys?: (list: { id: string; name: string; elevation: number }[]) => void
  visibleLayers?: Partial<Record<'architecture' | 'sanitary' | 'hvac' | 'electrical' | 'dimensions', boolean>>
  /** Suppress the room-name overlay for compact/Interior rendering. */
  hideRoomLabels?: boolean
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
  number?: string
  areaM2?: number
  storeyId?: string
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

interface ScreenClearanceLine { side: 'left' | 'right' | 'front' | 'rear'; value: number; x1: number; y1: number; x2: number; y2: number }

function readProperty(data: Record<string, unknown>, key: string): string {
  const raw = data[key]
  if (raw && typeof raw === 'object' && 'value' in raw) return String((raw as { value: unknown }).value ?? '')
  return raw === undefined || raw === null ? '' : String(raw)
}

function findIfcMeasure(data: unknown, names: string[]): number | undefined {
  const wanted = new Set(names.map(name => name.toLowerCase()))
  const visited = new WeakSet<object>()
  let result: number | undefined
  const numeric = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      for (const key of ['value', 'wrappedValue', 'AreaValue', 'NominalValue']) {
        const found = numeric(record[key])
        if (found !== undefined) return found
      }
    }
    return undefined
  }
  const visit = (value: unknown) => {
    if (result !== undefined || value === null || value === undefined) return
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (typeof value !== 'object') return
    if (visited.has(value)) return
    visited.add(value)
    const record = value as Record<string, unknown>
    const name = readProperty(record, 'Name').toLowerCase()
    if (wanted.has(name)) {
      for (const key of ['AreaValue', 'NominalValue', 'value', 'Value']) {
        result = numeric(record[key])
        if (result !== undefined) return
      }
    }
    for (const child of Object.values(record)) visit(child)
  }
  visit(data)
  return result
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

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>
type ViewerEngine = { components: OBC.Components; world: World; fragments: OBC.FragmentsManager }

const HIGHLIGHT = { color: new THREE.Color('#E9B949'), renderedFaces: RenderedFaces.TWO, opacity: 1, transparent: false }
const FOCUS_HIGHLIGHT = { color: new THREE.Color('#202427'), renderedFaces: RenderedFaces.TWO, opacity: 1, transparent: false }
const EMPTY_COLLAB: CollabState = { status: {}, messages: [] }
const EMPTY_ELEMENT_TAGS: NonNullable<Props['elementTags']> = []

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

function IfcViewerInner({ path, guids, selectedGuid, onSelectGuid, onPlacementsChange, onScreenshot, onSelectRoom, onRoomAction, previewRoomGuid, previewRoomStatus, collab = EMPTY_COLLAB, onCollabChange, isolateSpaceGuid, elementTags = [], clearances, roomDims, storeyId, onStoreys, visibleLayers, hideRoomLabels = false }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<ViewerEngine | null>(null)
  const placementsRef = useRef(new Map<string, THREE.Group>())
  const placedRef = useRef<PlacedProduct[]>([])
  const sceneVersionRef = useRef(0)
  const dragRef = useRef<{ id: string; plane: THREE.Plane } | null>(null)
  const draggedRef = useRef(false)
  const walkPositionRef = useRef(new THREE.Vector3())
  const walkYawRef = useRef(0)
  const walkPitchRef = useRef(0)
  const walkFloorZRef = useRef(0)
  const walkAvatarRef = useRef<THREE.Group | null>(null)
  const savedWalkCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null>(null)
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
  const [popupPosition, setPopupPosition] = useState({ x: 16, y: 16 })
  const [popupNote, setPopupNote] = useState('')
  const [popupFeedback, setPopupFeedback] = useState('')
  const [popupMediaCount, setPopupMediaCount] = useState(0)
  const [storeys, setStoreys] = useState<StoreyInfo[]>([])
  const [selectedStoreyId, setSelectedStoreyId] = useState<string | null>(null)
  const [trades, setTrades] = useState<TradesState>(createInitialTrades)
  const [allLocalIds, setAllLocalIds] = useState<number[]>([])
  const [explorerReady, setExplorerReady] = useState(false)
  const [exploded, setExploded] = useState(false)
  const [exploding, setExploding] = useState(false)
  const [peelStep, setPeelStep] = useState(0)
  const [planView, setPlanView] = useState(false)
  const [inspectedRoomKey, setInspectedRoomKey] = useState('')
  const [hoveredRoomKey, setHoveredRoomKey] = useState('')
  const [walkMode, setWalkMode] = useState(false)
  const [walkMap, setWalkMap] = useState({ x: 0, y: 0, yaw: 0 })
  const [helpOpen, setHelpOpen] = useState(false)
  const [showFirstWalkHint, setShowFirstWalkHint] = useState(false)
  const [walkHelpVisible, setWalkHelpVisible] = useState(false)
  const [elementTagPositions, setElementTagPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [clearanceLines, setClearanceLines] = useState<ScreenClearanceLine[]>([])
  const walkHelpTimerRef = useRef<number | null>(null)
  const [showcase, setShowcase] = useState(false)
  const [showcaseDegraded, setShowcaseDegraded] = useState(false)
  const [touring, setTouring] = useState(false)
  const [tourStage, setTourStage] = useState(0)
  const [recording, setRecording] = useState(false)
  const [transparentCapture, setTransparentCapture] = useState(false)
  const [buildingView, setBuildingView] = useState<'whole' | 'interior'>('whole')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(50)
  const showcaseLightsRef = useRef<THREE.Group | null>(null)
  const explodeAnimationRef = useRef<number | null>(null)
  const tourAnimationRef = useRef<number | null>(null)
  const tourDoneRef = useRef<(() => void) | null>(null)
  const recordingRef = useRef<{ recorder: MediaRecorder; frame: number; stream: MediaStream } | null>(null)
  const modelRef = useRef<FragmentsModel | null>(null)
  const classByLocalIdRef = useRef(new Map<number, string>())
  const modelBoundsRef = useRef<THREE.Box3 | null>(null)
  const roomSectionBoundsRef = useRef<THREE.Box3 | null>(null)
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null)
  const selectionOutlineRef = useRef<THREE.Box3Helper | null>(null)
  const presentTrades = Object.values(trades).filter((trade) => trade.count > 0)
  const onlyTrade = presentTrades.length === 1 ? presentTrades[0] : null
  // Real3D unmounts these props when returning to Whole Building. Keep the
  // viewer defensive so an old render cannot leave evidence hovering behind.
  const interiorElementTags = isolateSpaceGuid ? elementTags : EMPTY_ELEMENT_TAGS

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
    setInspectedRoomKey('')
    setHoveredRoomKey('')
    setWalkMode(false)
    setSelectedRoomKey('')
    setSelectedElement(null)
    setPlaced([])
    setStoreys([])
    setSelectedStoreyId(null)
    setTrades(createInitialTrades())
    setAllLocalIds([])
    setExplorerReady(false)
    setExploded(false)
    setExploding(false)
    setPeelStep(0)
    setShowcase(false)
    setTouring(false)
    setTourStage(0)
    setRecording(false)
    if (explodeAnimationRef.current !== null) cancelAnimationFrame(explodeAnimationRef.current)
    if (tourAnimationRef.current !== null) cancelAnimationFrame(tourAnimationRef.current)
    explodeAnimationRef.current = null
    tourAnimationRef.current = null
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
    setStatus('Loading 3D model… (large models take ~10 s)')
    ;(async () => {
      try {
        components = new OBC.Components()
        const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>()
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = new THREE.Color('#f5f3ee')
        world.scene.three.add(new THREE.HemisphereLight('#ffffff', '#d8d2c4', .9))
        const softKey = new THREE.DirectionalLight('#fff6dc', 1.15)
        softKey.position.set(12, -10, 18)
        softKey.castShadow = false
        softKey.shadow.mapSize.set(1024, 1024)
        softKey.shadow.camera.near = .1
        softKey.shadow.camera.far = 80
        world.scene.three.add(softKey)
        keyLightRef.current = softKey
        world.renderer = new OBC.SimpleRenderer(components, box.current!, { preserveDrawingBuffer: true, logarithmicDepthBuffer: true })
        world.camera = new OBC.OrthoPerspectiveCamera(components)
        components.init()
        world.camera.controls.minDistance = 2
        world.camera.controls.dollyToCursor = true
        world.camera.controls.mouseButtons.wheel = world.camera.controls.mouseButtons.middle
        const grid = components.get(OBC.Grids).create(world)
        grid.visible = false

        const fragments = components.get(OBC.FragmentsManager)
        engine.current = { components, world, fragments }
        setStatus('Loading 3D model… (large models take ~10 s)')
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
        setStatus('Loading 3D model… (large models take ~10 s)')
        const res = await fetch(fileUrl(path))
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch ${path}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        setStatus('Loading 3D model… (large models take ~10 s)')
        const loadedModel = await loader.load(bytes, true, path)
        if (cancelled) return
        modelRef.current = loadedModel
        const [allByClass, loadedStoreys] = await Promise.all([
          loadIfcClassItems(loadedModel),
          loadStoreys(loadedModel),
        ])
        if (cancelled) return
        const baseElevation = loadedStoreys[0]?.elevation ?? 0
        const displayOffset = Math.abs(baseElevation) > 5 ? baseElevation : 0
        const nextStoreys = loadedStoreys.map(floor => ({ ...floor, displayElevation: floor.elevation - displayOffset }))
        classByLocalIdRef.current = new Map(Object.entries(allByClass).flatMap(([className, ids]) => ids.map((id) => [id, className] as const)))
        const nextTrades = classifyModelTrades(loadedModel, allByClass)
        await applyTradeColors(loadedModel, nextTrades)
        const ids = new Set(allModelLocalIds(allByClass))
        for (const id of await loadedModel.getLocalIds()) ids.add(id)
        // Survey terrain and georeferencing meshes make several public IFCs
        // (notably FZK) appear as a tiny building on a giant brown slab.
        const siteClutterIds = Object.entries(allByClass)
          .filter(([ifcClass]) => /IFCSITE|IFCGEOGRAPHICELEMENT/i.test(ifcClass))
          .flatMap(([, localIds]) => localIds)
        siteClutterIds.forEach((id) => ids.delete(id))
        if (siteClutterIds.length) await loadedModel.setVisible(siteClutterIds, false)
        for (const storey of nextStoreys) {
          ids.add(storey.localId)
          for (const id of storey.itemIds) ids.add(id)
        }
        setStoreys(nextStoreys.map(storey => ({ ...storey, name: storeyEnglish(storey.name) })))
        setSelectedStoreyId(null)
        setTrades(nextTrades)
        setAllLocalIds([...ids])
        setExplorerReady(true)

        try {
          const byCategory = await loadedModel.getItemsOfCategories([/IFCSPACE/i])
          const spaceIds = [...new Set(Object.values(byCategory).flat())]
          if (spaceIds.length) {
            const [data, boxes, guidsById] = await Promise.all([
              loadedModel.getItemsData(spaceIds, { attributesDefault: true, relations: { IsDefinedBy: { attributes: true, relations: true } } }),
              loadedModel.getBoxes(spaceIds), loadedModel.getGuidsByLocalIds(spaceIds),
            ])
            if (cancelled) return
            const nextRooms = spaceIds.flatMap((localId, index) => {
              const attributes = data[index] ?? {}
              const read = (key: string) => {
                const raw = attributes[key] as { value?: unknown } | undefined
                return raw?.value === undefined || raw?.value === null ? '' : String(raw.value)
              }
              const name = read('LongName') || read('Name') || `Room ${localId}`
              const roomBox = boxes[index]
              if (!roomBox || roomBox.isEmpty()) return []
              const areaValue = Number(read('NetFloorArea') || read('GrossFloorArea') || read('Area'))
                || findIfcMeasure(attributes, ['NetFloorArea', 'GrossFloorArea'])
              const centerY = roomBox.getCenter(new THREE.Vector3()).y
              const roomStorey = nextStoreys.find(floor => floor.itemIds.includes(localId))
                ?? [...nextStoreys].sort((a, b) => Math.abs(a.elevation - centerY) - Math.abs(b.elevation - centerY))[0]
              return [{ key: `${loadedModel.modelId}:${localId}`, modelId: loadedModel.modelId, localId, name,
                guid: guidsById[index] ?? '', box: roomBox, number: read('Tag') || read('Reference'),
                areaM2: typeof areaValue === 'number' && Number.isFinite(areaValue) && areaValue > 0 ? areaValue : undefined, storeyId: roomStorey?.id }]
            })
            setRooms(nextRooms)
            if (nextRooms.length) {
              setSelectedRoomKey(nextRooms[0].key)
            }
          }
        } catch (error) { console.warn('Could not list IFC spaces:', error) }

        const modelBoxes = await loadedModel.getBoxes([...ids])
        const modelBounds = new THREE.Box3()
        for (const itemBox of modelBoxes) if (itemBox && !itemBox.isEmpty()) modelBounds.union(itemBox)
        if (modelBounds.isEmpty()) modelBounds.setFromObject(loadedModel.object)
        const initialCenter = modelBounds.getCenter(new THREE.Vector3())
        const initialDiameter = Math.max(modelBounds.getSize(new THREE.Vector3()).length(), 1)
        await world.camera.controls.setLookAt(
          initialCenter.x + initialDiameter * .65, initialCenter.y + initialDiameter * .52, initialCenter.z - initialDiameter * .65,
          initialCenter.x, initialCenter.y, initialCenter.z, false,
        )
        modelBoundsRef.current = modelBounds.clone()
        const modelDiameter = Math.max(modelBounds.getSize(new THREE.Vector3()).length(), 0.1)
        world.camera.three.near = .08
        world.camera.three.far = Math.max(modelDiameter * 5, 80)
        world.camera.three.updateProjectionMatrix()
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
      if (explodeAnimationRef.current !== null) cancelAnimationFrame(explodeAnimationRef.current)
      if (tourAnimationRef.current !== null) cancelAnimationFrame(tourAnimationRef.current)
      stopRecording()
      walkAvatarRef.current?.removeFromParent()
      walkAvatarRef.current = null
      showcaseLightsRef.current?.removeFromParent()
      showcaseLightsRef.current = null
      engine.current = null
      if (components) { try { components.dispose() } catch { /* best effort */ } }
    }
  }, [path])

  useEffect(() => {
    const current = engine.current
    if (!current?.world.renderer) return
    const scene = current.world.scene.three
    showcaseLightsRef.current?.removeFromParent()
    showcaseLightsRef.current = null
    if (!showcase) {
      scene.background = new THREE.Color('#f5f3ee')
      current.world.renderer.three.shadowMap.enabled = false
      current.world.renderer.needsUpdate = true
      return
    }
    const group = new THREE.Group()
    const fill = new THREE.AmbientLight('#718096', .55)
    const hemi = new THREE.HemisphereLight('#9db9d1', '#121820', 1.1)
    const key = new THREE.DirectionalLight('#fff1d5', 2.4)
    key.position.set(18, -16, 28)
    key.castShadow = !showcaseDegraded
    key.shadow.mapSize.set(showcaseDegraded ? 512 : 1024, showcaseDegraded ? 512 : 1024)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(200, 96), new THREE.MeshStandardMaterial({ color: '#15202c', roughness: .88, metalness: .05, transparent: true, opacity: .92 }))
    disc.position.z = -0.04; disc.receiveShadow = true
    group.add(fill, hemi, key, disc)
    scene.add(group)
    scene.background = new THREE.Color('#080d14')
    current.world.renderer.three.shadowMap.enabled = !showcaseDegraded
    current.world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap
    current.world.renderer.needsUpdate = true
    showcaseLightsRef.current = group
    return () => { group.removeFromParent() }
  }, [showcase, showcaseDegraded, modelReady])

  useEffect(() => {
    const current = engine.current
    const keyLight = keyLightRef.current
    if (!current?.world.renderer || !keyLight) return
    // Soft shadows improve depth in the small cutaway, but stay off for a full building.
    keyLight.castShadow = Boolean(isolateSpaceGuid)
    current.world.renderer.three.shadowMap.enabled = Boolean(isolateSpaceGuid || showcase)
    current.world.renderer.needsUpdate = true
  }, [isolateSpaceGuid, showcase])

  useEffect(() => {
    const current = engine.current
    const model = modelRef.current
    const guid = selectedGuid || selectedElement?.guid
    selectionOutlineRef.current?.removeFromParent()
    selectionOutlineRef.current = null
    if (!current || !model || !guid || !allLocalIds.length) return
    let cancelled = false
    void (async () => {
      const [guidsById, boxes] = await Promise.all([model.getGuidsByLocalIds(allLocalIds), model.getBoxes(allLocalIds)])
      const index = guidsById.findIndex(item => item === guid)
      const selectedBox = index >= 0 ? boxes[index] : undefined
      if (cancelled || !selectedBox || selectedBox.isEmpty()) return
      const outline = new THREE.Box3Helper(selectedBox.clone().expandByScalar(.015), new THREE.Color('#E9B949'))
      const outlineMaterial = outline.material as THREE.LineBasicMaterial
      outlineMaterial.transparent = true
      outlineMaterial.opacity = .95
      current.world.scene.three.add(outline)
      selectionOutlineRef.current = outline
    })().catch(error => console.warn('[Trace] could not outline selected element', error))
    return () => { cancelled = true; selectionOutlineRef.current?.removeFromParent(); selectionOutlineRef.current = null }
  }, [allLocalIds, selectedElement?.guid, selectedGuid])

  useEffect(() => { setShowcaseDegraded(allLocalIds.length > 18000) }, [allLocalIds.length])

  function animateExplode(open: boolean) {
    const model = modelRef.current
    if (!model || !storeys.length || exploding) return
    if (explodeAnimationRef.current) cancelAnimationFrame(explodeAnimationRef.current)
    setExploding(true)
    const started = performance.now()
    const duration = 950
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      const ease = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const progress = open ? ease : 1 - ease
      void applyExplodedView(model, storeys, progress, 6, placementsRef.current)
      if (t < 1) explodeAnimationRef.current = requestAnimationFrame(tick)
      else { setExploded(open); setExploding(false); explodeAnimationRef.current = null }
    }
    explodeAnimationRef.current = requestAnimationFrame(tick)
  }

  const tourCaptions = ['Whole building', 'Exploded construction', 'A floor at a glance', 'A room in context', 'Walk through', 'Back to the whole building']

  function stopTour() {
    if (tourAnimationRef.current !== null) cancelAnimationFrame(tourAnimationRef.current)
    tourAnimationRef.current = null
    const e = engine.current
    if (e) e.world.camera.controls.enabled = true
    setTouring(false)
    setTourStage(0)
    const done = tourDoneRef.current
    tourDoneRef.current = null
    done?.()
  }

  function startTour(onDone?: () => void) {
    const e = engine.current
    const model = modelRef.current
    if (!e || !model || !modelReady) return
    stopTour()
    tourDoneRef.current = onDone ?? null
    setShowcase(true)
    setTouring(true)
    const camera = e.world.camera.three
    const controls = e.world.camera.controls
    const bounds = new THREE.Box3().setFromObject(model.object)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const distance = Math.max(size.x, size.y, size.z, 8) * 1.25
    const curve = new THREE.CatmullRomCurve3([
      center.clone().add(new THREE.Vector3(distance, -distance, distance * .65)),
      center.clone().add(new THREE.Vector3(-distance * .9, -distance * .72, distance * .42)),
      center.clone().add(new THREE.Vector3(-distance * .66, distance, distance * .5)),
      center.clone().add(new THREE.Vector3(distance * .82, distance * .78, distance * .62)),
    ], true, 'catmullrom', .35)
    const featuredRoom = rooms.find(room => room.key === selectedRoomKey) ?? rooms[0]
    controls.stop(); controls.enabled = false
    const started = performance.now()
    const duration = 40000
    let lastStage = -1
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - started) / duration)
      const stage = Math.min(5, Math.floor(ratio * 6))
      if (stage !== lastStage) {
        lastStage = stage; setTourStage(stage)
        if (stage === 1) void applyExplodedView(model, storeys, 1, 6, placementsRef.current)
        if (stage === 2) { void applyExplodedView(model, storeys, 0, 6, placementsRef.current); if (featuredRoom?.storeyId) setSelectedStoreyId(featuredRoom.storeyId) }
        if (stage === 3 && featuredRoom) { selectRoom(featuredRoom.key); if (featuredRoom.storeyId) setSelectedStoreyId(featuredRoom.storeyId) }
        if (stage === 5) { setSelectedStoreyId(null); void applyExplodedView(model, storeys, 0, 6, placementsRef.current) }
      }
      const point = curve.getPointAt((ratio * 1.14) % 1)
      const target = stage >= 3 && featuredRoom ? featuredRoom.box.getCenter(new THREE.Vector3()) : center
      const roomScale = featuredRoom ? Math.max(...featuredRoom.box.getSize(new THREE.Vector3()).toArray(), 1) : 1
      if (stage === 3 || stage === 4) point.lerp(target.clone().add(new THREE.Vector3(roomScale * 1.15, -roomScale * 1.15, roomScale * .8)), .72)
      camera.position.copy(point)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      if (ratio < 1) tourAnimationRef.current = requestAnimationFrame(tick)
      else stopTour()
    }
    tourAnimationRef.current = requestAnimationFrame(tick)
  }

  function downloadBlob(blob: Blob, filename: string) {
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url; link.download = filename; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function stopRecording() {
    const active = recordingRef.current
    if (!active) return
    recordingRef.current = null
    cancelAnimationFrame(active.frame)
    active.stream.getTracks().forEach(track => track.stop())
    if (active.recorder.state !== 'inactive') active.recorder.stop()
    setRecording(false)
  }

  function recordTour() {
    const source = engine.current?.world.renderer?.three.domElement
    if (!source || typeof MediaRecorder === 'undefined') { setStatus('Video recording is not supported in this browser.'); return }
    const output = document.createElement('canvas')
    output.width = 1920; output.height = 1080
    const context = output.getContext('2d')
    if (!context || !output.captureStream) { setStatus('Video recording is not supported in this browser.'); return }
    let frame = 0
    const draw = () => { context.drawImage(source, 0, 0, output.width, output.height); frame = requestAnimationFrame(draw); if (recordingRef.current) recordingRef.current.frame = frame }
    draw()
    const stream = output.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => downloadBlob(new Blob(chunks, { type: mimeType }), 'trace-showcase-tour.webm')
    recordingRef.current = { recorder, frame, stream }
    recorder.start(1000)
    setRecording(true)
    startTour(stopRecording)
  }

  function saveHiResScreenshot() {
    const e = engine.current
    const source = e?.world.renderer?.three.domElement
    if (!e || !source) return
    const renderer = e.world.renderer?.three
    if (!renderer) return
    const scene = e.world.scene.three
    const originalBackground = scene.background
    if (transparentCapture) { scene.background = null; renderer.setClearColor(0x000000, 0); renderer.render(scene, e.world.camera.three) }
    const output = document.createElement('canvas')
    output.width = source.width * 2; output.height = source.height * 2
    output.getContext('2d')?.drawImage(source, 0, 0, output.width, output.height)
    if (transparentCapture) { scene.background = originalBackground; renderer.setClearColor(0x000000, 1); renderer.render(scene, e.world.camera.three) }
    output.toBlob(blob => { if (blob) downloadBlob(blob, `trace-showcase-${transparentCapture ? 'transparent-' : ''}2x.png`) }, 'image/png')
  }

  useEffect(() => {
    const cancelTour = (event: KeyboardEvent) => { if (event.key === 'Escape' && touring) { event.preventDefault(); stopTour() } }
    window.addEventListener('keydown', cancelTour)
    return () => window.removeEventListener('keydown', cancelTour)
  }, [touring])

  function advancePeel() {
    const next = (peelStep + 1) % 4
    setPeelStep(next)
    const model = modelRef.current
    if (!model) return
    void (async () => {
      const architecture = trades.architecture.itemIds
      if (architecture.length) await model.setOpacity(architecture, next >= 2 ? .2 : 1)
      const roofAndSlabs = trades.structure.itemIds
      if (roofAndSlabs.length) await model.setOpacity(roofAndSlabs, next >= 1 ? .35 : 1)
      await applyTradeColors(model, trades)
    })()
  }

  useEffect(() => {
    const advance = (event: KeyboardEvent) => { if (event.code === 'Space' && modelReady && !walkMode) { event.preventDefault(); advancePeel() } }
    window.addEventListener('keydown', advance)
    return () => window.removeEventListener('keydown', advance)
  }, [modelReady, walkMode, peelStep, trades])

  useEffect(() => {
    const current = engine.current
    const model = modelRef.current
    if (!current || !current.world.renderer || !model || !explorerReady) return
    const selectedStorey = selectedStoreyId ? storeys.find(item => item.id === selectedStoreyId) ?? null : null
    const sectionRoom = isolateSpaceGuid ? rooms.find(candidate => candidate.guid === isolateSpaceGuid) : undefined
    if (sectionRoom) {
      roomSectionBoundsRef.current = null
      const roomStorey = sectionRoom.storeyId ? storeys.find(storey => storey.id === sectionRoom.storeyId) ?? null : null
      applyStoreyCut(current.components, current.world, model, roomStorey)
    } else {
      roomSectionBoundsRef.current = null
      applyStoreyCut(current.components, current.world, model, planView ? selectedStorey : null)
    }
    if (walkMode && selectedStorey && current.world.renderer) {
      const cutZ = Math.max(selectedStorey.elevation + 3.2, walkFloorZRef.current + 1.2)
      model.useClippingPlanes([new THREE.Plane(new THREE.Vector3(0, 0, -1), cutZ)])
      current.world.renderer.three.localClippingEnabled = true
      current.world.renderer.needsUpdate = true
    }
    void (async () => {
      await applyExplodedView(model, storeys, exploded, 6, placementsRef.current)
      await applyTradeColors(model, trades)
      let visibleIds = allLocalIds
      if (walkMode) {
        const room = rooms.find(candidate => candidate.key === selectedRoomKey)
        if (room) {
          const bounds = room.box.clone().expandByVector(new THREE.Vector3(1.2, 1.2, 2.8))
          const boxes = await model.getBoxes(allLocalIds)
          visibleIds = allLocalIds.filter((_, index) => boxes[index]?.intersectsBox(bounds))
        }
      } else if (previewRoomGuid) {
        const room = rooms.find(candidate => candidate.guid === previewRoomGuid)
        if (room) {
          const boxes = await model.getBoxes(allLocalIds)
          const roomBounds = room.box.clone()
          visibleIds = allLocalIds.filter((_, index) => boxes[index]?.intersectsBox(roomBounds))
          const hidden = allLocalIds.filter(id => !visibleIds.includes(id))
          if (hidden.length) await model.setVisible(hidden, false)
          const walls = visibleIds.filter(id => /IFCWALL/i.test(classByLocalIdRef.current.get(id) || ''))
          if (previewRoomStatus === 'missing_wall' && walls.length) {
            await model.setColor(walls, new THREE.Color('#D84B45'))
            await model.setOpacity(walls, 0.58)
          }
        }
      }
      await applyBuildingVisibility(model, storeys, selectedStoreyId, trades, visibleIds, walkMode)
    })()
  }, [allLocalIds, explorerReady, exploded, isolateSpaceGuid, planView, previewRoomGuid, previewRoomStatus, roomDims, rooms, selectedStoreyId, storeys, trades, walkMode])

  useEffect(() => {
    const camera = engine.current?.world.camera
    if (!camera) return
    if (!isolateSpaceGuid) {
      const modelBounds = modelBoundsRef.current
      const diagonal = modelBounds ? Math.max(modelBounds.getSize(new THREE.Vector3()).length(), 1) : 1
      camera.controls.minDistance = 2
      camera.controls.maxDistance = diagonal * 2.5
      camera.controls.minPolarAngle = .15
      camera.controls.maxPolarAngle = Math.PI / 2 - .08
      camera.controls.dollyToCursor = true
      camera.controls.setBoundary(modelBounds?.clone().expandByScalar(.5))
      camera.controls.boundaryFriction = .2
      camera.controls.boundaryEnclosesCamera = false
      return
    }
    const room = rooms.find(candidate => candidate.guid === isolateSpaceGuid)
    if (!room) return
    const bounds = room.box
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const distance = Math.max(size.x, size.z, 1) * 2.6
    camera.set('Plan')
    void camera.projection.set('Orthographic').then(() => {
      void camera.controls.setLookAt(center.x, bounds.max.y + distance, center.z, center.x, bounds.min.y, center.z, true)
    })
  }, [isolateSpaceGuid, roomDims, rooms])

  useEffect(() => {
    const model = modelRef.current
    const camera = engine.current?.world.camera
    if (!isolateSpaceGuid || !model || !camera || (!interiorElementTags.length && !clearances) || !allLocalIds.length) {
      setElementTagPositions({})
      setClearanceLines([])
      return
    }
    let cancelled = false
    let frame = 0
    void (async () => {
      const [guids, boxes] = await Promise.all([
        model.getGuidsByLocalIds(allLocalIds),
        model.getBoxes(allLocalIds),
      ])
      if (cancelled) return
      const wanted = new Set([...interiorElementTags.map(tag => tag.guid), ...(clearances?.guid ? [clearances.guid] : [])])
      const boxesByGuid = new Map<string, THREE.Box3>()
      guids.forEach((guid, index) => {
        const elementBox = boxes[index]
        if (guid && elementBox && !elementBox.isEmpty() && wanted.has(guid)) boxesByGuid.set(guid, elementBox)
      })
      const update = () => {
        if (cancelled) return
        const rect = box.current?.getBoundingClientRect()
        if (!rect) return
        const next: Record<string, { x: number; y: number }> = {}
        for (const [guid, elementBox] of boxesByGuid) {
          const anchor = elementBox.getCenter(new THREE.Vector3())
          anchor.z = elementBox.max.z
          anchor.project(camera.three)
          if (anchor.z >= -1 && anchor.z <= 1) {
            next[guid] = {
              x: (anchor.x + 1) * .5 * rect.width,
              y: (1 - anchor.y) * .5 * rect.height,
            }
          }
        }
        const room = rooms.find(candidate => candidate.guid === isolateSpaceGuid)
        const clearanceBox = clearances?.guid ? boxesByGuid.get(clearances.guid) : undefined
        const lines: ScreenClearanceLine[] = []
        if (room && clearanceBox && clearances) {
          const fixtureCenter = clearanceBox.getCenter(new THREE.Vector3())
          const floorY = room.box.min.y + .025
          const definitions: { side: ScreenClearanceLine['side']; value?: number; from: THREE.Vector3; to: THREE.Vector3 }[] = [
            { side: 'left', value: clearances.left, from: new THREE.Vector3(clearanceBox.min.x, floorY, fixtureCenter.z), to: new THREE.Vector3(room.box.min.x, floorY, fixtureCenter.z) },
            { side: 'right', value: clearances.right, from: new THREE.Vector3(clearanceBox.max.x, floorY, fixtureCenter.z), to: new THREE.Vector3(room.box.max.x, floorY, fixtureCenter.z) },
            { side: 'front', value: clearances.front, from: new THREE.Vector3(fixtureCenter.x, floorY, clearanceBox.min.z), to: new THREE.Vector3(fixtureCenter.x, floorY, room.box.min.z) },
            { side: 'rear', value: clearances.rear, from: new THREE.Vector3(fixtureCenter.x, floorY, clearanceBox.max.z), to: new THREE.Vector3(fixtureCenter.x, floorY, room.box.max.z) },
          ]
          for (const item of definitions) {
            if (item.value == null) continue
            const from = item.from.project(camera.three)
            const to = item.to.project(camera.three)
            if (from.z < -1 || from.z > 1 || to.z < -1 || to.z > 1) continue
            lines.push({ side: item.side, value: item.value, x1: (from.x + 1) * .5 * rect.width, y1: (1 - from.y) * .5 * rect.height, x2: (to.x + 1) * .5 * rect.width, y2: (1 - to.y) * .5 * rect.height })
          }
        }
        setElementTagPositions(next)
        setClearanceLines(lines)
        frame = requestAnimationFrame(update)
      }
      update()
    })().catch(error => console.warn('[Trace] could not anchor interior evidence tags', error))
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [allLocalIds, clearances, interiorElementTags, isolateSpaceGuid, modelReady, rooms])

  function toggleTrade(key: TradeKey, enabled: boolean) {
    setTrades((current) => ({ ...current, [key]: { ...current[key], enabled } }))
  }

  const roomCounts = storeys.reduce<Record<string, number>>((counts, floor) => {
    counts[floor.id] = rooms.filter(room => room.storeyId === floor.id).length
    return counts
  }, {})
  useEffect(() => {
    if (!visibleLayers) return
    const layerToTrade: Partial<Record<keyof NonNullable<Props['visibleLayers']>, TradeKey>> = {
      architecture: 'architecture', sanitary: 'plumbing', hvac: 'hvac', electrical: 'electrical',
    }
    setTrades(current => {
      const next = { ...current }
      for (const [layer, enabled] of Object.entries(visibleLayers)) {
        const trade = layerToTrade[layer as keyof typeof layerToTrade]
        if (trade) next[trade] = { ...next[trade], enabled: enabled !== false }
      }
      return next
    })
  }, [visibleLayers])
  useEffect(() => { if (storeys.length) onStoreys?.(storeys.map(storey => ({ id: storey.id, name: englishRoomName(storey.name), elevation: storey.elevation }))) }, [onStoreys, storeys])
  useEffect(() => { if (storeyId && storeyId !== selectedStoreyId) selectStorey(storeyId) }, [storeyId, selectedStoreyId])
  const walkFloorRooms = rooms.filter(room => room.storeyId === selectedStoreyId)
  const walkFloorBounds = new THREE.Box3()
  for (const room of walkFloorRooms) walkFloorBounds.union(room.box)
  if (walkFloorBounds.isEmpty() && selectedStoreyId) {
    const floor = storeys.find(item => item.id === selectedStoreyId)
    if (floor) walkFloorBounds.copy(floor.box)
  }
  const walkFloorSize = walkFloorBounds.getSize(new THREE.Vector3())
  const selectedRoomDimensions = (() => {
    const room = rooms.find(candidate => candidate.guid === isolateSpaceGuid) ?? rooms.find(candidate => candidate.key === selectedRoomKey)
    if (!room) return null
    const size = room.box.getSize(new THREE.Vector3())
    return { L: size.x, B: size.z }
  })()

  function selectStorey(id: string | null) {
    setSelectedStoreyId(id)
    setPlanView(false)
    const floor = id ? storeys.find(item => item.id === id) : null
    if (!floor || floor.box.isEmpty()) { if (!id) fitModel(); return }
    const e = engine.current
    if (!e) return
    const center = floor.box.getCenter(new THREE.Vector3())
    const size = floor.box.getSize(new THREE.Vector3())
    const distance = Math.max(size.x, size.z, 3) * 1.35
    void e.world.camera.controls.setLookAt(center.x + distance, center.y + distance * .75, center.z - distance,
      center.x, center.y, center.z, true)
  }

  useEffect(() => {
    const camera = engine.current?.world.camera
    if (!camera) return
    const selected = selectedStoreyId ? storeys.find(item => item.id === selectedStoreyId) : null
    if (planView && selected) {
      void camera.projection.set('Orthographic').then(() => {
        camera.set('Plan')
        const center = selected.box.getCenter(new THREE.Vector3())
        const size = selected.box.getSize(new THREE.Vector3())
        const distance = Math.max(size.x, size.z, 5) * 1.4
        void camera.controls.setLookAt(center.x, center.y + distance, center.z, center.x, center.y, center.z, true)
      })
    } else if (!planView && camera.projection.current === 'Orthographic') {
      camera.set('Orbit')
      void camera.projection.set('Perspective')
    }
  }, [planView, selectedStoreyId, storeys])

  function selectRoom(key: string) {
    setSelectedRoomKey(key)
    const room = rooms.find((candidate) => candidate.key === key)
    onSelectRoom?.(room ? { id: room.guid || room.key, name: room.name } : null)
  }

  function focusRoom(key: string, popupAt?: { x: number; y: number }) {
    const room = rooms.find(candidate => candidate.key === key)
    if (!room) return
    selectRoom(key)
    setInspectedRoomKey(key)
    setSelectedElement(null)
    const rect = box.current?.getBoundingClientRect()
    setPopupPosition(popupAt || { x: Math.min((rect?.left || 16) + 16, window.innerWidth - 336), y: Math.min((rect?.top || 16) + 16, window.innerHeight - 300) })
    if (room.storeyId) setSelectedStoreyId(room.storeyId)
    const e = engine.current
    if (!e) return
    const center = room.box.getCenter(new THREE.Vector3())
    const size = room.box.getSize(new THREE.Vector3())
    const target = new THREE.Vector3(center.x, center.y, room.box.min.z + 1.6)
    const lateral = Math.max(Math.min(size.x, size.y) * 0.28, 0.7)
    const controls = e.world.camera.controls
    const oldSmoothTime = controls.smoothTime
    controls.smoothTime = isolateSpaceGuid ? 0.6 : 0.8
    void controls.setLookAt(target.x + lateral, target.y - lateral, target.z,
      target.x, target.y, target.z, true).finally(() => { controls.smoothTime = oldSmoothTime })
  }

  function startWalk() {
    const e = engine.current
    const room = rooms.find(candidate => candidate.key === selectedRoomKey)
    if (!e || !room) return
    const camera = e.world.camera.three
    savedWalkCameraRef.current = { position: camera.position.clone(), target: e.world.camera.controls.getTarget(new THREE.Vector3()), up: camera.up.clone() }
    const center = room.box.getCenter(new THREE.Vector3())
    walkFloorZRef.current = room.box.min.y + 1.6
    walkPositionRef.current.set(center.x, walkFloorZRef.current, center.z)
    walkAvatarRef.current?.removeFromParent()
    const avatar = new THREE.Group()
    avatar.name = 'trace-walk-avatar'
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.16, .19, .72, 14), new THREE.MeshStandardMaterial({ color: '#E9B949', roughness: .62 }))
    body.position.y = .42
    const head = new THREE.Mesh(new THREE.SphereGeometry(.18, 14, 10), new THREE.MeshStandardMaterial({ color: '#f6d4b4', roughness: .8 }))
    head.position.y = .92
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.28, .025, 8, 24), new THREE.MeshBasicMaterial({ color: '#E9B949' }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = .04
    avatar.add(body, head, ring)
    avatar.position.set(center.x, room.box.min.y + .02, center.z)
    e.world.scene.three.add(avatar)
    walkAvatarRef.current = avatar
    walkYawRef.current = 0
    walkPitchRef.current = 0
    setWalkMap({ x: center.x, y: center.y, yaw: 0 })
    if (room.storeyId) setSelectedStoreyId(room.storeyId)
    setPlanView(false)
    setInspectedRoomKey('')
    if (e.world.camera.projection.current === 'Orthographic') void e.world.camera.projection.set('Perspective')
    e.world.camera.controls.stop()
    e.world.camera.controls.enabled = false
    setWalkHelpVisible(true)
    if (walkHelpTimerRef.current) window.clearTimeout(walkHelpTimerRef.current)
    walkHelpTimerRef.current = window.setTimeout(() => setWalkHelpVisible(false), 5000)
    setWalkMode(true)
  }

  function stopWalk() {
    const e = engine.current
    if (e) {
      e.world.camera.controls.enabled = true
      const saved = savedWalkCameraRef.current
      if (saved) {
        e.world.camera.three.up.copy(saved.up)
        void e.world.camera.controls.setLookAt(saved.position.x, saved.position.y, saved.position.z,
          saved.target.x, saved.target.y, saved.target.z, false)
      }
      e.world.camera.enabled = true
    }
    savedWalkCameraRef.current = null
    walkAvatarRef.current?.removeFromParent()
    walkAvatarRef.current = null
    if (walkHelpTimerRef.current) window.clearTimeout(walkHelpTimerRef.current)
    setWalkMode(false)
  }

  function nudgeWalk(forward: number, strafe = 0) {
    if (!walkMode) return
    const room = rooms.find(candidate => candidate.key === selectedRoomKey)
    const bounds = room?.box ?? walkFloorBounds
    const step = 1
    walkPositionRef.current.x += (Math.sin(walkYawRef.current) * forward + Math.cos(walkYawRef.current) * strafe) * step
    walkPositionRef.current.z += (Math.cos(walkYawRef.current) * forward - Math.sin(walkYawRef.current) * strafe) * step
    walkPositionRef.current.x = THREE.MathUtils.clamp(walkPositionRef.current.x, bounds.min.x + .3, bounds.max.x - .3)
    walkPositionRef.current.z = THREE.MathUtils.clamp(walkPositionRef.current.z, bounds.min.z + .3, bounds.max.z - .3)
  }

  useEffect(() => {
    if (!walkMode) return
    const e = engine.current
    const renderer = e?.world.renderer
    const canvas = renderer?.three.domElement
    if (!e || !renderer || !canvas) return
    let frame = 0
    let mapTick = 0
    const camera = e.world.camera.three
    const updateCamera = () => {
      const direction = new THREE.Vector3(
        Math.sin(walkYawRef.current) * Math.cos(walkPitchRef.current),
        Math.sin(walkPitchRef.current),
        Math.cos(walkYawRef.current) * Math.cos(walkPitchRef.current),
      )
      // Third-person follow: keep the yellow walker in front of the camera.
      camera.position.copy(walkPositionRef.current).addScaledVector(direction, -3).add(new THREE.Vector3(0, 2.2, 0))
      camera.lookAt(walkPositionRef.current.clone().add(new THREE.Vector3(0, .85, 0)))
      camera.updateMatrixWorld()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      const activeRoom = rooms.find(room => room.key === selectedRoomKey)
      if (!activeRoom) return
      const rect = canvas.getBoundingClientRect()
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(pointer, camera)
      const destination = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(activeRoom.box.min.y + .02)), destination)) return
      const inside = destination.x >= activeRoom.box.min.x + .3 && destination.x <= activeRoom.box.max.x - .3
        && destination.z >= activeRoom.box.min.z + .3 && destination.z <= activeRoom.box.max.z - .3
      if (!inside) {
        setStatus('Stay inside this room')
        window.setTimeout(() => setStatus(''), 1600)
        return
      }
      walkPositionRef.current.set(destination.x, walkFloorZRef.current, destination.z)
      updateCamera()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') { stopWalk(); return }
    }
    const tick = () => {
      walkPositionRef.current.y = walkFloorZRef.current
      const activeRoom = rooms.find(room => room.key === selectedRoomKey)
      const movementBounds = activeRoom?.box ?? walkFloorBounds
      walkPositionRef.current.x = THREE.MathUtils.clamp(walkPositionRef.current.x, movementBounds.min.x + .3, movementBounds.max.x - .3)
      walkPositionRef.current.z = THREE.MathUtils.clamp(walkPositionRef.current.z, movementBounds.min.z + .3, movementBounds.max.z - .3)
      if (walkAvatarRef.current) {
        walkAvatarRef.current.position.set(walkPositionRef.current.x, movementBounds.min.y + .02, walkPositionRef.current.z)
        walkAvatarRef.current.rotation.y = -walkYawRef.current
      }
      updateCamera()
      if (++mapTick % 6 === 0) setWalkMap({ x: walkPositionRef.current.x, y: walkPositionRef.current.y, yaw: walkYawRef.current })
      frame = requestAnimationFrame(tick)
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [walkMode])

  useEffect(() => {
    const e = engine.current
    const model = modelRef.current
    if (!model || !modelReady || !rooms.length) return
    const statusColor: Record<RoomStatus, string> = { built: '#48A868', missing_wall: '#D84B45', pending: '#E9B949' }
    const grouped = new Map<string, number[]>()
    for (const room of rooms) {
      const state = collab.status[room.guid]?.status ?? collab.status[room.name]?.status ?? collab.status[room.key]?.status
      const color = room.key === hoveredRoomKey ? '#D9A92D' : state ? statusColor[state] : '#D4D7D5'
      const ids = grouped.get(color) ?? []
      ids.push(room.localId)
      grouped.set(color, ids)
    }
    void (async () => {
      for (const [color, ids] of grouped) {
        await model.setColor(ids, new THREE.Color(color))
        await model.setOpacity(ids, color === '#D4D7D5' ? 0.15 : 0.34)
      }
      await e?.fragments.core.update(true)
    })()
  }, [collab.status, hoveredRoomKey, modelReady, rooms])

  useEffect(() => {
    const e = engine.current
    const host = box.current
    if (!e || !host || !modelReady || !rooms.length) return
    let frame = 0
    const placeLabels = () => {
      const camera = e.world.camera.three
      camera.updateMatrixWorld()
      const rect = host.getBoundingClientRect()
      const candidates = rooms.filter(room => !selectedStoreyId || room.storeyId === selectedStoreyId)
        .map(room => {
          const center = room.box.getCenter(new THREE.Vector3()).project(camera)
          const world = room.box.getCenter(new THREE.Vector3())
          return { room, center, distance: camera.position.distanceTo(world) }
        }).filter(item => item.center.z > -1 && item.center.z < 1 && Math.abs(item.center.x) < 1 && Math.abs(item.center.y) < 1)
        .sort((a, b) => a.distance - b.distance)
      const visible: typeof candidates = []
      for (const item of candidates) {
        const x = (item.center.x + 1) * rect.width / 2
        const y = (1 - item.center.y) * rect.height / 2
        if (visible.every(other => Math.hypot(
          x - (other.center.x + 1) * rect.width / 2,
          y - (1 - other.center.y) * rect.height / 2,
        ) > 72)) visible.push(item)
        if (visible.length >= 12) break
      }
      const visibleKeys = new Set(visible.map(item => item.room.key))
      for (const label of host.querySelectorAll<HTMLElement>('[data-room-label]')) {
        const item = candidates.find(candidate => candidate.room.key === label.dataset.roomLabel)
        label.style.display = item && visibleKeys.has(item.room.key) ? 'block' : 'none'
        if (item) label.style.transform = `translate(${(item.center.x + 1) * rect.width / 2}px, ${(1 - item.center.y) * rect.height / 2}px) translate(-50%, -100%)`
      }
      frame = requestAnimationFrame(placeLabels)
    }
    frame = requestAnimationFrame(placeLabels)
    return () => cancelAnimationFrame(frame)
  }, [modelReady, planView, rooms, selectedStoreyId])

  useEffect(() => {
    if (!modelReady) return
    const key = 'trace-3d-first-walk-hint-seen'
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { /* Storage can be unavailable in private browsing. */ }
    setShowFirstWalkHint(true)
    const timer = window.setTimeout(() => setShowFirstWalkHint(false), 5000)
    return () => window.clearTimeout(timer)
  }, [modelReady])

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
    const bounds = modelBoundsRef.current
    if (!e || !bounds || bounds.isEmpty()) return
    const diameter = Math.max(bounds.getSize(new THREE.Vector3()).length(), 0.1)
    e.world.camera.controls.maxDistance = diameter * 3
    const center = bounds.getCenter(new THREE.Vector3())
    void e.world.camera.controls.setLookAt(
      center.x + diameter * .65, center.y + diameter * .52, center.z - diameter * .65,
      center.x, center.y, center.z, true,
    )
  }

  function clearRoomClipping() {
    const e = engine.current
    const model = modelRef.current
    if (!e || !e.world.renderer || !model) return
    model.useClippingPlanes([])
    e.components.get(OBC.Clipper).deleteAll()
    e.world.renderer.three.localClippingEnabled = false
    const bounds = modelBoundsRef.current
    if (bounds) e.world.camera.controls.setBoundary(bounds.clone().expandByScalar(.5))
  }

  function zoomCamera(factor: number) {
    const e = engine.current
    if (!e) return
    const camera = e.world.camera.three
    const target = e.world.camera.controls.getTarget(new THREE.Vector3())
    const offset = camera.position.clone().sub(target)
    const min = Math.max(e.world.camera.controls.minDistance || .08, .08)
    const max = Math.max(e.world.camera.controls.maxDistance || 100, min * 2)
    const distance = THREE.MathUtils.clamp(offset.length() * factor, min, max)
    if (!offset.length()) offset.set(1, -1, .7)
    offset.setLength(distance)
    void e.world.camera.controls.setLookAt(target.x + offset.x, target.y + offset.y, target.z + offset.z, target.x, target.y, target.z, true)
  }

  function panCamera(x: number, y: number) {
    const e = engine.current
    if (!e) return
    const camera = e.world.camera.three
    const target = e.world.camera.controls.getTarget(new THREE.Vector3())
    const distance = camera.position.distanceTo(target)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(distance * .08 * x)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(distance * .08 * y)
    const next = target.clone().add(right).add(up)
    const position = camera.position.clone().add(right).add(up)
    void e.world.camera.controls.setLookAt(position.x, position.y, position.z, next.x, next.y, next.z, true)
  }

  useEffect(() => {
    const canvas = engine.current?.world.renderer?.three.domElement
    if (!canvas || !modelReady || walkMode) return
    let last = 1
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const raw = event.ctrlKey ? event.deltaY * .35 : event.deltaY
      const normalized = THREE.MathUtils.clamp(raw / (Math.abs(raw) > 80 ? 1800 : 750), -.05, .05)
      const target = 1 + normalized
      last += (target - last) * .38
      zoomCamera(last)
    }
    const keys = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const pan: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      if (pan[event.key]) { event.preventDefault(); panCamera(...pan[event.key]) }
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', keys)
    return () => { canvas.removeEventListener('wheel', wheel); window.removeEventListener('keydown', keys) }
  }, [modelReady, walkMode])

  function resetView() {
    if (explodeAnimationRef.current !== null) cancelAnimationFrame(explodeAnimationRef.current)
    if (tourAnimationRef.current !== null) cancelAnimationFrame(tourAnimationRef.current)
    explodeAnimationRef.current = null
    tourAnimationRef.current = null
    stopRecording()
    setExploded(false); setExploding(false); setPeelStep(0); setShowcase(false)
    setTouring(false); setTourStage(0); setPlanView(false); setSelectedStoreyId(null)
    setBuildingView('whole')
    setTrades(createInitialTrades())
    const model = modelRef.current
    if (model) void applyExplodedView(model, storeys, 0, 6, placementsRef.current)
    clearRoomClipping()
    requestAnimationFrame(() => fitModel())
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

  function captureScreenshotData(note: string) {
    const renderer = engine.current?.world.renderer
    if (!renderer) return ''
    renderer.three.render(engine.current!.world.scene.three, engine.current!.world.camera.three)
    const source = renderer.three.domElement
    const annotated = document.createElement('canvas')
    annotated.width = source.width; annotated.height = source.height
    const context = annotated.getContext('2d')
    if (!context) return ''
    context.drawImage(source, 0, 0)
    if (note) {
      const band = Math.max(52, Math.round(annotated.height * 0.075))
      context.fillStyle = 'rgba(18, 24, 32, 0.82)'; context.fillRect(0, annotated.height - band, annotated.width, band)
      context.fillStyle = '#fff'; context.font = `600 ${Math.max(18, Math.round(band * 0.38))}px system-ui, sans-serif`
      context.textBaseline = 'middle'; context.fillText(note.slice(0, 240), 20, annotated.height - band / 2, annotated.width - 40)
    }
    return annotated.toDataURL('image/png')
  }

  function screenshot() {
    const note = screenshotNote.trim()
    const dataUrl = captureScreenshotData(note)
    if (!dataUrl) return
    const roomName = rooms.find((room) => room.key === selectedRoomKey)?.name ?? 'Selected room'
    onScreenshot?.(dataUrl, roomName, note)
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'trace-room-layout.png'
    link.click()
  }

  async function savePopupNote() {
    const room = rooms.find(candidate => candidate.key === inspectedRoomKey || candidate.key === selectedRoomKey)
    if (!room) { setPopupFeedback('Select a room before adding a room note.'); return }
    let me: { id?: string; trade?: string } | null = null
    try { me = JSON.parse(localStorage.getItem('trace-collab-profile') || 'null') } catch { /* profile may not be registered */ }
    if (!me?.id) { setPopupFeedback('Set up your project identity before posting a room note.'); return }
    const text = popupNote.trim()
    if (!text) { setPopupFeedback('Write a short note first.'); return }
    const attachment = captureScreenshotData(text)
    if (!attachment) { setPopupFeedback('The 3D view is not ready for a screenshot yet.'); return }
    try {
      const next = await postRoomChat(room.guid || room.key, text, me.id, me.trade || '', attachment)
      onCollabChange?.(next)
      setPopupNote(''); setPopupFeedback('Note and screenshot added to the room chat.')
    } catch (error) { setPopupFeedback(error instanceof Error ? error.message : String(error)) }
  }

  useEffect(() => {
    const room = rooms.find(candidate => candidate.key === inspectedRoomKey)
    if (!room) { setPopupMediaCount(0); return }
    let active = true
    void getRoomMedia(room.guid || room.key).then(records => { if (active) setPopupMediaCount(records.length) }).catch(() => { if (active) setPopupMediaCount(0) })
    return () => { active = false }
  }, [inspectedRoomKey, rooms])

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
        if (room) { selectRoom(room.key); setInspectedRoomKey(room.key) }
        else { selectRoom(''); setInspectedRoomKey('') }
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
      if (walkMode) return
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
      if (walkMode) return
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
              const room = rooms.find(candidate => candidate.modelId === model.modelId && candidate.localId === hit.localId)
              setHoveredRoomKey(room?.key || '')
              const data = (await model.getItemsData([hit.localId]))[0] as Record<string, unknown> | undefined
              const category = classByLocalIdRef.current.get(hit.localId) || 'IfcBuildingElement'
              canvas.title = `${friendlyIfcCategory(category)} · ${readProperty(data || {}, 'Name') || 'Unnamed element'}`
              return
            } catch { /* No hover hit is a normal pointer position. */ }
          }
          setHoveredRoomKey('')
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
      if (walkMode) return
      if (draggedRef.current) return
      const rect = canvas.getBoundingClientRect()
      const popupX = Math.min(Math.max(event.clientX + 12, 12), Math.max(12, window.innerWidth - 336))
      const popupY = Math.min(Math.max(event.clientY + 12, 12), Math.max(12, window.innerHeight - 300))
      setPopupPosition({ x: popupX, y: popupY })
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(point, e.world.camera.three)
      const clickPoint = point.clone()
      if (raycaster.intersectObjects([...placementsRef.current.values()], true).length) return
      for (const model of e.fragments.list.values()) {
        try {
          const hit = await model.raycast({ camera: e.world.camera.three, mouse: clickPoint, dom: canvas })
          if (!hit) continue
          const room = rooms.find(candidate => candidate.modelId === model.modelId && candidate.localId === hit.localId)
          if (room) { focusRoom(room.key, { x: popupX, y: popupY }); return }
          await inspectElement(model, hit.localId)
          break
        } catch { /* A click outside model geometry is not a room selection. */ }
      }
    }
    const onDoubleClick = async (event: MouseEvent) => {
      if (walkMode) return
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
  }, [modelReady, onSelectRoom, rooms, walkMode])

  const popupRoom = rooms.find(room => room.key === inspectedRoomKey)
  const popupSpaceId = popupRoom ? popupRoom.guid || popupRoom.key : ''

  return <div className={`viewer ${showcase ? 'showcase-mode' : ''} ${recording ? 'showcase-recording' : ''} ${toolsOpen ? 'tools-open' : ''}`}>
    {modelReady && onlyTrade && <div className="viewer-trade-summary">{onlyTrade.key === 'plumbing'
      ? 'This model contains only plumbing (pipes and fixtures).'
      : `This model contains only ${onlyTrade.label.toLowerCase()}.`}</div>}
    <div className="viewer-bar furniture-bar">
      <span className="path">{path}</span>
      <div className="building-view-tabs" role="tablist" aria-label="3D view mode"><button role="tab" aria-selected={buildingView === 'whole'} className={buildingView === 'whole' ? 'active' : ''} onClick={() => { clearRoomClipping(); setBuildingView('whole'); setSelectedStoreyId(null); setPeelStep(0); setPlanView(false); requestAnimationFrame(() => fitModel()) }}>Whole Building</button><button role="tab" aria-selected={buildingView === 'interior'} className={buildingView === 'interior' ? 'active' : ''} onClick={() => { const room = rooms.find(item => item.key === selectedRoomKey) ?? rooms[0]; setBuildingView('interior'); if (room?.storeyId) setSelectedStoreyId(room.storeyId); setPeelStep(2); setPlanView(false) }}>Interior</button></div>
      <button className="viewer-tools-toggle" onClick={() => setToolsOpen(open => !open)}>{toolsOpen ? 'Tools ▴' : 'Tools ▾'}</button>
      <span className="catalog-label" title="Demo catalog">Demo catalog</span>
      {guids.length > 0 && <span>{guids.length} element{guids.length === 1 ? '' : 's'} highlighted</span>}
      {selectedGuid && <span className="dim"> · Focused: {selectedGuid.slice(0, 8)}…</span>}
      <button className={`showcase-toggle ${showcase ? 'on' : ''}`} title="Dark presentation lighting and soft shadows" disabled={!modelReady} onClick={() => setShowcase(value => !value)}>{showcase ? '✦ Showcase on' : '✦ Showcase'}</button>
      {showcase && <span className="showcase-quality">{showcaseDegraded ? 'Performance lighting' : 'Soft-shadow lighting'}</span>}
      <button title="Fit the whole model in view" disabled={!modelReady} onClick={fitModel}>Fit</button>
      <button title="Restore the model, camera and filters to their initial state" disabled={!modelReady} onClick={resetView}>Reset view</button>
      {!walkMode && <button title="Enter room walk view" disabled={!modelReady || !selectedRoomKey} onClick={startWalk}>Walk</button>}
      <button className={touring ? 'tour-active' : ''} title="Play a 40 second guided model tour" disabled={!modelReady || walkMode} onClick={() => touring ? stopTour() : startTour()}>{touring ? 'Stop tour · Esc' : 'Tour · 40s'}</button>
      <button className={recording ? 'recording-active' : ''} title="Record the 40 second tour as 1920 × 1080 WebM" disabled={!modelReady || (touring && !recording)} onClick={() => recording ? stopRecording() : recordTour()}>{recording ? 'Stop recording' : 'Record tour'}</button>
      <button title="Download the current 3D view as a 2× PNG" disabled={!modelReady} onClick={saveHiResScreenshot}>Hi-res PNG</button>
      <label className="transparent-shot"><input type="checkbox" checked={transparentCapture} onChange={event => setTransparentCapture(event.target.checked)} /> Transparent</label>
      <button title="Center the camera on the selected element or room" disabled={!modelReady || (!selectedGuid && !selectedElement && !selectedPlacementId && !selectedRoomKey)} onClick={() => void zoomToSelection()}>Zoom to selection</button>
      <label className="furniture-room-select">Room
        <select aria-label="Room" value={selectedRoomKey} onChange={(event) => selectRoom(event.target.value)}>
          <option value="">Select a room…</option>
          {rooms.map((room) => <option key={room.key} value={room.key}>{englishRoomName(room.name)}</option>)}
        </select>
        <small>Determines where furniture is placed; it does not change the catalog.</small>
      </label>
      <button disabled={!selectedRoomKey || !modelReady} onClick={() => setCatalogOpen(true)}>Add furniture</button>
      <small className="furniture-help">Place demo furniture in the selected room. Everyone on the project sees it.</small>
      <button disabled={!placed.length} onClick={rotateProduct}>Rotate 90°</button>
      <button disabled={!selectedPlacementId} onClick={removeProduct}>Delete</button>
      <span className="dim small">{placed.length} placed</span>
      <input aria-label="Screenshot note" value={screenshotNote} onChange={event => setScreenshotNote(event.target.value)} placeholder="Screenshot note…" />
      <small className="furniture-help">Note saved with the screenshot.</small>
      <button disabled={!modelReady} onClick={screenshot}>Screenshot</button>
    </div>
    {status && <div className="status">{status}</div>}
    {selectedRoomKey && <div className="status room-hint">Selected room: {englishRoomName(rooms.find((room) => room.key === selectedRoomKey)?.name ?? 'IfcSpace')} · click a room in the model to change selection</div>}
    <div className="viewer-main-row">
    <BuildingExplorer
      storeys={storeys}
      selectedStoreyId={selectedStoreyId}
      onSelectStorey={selectStorey}
      roomCounts={roomCounts}
      rooms={rooms}
      selectedRoomKey={selectedRoomKey}
      onSelectRoom={focusRoom}
      trades={trades}
      onToggleTrade={toggleTrade}
      exploded={exploded}
      onExplodedChange={animateExplode}
      planView={planView}
      onPlanViewChange={setPlanView}
      disabled={!modelReady || !explorerReady || walkMode}
    />
    <div className="three" ref={box}>
      <div className="camera-nav" aria-label="Camera navigation">
        <button type="button" title="Zoom in 20%" onClick={() => { zoomCamera(.8); setZoomLevel(level => Math.min(100, level + 20)) }}>＋</button>
        <input aria-label="Zoom level" type="range" min="0" max="100" value={zoomLevel} onChange={event => { const next = Number(event.target.value); zoomCamera(next > zoomLevel ? .94 : 1.06); setZoomLevel(next) }} />
        <button type="button" title="Zoom out 20%" onClick={() => { zoomCamera(1.2); setZoomLevel(level => Math.max(0, level - 20)) }}>－</button>
        <button type="button" onClick={fitModel}>Fit</button>
        <button type="button" onClick={resetView}>Reset</button>
      </div>
      <div className="showcase-motion-controls" aria-label="Showcase motion controls">
        <button type="button" disabled={!modelReady || exploding} onClick={() => animateExplode(!exploded)}>{exploding ? 'Exploding…' : exploded ? 'Assemble' : 'Explode'}</button>
        <button type="button" disabled={!modelReady} onClick={advancePeel}>Peel · {peelStep}/3</button>
        {peelStep > 0 && <span>Step {peelStep}: {['', 'Lift slabs', 'Fade envelope', 'Reveal systems'][peelStep]}</span>}
      </div>
      {hideRoomLabels && !isolateSpaceGuid && !walkMode && rooms.length > 0 && <aside className="room-picker" aria-label="Choose a room">
        <strong>Choose a room</strong>
        <div>{rooms.slice(0, 12).map(room => <button type="button" key={room.key} onClick={() => focusRoom(room.key)}>{englishRoomName(room.name)}{room.areaM2 ? ` · ${room.areaM2.toFixed(1)} m²` : ''}</button>)}</div>
      </aside>}
      {touring && <div className="tour-caption" aria-live="polite"><span>TRACE TOUR · {Math.min(tourStage + 1, 6)} / 6</span><strong>{tourCaptions[tourStage]}</strong><small>Press Esc to cancel</small></div>}
      <div className="room-label-layer" aria-label="Room labels">
        {isolateSpaceGuid && clearanceLines.length > 0 && <svg className="interior-clearances" aria-label="Fixture clearances">{clearanceLines.map(line => <g key={line.side}><line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} /><text x={(line.x1 + line.x2) / 2} y={(line.y1 + line.y2) / 2}>≈ {line.value} mm</text></g>)}</svg>}
        {isolateSpaceGuid && selectedRoomDimensions && <div className="room-floor-dimensions"><span className="room-dim-l">↔ {selectedRoomDimensions.L.toFixed(2)} m</span><span className="room-dim-b">↕ {selectedRoomDimensions.B.toFixed(2)} m</span></div>}
        {interiorElementTags.slice(0, 12).map((tag) => {
          const position = elementTagPositions[tag.guid]
          if (!position) return null
          const tagKind = tag.issue ? 'issue' : tag.verified ? 'verified' : 'unverified'
          return <button key={tag.guid} type="button" className={`element-world-tag ${tagKind}`} style={{ left: position.x, top: position.y }} onClick={() => onSelectGuid?.(tag.guid)}>{tag.code}{tag.issue ? ' !' : ''}</button>
        })}
        {!walkMode && !hideRoomLabels && planView && rooms.filter(room => !selectedStoreyId || room.storeyId === selectedStoreyId).filter((room, index, list) => list.findIndex(candidate => englishRoomName(candidate.name) === englishRoomName(room.name)) === index).map(room => { const roomMessages = collab.messages.filter(item => item.space_id === (room.guid || room.key)).length; const hasBubble = roomMessages + (room.key === inspectedRoomKey ? popupMediaCount : 0) > 0; return <button key={room.key} type="button" data-room-label={room.key}
          className={`room-world-label ${hoveredRoomKey === room.key ? 'hovered' : ''}`}
          onPointerEnter={() => setHoveredRoomKey(room.key)} onPointerLeave={() => setHoveredRoomKey('')}
          onClick={() => focusRoom(room.key)} title="Open room actions">
          {englishRoomName(room.name)}{room.number ? ` · ${room.number}` : ''}{room.areaM2 !== undefined ? ` · ${room.areaM2.toFixed(1)} m²` : ''}{hasBubble && <span className="room-activity-bubble">💬 {roomMessages}{room.key === inspectedRoomKey && popupMediaCount ? ` · 📷 ${popupMediaCount}` : ''}</span>}
        </button>})}
      </div>
      {walkMode && <>
        <div className={`walk-hud ${walkHelpVisible ? 'visible' : ''}`}><strong>Walk mode</strong><span>Click the floor to move · use the arrows for 1 m steps · Esc exits</span></div>
        <div className="walk-joystick walk-ground-arrows" aria-label="Walk direction arrows">
          <button onClick={() => nudgeWalk(1)}>▲</button>
          <button onClick={() => nudgeWalk(0, -1)}>◀</button>
          <button onClick={() => nudgeWalk(0, 1)}>▶</button>
          <button onClick={() => nudgeWalk(-1)}>▼</button>
        </div>
        <div className="walk-minimap" aria-label="Current floor minimap">
          <strong>{storeys.find(floor => floor.id === selectedStoreyId)?.name || 'Floor map'}</strong>
          <svg viewBox="0 0 180 130" role="img" aria-label="Floor outline and viewer position">
            <rect x="1" y="1" width="178" height="128" rx="5" fill="#F7F6F2" stroke="#A9AFB0" />
            {walkFloorRooms.map(room => {
              const xSize = Math.max(walkFloorSize.x, 0.01); const ySize = Math.max(walkFloorSize.y, 0.01)
              const x = 10 + (room.box.min.x - walkFloorBounds.min.x) / xSize * 160
              const y = 10 + (walkFloorBounds.max.y - room.box.max.y) / ySize * 110
              const width = Math.max((room.box.max.x - room.box.min.x) / xSize * 160, 1)
              const height = Math.max((room.box.max.y - room.box.min.y) / ySize * 110, 1)
              return <rect key={room.key} x={x} y={y} width={width} height={height} fill="rgba(233,185,73,.12)" stroke="#A9AFB0" strokeWidth=".7" />
            })}
            {(() => {
              const x = 10 + (walkMap.x - walkFloorBounds.min.x) / Math.max(walkFloorSize.x, .01) * 160
              const y = 10 + (walkFloorBounds.max.y - walkMap.y) / Math.max(walkFloorSize.y, .01) * 110
              return <g transform={`translate(${x} ${y}) rotate(${walkMap.yaw * 180 / Math.PI})`}><path d="M0 -9 L6 7 L0 4 L-6 7 Z" fill="#1F6FEB" stroke="#202427" strokeWidth="1" /></g>
            })()}
          </svg>
        </div>
      </>}
      {showFirstWalkHint && <div className="first-walk-hint">Pick a floor on the left, then click a room to fly in. Press Walk to look around inside.</div>}
      <button className="walk-inside-button" type="button" disabled={!modelReady || (!walkMode && !selectedRoomKey)} onClick={walkMode ? stopWalk : startWalk}>{walkMode ? 'Exit Walk · Esc' : '🚶 Walk inside'}</button>
      <div className="viewer-help-control">
        <button type="button" aria-label="3D controls help" aria-expanded={helpOpen} onClick={() => { setHelpOpen(open => !open); if (walkMode) setWalkHelpVisible(true) }}>?</button>
        {helpOpen && <aside className="viewer-help-popover">
          <div><strong>3D controls</strong><button type="button" aria-label="Close 3D controls help" onClick={() => setHelpOpen(false)}>×</button></div>
          <ul>
            <li>Left mouse drag: rotate</li>
            <li>Right mouse drag: pan</li>
            <li>Wheel: zoom</li>
            <li>Double-click: focus an element</li>
            <li>Walk: click a floor point to move, use the on-floor arrows for 1 m steps, Esc exits</li>
          </ul>
        </aside>}
      </div>
      {(popupRoom || selectedElement) && !walkMode && <aside className="ifc-action-popup" aria-label="Room and element actions" style={{ left: popupPosition.x, top: popupPosition.y }}>
        <div className="ifc-info-heading"><div><span>{selectedElement?.category || 'IfcSpace'}</span><h3>{selectedElement?.name || popupRoom?.name || 'Room'}</h3></div><button aria-label="Close room actions" onClick={() => { setInspectedRoomKey(''); setSelectedElement(null) }}>×</button></div>
        <dl>{selectedElement && <><dt>Category</dt><dd>{selectedElement.type}</dd><dt>Storey</dt><dd>{selectedElement.storey}</dd><dt>Room</dt><dd>{popupRoom?.name || selectedElement.room}</dd><dt>Dimensions</dt><dd>{selectedElement.dimensions.map(value => `${value.toFixed(2)} m`).join(' × ')}</dd></>}{popupRoom && <><dt>Floor</dt><dd>{storeys.find(storey => storey.id === popupRoom.storeyId)?.name || selectedElement?.storey || 'Unknown'}</dd><dt>Room</dt><dd>{popupRoom.name}{popupRoom.number ? ` · ${popupRoom.number}` : ''}</dd><dt>Area</dt><dd>{popupRoom.areaM2 !== undefined ? `${popupRoom.areaM2.toFixed(1)} m²` : 'Unavailable'}</dd></>}</dl>
        {popupSpaceId && <><textarea aria-label="Room note" value={popupNote} onChange={event => setPopupNote(event.target.value)} placeholder="Write a room note…" rows={2} /><div className="ifc-popup-actions"><button onClick={() => void savePopupNote()}>Add note</button><button onClick={screenshot}>Screenshot</button><button onClick={() => onRoomAction?.('Photos')}>Photos ({popupMediaCount})</button><button onClick={() => onRoomAction?.('Schedule')}>Timeline</button><button className="ifc-popup-place" onClick={() => setCatalogOpen(true)}>Place furniture here</button></div>{popupFeedback && <small className="ifc-popup-feedback">{popupFeedback}</small>}</>}
        {!popupSpaceId && <small>Room details are unavailable for this element.</small>}
      </aside>}
    </div>
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
