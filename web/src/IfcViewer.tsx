import { useEffect, useRef, useState } from 'react'
import * as OBC from '@thatopen/components'
import * as THREE from 'three'
import { RenderedFaces } from '@thatopen/fragments'
import { fileUrl } from './api'

interface Props {
  path: string
  guids: string[] // IFC GlobalIds to highlight (from evidence items)
}

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>

const HIGHLIGHT = {
  color: new THREE.Color('#e4572e'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
}

/** 3D view of an IFC model (That Open Engine). Elements whose GUID is in `guids` are highlighted and framed. */
export default function IfcViewer({ path, guids }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<{ components: OBC.Components; world: World; fragments: OBC.FragmentsManager } | null>(null)
  const [status, setStatus] = useState('')

  // load the model whenever the path changes
  useEffect(() => {
    if (!box.current) return
    let cancelled = false
    const components = new OBC.Components()
    const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>()
    world.scene = new OBC.SimpleScene(components)
    world.scene.setup()
    world.scene.three.background = new THREE.Color('#f5f5f3')
    world.renderer = new OBC.SimpleRenderer(components, box.current)
    world.camera = new OBC.SimpleCamera(components)
    components.init()
    components.get(OBC.Grids).create(world)

    const fragments = components.get(OBC.FragmentsManager)
    engine.current = { components, world, fragments }

    ;(async () => {
      try {
        setStatus('Loading 3D engine…')
        fragments.init(await OBC.FragmentsManager.getWorker())
        world.camera.controls.addEventListener('rest', () => fragments.core.update(true))
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three)
          world.scene.three.add(model.object)
          fragments.core.update(true)
        })
        const loader = components.get(OBC.IfcLoader)
        await loader.setup({ autoSetWasm: true })
        setStatus('Downloading model…')
        const res = await fetch(fileUrl(path))
        if (!res.ok) throw new Error(`${res.status}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        setStatus('Converting IFC (may take tens of seconds for large models)…')
        await loader.load(bytes, true, path)
        await world.camera.fitToItems()
        setStatus('')
      } catch (e) {
        if (!cancelled) setStatus(`3D loading failed: ${e}`)
      }
    })()

    return () => {
      cancelled = true
      engine.current = null
      components.dispose()
    }
  }, [path])

  // highlight + frame the elements named in the answer
  useEffect(() => {
    const e = engine.current
    if (!e || status) return
    ;(async () => {
      await e.fragments.resetHighlight()
      if (!guids.length) return
      const items = await e.fragments.guidsToModelIdMap(guids)
      await e.fragments.highlight(HIGHLIGHT, items)
      await e.world.camera.fitToItems(items)
      await e.fragments.core.update(true)
    })()
  }, [guids, status])

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <span className="path">{path}</span>
        {guids.length > 0 && <span>{guids.length} element{guids.length === 1 ? '' : 's'} highlighted</span>}
      </div>
      {status && <div className="status">{status}</div>}
      <div className="three" ref={box} />
    </div>
  )
}
