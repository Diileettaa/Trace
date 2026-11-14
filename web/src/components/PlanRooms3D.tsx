import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getPlanRooms } from '../api'

/** Lightweight 3D fallback for projects which only have a floor-plan drawing. */
export default function PlanRooms3D({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('Loading room geometry…')
  useEffect(() => {
    const element = host.current
    if (!element || !path) return
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let observer: ResizeObserver | null = null
    void getPlanRooms(path).then(({ rooms }) => {
      if (disposed) return
      const polygons = rooms.map(room => room.polygon_px).filter((polygon): polygon is [number, number][] => !!polygon && polygon.length > 2)
      if (!polygons.length) { setMessage('No room polygons are available for this drawing.'); return }
      const minX = Math.min(...polygons.flatMap(p => p.map(([x]) => x))); const maxX = Math.max(...polygons.flatMap(p => p.map(([x]) => x)))
      const minY = Math.min(...polygons.flatMap(p => p.map(([, y]) => y))); const maxY = Math.max(...polygons.flatMap(p => p.map(([, y]) => y)))
      const scale = 0.01; const width = (maxX - minX) * scale; const depth = (maxY - minY) * scale
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#F7F6F2')
      const camera = new THREE.PerspectiveCamera(45, 1, .05, 500); camera.up.set(0, 0, 1)
      renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); element.appendChild(renderer.domElement)
      scene.add(new THREE.HemisphereLight('#ffffff', '#647078', 2.4)); const key = new THREE.DirectionalLight('#fff4d8', 2); key.position.set(8, -8, 12); scene.add(key)
      const floor = new THREE.Mesh(new THREE.BoxGeometry(width, depth, .06), new THREE.MeshStandardMaterial({ color: '#e4e3de', roughness: 1 })); floor.position.set(width / 2, depth / 2, -.03); scene.add(floor)
      const material = new THREE.MeshStandardMaterial({ color: '#7e898c', roughness: .82, transparent: true, opacity: .9 })
      for (const polygon of polygons) {
        const points = polygon.map(([x, y]) => new THREE.Vector2((x - minX) * scale, (maxY - y) * scale))
        for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; const length = a.distanceTo(b); if (length < .04) continue; const wall = new THREE.Mesh(new THREE.BoxGeometry(length, .07, 2.7), material); wall.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 1.35); wall.rotation.z = Math.atan2(b.y - a.y, b.x - a.x); scene.add(wall) }
      }
      const render = () => { if (!renderer || disposed) return; const w = Math.max(1, element.clientWidth), h = Math.max(1, element.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); const distance = Math.max(width, depth, 3) * 1.7; camera.position.set(width / 2 + distance, depth / 2 - distance, distance * .8); camera.lookAt(width / 2, depth / 2, 1); renderer.render(scene, camera) }
      render(); observer = new ResizeObserver(render); observer.observe(element); setMessage('3D generated from the drawing · assumed wall height 2.7 m')
      const cleanup = () => scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach(item => item.dispose()); else object.material.dispose() } })
      ;(element as HTMLDivElement & { _planCleanup?: () => void })._planCleanup = cleanup
    }).catch(() => setMessage('Room geometry could not be loaded.'))
    return () => { disposed = true; observer?.disconnect(); (element as HTMLDivElement & { _planCleanup?: () => void })._planCleanup?.(); renderer?.dispose(); renderer?.domElement.remove() }
  }, [path])
  return <div className="plan-rooms-3d"><div ref={host} className="plan-rooms-3d-canvas" /><p>{message}</p></div>
}
