import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export default function RoomPlanPreview({ polygon, missingWall }: { polygon: [number, number][]; missingWall: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = host.current
    if (!element || polygon.length < 3) return
    let renderer: THREE.WebGLRenderer | null = null
    let resizeObserver: ResizeObserver | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor('#F7F6F2')
      element.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#F7F6F2')
      scene.add(new THREE.AmbientLight('#ffffff', 1.8))
      const light = new THREE.DirectionalLight('#ffffff', 2.3)
      light.position.set(4, -5, 8)
      scene.add(light)
      const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000)
      camera.up.set(0, 0, 1)

      const minX = Math.min(...polygon.map(([x]) => x)); const maxX = Math.max(...polygon.map(([x]) => x))
      const minY = Math.min(...polygon.map(([, y]) => y)); const maxY = Math.max(...polygon.map(([, y]) => y))
      const scale = 0.01
      const points = polygon.map(([x, y]) => new THREE.Vector2((x - minX) * scale, (maxY - y) * scale))
      const width = Math.max((maxX - minX) * scale, 0.4)
      const depth = Math.max((maxY - minY) * scale, 0.4)
      const center = new THREE.Vector3(width / 2, depth / 2, 1.3)
      const floor = new THREE.Mesh(new THREE.BoxGeometry(width, depth, 0.08), new THREE.MeshStandardMaterial({ color: '#dedbd2', roughness: 1 }))
      floor.position.set(width / 2, depth / 2, -0.04)
      scene.add(floor)
      const wallMaterial = new THREE.MeshStandardMaterial({ color: missingWall ? '#D84B45' : '#8C9698', transparent: true, opacity: missingWall ? 0.62 : 0.84, roughness: 0.8 })
      const wallHeight = 2.6
      const thickness = Math.max(Math.min(width, depth) * 0.025, 0.08)
      for (let index = 0; index < points.length; index++) {
        const from = points[index]; const to = points[(index + 1) % points.length]
        const dx = to.x - from.x; const dy = to.y - from.y
        const length = Math.hypot(dx, dy)
        if (length < 0.05) continue
        const wall = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, wallHeight), wallMaterial)
        wall.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, wallHeight / 2)
        wall.rotation.z = Math.atan2(dy, dx)
        wall.castShadow = true
        scene.add(wall)
      }

      const render = () => {
        if (!renderer || !element) return
        const w = Math.max(element.clientWidth, 1); const h = Math.max(element.clientHeight, 1)
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        const distance = Math.max(width, depth, wallHeight) * 2.2
        camera.position.copy(center).add(new THREE.Vector3(1.1, -1.7, 1.05).normalize().multiplyScalar(distance))
        camera.lookAt(center)
        renderer.render(scene, camera)
      }
      render()
      resizeObserver = new ResizeObserver(render)
      resizeObserver.observe(element)
      return () => {
        resizeObserver?.disconnect()
        renderer?.dispose()
        if (renderer?.domElement.parentElement === element) element.removeChild(renderer.domElement)
        scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose() } })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      renderer?.dispose()
      return () => { resizeObserver?.disconnect() }
    }
  }, [polygon, missingWall])

  return <div className="room-plan-preview">
    <div className="room-plan-preview-canvas" ref={host} />
    <span>Preview (extruded from plan)</span>
    {error && <p className="error">3D preview unavailable: {error}</p>}
  </div>
}
