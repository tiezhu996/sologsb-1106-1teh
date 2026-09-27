<script lang="ts">
  import { onMount } from 'svelte'
  import EmptyBox from '../components/common/EmptyBox.svelte'
  import { blockStore } from '../stores/blockStore'
  import { carverStore } from '../stores/carverStore'
  import { draftStore } from '../stores/draftStore'
  import { repairStore } from '../stores/repairStore'
  import type { RepairOrder } from '../types/repair'

  let methodDraft = $state<Record<string, string>>({})
  let hoursDraft = $state<Record<string, number>>({})
  let cardMessage = $state<Record<string, string>>({})

  const unfinishedOrders = $derived(
    [...$repairStore].filter((order) => order.status === '未完成').sort((a, b) => a.openedAt.localeCompare(b.openedAt)),
  )
  const finishedOrders = $derived(
    [...$repairStore].filter((order) => order.status === '已完成').sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)),
  )
  const totalHours = $derived(finishedOrders.reduce((sum, order) => sum + order.workHours, 0))

  onMount(() => {
    void Promise.all([draftStore.load(), blockStore.load(), carverStore.load(), repairStore.load()])
  })

  $effect(() => {
    for (const order of $repairStore) {
      if (methodDraft[order.id] === undefined) methodDraft[order.id] = order.repairMethod
      if (hoursDraft[order.id] === undefined) hoursDraft[order.id] = order.workHours
    }
  })

  function draftTitle(draftId: string): string {
    return $draftStore.find((draft) => draft.id === draftId)?.title ?? '未知画稿'
  }

  function blockLabel(blockId: string): string {
    const block = $blockStore.find((item) => item.id === blockId)
    return block ? `${block.blockName} · 色序${block.colorNo}` : '版片已删档'
  }

  function carverName(carverId: string): string {
    return $carverStore.find((carver) => carver.id === carverId)?.name ?? '待指派'
  }

  async function assignCarver(order: RepairOrder, carverId: string): Promise<void> {
    await repairStore.assignCarver(order.id, carverId)
    cardMessage[order.id] = carverId ? `已指派${carverName(carverId)}修版。` : '已取消修版刻工指派。'
  }

  async function savePlan(order: RepairOrder): Promise<void> {
    const method = (methodDraft[order.id] ?? '').trim()
    const hours = Number(hoursDraft[order.id] ?? 0)
    if (!method || hours <= 0) {
      cardMessage[order.id] = '请填清修补方式，工时需大于 0。'
      return
    }
    await repairStore.savePlan(order.id, method, hours)
    cardMessage[order.id] = '修补方式与工时已存档。'
  }

  async function completeOrder(order: RepairOrder): Promise<void> {
    const method = (methodDraft[order.id] ?? '').trim()
    const hours = Number(hoursDraft[order.id] ?? 0)
    if (!order.carverId) {
      cardMessage[order.id] = '办结前先挑选修版刻工。'
      return
    }
    if (!method || hours <= 0) {
      cardMessage[order.id] = '办结前请填清修补方式，工时需大于 0。'
      return
    }
    await repairStore.complete(order.id, { repairMethod: method, workHours: hours })
    delete cardMessage[order.id]
  }
</script>

<svelte:head>
  <title>修版返修单 · 木版年画刻版工序档案</title>
</svelte:head>

<div class="page-heading">
  <div>
    <p class="eyebrow">走版崩口督办</p>
    <h1>修版返修单</h1>
    <p>印制批次填了偏差的版片自动开单，修版刻工按单修补，办结后版片记为已修版。</p>
  </div>
</div>

<section class="summary-strip four">
  <div><span>待办返修单</span><strong data-testid="count-repair-open">{unfinishedOrders.length}</strong></div>
  <div><span>已办结</span><strong data-testid="count-repair-done">{finishedOrders.length}</strong></div>
  <div><span>待办涉及版片</span><strong>{new Set(unfinishedOrders.map((order) => order.blockId)).size}</strong></div>
  <div><span>累计修版工时</span><strong>{totalHours}</strong></div>
</section>

<div class="repair-columns">
  <section class="panel">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">待办</span>
        <h2>未完成</h2>
      </div>
      <strong>{unfinishedOrders.length} 张</strong>
    </div>

    {#if unfinishedOrders.length === 0}
      <EmptyBox title="没有待办返修单" message="印制批次登记偏差后会自动开单，同一块版的未完单只并单不另开。" />
    {:else}
      <div class="repair-list">
        {#each unfinishedOrders as order (order.id)}
          <article class="repair-card" data-testid="row-repair-open">
            <div class="repair-head">
              <div>
                <h3>{draftTitle(order.draftId)} · {blockLabel(order.blockId)}</h3>
                <small>开单 {order.openedAt.replace(/-/g, '.')}</small>
              </div>
              <span class="tag">未完成</span>
            </div>

            <ul class="deviation-list">
              {#each order.deviations as entry}
                <li>
                  <strong>{entry.batchNo}</strong><span>{entry.foundAt.replace(/-/g, '.')}</span>
                  <p>{entry.text}</p>
                </li>
              {/each}
            </ul>

            <div class="repair-form">
              <label>
                <span>修版刻工</span>
                <select
                  data-testid={`field-repair-carver-${order.id}`}
                  value={order.carverId}
                  onchange={(event) => assignCarver(order, (event.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="">待指派</option>
                  {#each $carverStore as carver}<option value={carver.id}>{carver.name} · {carver.specialty}</option>{/each}
                </select>
              </label>
              <label>
                <span>修补方式</span>
                <input data-testid={`field-repair-method-${order.id}`} bind:value={methodDraft[order.id]} placeholder="如：嵌木补线后压平" />
              </label>
              <label>
                <span>工时（小时）</span>
                <input data-testid={`field-repair-hours-${order.id}`} type="number" min="0" step="0.5" bind:value={hoursDraft[order.id]} />
              </label>
            </div>

            {#if cardMessage[order.id]}<p class="form-message">{cardMessage[order.id]}</p>{/if}
            <div class="form-actions">
              <button class="button primary" data-testid={`submit-repair-${order.id}`} type="button" onclick={() => completeOrder(order)}>办结返修</button>
              <button class="button ghost" type="button" onclick={() => savePlan(order)}>存修补方案</button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="panel">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">留档</span>
        <h2>已完成</h2>
      </div>
      <strong>{finishedOrders.length} 张</strong>
    </div>

    {#if finishedOrders.length === 0}
      <EmptyBox title="还没有办结记录" message="待办单办结后在此留档，对应版片记为已修版。" />
    {:else}
      <div class="repair-list">
        {#each finishedOrders as order (order.id)}
          <article class="repair-card done" data-testid="row-repair-done">
            <div class="repair-head">
              <div>
                <h3>{draftTitle(order.draftId)} · {blockLabel(order.blockId)}</h3>
                <small>开单 {order.openedAt.replace(/-/g, '.')} · 办结 {order.finishedAt.replace('T', ' ')}</small>
              </div>
              <span class="tag done-tag">已完成</span>
            </div>

            <ul class="deviation-list">
              {#each order.deviations as entry}
                <li>
                  <strong>{entry.batchNo}</strong><span>{entry.foundAt.replace(/-/g, '.')}</span>
                  <p>{entry.text}</p>
                </li>
              {/each}
            </ul>

            <dl class="meta-list repair-meta">
              <div><dt>修版刻工</dt><dd>{carverName(order.carverId)}</dd></div>
              <div><dt>修补方式</dt><dd>{order.repairMethod}</dd></div>
              <div><dt>工时</dt><dd>{order.workHours} 小时</dd></div>
            </dl>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>
