import { derived, writable } from 'svelte/store'
import type { PrintBatch } from '../types/batch'
import type { RepairOrder } from '../types/repair'
import { db } from '../utils/db'

const repairList = writable<RepairOrder[]>([])

const unfinishedByBlock = derived(repairList, ($repairs) => {
  const map: Record<string, RepairOrder> = {}
  for (const order of $repairs) {
    if (order.status === '未完成') map[order.blockId] = order
  }
  return map
})

async function load(): Promise<void> {
  const records = await db.repairs.toArray()
  records.sort((a, b) => b.openedAt.localeCompare(a.openedAt) || a.id.localeCompare(b.id))
  repairList.set(records)
}

export interface BatchDeviationEntry {
  blockId: string
  deviation: string
}

export interface RepairSyncResult {
  created: number
  merged: number
}

async function recordBatchDeviations(batch: PrintBatch, entries: BatchDeviationEntry[]): Promise<RepairSyncResult> {
  const filled = entries.filter((entry) => entry.deviation.trim())
  const result: RepairSyncResult = { created: 0, merged: 0 }
  if (filled.length === 0) return result

  await db.transaction('rw', db.repairs, async () => {
    for (const entry of filled) {
      const deviation = {
        batchId: batch.id,
        batchNo: batch.batchNo,
        foundAt: batch.printedAt,
        text: entry.deviation.trim(),
      }
      const existing = await db.repairs.where('[blockId+status]').equals([entry.blockId, '未完成']).first()
      if (existing) {
        await db.repairs.update(existing.id, { deviations: [...existing.deviations, deviation] })
        result.merged += 1
      } else {
        await db.repairs.add({
          id: `repair-${crypto.randomUUID()}`,
          draftId: batch.draftId,
          blockId: entry.blockId,
          status: '未完成' as const,
          openedAt: batch.printedAt,
          carverId: '',
          repairMethod: '',
          workHours: 0,
          finishedAt: '',
          deviations: [deviation],
        })
        result.created += 1
      }
    }
  })

  await load()
  return result
}

async function assignCarver(id: string, carverId: string): Promise<void> {
  await db.repairs.update(id, { carverId })
  await load()
}

async function savePlan(id: string, repairMethod: string, workHours: number): Promise<void> {
  await db.repairs.update(id, { repairMethod, workHours })
  await load()
}

async function complete(id: string, plan: { repairMethod: string; workHours: number }): Promise<void> {
  const order = await db.repairs.get(id)
  if (!order || order.status === '已完成') return
  const carver = order.carverId ? await db.carvers.get(order.carverId) : null
  const finishedAt = new Date().toISOString().slice(0, 16)

  await db.transaction('rw', db.repairs, db.blocks, db.nodes, async () => {
    await db.repairs.update(id, {
      status: '已完成',
      repairMethod: plan.repairMethod,
      workHours: plan.workHours,
      finishedAt,
    })
    await db.blocks.update(order.blockId, { state: '已修版' })

    const existing = await db.nodes.where('blockId').equals(order.blockId).toArray()
    await db.nodes.add({
      id: `node-${crypto.randomUUID()}`,
      blockId: order.blockId,
      stage: '修版',
      seq: Math.max(0, ...existing.map((node) => node.seq)) + 1,
      operator: carver?.name ?? '修版刻工',
      startedAt: finishedAt,
      durationMin: Math.round(plan.workHours * 60),
      note: `修版返修办结：${plan.repairMethod}`,
    })
  })

  const draftBlocks = await db.blocks.where('draftId').equals(order.draftId).toArray()
  const allCarved = draftBlocks.length > 0 && draftBlocks.every((item) => item.state === '已刻成' || item.state === '已修版')
  if (allCarved) await db.drafts.update(order.draftId, { status: '可印' })

  await load()
}

export const repairStore = {
  subscribe: repairList.subscribe,
  unfinishedByBlock,
  load,
  recordBatchDeviations,
  assignCarver,
  savePlan,
  complete,
}
