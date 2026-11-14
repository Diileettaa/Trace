import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import * as OBC from '@thatopen/components'
import * as THREE from 'three'
import { RenderedFaces } from '@thatopen/fragments'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'
import wasmMtUrl from 'web-ifc/web-ifc-mt.wasm?url'
import { fileUrl } from './api'

interface Props {
  path: string
  guids: string[] // IFC GlobalIds to highlight (from evidence items)
  selectedGuid?: string | null
  onSelectGuid?: (guid: string) => void
}

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>

const HIGHLIGHT = {
  color: new THREE.Color('#e4572e'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
}

const FOCUS_HIGHLIGHT = {
  color: new THREE.Color('#1a56db'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
}

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class IfcErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="viewer empty" style={{ padding: 24, textAlign: 'center' }}>
          <div className="error" style={{ marginBottom: 12 }}>
            3D rendering encountered an error: {this.state.error?.message || 'Unknown error'}
          </div>
          <button onClick={() => this.setState({ hasError: false, error: null })}>Reload 3D view</button>
        </div>
      )
    }
    return this.props.children
  }
}

function IfcViewerInner({ path, guids, selectedGuid }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<{ components: OBC.Components; world: World; fragments: OBC.FragmentsManager } | null>(null)
  const [status, setStatus] = useState('')
  const [modelReady, setModelReady] = useState(false)

  // load the model whenever the path changes
  useEffect(() => {
    if (!box.current) return
    let cancelled = false
    setModelReady(false)

    // Check WebGL availability to avoid white screen
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) {
        setStatus('WebGL is not available in your browser.')
        return
      }
    } catch {
      setStatus('WebGL check failed.')
      return
    }

    let components: OBC.Components | null = null

    ;(async () => {
      try {
        components = new OBC.Components()
        const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>()
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = new THREE.Color('#f5f5f3')
        world.renderer = new OBC.SimpleRenderer(components, box.current!)
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
        })

        const loader = components.get(OBC.IfcLoader)
        await loader.setup({
          autoSetWasm: false,
          customLocateFileHandler: (url: string) => {
            if (url.includes('web-ifc-mt.wasm')) return wasmMtUrl
            if (url.includes('web-ifc.wasm')) return wasmUrl
            return url
          },
        })
        loader.settings.wasm.path = wasmUrl
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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setStatus(`3D loading failed: ${msg}`)
      }
    })()

    return () => {
      cancelled = true
      engine.current = null
      if (components) {
        try {
          components.dispose()
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [path])

  // Highlight all guids and focus selectedGuid
  useEffect(() => {
    const e = engine.current
    if (!e || status || !modelReady) return
    let cancelled = false
    ;(async () => {
      try {
        await e.fragments.resetHighlight()
        if (cancelled) return

        if (guids.length > 0) {
          const items = await e.fragments.guidsToModelIdMap(guids)
          if (cancelled) return
          if (Object.keys(items).length > 0) {
            await e.fragments.highlight(HIGHLIGHT, items)
          }
        }

        if (selectedGuid) {
          const selItems = await e.fragments.guidsToModelIdMap([selectedGuid])
          if (cancelled) return
          if (Object.keys(selItems).length > 0) {
            await e.fragments.highlight(FOCUS_HIGHLIGHT, selItems)
            await e.world.camera.fitToItems(selItems)
            await e.fragments.core.update(true)
            return
          }
        }

        if (guids.length > 0) {
          const items = await e.fragments.guidsToModelIdMap(guids)
          if (cancelled) return
          if (Object.keys(items).length > 0) {
            await e.world.camera.fitToItems(items)
          }
        }
        await e.fragments.core.update(true)
      } catch (err) {
        console.warn('Failed to update 3D highlights:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [guids, selectedGuid, status, modelReady])

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <span className="path">{path}</span>
        {guids.length > 0 && <span>{guids.length} element{guids.length === 1 ? '' : 's'} highlighted</span>}
        {selectedGuid && <span className="dim"> · Focused: {selectedGuid.slice(0, 8)}…</span>}
      </div>
      {status && <div className="status">{status}</div>}
      <div className="three" ref={box} />
    </div>
  )
}

/** 3D view of an IFC model (That Open Engine). Elements whose GUID is in `guids` are highlighted and framed. */
export default function IfcViewer(props: Props) {
  return (
    <IfcErrorBoundary>
      <IfcViewerInner {...props} />
    </IfcErrorBoundary>
  )
}
