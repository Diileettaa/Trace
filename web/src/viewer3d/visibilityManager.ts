import type { FragmentsModel } from '@thatopen/fragments'
import * as THREE from 'three'
import type { StoreyInfo, TradesState } from './types'

/** Applies the intersection of the selected storey and enabled trade layers. */
export async function applyBuildingVisibility(
  model: FragmentsModel,
  storeys: StoreyInfo[],
  selectedStoreyId: string | null,
  trades: TradesState,
  allLocalIds: number[],
  walkMode = false,
) {
  try {
    const activeStorey = selectedStoreyId ? storeys.find((storey) => storey.id === selectedStoreyId) ?? null : null
    const selectedIndex = activeStorey ? storeys.indexOf(activeStorey) : -1
    const storeyIds = activeStorey && !walkMode ? new Set(activeStorey.itemIds) : null
    const lowerIds = new Set<number>()
    if (activeStorey && !walkMode) {
      const activeSet = new Set(activeStorey.itemIds)
      for (const floor of storeys.slice(0, selectedIndex)) {
        for (const id of floor.itemIds) if (!activeSet.has(id)) lowerIds.add(id)
      }
    }
    const hiddenTradeIds = new Set<number>()
    for (const trade of Object.values(trades)) {
      if (!trade.enabled) for (const id of trade.itemIds) hiddenTradeIds.add(id)
    }

    const toShow: number[] = []
    const toHide: number[] = []
    for (const id of allLocalIds) {
      if ((!storeyIds || storeyIds.has(id) || lowerIds.has(id)) && !hiddenTradeIds.has(id)) toShow.push(id)
      else toHide.push(id)
    }
    if (toHide.length) await model.setVisible(toHide, false)
    if (toShow.length) await model.setVisible(toShow, true)
    model.clearGhost()
    const ghosts = [...lowerIds].filter(id => !hiddenTradeIds.has(id))
    if (ghosts.length) {
      await model.setColor(ghosts, new THREE.Color('#8C9294'))
      await model.setOpacity(ghosts, 0.15)
    }
  } catch (error) {
    console.warn('Could not apply building visibility:', error)
  }
}
