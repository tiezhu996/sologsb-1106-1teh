import { writable } from 'svelte/store'
import type { PrintBatch } from '../types/batch'
import type { RepairOrder } from '../types/repair'
import { db } from '../utils/db'
import { blockStore } from './blockStore'

const repairList = writable<RepairOrder[]>([])

export interface DeviationEntry {
  blockId: string
  note: string
}

export interface RepairBillResult {
  created: number
  merged: number
}

async function load(): Promise<void> {
  const records = await db.repairs.toArray()
  records.sort((a, b) => {
    if (a.status !== b.status) return a.status === '未完成' ? -1 : 1
    const aTime = a.status === '已完成' ? a.completedAt : a.createdAt
    const bTime = b.status === '已完成' ? b.completedAt : b.createdAt
    return bTime.localeCompare(aTime)
  })
  repairList.set(records)
}

/**
 * 保存印制批次，并为填了偏差的版片开修版返修单：
 * 同一块版还有未完成的单子时，把新偏差并入该单，不另开。
 */
async function saveBatchWithRepairs(batch: PrintBatch, entries: DeviationEntry[]): Promise<RepairBillResult> {
  let created = 0
  let merged = 0

  await db.transaction('rw', db.batches, db.repairs, async () => {
    await db.batches.add(batch)

    for (const entry of entries) {
      const deviation = {
        batchId: batch.id,
        batchNo: batch.batchNo,
        printedAt: batch.printedAt,
        note: entry.note,
      }
      const openOrder = await db.repairs
        .where('blockId')
        .equals(entry.blockId)
        .and((order) => order.status === '未完成')
        .first()

      if (openOrder) {
        await db.repairs.update(openOrder.id, { deviations: [...openOrder.deviations, deviation] })
        merged += 1
      } else {
        await db.repairs.add({
          id: `repair-${crypto.randomUUID()}`,
          draftId: batch.draftId,
          blockId: entry.blockId,
          status: '未完成',
          deviations: [deviation],
          repairBy: '',
          repairMethod: '',
          laborHours: 0,
          createdAt: new Date().toISOString().slice(0, 16),
          completedAt: '',
        })
        created += 1
      }
    }
  })

  await load()
  return { created, merged }
}

async function update(id: string, changes: Partial<Omit<RepairOrder, 'id'>>): Promise<void> {
  await db.repairs.update(id, changes)
  await load()
}

/** 办结返修单：单子记为已完成，版片记为已修版，并补一条修版工序节点。 */
async function complete(order: RepairOrder): Promise<void> {
  const completedAt = new Date().toISOString().slice(0, 16)

  await db.transaction('rw', db.repairs, db.blocks, db.nodes, async () => {
    await db.repairs.update(order.id, {
      status: '已完成',
      repairBy: order.repairBy,
      repairMethod: order.repairMethod,
      laborHours: order.laborHours,
      completedAt,
    })
    await db.blocks.update(order.blockId, { state: '已修版' })

    const existing = await db.nodes.where('blockId').equals(order.blockId).toArray()
    await db.nodes.add({
      id: `node-${crypto.randomUUID()}`,
      blockId: order.blockId,
      stage: '修版',
      seq: Math.max(0, ...existing.map((node) => node.seq)) + 1,
      operator: order.repairBy || '当班刻工',
      startedAt: completedAt,
      durationMin: Math.round(order.laborHours * 60),
      note: `返修办结：${order.repairMethod}`,
    })
  })

  await Promise.all([load(), blockStore.load()])
}

export const repairStore = {
  subscribe: repairList.subscribe,
  load,
  saveBatchWithRepairs,
  update,
  complete,
}
