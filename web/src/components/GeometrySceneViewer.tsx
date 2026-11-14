import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GeometryObject, GeometryScene, PlanPoint } from '../viewer3d/geometryScene'

interface Props {
  scene: GeometryScene
  onSelectObject?: (id: string) => void
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
  const material = new THREE.MeshStandardMaterial({ color: '#e9b949', roughness: .7 })
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
  } else {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    base.position.y = height / 2
    group.add(base)
  }
  group.position.set(item.position[0], item.position[1], item.position[2])
  group.rotation.y = THREE.MathUtils.degToRad(item.rotationDeg ?? 0)
  group.userData.objectId = item.id
  return group
}

/** Renders only calibrated metre-based data supplied by the scene endpoint. */
export default function GeometrySceneViewer({ scene, onSelectObject }: Props) {
  const host = useRef<HTMLDivElement>(null)

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
    for (const room of scene.rooms) {
      if (room.polygon.length < 3) continue
      const floor = roomMesh(room.polygon, room.floorYM ?? 0, floorMaterial)
      scene3.add(floor)
      bounds.expandByObject(floor)
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(room.polygon.map(([x, z]) => new THREE.Vector3(x, room.floorYM ?? .01, z))), roomLine)
      scene3.add(outline)
    }
    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#434b4e', roughness: .8 })
    for (const wall of scene.walls) {
      for (let index = 1; index < wall.points.length; index++) {
        const [ax, az] = wall.points[index - 1]; const [bx, bz] = wall.points[index]
        const length = Math.hypot(bx - ax, bz - az)
        if (!length) continue
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, wall.heightM, wall.thicknessM), wallMaterial)
        mesh.position.set((ax + bx) / 2, wall.baseYM + wall.heightM / 2, (az + bz) / 2)
        mesh.rotation.y = Math.atan2(bz - az, bx - ax)
        scene3.add(mesh); bounds.expandByObject(mesh)
      }
    }
    for (const item of scene.objects) { const mesh = symbol(item); scene3.add(mesh); bounds.expandByObject(mesh) }

    const size = bounds.isEmpty() ? new THREE.Vector3(5, 3, 5) : bounds.getSize(new THREE.Vector3())
    const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3())
    if (!bounds.isEmpty()) {
      const reference = new THREE.Vector3(bounds.min.x + Math.max(.18, size.x * .025), bounds.min.y + .035, bounds.min.z + Math.max(.18, size.z * .025))
      const scaleLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([reference, reference.clone().add(new THREE.Vector3(1, 0, 0))]), new THREE.LineBasicMaterial({ color: '#e9b949' }))
      const north = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), reference, .75, '#202427', .16, .09)
      scene3.add(scaleLine, north)
    }
    const distance = Math.max(size.x, size.z, 3) * 1.7
    camera.position.set(center.x + distance, center.y + distance * .9, center.z + distance)
    controls.target.copy(center); controls.update()
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2()
    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(scene3.children, true).find(candidate => {
        let node: THREE.Object3D | null = candidate.object
        while (node) { if (typeof node.userData.objectId === 'string') return true; node = node.parent }
        return false
      })
      let node = hit?.object ?? null
      while (node && typeof node.userData.objectId !== 'string') node = node.parent
      if (node?.userData.objectId) onSelectObject?.(node.userData.objectId as string)
    }
    renderer.domElement.addEventListener('click', onClick)
    const resize = () => { const width = Math.max(1, element.clientWidth); const height = Math.max(1, element.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    const animate = () => { if (disposed) return; controls.update(); renderer.render(scene3, camera); frame = requestAnimationFrame(animate) }; animate()
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', onClick); controls.dispose(); scene3.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Line) { node.geometry.dispose(); const materials = Array.isArray(node.material) ? node.material : [node.material]; materials.forEach(material => material.dispose()) } }); renderer.dispose(); renderer.domElement.remove() }
  }, [onSelectObject, scene])

  return <div className="geometry-scene-viewer"><div ref={host} className="geometry-scene-canvas" /><aside className="geometry-scene-reference" aria-label="Metric scene reference"><strong>↑ N</strong><span>1 m model units</span></aside></div>
}
