import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import type { FragmentsModel, SpatialTreeItem } from '@thatopen/fragments'
import type { StoreyInfo } from './types'

function collectSpatialDescendants(node: SpatialTreeItem | null, targetId: number | null, collecting: boolean, out: Set<number>) {
  if (!node) return
  const isMatch = targetId !== null && node.localId === targetId
  const shouldCollect = collecting || isMatch

  if (shouldCollect && node.localId !== null && node.localId !== undefined) {
    out.add(node.localId)
  }

  if (node.children) {
    for (const child of node.children) {
      collectSpatialDescendants(child, targetId, shouldCollect, out)
    }
  }
}

function findStoreyIdsInTree(node: SpatialTreeItem | null, out: number[]) {
  if (!node) return
  if (node.category && /IFCBUILDINGSTOREY/i.test(node.category) && node.localId !== null) {
    out.push(node.localId)
  }
  if (node.children) {
    for (const child of node.children) {
      findStoreyIdsInTree(child, out)
    }
  }
}

export async function loadStoreys(model: FragmentsModel): Promise<StoreyInfo[]> {
  const storeys: StoreyInfo[] = []

  const [byCat, spatialTree] = await Promise.all([
    model.getItemsOfCategories([/IFCBUILDINGSTOREY/i]).catch(() => ({})),
    model.getSpatialStructure().catch(() => null),
  ])

  const storeyIdsFromCat = Object.values(byCat).flat()
  const storeyIdsFromTree: number[] = []
  findStoreyIdsInTree(spatialTree, storeyIdsFromTree)

  const allStoreyIds = [...new Set([...storeyIdsFromCat, ...storeyIdsFromTree])]
  if (!allStoreyIds.length) return []

  const storeyData = await model.getItemsData(allStoreyIds).catch(() => [])

  for (let i = 0; i < allStoreyIds.length; i++) {
    const storeyId = allStoreyIds[i]
    const data = storeyData[i] ?? {}

    // Collect child element IDs
    const childrenSet = new Set<number>()
    const directChildren = await model.getItemsChildren([storeyId]).catch(() => [])
    for (const id of directChildren) childrenSet.add(id)

    // Traverse spatial tree for any nested children (e.g. elements inside spaces)
    if (spatialTree) {
      collectSpatialDescendants(spatialTree, storeyId, false, childrenSet)
    }

    const itemIds = [...childrenSet]

    // Determine storey name
    const rawName = (data.Name as { value?: unknown } | undefined)?.value ??
      (data.LongName as { value?: unknown } | undefined)?.value
    const name = typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : `Storey ${storeyId}`

    // Compute bounding box to get accurate floor elevation in 3D world coordinates
    const storeyBox = new THREE.Box3()
    if (itemIds.length) {
      const boxes = await model.getBoxes(itemIds).catch(() => [])
      for (const b of boxes) {
        if (b && !b.isEmpty()) storeyBox.union(b)
      }
    }

    // Determine floor elevation
    const rawElevation = (data.Elevation as { value?: unknown } | undefined)?.value ?? data.Elevation
    const elevationVal = typeof rawElevation === 'number' ? rawElevation : typeof rawElevation === 'string' ? parseFloat(rawElevation) : undefined

    let elevation = 0
    if (!storeyBox.isEmpty()) {
      elevation = storeyBox.min.z
    } else if (elevationVal !== undefined && !isNaN(elevationVal)) {
      elevation = elevationVal
    }

    storeys.push({
      id: `${model.modelId}:${storeyId}`,
      localId: storeyId,
      name,
      elevation,
      itemIds,
      box: storeyBox,
    })
  }

  // Sort storeys by elevation ascending (ground floor first, top floor last)
  storeys.sort((a, b) => a.elevation - b.elevation)

  return storeys
}

export function applyStoreyCut(
  components: OBC.Components,
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>,
  model: FragmentsModel,
  storey: StoreyInfo | null
) {
  try {
    const renderer = world.renderer
    if (!renderer) return
    const clipper = components.get(OBC.Clipper)

    if (!storey) {
      // "All storeys" restores full building
      clipper.deleteAll()
      model.useClippingPlanes([])
      renderer.three.localClippingEnabled = false
      renderer.needsUpdate = true
      return
    }

    // Horizontal cut plane at 1.2 m above the storey floor
    const cutZ = storey.elevation + 1.2

    // Three.js Plane clipping: normal (0, 0, -1) keeps points where z <= cutZ
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), cutZ)

    clipper.enabled = true
    clipper.visible = false
    clipper.deleteAll()
    clipper.createFromNormalAndCoplanarPoint(world, new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, cutZ))

    model.useClippingPlanes([cutPlane])
    renderer.three.localClippingEnabled = true
    renderer.needsUpdate = true
  } catch (error) {
    console.warn('Could not apply storey clipping plane:', error)
  }
}

export async function applyExplodedView(
  model: FragmentsModel,
  storeys: StoreyInfo[],
  exploded: boolean,
  spacing = 6.0,
  placements?: Map<string, THREE.Group>
) {
  try {
    if (!storeys.length) return

    // Map each item ID to its storey index
    const itemIdToStoreyIdx = new Map<number, number>()
    const localIdToStoreyIdx = new Map<number, number>()

    for (let idx = 0; idx < storeys.length; idx++) {
      const s = storeys[idx]
      for (const lid of s.itemIds) {
        localIdToStoreyIdx.set(lid, idx)
      }
      try {
        const itemIds = await model.getItemIdsByLocalIds(s.itemIds)
        for (const iid of itemIds) {
          if (iid !== null && iid !== undefined) itemIdToStoreyIdx.set(iid, idx)
        }
      } catch {
        // Fallback to localId
      }
    }

    // Apply or reset vertical offsets on tile meshes
    for (const mesh of model.tiles.values()) {
      const geom = mesh.geometry
      if (!geom.attributes.position) continue

      if (!geom.userData.originalPositions) {
        geom.userData.originalPositions = new Float32Array(geom.attributes.position.array)
      }

      const orig = geom.userData.originalPositions as Float32Array
      const pos = geom.attributes.position
      const idAttr = geom.attributes.id

      if (exploded) {
        for (let i = 0; i < pos.count; i++) {
          const origZ = orig[3 * i + 2]
          let sIdx = 0

          if (idAttr) {
            const itemId = idAttr.getX(i)
            if (itemIdToStoreyIdx.has(itemId)) {
              sIdx = itemIdToStoreyIdx.get(itemId)!
            } else if (localIdToStoreyIdx.has(itemId)) {
              sIdx = localIdToStoreyIdx.get(itemId)!
            } else {
              // Elevation fallback
              sIdx = findStoreyIndexByZ(storeys, origZ)
            }
          } else {
            sIdx = findStoreyIndexByZ(storeys, origZ)
          }

          pos.setZ(i, origZ + sIdx * spacing)
        }
      } else {
        pos.array.set(orig)
      }

      pos.needsUpdate = true
      geom.computeBoundingBox()
      geom.computeBoundingSphere()
    }

    // Handle demo catalog placed furniture
    if (placements) {
      for (const group of placements.values()) {
        const baseFloorZ = typeof group.userData.floorZ === 'number' ? group.userData.floorZ : group.position.z
        if (exploded) {
          const sIdx = findStoreyIndexByZ(storeys, baseFloorZ)
          group.position.z = baseFloorZ + sIdx * spacing
        } else {
          group.position.z = baseFloorZ
        }
      }
    }
  } catch (error) {
    console.warn('Could not apply exploded view:', error)
  }
}

function findStoreyIndexByZ(storeys: StoreyInfo[], z: number): number {
  for (let i = storeys.length - 1; i >= 0; i--) {
    if (z >= storeys[i].elevation - 0.2) return i
  }
  return 0
}
