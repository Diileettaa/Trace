import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

export interface FurnitureProduct {
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

const FILTERS = ['Kitchen', 'Bathroom', 'Living', 'Bedroom', 'Lighting', 'Office'] as const
type CatalogFilter = typeof FILTERS[number]

function filterFor(product: FurnitureProduct): CatalogFilter {
  if (product.id === 'kitchen-island' || product.category === 'kitchen') return 'Kitchen'
  if (['toilet', 'sink', 'shower', 'bathtub'].includes(product.category)) return 'Bathroom'
  if (product.category === 'bed') return 'Bedroom'
  if (product.category === 'lamp') return 'Lighting'
  if (product.id === 'work-desk') return 'Office'
  return 'Living'
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
    else object.material.dispose()
  })
}

interface Props {
  products: FurnitureProduct[]
  roomName: string
  createModel: (product: FurnitureProduct) => THREE.Group
  onPlace: (product: FurnitureProduct) => void
  onClose: () => void
}

export default function FurnitureCatalogModal({ products, roomName, createModel, onPlace, onClose }: Props) {
  const [filter, setFilter] = useState<CatalogFilter>('Kitchen')
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const visible = useMemo(() => products.filter((product) => filterFor(product) === filter), [filter, products])

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
      renderer.setSize(176, 116, false)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#F7F6F2')
      scene.add(new THREE.AmbientLight('#ffffff', 2.1))
      const keyLight = new THREE.DirectionalLight('#ffffff', 2.6)
      keyLight.position.set(3, -4, 7)
      scene.add(keyLight)
      const camera = new THREE.PerspectiveCamera(36, 176 / 116, 0.01, 100)
      camera.up.set(0, 0, 1)
      const direction = new THREE.Vector3(1.25, -1.8, 1.15).normalize()
      const next: Record<string, string> = {}
      for (const product of products) {
        const group = createModel(product)
        scene.add(group)
        const bounds = new THREE.Box3().setFromObject(group)
        const center = bounds.getCenter(new THREE.Vector3())
        const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.1)
        camera.position.copy(center).addScaledVector(direction, radius * 3.2)
        camera.lookAt(center)
        camera.near = Math.max(radius / 100, 0.001)
        camera.far = radius * 12
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
        next[product.id] = renderer.domElement.toDataURL('image/png')
        scene.remove(group)
        disposeGroup(group)
      }
      setThumbnails(next)
    } catch (error) {
      console.warn('Could not render local furniture catalog thumbnails:', error)
    } finally {
      renderer?.dispose()
    }
    return () => { renderer?.dispose() }
  }, [createModel, products])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="catalog-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title">
      <header className="catalog-modal-heading">
        <div><p>Demo catalog · prices are demo data</p><h2 id="catalog-modal-title">Add furniture</h2>
          <strong>Placing into room {roomName}</strong></div>
        <button aria-label="Close catalog" onClick={onClose}>×</button>
      </header>
      <nav className="catalog-filter-list" aria-label="Furniture category">
        {FILTERS.map((category) => <button key={category} className={filter === category ? 'active' : ''}
          aria-pressed={filter === category} onClick={() => setFilter(category)}>{category}</button>)}
      </nav>
      <div className="catalog-product-grid">
        {visible.map((product) => <button className="catalog-product-card" key={product.id} onClick={() => onPlace(product)}>
          <img src={thumbnails[product.id] || ''} alt={`${product.name} 3D preview`} />
          <span className="catalog-demo-badge">Demo catalog</span>
          <strong>{product.name}</strong>
          <span>€{product.price_eur.toLocaleString('en-US')}</span>
          <small>{product.width_mm} × {product.depth_mm} × {product.height_mm} mm</small>
          <small>{product.material}</small>
        </button>)}
      </div>
    </section>
  </div>
}
