import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import * as OBC from '@thatopen/components'
import * as THREE from 'three'
import { RenderedFaces } from '@thatopen/fragments'
import { fileUrl } from './api'
import catalogUrl from './catalog.json?url'

interface Props {
  path: string
  guids: string[]
  selectedGuid?: string | null
  onSelectGuid?: (guid: string) => void
  onPlacementsChange?: (placements: PlacedProduct[]) => void
  onScreenshot?: (dataUrl: string, roomName: string) => void
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
}

interface CatalogProduct {
  id: string
  category: string
  name: string
  width_mm: number
  depth_mm: number
  height_mm: number
  price_eur: number
  material: string
  color_hex: string
  variants: string[]
  mount: 'floor' | 'ceiling' | 'wall'
}

interface RoomOption {
  key: string
  modelId: string
  localId: number
  name: string
  guid: string
  box: THREE.Box3
}

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>
type ViewerEngine = { components: OBC.Components; world: World; fragments: OBC.FragmentsManager }

const HIGHLIGHT = { color: new THREE.Color('#e4572e'), renderedFaces: RenderedFaces.TWO, opacity: 1, transparent: false }
const FOCUS_HIGHLIGHT = { color: new THREE.Color('#1a56db'), renderedFaces: RenderedFaces.TWO, opacity: 1, transparent: false }

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

function IfcViewerInner({ path, guids, selectedGuid, onPlacementsChange, onScreenshot }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<ViewerEngine | null>(null)
  const placementsRef = useRef(new Map<string, THREE.Group>())
  const dragRef = useRef<{ id: string; plane: THREE.Plane } | null>(null)
  const draggedRef = useRef(false)
  const [status, setStatus] = useState('')
  const [modelReady, setModelReady] = useState(false)
  const [catalog, setCatalog] = useState<CatalogProduct[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [selectedRoomKey, setSelectedRoomKey] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [placed, setPlaced] = useState<PlacedProduct[]>([])
  const [selectedPlacementId, setSelectedPlacementId] = useState('')

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
    setPlaced([])
    placementsRef.current.clear()
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
        world.scene.three.background = new THREE.Color('#f5f5f3')
        world.renderer = new OBC.SimpleRenderer(components, box.current!, { preserveDrawingBuffer: true })
        world.camera = new OBC.SimpleCamera(components)
        components.init()
        components.get(OBC.Grids).create(world)

        const fragments = components.get(OBC.FragmentsManager)
        engine.current = { components, world, fragments }
        setStatus('Loading 3D engine…')
        fragments.init(await OBC.FragmentsManager.getWorker())
        world.camera.controls.addEventListener('rest', () => fragments.core.update(true))
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three)
          world.scene.three.add(model.object)
          fragments.core.update(true)
          void (async () => {
            try {
              const byCategory = await model.getItemsOfCategories([/IFCSPACE/i])
              const ids = [...new Set(Object.values(byCategory).flat())]
              if (!ids.length) return
              const [data, boxes, guidsById] = await Promise.all([
                model.getItemsData(ids), model.getBoxes(ids), model.getGuidsByLocalIds(ids),
              ])
              if (cancelled) return
              const next = ids.flatMap((localId, index) => {
                const attributes = data[index] ?? {}
                const name = String((attributes.Name as { value?: unknown } | undefined)?.value ?? `Room ${localId}`)
                const roomBox = boxes[index]
                if (!roomBox || roomBox.isEmpty()) return []
                return [{ key: `${model.modelId}:${localId}`, modelId: model.modelId, localId, name,
                  guid: guidsById[index] ?? '', box: roomBox }]
              })
              setRooms((current) => [...current.filter((room) => room.modelId !== model.modelId), ...next])
              if (!selectedRoomKey && next.length) setSelectedRoomKey(next[0].key)
            } catch (error) { console.warn('Could not list IFC spaces:', error) }
          })()
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
        await loader.load(bytes, true, path)
        if (cancelled) return
        await world.camera.fitToItems()
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
        if (selectedGuid) {
          const selected = await e.fragments.guidsToModelIdMap([selectedGuid])
          if (Object.keys(selected).length) {
            await e.fragments.highlight(FOCUS_HIGHLIGHT, selected)
            await e.world.camera.fitToItems(selected)
            await e.fragments.core.update(true)
            return
          }
        }
        if (guids.length) {
          const items = await e.fragments.guidsToModelIdMap(guids)
          if (Object.keys(items).length) await e.world.camera.fitToItems(items)
        }
        await e.fragments.core.update(true)
      } catch (error) { console.warn('Failed to update 3D highlights:', error) }
    })()
    return () => { cancelled = true }
  }, [guids, selectedGuid, status, modelReady])

  function notifyPlacementChange(next: PlacedProduct[]) {
    setPlaced(next)
    onPlacementsChange?.(next)
  }

  function addProduct() {
    const e = engine.current
    const room = rooms.find((candidate) => candidate.key === selectedRoomKey)
    const product = catalog.find((candidate) => candidate.id === selectedProductId)
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
    e.world.scene.three.add(group)
    placementsRef.current.set(instanceId, group)
    const placement: PlacedProduct = {
      instanceId, catalogId: product.id, name: product.name,
      width_mm: product.width_mm, depth_mm: product.depth_mm, height_mm: product.height_mm,
      price_eur: product.price_eur, material: product.material, color_hex: product.color_hex,
      mount: product.mount, rotationDeg: 0,
    }
    setSelectedPlacementId(instanceId)
    notifyPlacementChange([...placed, placement])
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
  }

  function screenshot() {
    const renderer = engine.current?.world.renderer
    if (!renderer) return
    renderer.three.render(engine.current!.world.scene.three, engine.current!.world.camera.three)
    const dataUrl = renderer.three.domElement.toDataURL('image/png')
    const roomName = rooms.find((room) => room.key === selectedRoomKey)?.name ?? 'Selected room'
    onScreenshot?.(dataUrl, roomName)
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
      if (!drag) return
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
    const onPointerUp = () => { dragRef.current = null; setTimeout(() => { draggedRef.current = false }, 0) }
    const onClick = async (event: MouseEvent) => {
      if (draggedRef.current) return
      const rect = canvas.getBoundingClientRect()
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(point, e.world.camera.three)
      if (raycaster.intersectObjects([...placementsRef.current.values()], true).length) return
      for (const model of e.fragments.list.values()) {
        try {
          const hit = await model.raycast({ camera: e.world.camera.three, mouse: point, dom: canvas })
          if (!hit) continue
          const room = rooms.find((candidate) => candidate.modelId === model.modelId && candidate.localId === hit.localId)
          if (room) { setSelectedRoomKey(room.key); break }
        } catch { /* A click outside model geometry is not a room selection. */ }
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('pointerup', onPointerUp, true)
    canvas.addEventListener('pointercancel', onPointerUp, true)
    canvas.addEventListener('click', onClick)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('pointerup', onPointerUp, true)
      canvas.removeEventListener('pointercancel', onPointerUp, true)
      canvas.removeEventListener('click', onClick)
    }
  }, [modelReady, rooms])

  return <div className="viewer">
    <div className="viewer-bar furniture-bar">
      <span className="path">{path}</span>
      <span className="catalog-label">Demo catalog</span>
      {guids.length > 0 && <span>{guids.length} element{guids.length === 1 ? '' : 's'} highlighted</span>}
      {selectedGuid && <span className="dim"> · Focused: {selectedGuid.slice(0, 8)}…</span>}
      <select aria-label="IFC space" value={selectedRoomKey} onChange={(event) => setSelectedRoomKey(event.target.value)}>
        <option value="">Select an IfcSpace…</option>
        {rooms.map((room) => <option key={room.key} value={room.key}>{room.name}</option>)}
      </select>
      <select aria-label="Demo catalog product" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
        {catalog.map((product) => <option key={product.id} value={product.id}>{product.name} · €{product.price_eur}</option>)}
      </select>
      <button disabled={!selectedRoomKey || !modelReady} onClick={addProduct}>Add product</button>
      <button disabled={!placed.length} onClick={rotateProduct}>Rotate 90°</button>
      <button disabled={!selectedPlacementId} onClick={removeProduct}>Delete</button>
      <span className="dim small">{placed.length} placed</span>
      <button disabled={!modelReady} onClick={screenshot}>Screenshot</button>
    </div>
    {status && <div className="status">{status}</div>}
    {selectedRoomKey && <div className="status room-hint">Selected room: {rooms.find((room) => room.key === selectedRoomKey)?.name ?? 'IfcSpace'} · click a room in the model to change selection</div>}
    <div className="three" ref={box} />
  </div>
}

/** IFC model viewer with evidence highlighting and a furniture demo placement layer. */
export default function IfcViewer(props: Props) {
  return <IfcErrorBoundary><IfcViewerInner {...props} /></IfcErrorBoundary>
}
