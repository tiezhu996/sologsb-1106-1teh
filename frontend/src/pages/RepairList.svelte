<script lang="ts">
  import { onMount } from 'svelte'
  import { link } from 'svelte-spa-router'
  import EmptyBox from '../components/common/EmptyBox.svelte'
  import { draftStore } from '../stores/draftStore'
  import { blockStore } from '../stores/blockStore'
  import { carverStore } from '../stores/carverStore'
  import { repairStore } from '../stores/repairStore'
  import type { RepairOrder } from '../types/repair'
  import type { Block } from '../types/block'

  interface PlanDraft {
    repairBy: string
    repairMethod: string
    laborHours: number
  }

  let planDrafts = $state<Record<string, PlanDraft>>({})
  let feedback = $state<Record<string, string>>({})

  const openOrders = $derived($repairStore.filter((order) => order.status === '未完成'))
  const doneOrders = $derived($repairStore.filter((order) => order.status === '已完成'))
  const unassignedCount = $derived(openOrders.filter((order) => !order.repairBy).length)

  onMount(() => {
    void Promise.all([draftStore.load(), blockStore.load(), carverStore.load(), repairStore.load()])
  })

  $effect(() => {
    for (const order of $repairStore) {
      if (!planDrafts[order.id]) {
        planDrafts[order.id] = {
          repairBy: order.repairBy,
          repairMethod: order.repairMethod,
          laborHours: order.laborHours,
        }
      }
    }
  })

  function draftTitle(draftId: string): string {
    return $draftStore.find((draft) => draft.id === draftId)?.title ?? '未知画稿'
  }

  function orderBlock(order: RepairOrder): Block | null {
    return $blockStore.find((block) => block.id === order.blockId) ?? null
  }

  function formatDate(value: string): string {
    return value.replace(/-/g, '.')
  }

  function formatCompletedAt(value: string): string {
    return value.replace('T', ' ')
  }

  async function savePlan(order: RepairOrder): Promise<void> {
    const plan = planDrafts[order.id]
    if (!plan) return
    await repairStore.update(order.id, {
      repairBy: plan.repairBy.trim(),
      repairMethod: plan.repairMethod.trim(),
      laborHours: Math.max(0, Number(plan.laborHours) || 0),
    })
    feedback[order.id] = '返修安排已保存。'
  }

  async function completeOrder(order: RepairOrder): Promise<void> {
    const plan = planDrafts[order.id]
    const repairBy = plan?.repairBy.trim() ?? order.repairBy
    const repairMethod = plan?.repairMethod.trim() ?? order.repairMethod
    const laborHours = Math.max(0, Number(plan?.laborHours ?? order.laborHours) || 0)

    if (!repairBy || !repairMethod || laborHours <= 0) {
      feedback[order.id] = '请先挑好修版刻工，并填清修补方式与工时，再办结返修。'
      return
    }

    await repairStore.complete({ ...order, repairBy, repairMethod, laborHours })
    feedback[order.id] = ''
  }
</script>

<svelte:head>
  <title>修版返修单 · 木版年画刻版工序档案</title>
</svelte:head>

<div class="page-heading">
  <div>
    <p class="eyebrow">走版崩口返修</p>
    <h1>修版返修单</h1>
    <p>印制中逐版发现的偏差按版片归单：同一块版的新偏差并入未完成的单子，办结后版片记为已修版。</p>
  </div>
  <a class="button ghost" use:link href="/batches">去印制批次登记</a>
</div>

<section class="summary-strip four">
  <div><span>返修单总数</span><strong data-testid="count-repair">{$repairStore.length}</strong></div>
  <div><span>未完成</span><strong data-testid="count-repair-open">{openOrders.length}</strong></div>
  <div><span>待派刻工</span><strong>{unassignedCount}</strong></div>
  <div><span>已完成</span><strong data-testid="count-repair-done">{doneOrders.length}</strong></div>
</section>

<section class="panel">
  <div class="panel-heading">
    <div>
      <span class="section-kicker">在办</span>
      <h2>未完成的返修单</h2>
    </div>
    <strong>{openOrders.length} 张</strong>
  </div>

  {#if openOrders.length === 0}
    <EmptyBox title="没有未完成的返修单" message="保存印制批次时填写了套色偏差的版片，会在这里自动开单。" />
  {:else}
    <div class="repair-list">
      {#each openOrders as order (order.id)}
        {@const block = orderBlock(order)}
        <article class="repair-item" data-testid="row-repair-open">
          <div class="repair-head">
            <div>
              <span class="section-kicker">{draftTitle(order.draftId)}</span>
              <h3>{block ? `${block.colorNo} 号 · ${block.blockName}` : '未知版片'}</h3>
              {#if block}
                <small>{block.woodType} · {block.thicknessMm} mm · 当前状态：{block.state}</small>
              {/if}
            </div>
            <span class="tag repair-open">未完成</span>
          </div>

          <div class="deviation-records">
            <h4>逐批偏差（{order.deviations.length} 条）</h4>
            <ul>
              {#each order.deviations as deviation}
                <li>
                  <div><strong>{deviation.batchNo}</strong><span>{formatDate(deviation.printedAt)}</span></div>
                  <p>{deviation.note}</p>
                </li>
              {/each}
            </ul>
          </div>

          {#if planDrafts[order.id]}
            <div class="repair-form">
              <label>
                <span>修版刻工</span>
                <select data-testid={`field-repairBy-${order.id}`} bind:value={planDrafts[order.id].repairBy}>
                  <option value="">待指派</option>
                  {#each $carverStore as carver}
                    <option value={carver.name}>{carver.name} · {carver.specialty}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>修补方式</span>
                <input
                  data-testid={`field-repairMethod-${order.id}`}
                  bind:value={planDrafts[order.id].repairMethod}
                  placeholder="如：铲底收线、嵌补梨木、补刻半线"
                />
              </label>
              <label class="hours-field">
                <span>工时（小时）</span>
                <input
                  data-testid={`field-laborHours-${order.id}`}
                  type="number"
                  min="0"
                  step="0.5"
                  bind:value={planDrafts[order.id].laborHours}
                />
              </label>
              <button class="button ghost" type="button" onclick={() => savePlan(order)}>保存安排</button>
              <button class="button primary" data-testid={`complete-repair-${order.id}`} type="button" onclick={() => completeOrder(order)}>
                办结返修
              </button>
            </div>
          {/if}
          {#if feedback[order.id]}<p class="notice" data-testid={`repair-feedback-${order.id}`}>{feedback[order.id]}</p>{/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<section class="panel">
  <div class="panel-heading">
    <div>
      <span class="section-kicker">已办结</span>
      <h2>已完成的返修单</h2>
    </div>
    <strong>{doneOrders.length} 张</strong>
  </div>

  {#if doneOrders.length === 0}
    <EmptyBox title="还没有办结的返修单" message="未完成的返修单填好刻工、修补方式与工时后即可办结。" />
  {:else}
    <div class="repair-list">
      {#each doneOrders as order (order.id)}
        {@const block = orderBlock(order)}
        <article class="repair-item done" data-testid="row-repair-done">
          <div class="repair-head">
            <div>
              <span class="section-kicker">{draftTitle(order.draftId)}</span>
              <h3>{block ? `${block.colorNo} 号 · ${block.blockName}` : '未知版片'}</h3>
              <small>办结于 {formatCompletedAt(order.completedAt)}</small>
            </div>
            <span class="tag repair-done">已完成</span>
          </div>

          <div class="deviation-records">
            <h4>逐批偏差（{order.deviations.length} 条）</h4>
            <ul>
              {#each order.deviations as deviation}
                <li>
                  <div><strong>{deviation.batchNo}</strong><span>{formatDate(deviation.printedAt)}</span></div>
                  <p>{deviation.note}</p>
                </li>
              {/each}
            </ul>
          </div>

          <dl class="repair-summary">
            <div><dt>修版刻工</dt><dd>{order.repairBy || '未指派'}</dd></div>
            <div><dt>修补方式</dt><dd>{order.repairMethod || '未填写'}</dd></div>
            <div><dt>工时</dt><dd>{order.laborHours} 小时</dd></div>
          </dl>
        </article>
      {/each}
    </div>
  {/if}
</section>
