import type { KitchenPanelId, KitchenRecipeView, KitchenViewState } from './pixel-contract';
export type { KitchenIngredientView, KitchenRecipeView } from './pixel-contract';

/** Presentation only. All inventory, effects and availability come from the real controller. */
export function escapeKitchenHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
const h = escapeKitchenHtml;
const PANEL_NAMES: Record<KitchenPanelId, string> = {
  shelf: '食材架', stove: '暖火灶台', recipes: '家常食谱', bag: '出征行囊',
};

function storageNotice(state: KitchenViewState): string | null {
  return state.warning ?? (state.readOnly ? '当前存档只读，可以查看材料，暂不能下锅或装包。'
    : state.sessionOnly ? '当前仅在本页保留，刷新或关闭后不会保存。' : null);
}

function recipeDetails(recipe: KitchenRecipeView | undefined): string {
  if (!recipe) return '<p class="akitchen-panel-note">配方目录暂不可用，请返回画廊后重试。</p>';
  return `<section class="akitchen-recipe-detail" aria-label="${h(recipe.name)}的材料与产出">
    <div class="akitchen-detail-title"><h3>${h(recipe.name)}</h3><p>${h(recipe.outputName)} <strong>${recipe.stock}</strong> / ${recipe.capacity}</p></div>
    <p class="akitchen-effect">${h(recipe.description)}</p>
    <div class="akitchen-section-label"><h4>这一锅需要</h4><span>现有 / 需要</span></div>
    <dl class="akitchen-ingredients">${recipe.ingredients.map(ingredient => `<div><dt>${h(ingredient.name)}<small>${h(ingredient.source)}</small></dt><dd data-enough="${ingredient.current >= ingredient.required}"><strong>${ingredient.current}</strong> / ${ingredient.required}<small>${ingredient.current >= ingredient.required ? '已备齐' : `还缺 ${ingredient.required - ingredient.current}`}</small></dd></div>`).join('')}</dl>
    <div class="akitchen-output"><p>成品 <strong>${h(recipe.outputName)} ×${recipe.outputCount}</strong> · 库存 ${recipe.stock} / ${recipe.capacity}</p>${recipe.additionalRewards.map(reward => `<p>返还 <strong>${h(reward.name)} ×${reward.count}</strong> · 现有 ${reward.current} / ${reward.capacity}</p>`).join('')}</div>
  </section>`;
}

function recipeChoices(state: KitchenViewState): string {
  return `<div class="akitchen-recipe-choices" role="group" aria-label="选择烹饪配方">${state.recipes.map((recipe, index) => {
    const status = state.readOnly ? '只读 · 可查看' : recipe.status;
    return `<button class="akitchen-recipe-choice" type="button" data-action="select" data-recipe="${h(recipe.id)}" data-focus="recipe-${h(recipe.id)}" aria-pressed="${recipe.id === state.selectedId}" aria-label="${h(recipe.name)}，${h(status)}，成品${recipe.stock}份"><span class="akitchen-choice-number" aria-hidden="true">0${index + 1}</span><span class="akitchen-choice-name">${h(recipe.name)}</span><small>${h(status)}</small></button>`;
  }).join('')}</div>`;
}

function shelfContents(state: KitchenViewState): string {
  return `<p class="akitchen-panel-note">鱼获来自钓鱼，植物原料来自花园。这里只查看已有库存。</p><dl class="akitchen-stock-list">${state.inventory.map(item => `<div><dt>${h(item.name)}<small>${h(item.source)}</small></dt><dd>${item.count}<span> / ${item.capacity}</span></dd></div>`).join('')}</dl>`;
}

function bagContents(state: KitchenViewState): string {
  const packed = state.supplies.find(supply => supply.id === state.packedSupply);
  return `<div class="akitchen-packed"><span>当前单槽</span><strong>${packed ? h(packed.name) : '行囊空着'}</strong>${packed ? `<button type="button" class="akitchen-button" data-action="unpack" data-focus="unpack" ${state.readOnly ? 'disabled' : ''}>移出行囊</button>` : ''}</div>
    <p class="akitchen-panel-note">装入或移出不消耗成品。确认新冒险时才使用一份，只在该局生效。</p>
    <ul class="akitchen-supply-list">${state.supplies.map(supply => {
      const selected = supply.id === state.packedSupply;
      return `<li><div class="akitchen-supply-heading"><h3>${h(supply.name)}</h3><span>库存 <strong>${supply.count}</strong> / ${supply.capacity}</span></div><p>${h(supply.description)}</p><button class="akitchen-button" type="button" data-action="pack" data-supply="${h(supply.id)}" data-focus="pack-${h(supply.id)}" aria-pressed="${selected}" ${state.readOnly || supply.count < 1 || selected ? 'disabled' : ''}>${selected ? '✓ 已装入' : supply.count < 1 ? '还没有成品' : `装入${h(supply.name)}`}</button></li>`;
    }).join('')}</ul>`;
}

function panel(state: KitchenViewState): string {
  if (!state.panel) return '';
  const name = PANEL_NAMES[state.panel];
  const recipe = state.recipes.find(entry => entry.id === state.selectedId) ?? state.recipes[0];
  const notice = storageNotice(state);
  const body = state.panel === 'shelf' ? shelfContents(state)
    : state.panel === 'bag' ? bagContents(state)
      : `${recipeChoices(state)}${recipeDetails(recipe)}`;
  const cookLabel = state.readOnly ? '只读 · 暂不能下锅' : !recipe ? '暂无配方'
    : recipe.full ? '容量不足 · 查看说明' : recipe.available ? '下锅烹饪一份' : '材料不足 · 查看清单';
  const action = state.panel === 'recipes'
    ? '<button class="akitchen-button akitchen-button-primary" type="button" data-action="go-stove" data-focus="go-stove">选好这道 · 去灶台</button>'
    : state.panel === 'stove'
      ? `<button class="akitchen-button akitchen-button-primary" type="button" data-action="cook" data-focus="cook" data-blocked="${!recipe?.available || !!recipe?.full}" ${state.readOnly || !recipe ? 'disabled' : ''} aria-label="${h(cookLabel)}${recipe ? `：${h(recipe.name)}` : ''}">${h(cookLabel)}</button>` : '';
  return `<div class="akitchen-modal"><button class="akitchen-backdrop" type="button" data-action="close" aria-label="关闭互动面板" tabindex="-1"></button>
    <section class="akitchen-panel" role="dialog" aria-modal="true" aria-label="${h(name)}" tabindex="-1">
      <header class="akitchen-panel-header"><div><p>${state.panel === 'stove' ? '一锅一份，备齐再下锅' : '归途厨房'}</p><h2>${h(name)}</h2></div><button class="akitchen-button akitchen-close" type="button" data-action="close" data-focus="panel-close" aria-label="关闭${h(name)}"><span aria-hidden="true">×</span></button></header>
      <div class="akitchen-panel-body">${notice ? `<p class="akitchen-storage-notice">${h(notice)}</p>` : ''}${body}</div>
      <footer class="akitchen-panel-footer"><p class="akitchen-panel-feedback" data-tone="${state.tone}">${h(state.message)}</p>${action}${state.panel === 'stove' ? `<p class="akitchen-panel-rule">${state.readOnly ? '恢复可写存储后才能下锅。' : '每次明确下锅只做一份；材料不足或产出满仓不会扣料。'}</p>` : ''}<p class="akitchen-panel-key">Esc 收起面板</p></footer>
    </section></div>`;
}

/**
 * Insert into .akitchen-ui. The permanent stage/canvas and live announcer stay mounted.
 * Click delegation, modal focus and all actual actions remain owned by index.ts.
 */
export function renderKitchenHud(state: KitchenViewState): string {
  const selected = state.recipes.find(recipe => recipe.id === state.selectedId) ?? state.recipes[0];
  const totalSupplies = state.supplies.reduce((sum, supply) => sum + supply.count, 0);
  const notice = storageNotice(state);
  return `<div class="akitchen-hud" ${state.panel ? 'inert aria-hidden="true"' : ''}>
    <header class="akitchen-hud-header"><div class="akitchen-brand"><h1><span aria-hidden="true">♨</span>归途厨房</h1><p>${selected ? `${h(selected.name)} · ${h(selected.outputName)} ${selected.stock}/${selected.capacity}` : '翻开食谱，备一份暖意'}</p></div><div class="akitchen-corner"><button class="akitchen-button" type="button" data-action="exit" data-focus="exit">返回画廊</button><p class="akitchen-counts">鱼 ${state.fishCount}<span>补给 ${totalSupplies}</span>${state.sessionOnly ? '<strong>本页未保存</strong>' : ''}</p></div></header>
    <div class="akitchen-notices">${notice ? `<p class="akitchen-storage-notice">${h(notice)}</p>` : ''}<p class="akitchen-message" data-tone="${state.tone}">${h(state.message)}</p></div>
    ${state.near ? `<aside class="akitchen-near"><span>${h(state.near.name)}</span><button class="akitchen-button" type="button" data-action="interact" data-focus="interact" aria-label="与${h(state.near.name)}交互"><kbd>F</kbd> ${state.near.id === 'exit' ? '返回' : '交互'}</button></aside>` : ''}
    <footer class="akitchen-hud-footer"><p class="akitchen-controls"><kbd>WASD</kbd> 走动 · 点击物件靠近</p><nav class="akitchen-shortcuts" aria-label="厨房工作台快捷入口"><button type="button" class="akitchen-button" data-action="walk" data-target="recipes" data-focus="walk-recipes" aria-label="走到家常食谱">食谱</button><button type="button" class="akitchen-button" data-action="walk" data-target="stove" data-focus="walk-stove" aria-label="走到暖火灶台">灶台</button><button type="button" class="akitchen-button" data-action="walk" data-target="shelf" data-focus="walk-shelf" aria-label="走到食材架">食材</button><button type="button" class="akitchen-button" data-action="walk" data-target="bag" data-focus="walk-bag" aria-label="走到出征行囊">行囊</button></nav></footer>
  </div>${panel(state)}`;
}
