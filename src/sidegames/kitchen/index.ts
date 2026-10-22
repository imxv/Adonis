import { cookRecipe, createLifeActionId, FISH, FISH_IDS, getRecipeFailure, LIFE_LIMITS, loadProfile, RECIPES, RECIPE_IDS, subscribeProfile } from '../../meta/life';
import type { MetaFailure, MetaResult, ProfileState, RecipeId } from '../../meta/life';
import { META_LIMITS, packSupply, PLANTS, PLANT_IDS, SUPPLIES, SUPPLY_IDS } from '../../meta/profile';
import type { PlantId, SupplyId } from '../../meta/profile';
import { KITCHEN_STATIONS, KITCHEN_WORLD } from './pixel-contract';
import type { KitchenIngredientView, KitchenRecipeView, KitchenPanelId, KitchenTargetId, KitchenViewState } from './pixel-contract';
import { createKitchenWalker } from './pixel-controls';
import { createKitchenPixelRenderer } from './pixel-renderer';
import { renderKitchenHud } from './view';
import '../../ui/visualTheme.css';
import './kitchen.css';

export interface KitchenOptions { container: HTMLElement; onExit: () => void }
export interface KitchenHandle { dispose(): void }
type Tone = KitchenViewState['tone'];
const FAILURE_MESSAGES: Record<MetaFailure, string> = {
  invalid: '这次操作无法识别，请重新选择配方后再试。',
  capacity: '产出空间或料理记录已满；原料未扣除。请检查补给与返还种子的容量。',
  occupied: '这个位置暂时无法使用，请重新选择。',
  empty: '还没有这份成品，可以先备好材料烹饪。',
  'not-ready': '这次操作还没有准备好，请稍后重试。',
  insufficient: '材料还不齐，原料未扣除。请查看清单里的“还缺”，鱼可去钓，植物原料可去花园收获。',
  unavailable: '当前存储为只读，操作没有执行。请查看上方存储提示。',
};

function outputFor(id: RecipeId): SupplyId {
  // The authoritative catalog currently has exactly one existing supply per recipe.
  const output = SUPPLY_IDS.find(supply => (RECIPES[id].reward.supplies?.[supply] ?? 0) > 0);
  if (!output) throw new Error(`Recipe ${id} has no supply output`);
  return output;
}

function recipeView(state: ProfileState, id: RecipeId): KitchenRecipeView {
  const recipe = RECIPES[id];
  const profile = state.profile;
  const supplyId = outputFor(id);
  const supply = SUPPLIES[supplyId];
  const failure = getRecipeFailure(profile, id);
  const ingredients: KitchenIngredientView[] = [];
  for (const fishId of FISH_IDS) {
    const count = recipe.ingredients.fish?.[fishId];
    if (count) ingredients.push({ name: FISH[fishId].name, source: '来自钓鱼', required: count, current: profile.life.fish[fishId] });
  }
  for (const [plantId, count] of Object.entries(recipe.ingredients.produce ?? {})) {
    const plant = plantId as PlantId;
    ingredients.push({ name: `${PLANTS[plant].name}原料`, source: '来自花园收获', required: count, current: profile.produce[plant] });
  }
  if (recipe.ingredients.fragments) ingredients.push({ name: '修复碎片', source: '来自旅途与委托', required: recipe.ingredients.fragments, current: profile.fragments });
  return {
    id, name: recipe.name, description: `${recipe.description} ${supply.description}`,
    outputName: supply.name, outputCount: recipe.reward.supplies?.[supplyId] ?? 0,
    stock: profile.supplies[supplyId], capacity: META_LIMITS.supplies, ingredients,
    additionalRewards: Object.entries(recipe.reward.seeds ?? {}).map(([plantId, count]) => ({
      name: `${PLANTS[plantId as PlantId].name}种子`, count,
      current: profile.seeds[plantId as PlantId], capacity: META_LIMITS.seeds,
    })),
    available: failure === undefined, full: failure === 'capacity',
    status: failure === undefined ? '材料齐备 · 可以烹饪' : failure === 'capacity' ? '产出空间或记录已满' : failure === 'insufficient' ? '尚缺材料' : '暂时无法烹饪',
  };
}

/** A walkable pixel room. The caller owns the paused combat game and host. */
export function mountKitchen({container,onExit}:KitchenOptions):KitchenHandle {
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const root=document.createElement('section');root.className='ag-theme akitchen';root.setAttribute('aria-label','归途厨房');root.dataset.renderer='procedural-kitchen-v2';
  root.innerHTML='<div class="akitchen-stage"><canvas class="akitchen-canvas" tabindex="0" aria-label="可走动的像素厨房。WASD或方向键走动，点击物件自动走近，按F或Enter交互。"></canvas></div><div class="akitchen-ui"></div><p class="ag-sr-only" role="status" aria-live="polite" aria-atomic="true"></p>';
  container.append(root);
  const stage=root.querySelector<HTMLElement>('.akitchen-stage')!,canvas=root.querySelector<HTMLCanvasElement>('canvas')!,ui=root.querySelector<HTMLElement>('.akitchen-ui')!,announcer=root.querySelector<HTMLElement>('[role="status"]')!;
  const context=canvas.getContext('2d',{alpha:false});if(!context){root.remove();throw Error('当前浏览器无法绘制厨房。');}
  const ctx=context,renderer=createKitchenPixelRenderer(),walker=createKitchenWalker();
  const events=new AbortController(),signal=events.signal,keys=new Set<string>(),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let state=loadProfile(),selectedId:RecipeId=RECIPE_IDS[0],panel:KitchenPanelId|null=null,disposed=false,transacting=false;
  let message='走近灶台或菜谱台，备齐材料后明确下锅。',tone:Tone='info';
  let near:typeof KITCHEN_STATIONS[number]|null=null,hovered:KitchenTargetId|null=null,animation=0,lastTime=0,elapsed=0,visible=!document.hidden;
  let width=1,height=1,dpr=1,scale=1,camera={x:0,y:0};
  let pointerId:number|null=null,pointerStart:{x:number;y:number}|null=null;
  let celebration:{recipe:RecipeId;start:number}|null=null;
  let unsubscribe=()=>{};
  const readOnly=()=>state.storage==='busy'||state.storage==='unsupported';
  function viewState():KitchenViewState {
    return {recipes:RECIPE_IDS.map(id=>recipeView(state,id)),selectedId,panel,readOnly:readOnly(),warning:state.warning,sessionOnly:state.storage==='memory',message,tone,
      near:near?{id:near.id,name:near.name}:null,fishCount:FISH_IDS.reduce((sum,id)=>sum+state.profile.life.fish[id],0),packedSupply:state.profile.packedSupply,
      supplies:SUPPLY_IDS.map(id=>({id,name:SUPPLIES[id].name,description:SUPPLIES[id].description,count:state.profile.supplies[id],capacity:META_LIMITS.supplies})),
      inventory:[...FISH_IDS.map(id=>({name:FISH[id].name,source:'钓鱼',count:state.profile.life.fish[id],capacity:LIFE_LIMITS.fish})),
        ...PLANT_IDS.map(id=>({name:PLANTS[id].name+'原料',source:'花园收获',count:state.profile.produce[id],capacity:META_LIMITS.produce})),
        ...PLANT_IDS.map(id=>({name:PLANTS[id].name+'种子',source:'返种与收获',count:state.profile.seeds[id],capacity:META_LIMITS.seeds}))]};
  }
  const keyOf=(el:HTMLElement)=>[el.dataset.action,el.dataset.recipe,el.dataset.supply,el.dataset.target].join('|');
  function renderHud(focusPanel=false) {
    if(disposed)return;
    const active=document.activeElement instanceof HTMLElement&&ui.contains(document.activeElement)?keyOf(document.activeElement):null;
    ui.innerHTML=renderKitchenHud(viewState());stage.inert=!!panel;canvas.tabIndex=panel?-1:0;root.dataset.panel=panel??'';root.dataset.storage=state.storage;
    if(announcer.textContent!==message)announcer.textContent=message;
    const buttons=[...ui.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const prior=active?buttons.find(button=>keyOf(button)===active):null;
    if(focusPanel&&panel)(ui.querySelector<HTMLButtonElement>('[role="dialog"] [data-action="close"]')??ui.querySelector<HTMLButtonElement>('[role="dialog"] button:not(:disabled)'))?.focus({preventScroll:true});
    else prior?.focus({preventScroll:true});
  }
  function releasePointer(){if(pointerId!==null&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);pointerId=null;pointerStart=null;}
  function clearInput(){keys.clear();walker.clear();hovered=null;releasePointer();}
  function openTarget(id:KitchenTargetId){if(disposed)return;if(id==='exit'){exit();return;}clearInput();panel=id;renderHud(true);}
  function closePanel(){panel=null;clearInput();renderHud();canvas.focus({preventScroll:true});}
  function exit(){if(disposed)return;dispose();onExit();}
  function perform(action:()=>MetaResult,success:string|((result:MetaResult)=>string),after?:()=>void){
    if(disposed||transacting)return;
    transacting=true;
    try{const result=action();state=result;tone=result.applied?(result.storage==='memory'?'warning':'success'):result.duplicate?'info':'error';
      if(result.applied){const text=typeof success==='function'?success(result):success;message=result.storage==='memory'?text+' 当前仅在本页保留，关闭或重载后不会保存；不要重复操作。':text;after?.();}
      else if(result.duplicate)message='这次操作已经完成；库存没有再次扣除或增加。';
      else message=FAILURE_MESSAGES[result.reason??'invalid'];
      if(!result.applied&&result.reason==='capacity'&&state.profile.life.cooked.length>=LIFE_LIMITS.cooks)message=`料理记录已达 ${LIFE_LIMITS.cooks} 份上限；本次没有扣除原料。`;
    }catch{state=loadProfile();message='操作未能确认，请查看存储提示后再试；不会自动重试。';tone='error';}
    finally{transacting=false;}
    renderHud();if(!panel)canvas.focus({preventScroll:true});
  }
  function handleClick(event:MouseEvent){
    event.stopPropagation();
    const control=event.target instanceof Element?event.target.closest<HTMLElement>('[data-action]'):null;
    if(!control||!ui.contains(control)||control.matches(':disabled')||disposed)return;
    if(!(control instanceof HTMLButtonElement)&&control!==event.target)return;
    const action=control.dataset.action;
    if(action==='exit'){exit();return;}if(action==='close'){closePanel();return;}
    if(action==='walk'){const id=control.dataset.target;if(KITCHEN_STATIONS.some(s=>s.id===id)){if(panel)closePanel();clearInput();walker.walkToTarget(id as KitchenTargetId);canvas.focus({preventScroll:true});}return;}
    if(action==='interact'){if(near)openTarget(near.id);return;}
    if(action==='select'){const id=control.dataset.recipe;if(RECIPE_IDS.some(value=>value===id)){selectedId=id as RecipeId;tone='info';message='已选择'+RECIPES[selectedId].name+'，选配方不会消耗材料。';renderHud();}return;}
    if(action==='go-stove'){closePanel();walker.walkToTarget('stove');return;}
    if(action==='cook'){
      if(panel!=='stove')return;
      const id=selectedId,token=createLifeActionId(),recipe=RECIPES[id],supply=outputFor(id);
      const reward=[...SUPPLY_IDS.flatMap(key=>recipe.reward.supplies?.[key]?[`${SUPPLIES[key].name} ×${recipe.reward.supplies[key]}`]:[]),...Object.entries(recipe.reward.seeds??{}).map(([key,count])=>`${PLANTS[key as PlantId].name}种子 ×${count}`)].join('、');
      perform(()=>cookRecipe(id,token),result=>`${recipe.name}出锅，获得${reward}。${SUPPLIES[supply].name}现有 ${result.profile.supplies[supply]} / ${META_LIMITS.supplies}。`,()=>{celebration={recipe:id,start:elapsed};panel=null;clearInput();});
    }else if(action==='pack'){
      const id=control.dataset.supply;if(panel!=='bag'||!SUPPLY_IDS.some(key=>key===id))return;
      const supply=id as SupplyId;perform(()=>packSupply(supply),SUPPLIES[supply].name+'已装入单份行囊；确认新冒险时才消耗一份。');
    }else if(action==='unpack'&&panel==='bag')perform(()=>packSupply(null),'补给已移出行囊，成品库存没有减少。');
  }
  root.addEventListener('click',handleClick,{signal});
  window.addEventListener('keydown',event=>{
    if(disposed||!visible||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat){if(panel)closePanel();else exit();}return;}
    if(event.repeat&&(event.key==='Enter'||event.key===' '||event.key.toLowerCase()==='f')){event.preventDefault();event.stopPropagation();return;}
    if(event.key==='Tab'){
      const scope=panel?ui.querySelector('[role="dialog"]')??ui:ui;
      const controls=[...scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(b=>b.getClientRects().length>0);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||!scope.contains(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!scope.contains(document.activeElement))){event.preventDefault();first?.focus();}
    }
    if(!panel){const key=event.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){event.preventDefault();keys.add(key);}
      else if(key==='f'||key==='enter'&&!(event.target instanceof Element&&event.target.closest('button'))){event.preventDefault();if(near)openTarget(near.id);}}
    event.stopPropagation();
  },{capture:true,signal});
  window.addEventListener('keyup',event=>{keys.delete(event.key.toLowerCase());if(!disposed&&!event.ctrlKey&&!event.metaKey&&!event.altKey)event.stopPropagation();},{capture:true,signal});
  window.addEventListener('blur',clearInput,{signal});
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;clearInput();if(visible)start();else stop();},{signal});
  function worldPoint(event:PointerEvent){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)/scale+camera.x,y:(event.clientY-rect.top)/scale+camera.y};}
  function hit(point:{x:number;y:number}){return KITCHEN_STATIONS.find(s=>point.x>=s.x&&point.x<=s.x+s.width&&point.y>=s.y&&point.y<=s.y+s.height)??null;}
  canvas.addEventListener('pointerdown',event=>{if(disposed||panel||!visible||event.button!==0)return;event.preventDefault();event.stopPropagation();canvas.focus({preventScroll:true});pointerId=event.pointerId;pointerStart=worldPoint(event);canvas.setPointerCapture(pointerId);const station=hit(pointerStart);keys.clear();if(station)walker.walkToTarget(station.id);else walker.walkTo(pointerStart);},{signal});
  canvas.addEventListener('pointermove',event=>{if(disposed||panel||!visible)return;const point=worldPoint(event);if(pointerId===event.pointerId&&pointerStart&&Math.hypot(point.x-pointerStart.x,point.y-pointerStart.y)>12){walker.walkTo(point);keys.clear();}hovered=event.pointerType==='mouse'?hit(point)?.id??null:null;canvas.style.cursor=hovered?'pointer':'crosshair';},{signal});
  canvas.addEventListener('pointerup',event=>{if(event.pointerId===pointerId)releasePointer();},{signal});
  canvas.addEventListener('pointercancel',()=>clearInput(),{signal});canvas.addEventListener('pointerleave',()=>{hovered=null;},{signal});
  function moveCamera(immediate=false){const vw=width/scale,vh=height/scale;const desired={x:vw>=KITCHEN_WORLD.width?(KITCHEN_WORLD.width-vw)/2:Math.max(0,Math.min(KITCHEN_WORLD.width-vw,walker.player.x-vw/2)),y:vh>=KITCHEN_WORLD.height?(KITCHEN_WORLD.height-vh)/2:Math.max(0,Math.min(KITCHEN_WORLD.height-vh,walker.player.y-vh*.74))};const ease=immediate||motion.matches?1:.16;camera.x+=(desired.x-camera.x)*ease;camera.y+=(desired.y-camera.y)*ease;}
  function draw(){if(disposed)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#172e32';ctx.fillRect(0,0,width,height);ctx.save();ctx.scale(scale,scale);ctx.translate(-camera.x,-camera.y);renderer.draw(ctx,{player:walker.player,target:hovered??walker.pending??near?.id??null,destination:walker.destination,selectedRecipe:selectedId,packedSupply:state.profile.packedSupply,celebration:celebration&&elapsed-celebration.start<2.4?{recipe:celebration.recipe,elapsed:elapsed-celebration.start}:null,elapsed,reducedMotion:motion.matches});ctx.restore();}
  function resize(){if(disposed)return;const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);scale=Math.max(width/KITCHEN_WORLD.width,height/KITCHEN_WORLD.height,.7);moveCamera(true);draw();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  function updateNear(){const next=KITCHEN_STATIONS.reduce<typeof near>((best,s)=>Math.hypot(walker.player.x-s.approach.x,walker.player.y-s.approach.y)<72&&(!best||Math.hypot(walker.player.x-s.approach.x,walker.player.y-s.approach.y)<Math.hypot(walker.player.x-best.approach.x,walker.player.y-best.approach.y))?s:best,null);if(next?.id!==near?.id){near=next;renderHud();}}
  function step(now:number){animation=0;if(disposed||!visible)return;const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;elapsed+=dt;if(!panel){const arrived=walker.tick(dt,keys);updateNear();if(arrived)openTarget(arrived);}moveCamera();draw();if(!disposed&&visible)animation=requestAnimationFrame(step);}
  function start(){if(!disposed&&visible&&!animation){lastTime=0;animation=requestAnimationFrame(step);}}
  function stop(){if(animation)cancelAnimationFrame(animation);animation=0;lastTime=0;}
  function dispose(){if(disposed)return;disposed=true;clearInput();stop();events.abort();observer.disconnect();unsubscribe();renderer.dispose();root.remove();canvas.width=canvas.height=1;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  unsubscribe=subscribeProfile(()=>{if(!disposed&&!transacting){state=loadProfile();renderHud();}});
  updateNear();renderHud();resize();canvas.focus({preventScroll:true});start();return{dispose};
}
