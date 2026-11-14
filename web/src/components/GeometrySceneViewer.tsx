import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GeometryObject, GeometryOpening, GeometryRoom, GeometryScene, GeometrySource, GeometrySystem, GeometryWall, PlanPoint } from '../viewer3d/geometryScene'

type SceneLayer = 'architecture' | 'sanitary' | 'hvac' | 'electrical'

interface Props {
  scene: GeometryScene
  onSelectObject?: (id: string) => void
  onSelectRoom?: (room: { id: string; name: string }) => void
  onSelectSource?: (source: GeometrySource) => void
  focusRoomId?: string | null
  storeyId?: string | null
  visibleLayers?: Partial<Record<SceneLayer, boolean>>
}

const layerFor = (kind: string): SceneLayer => {
  const value = kind.toLowerCase()
  if (/electric|light|socket|power|cable/.test(value)) return 'electrical'
  if (/hvac|vent|duct|air/.test(value)) return 'hvac'
  if (/toilet|wc|sink|basin|wash|shower|bath|water|drain|plumb|pipe/.test(value)) return 'sanitary'
  return 'architecture'
}
const layerVisible = (layer: SceneLayer, visibleLayers?: Partial<Record<SceneLayer, boolean>>) => visibleLayers?.[layer] !== false
const matchesStorey = (item: { storeyId?: string }, storeyId?: string | null) => !storeyId || !item.storeyId || item.storeyId === storeyId
const metres = (value: number) => `${value < 1 ? value.toFixed(2) : value.toFixed(2).replace(/\.00$/, '')} m`

interface Inspection {
  id: string
  title: string
  kind: string
  dimensions: string[]
  method?: string
  confidence?: number
  assumed?: boolean
  source?: GeometrySource
}

const inspectionFor = (scene: GeometryScene, id: string, roomId?: string): Inspection | null => {
  const build = (item: GeometryObject | GeometryOpening | GeometryWall | GeometrySystem | GeometryRoom, title: string, kind: string, dimensions: string[]): Inspection => ({
    id: item.id, title, kind, dimensions, method: item.method, confidence: item.confidence, assumed: item.assumed, source: item.source,
  })
  if (roomId) {
    const room = scene.rooms.find(item => item.id === roomId)
    return room ? build(room, room.name || room.number || room.id, 'Room', [
      ...(room.areaM2 !== null && room.areaM2 !== undefined ? [`${room.areaM2.toFixed(2)} m²`] : []),
      ...(room.heightM !== undefined ? [`height ${metres(room.heightM)}`] : []),
    ]) : null
  }
  const object = scene.objects.find(item => item.id === id)
  if (object) return build(object, object.name || object.id, object.category, [
    ...(object.footprint ? [`${metres(object.footprint.widthM)} × ${metres(object.footprint.depthM)}`] : []),
    ...(object.heightM !== undefined ? [`height ${metres(object.heightM)}`] : []),
  ])
  const opening = scene.openings.find(item => item.id === id)
  if (opening) return build(opening, opening.id, opening.kind, [`${metres(opening.widthM)} × ${metres(opening.heightM)}`])
  const wall = scene.walls.find(item => item.id === id)
  if (wall) return build(wall, wall.id, 'wall', [`${metres(wall.thicknessM)} thick`, `height ${metres(wall.heightM)}`])
  const system = scene.systems.find(item => item.id === id)
  if (system) return build(system, system.id, system.kind, system.diameterM !== undefined ? [`Ø ${metres(system.diameterM)}`] : [])
  return null
}

const roomMesh = (polygon: PlanPoint[], y: number, material: THREE.Material) => {
  const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, z)))
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = y
  return mesh
}

const symbol = (item: GeometryObject) => {
  const width = item.footprint?.widthM ?? .45
  const depth = item.footprint?.depthM ?? .65
  const height = item.heightM ?? .42
  const group = new THREE.Group()
  // Amber is a normal recognised symbol; muted red means the engine explicitly
  // marked it below the review threshold. The UI never invents confidence.
  const material = new THREE.MeshStandardMaterial({ color: item.confidence !== undefined && item.confidence < .7 ? '#b65b4f' : '#e9b949', roughness: .7 })
  const dark = new THREE.MeshStandardMaterial({ color: '#384044', roughness: .8 })
  const category = item.category.toLowerCase()
  if (/toilet|wc/.test(category)) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height * .55, depth), material)
    base.position.y = height * .275
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(width * .38, width * .46, height * .22, 20), dark)
    bowl.position.set(0, height * .67, -depth * .12)
    group.add(base, bowl)
  } else if (/sink|basin|wash/.test(category)) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height * .75, depth), material)
    base.position.y = height * .375
    const bowl = new THREE.Mesh(new THREE.BoxGeometry(width * .7, height * .12, depth * .62), dark)
    bowl.position.y = height * .79
    group.add(base, bowl)
  } else if (/shower/.test(category)) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(width, Math.max(.06, height * .12), depth), material)
    tray.position.y = Math.max(.03, height * .06)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height * .72, .025), dark)
    glass.position.set(0, height * .42, -depth / 2)
    group.add(tray, glass)
  } else if (/bath|tub/.test(category)) {
    const tub = new THREE.Mesh(new THREE.BoxGeometry(width, height * .62, depth), material)
    tub.position.y = height * .31
    const well = new THREE.Mesh(new THREE.BoxGeometry(width * .68, height * .13, depth * .65), dark)
    well.position.y = height * .65
    group.add(tub, well)
  } else {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    base.position.y = height / 2
    group.add(base)
  }
  group.position.set(item.position[0], item.position[1], item.position[2])
  group.rotation.y = THREE.MathUtils.degToRad(item.rotationDeg ?? 0)
  group.userData.objectId = item.id
  group.userData.confidence = item.confidence
  group.userData.assumed = item.assumed
  return group
}

const openingSymbol = (opening: GeometryOpening) => {
  const material = new THREE.MeshStandardMaterial({ color: opening.kind === 'door' ? '#e9b949' : '#9ec9d9', transparent: true, opacity: .82 })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(opening.widthM, opening.heightM, .045), material)
  mesh.position.set(opening.position[0], opening.position[1] + opening.heightM / 2, opening.position[2])
  mesh.rotation.y = THREE.MathUtils.degToRad(opening.rotationDeg)
  mesh.userData.objectId = opening.id
  mesh.userData.confidence = opening.confidence
  mesh.userData.assumed = opening.assumed
  return mesh
}

const systemSymbol = (system: GeometrySystem) => {
  const curve = new THREE.CatmullRomCurve3(system.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  const layer = layerFor(system.kind)
  const color = layer === 'electrical' ? '#e9b949' : layer === 'hvac' ? '#86b7c8' : '#579c87'
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, system.points.length * 5), system.diameterM ? Math.max(.008, system.diameterM / 2) : .018, 7, false), new THREE.MeshStandardMaterial({ color, roughness: .55 }))
  mesh.userData.objectId = system.id
  mesh.userData.source = system.source
  return mesh
}

/** Renders only calibrated metre-based data supplied by the scene endpoint. */
export default function GeometrySceneViewer({ scene, onSelectObject, onSelectRoom, onSelectSource, focusRoomId, storeyId, visibleLayers }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const reviewNeeded = [...scene.rooms, ...scene.walls, ...scene.openings, ...scene.objects]
    .some(item => item.confidence !== undefined && item.confidence < .7)
  const hasAssumedDimensions = [...scene.rooms, ...scene.walls, ...scene.openings, ...scene.objects]
    .some(item => item.assumed)

  useEffect(() => {
    const element = host.current
    if (!element) return
    let disposed = false
    let frame = 0
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    element.appendChild(renderer.domElement)
    const scene3 = new THREE.Scene()
    scene3.background = new THREE.Color('#f7f6f2')
    const camera = new THREE.PerspectiveCamera(42, 1, .05, 1000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2.05
    scene3.add(new THREE.HemisphereLight('#ffffff', '#566267', 2.2))
    const key = new THREE.DirectionalLight('#fff1c4', 1.4); key.position.set(12, 18, 8); scene3.add(key)

    const bounds = new THREE.Box3()
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#e7e7e2', roughness: 1, side: THREE.DoubleSide })
    const roomLine = new THREE.LineBasicMaterial({ color: '#6b7376' })
    const architectureVisible = layerVisible('architecture', visibleLayers)
    for (const room of scene.rooms.filter(room => architectureVisible && matchesStorey(room, storeyId))) {
      if (room.polygon.length < 3) continue
      const floor = roomMesh(room.polygon, room.floorYM ?? 0, floorMaterial)
      floor.userData.roomId = room.id
      floor.userData.roomName = room.name || room.number || room.id
      floor.userData.source = room.source
      scene3.add(floor)
      bounds.expandByObject(floor)
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(room.polygon.map(([x, z]) => new THREE.Vector3(x, room.floorYM ?? .01, z))), roomLine)
      scene3.add(outline)
    }
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#434b4e', roughness: .8 })
    const renderedWallIds = new Set<string>()
    for (const wall of scene.walls.filter(wall => architectureVisible && matchesStorey(wall, storeyId))) {
      for (let index = 1; index < wall.points.length; index++) {
        const [ax, az] = wall.points[index - 1]; const [bx, bz] = wall.points[index]
        const length = Math.hypot(bx - ax, bz - az)
        if (!length) continue
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, wall.heightM, wall.thicknessM), wallMaterial)
        mesh.position.set((ax + bx) / 2, wall.baseYM + wall.heightM / 2, (az + bz) / 2)
        mesh.rotation.y = Math.atan2(bz - az, bx - ax)
        mesh.userData.objectId = wall.id
        mesh.userData.source = wall.source
        scene3.add(mesh); bounds.expandByObject(mesh); renderedWallIds.add(wall.id)
      }
    }
    for (const opening of scene.openings.filter(opening => architectureVisible && (!opening.wallId || renderedWallIds.has(opening.wallId)))) { const mesh = openingSymbol(opening); mesh.userData.source = opening.source; scene3.add(mesh); bounds.expandByObject(mesh) }
    for (const item of scene.objects.filter(item => matchesStorey(item, storeyId) && layerVisible(layerFor(item.category), visibleLayers))) { const mesh = symbol(item); mesh.userData.source = item.source; scene3.add(mesh); bounds.expandByObject(mesh) }
    for (const system of scene.systems.filter(system => matchesStorey(system, storeyId) && layerVisible(layerFor(system.kind), visibleLayers))) { const mesh = systemSymbol(system); scene3.add(mesh); bounds.expandByObject(mesh) }

    const size = bounds.isEmpty() ? new THREE.Vector3(5, 3, 5) : bounds.getSize(new THREE.Vector3())
    const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3())
    if (!bounds.isEmpty()) {
      const reference = new THREE.Vector3(bounds.min.x + Math.max(.18, size.x * .025), bounds.min.y + .035, bounds.min.z + Math.max(.18, size.z * .025))
      const scaleLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([reference, reference.clone().add(new THREE.Vector3(1, 0, 0))]), new THREE.LineBasicMaterial({ color: '#e9b949' }))
      const north = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), reference, .75, '#202427', .16, .09)
      scene3.add(scaleLine, north)
    }
    const focusedRoom = focusRoomId ? scene.rooms.find(room => room.id === focusRoomId) : null
    const focusCenter = focusedRoom ? focusedRoom.polygon.reduce((total, [x, z]) => total.add(new THREE.Vector3(x, focusedRoom.floorYM ?? 0, z)), new THREE.Vector3()).multiplyScalar(1 / focusedRoom.polygon.length) : center
    const focusSize = focusedRoom ? new THREE.Box3().setFromPoints(focusedRoom.polygon.map(([x, z]) => new THREE.Vector3(x, focusedRoom.floorYM ?? 0, z))).getSize(new THREE.Vector3()) : size
    const distance = Math.max(focusSize.x, focusSize.z, 3) * 1.7
    camera.position.set(focusCenter.x + distance, focusCenter.y + distance * .9, focusCenter.z + distance)
    controls.target.copy(focusCenter); controls.update()
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2()
    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(scene3.children, true).find(candidate => {
        let node: THREE.Object3D | null = candidate.object
        while (node) { if (typeof node.userData.objectId === 'string' || typeof node.userData.roomId === 'string' || node.userData.source) return true; node = node.parent }
        return false
      })
      let node = hit?.object ?? null
      while (node && typeof node.userData.objectId !== 'string' && typeof node.userData.roomId !== 'string' && !node.userData.source) node = node.parent
      if (node?.userData.objectId) {
        const id = node.userData.objectId as string
        onSelectObject?.(id); setInspection(inspectionFor(scene, id))
      } else if (node?.userData.roomId) {
        const id = node.userData.roomId as string
        onSelectRoom?.({ id, name: node.userData.roomName as string }); setInspection(inspectionFor(scene, '', id))
      }
    }
    renderer.domElement.addEventListener('click', onClick)
    const resize = () => { const width = Math.max(1, element.clientWidth); const height = Math.max(1, element.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    const animate = () => { if (disposed) return; controls.update(); renderer.render(scene3, camera); frame = requestAnimationFrame(animate) }; animate()
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', onClick); controls.dispose(); scene3.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Line) { node.geometry.dispose(); const materials = Array.isArray(node.material) ? node.material : [node.material]; materials.forEach(material => material.dispose()) } }); renderer.dispose(); renderer.domElement.remove() }
  }, [focusRoomId, onSelectObject, onSelectRoom, onSelectSource, scene, storeyId, visibleLayers])

  return <div className="geometry-scene-viewer"><div ref={host} className="geometry-scene-canvas" /><aside className="geometry-scene-reference" aria-label="Metric scene reference"><strong>↑ N</strong><span>1 m model units</span>{reviewNeeded && <span className="geometry-scene-review">△ review symbol</span>}{hasAssumedDimensions && <span>△ default height</span>}</aside>{inspection && <aside className="geometry-scene-inspector" aria-live="polite"><button type="button" className="geometry-scene-inspector-close" onClick={() => setInspection(null)} aria-label="Close element details">×</button><strong>{inspection.title}</strong><span>{inspection.kind}</span>{inspection.dimensions.map((dimension) => <span key={dimension}>{dimension}</span>)}{inspection.method && <span>method: {inspection.method}</span>}{inspection.confidence !== undefined && <span>confidence: {Math.round(inspection.confidence * 100)}%</span>}{inspection.assumed && <span className="geometry-scene-review">△ default dimension</span>}{inspection.source?.bbox && <button type="button" className="geometry-scene-source-button" onClick={() => onSelectSource?.(inspection.source!)}>Open source evidence</button>}</aside>}</div>
}
