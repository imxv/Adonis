import * as THREE from 'three';
import { createNatureMaterials, type NatureMaterials } from './nature-materials';
import { createAncientOlive } from './nature-trees';
import { createLimestoneBoulder, createLimestoneFormation, createScannedLimestoneFormation } from './nature-rocks';
import { CASCADE_REFERENCE_ENVELOPE, referenceCascadeScale } from './nature-cascade';
import { createReferenceLandforms } from './nature-landforms';
import { REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION } from './grove-bank-patch';
import type { NatureLandformContacts } from './nature-landform-types';
import type { NaturePlacement, ReferenceCollider, ReferenceLayer, ReferenceLayerOptions, ReferenceVec3, ReferenceGroveBankPatch } from './contracts';
import type { GreekWorldQuality } from '../types';

interface OwnedSet {
  group: THREE.Group;
  materials: NatureMaterials;
  geometries: Set<THREE.BufferGeometry>;
  instances: Set<THREE.InstancedMesh>;
  anchors: Record<string, ReferenceVec3>;
  colliders: ReferenceCollider[];
  disposed: boolean;
  landformRegistration?: Record<string, unknown>;
}
interface BuildScope { controller: AbortController; materials: NatureMaterials }
function destroy(set: OwnedSet | null) {
  if(!set||set.disposed)return;
  set.disposed=true;
  set.group.removeFromParent();
  set.instances.forEach(mesh=>mesh.dispose());
  set.geometries.forEach(geometry=>geometry.dispose());
  set.materials.dispose();set.group.clear();set.instances.clear();set.geometries.clear();
}
function own(set:OwnedSet,model:THREE.Group) {
  // A cancelled loader may still deliver. Adopt its resources before examining
  // the generation, and immediately release them if their owner already closed.
  const target=set.disposed?{geometries:new Set<THREE.BufferGeometry>(),instances:new Set<THREE.InstancedMesh>()}:set;
  model.traverse(object=>{if(object instanceof THREE.Mesh){target.geometries.add(object.geometry);if(object instanceof THREE.InstancedMesh)target.instances.add(object);}});
  if(set.disposed){
    target.instances.forEach(mesh=>mesh.dispose());target.geometries.forEach(geometry=>geometry.dispose());
    model.removeFromParent();model.clear();return false;
  }
  return true;
}
const cancelled=()=>new DOMException('Natural assets cancelled','AbortError');

export interface ReferenceNatureOptions extends ReferenceLayerOptions {
  /** D opts in with its authoritative contacts; shares this rebuild's PBR owner. */
  readonly landforms?: NatureLandformContacts;
  /** One D-owned top-level optional patch; never copied into contact authority. */
  readonly groveBankPatch?: ReferenceGroveBankPatch;
}

/** Reference factory. Returns detached world-space assets; owns no lights, RAF or input. */
export async function createReferenceNature(options: ReferenceNatureOptions): Promise<ReferenceLayer> {
  if(options.signal.aborted)throw cancelled();
  const root=new THREE.Group();root.name='reference/nature';
  const colliders:ReferenceCollider[]=[];
  const anchors:Record<string,ReferenceVec3>={};
  let disposed=false,generation=0,current:OwnedSet|null=null;
  let quality=options.quality;
  let requestedQuality:GreekWorldQuality|null=null;
  let pending:Promise<void>=Promise.resolve();
  const inFlight=new Set<BuildScope>();
  function cancelBuilds(){inFlight.forEach(scope=>{scope.controller.abort();scope.materials.dispose();});}
  async function readyOrCancel<T>(ready:Promise<T>,signal:AbortSignal):Promise<T> {
    if(signal.aborted){void ready.catch(()=>undefined);throw cancelled();}
    let rejectCancel!:()=>void;
    const stopped=new Promise<never>((_resolve,reject)=>{rejectCancel=()=>reject(cancelled());});
    signal.addEventListener('abort',rejectCancel,{once:true});
    try{return await Promise.race([ready,stopped]);}finally{signal.removeEventListener('abort',rejectCancel);}
  }

  function position(model:THREE.Group,placement:NaturePlacement,cascade=false) {
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
    // An envelope is a composition target. Keep the authored proportions intact.
    const envelope=cascade?CASCADE_REFERENCE_ENVELOPE:size.toArray();
    const scale=cascade?referenceCascadeScale(placement.size):Math.min(...placement.size.map((value,i)=>value/envelope[i]));
    model.scale.setScalar(scale);model.rotation.y=placement.yaw;model.position.fromArray([...placement.position]);
    model.name=placement.id;
    model.userData.placement={id:placement.id,targetEnvelope:[...placement.size],referenceEnvelope:[...envelope],uniformScale:scale,actualEnvelope:[size.x*scale,size.y*scale,size.z*scale],note:'Uniform fit; no finished mesh is stretched to a box. Cascade uses one reference envelope across both LODs.'};
    // Wood/rock tiles retain metre density after permissible uniform object scaling.
    model.traverse(object=>{
      if(!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh)return;
      for(const name of ['uv','uv1']) {const uv=object.geometry.getAttribute(name);if(uv){for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*scale,uv.getY(i)*scale);uv.needsUpdate=true;}}
    });
  }

  function cascadeRegistration(set:OwnedSet) {
    const model=set.group.getObjectByName('cliff.cascade');
    if(!model)return null;
    const asset=model.userData.natureAsset;
    const scale=model.scale.x;
    const modelTiers=['upper','lower'].map(name=>({
      top:set.anchors[`cliff.cascade.${name}.start`],bottom:set.anchors[`cliff.cascade.${name}.end`],width:asset.waterAnchors[name].width*scale,
    }));
    const modelLedge=[0,1,2].map(i=>set.anchors[`cliff.cascade.ledge.${i}`]);
    const modelLedgeWidth=asset.waterAnchors.upper.width*scale;
    const layoutFall=options.layout.water.find(w=>w.id==='water.cascade');
    const layoutLedge=options.layout.water.find(w=>w.id==='water.cascade-ledge');
    const samePoint=(a:ReferenceVec3|undefined,b:ReferenceVec3|undefined)=>Boolean(a&&b&&a.every((value,i)=>Math.abs(value-b[i])<1e-4));
    const tiersMatch=layoutFall?.kind==='waterfall'&&layoutFall.tiers.length===2&&modelTiers.every((tier,i)=>samePoint(tier.top,layoutFall.tiers[i].top)&&samePoint(tier.bottom,layoutFall.tiers[i].bottom)&&Math.abs(tier.width-layoutFall.tiers[i].width)<1e-4);
    const ledgeMatches=layoutLedge?.kind==='stream'&&layoutLedge.points.length===3&&Math.abs(layoutLedge.width-modelLedgeWidth)<1e-4&&modelLedge.every((point,i)=>samePoint(point,layoutLedge.points[i]));
    return {factoryRevision:'cascade-async-1',referenceEnvelope:[...CASCADE_REFERENCE_ENVELOPE],uniformScale:scale,modelTiers,modelLedge,modelLedgeWidth,
      layoutWaterMatches:Boolean(tiersMatch&&ledgeMatches),layoutVersion:options.layout.version,
      scope:'Compares committed model attachments to the supplied layout only; terrain, water rendering and reachable side clearance require world inspection.'};
  }

  async function addPlacement(set:OwnedSet,p:NaturePlacement,next:GreekWorldQuality,ticket:number,signal:AbortSignal) {
    let model:THREE.Group;
    const modelQuality=next==='low' || p.id.includes('distant') || p.id.includes('back-ridge')?'low':'high';
    if(p.kind==='olive-hero'||p.kind==='olive') {
      model=createAncientOlive({quality:modelQuality,variant:p.variant,seed:7331+p.variant*197,materials:set.materials});
      position(model,p);own(set,model);set.group.add(model);
      set.colliders.push({id:p.id,kind:'circle',x:p.position[0],z:p.position[2],radius:Math.max(.5,1.12*model.scale.x)});
      return;
    }
    if(p.kind==='cliff') {
      const scanned=p.id==='cliff.cascade';
      if(scanned){
        const adopted=createScannedLimestoneFormation({quality:modelQuality,materials:set.materials,signal}).then(loaded=>{
          if(!own(set,loaded))throw cancelled();
          set.group.add(loaded);
          if(disposed||signal.aborted||ticket!==generation)throw cancelled();
          return loaded;
        });
        model=await readyOrCancel(adopted,signal);
      }else{
        model=createLimestoneFormation({quality:modelQuality,seed:381+p.variant*137,materials:set.materials});
        own(set,model);set.group.add(model);
      }
      position(model,p,scanned);
      const water=model.userData.natureAsset?.waterAnchors;
      model.updateMatrixWorld(true);
      if(water)for(const [name,points] of Object.entries(water as Record<string,{start:ReferenceVec3;end:ReferenceVec3}>))for(const end of ['start','end'] as const){const v=new THREE.Vector3(...points[end]).applyMatrix4(model.matrixWorld);set.anchors[`${p.id}.${name}.${end}`]=v.toArray();}
      const ledge=model.userData.natureAsset?.ledgeFlow as ReferenceVec3[]|undefined;
      ledge?.forEach((point,i)=>{set.anchors[`${p.id}.ledge.${i}`]=new THREE.Vector3(...point).applyMatrix4(model.matrixWorld).toArray();});
      // Do not invent a solid box collider across D's walk routes and water slots.
      return;
    }
    if(p.kind==='rock-cluster') {
      model=new THREE.Group();model.name=p.id;
      const layouts=[[-.32,.04,-.2,1.45,.4],[.18,0,.24,1.15,-.65],[.38,.02,-.25,.78,.9],[-.02,.03,-.38,.9,-.2],[-.4,0,.35,.67,1.3]];
      layouts.forEach(([x,y,z,s,yaw],i)=>{
        const boulder=createLimestoneBoulder({quality:modelQuality,seed:137+p.variant*83+i*41,materials:set.materials,scale:s});
        boulder.position.set(x*p.size[0],y,z*p.size[2]);boulder.rotation.y=yaw+p.variant*.19;model.add(boulder);
      });
      position(model,p);own(set,model);set.group.add(model);
    }
  }

  async function rebuild(next:GreekWorldQuality) {
    const ticket=++generation;requestedQuality=next;
    cancelBuilds();
    const controller=new AbortController();
    const materials=createNatureMaterials(next==='low'?'low':'high');
    const scope={controller,materials};inFlight.add(scope);
    const set:OwnedSet={group:new THREE.Group(),materials,geometries:new Set(),instances:new Set(),anchors:{},colliders:[],disposed:false};
    try {
      await readyOrCancel(materials.ready,controller.signal);
      if(disposed||controller.signal.aborted||ticket!==generation)throw cancelled();
      // Lighting/environment is borrowed. Material disposal never owns this texture.
      if(options.lighting.environment)for(const material of [materials.bark,materials.barkDark,materials.limestone,materials.wetLimestone,materials.moss,materials.foliage]){material.envMap=options.lighting.environment;material.envMapIntensity=.55;}
      for(const p of options.layout.nature) {
        if(disposed||controller.signal.aborted||ticket!==generation)throw cancelled();
        await addPlacement(set,p,next,ticket,controller.signal);
        // Give exit/quality input a task boundary between expensive authored assets.
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      if(disposed||controller.signal.aborted||ticket!==generation)throw cancelled();
      if(options.landforms){
        const asset=createReferenceLandforms({quality:next==='low'?'low':'high',materials,terrainHeight:options.terrainHeight,signal:controller.signal,contacts:options.landforms,groveBankPatch:options.groveBankPatch});
        if(!own(set,asset.root))throw cancelled();
        set.group.add(asset.root);set.landformRegistration=asset.root.userData.landforms;
        if(disposed||controller.signal.aborted||ticket!==generation)throw cancelled();
      }
      const registration=cascadeRegistration(set);
      const old=current;current=set;root.add(set.group);destroy(old);
      Object.keys(anchors).forEach(key=>delete anchors[key]);Object.assign(anchors,set.anchors);
      colliders.splice(0,colliders.length,...set.colliders);
      root.userData.cascadeRegistration=registration;
      root.userData.landformRegistration=set.landformRegistration??null;
      quality=next;requestedQuality=null;delete root.userData.loadError;
      root.userData.quality=next;root.userData.pendingKinds=[...new Set(options.layout.nature.filter(p=>p.kind==='cypress'||p.kind==='ground-cover').map(p=>p.kind))];
      root.userData.scope='Hero olives, one scanned cliff.cascade, original other cliffs and shore boulders. Cypress/ground-cover remain pending.'+(options.landforms?' Includes supplied D visible landforms sharing this rebuild material owner.':'');
      root.userData.compositionWarning='Authored sample envelopes are uniformly fitted, not stretched. Full-cliff height/depth and world waterfall alignment require layout-owner composition review.';
    } catch(error) {controller.abort();if(ticket===generation)requestedQuality=null;destroy(set);throw error;} finally {inFlight.delete(scope);}
  }
  const dispose=()=>{if(disposed)return;disposed=true;generation++;options.signal.removeEventListener('abort',dispose);cancelBuilds();destroy(current);current=null;root.removeFromParent();root.clear();colliders.length=0;Object.keys(anchors).forEach(key=>delete anchors[key]);};
  options.signal.addEventListener('abort',dispose,{once:true});
  try {pending=rebuild(quality);await pending;}catch(error){dispose();throw error;}
  return {
    root,colliders,anchors,
    setQuality(next){if(disposed||next===requestedQuality)return;if(next===quality&&requestedQuality===null){pending=Promise.resolve();delete root.userData.loadError;return;}pending=rebuild(next);void pending.catch(error=>{if(!disposed && !(error instanceof DOMException && error.name==='AbortError'))root.userData.loadError=String(error);});},
    update(_time,position){if(disposed||!current)return;for(const model of current.group.children){const distance=model.position.distanceTo(position);model.visible=distance<(quality==='low'?165:240);}},
    whenReady(){return pending;},dispose,
  };
}

createReferenceNature.groveBankPatchContractRevision = REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION;

// Independent r5 visible rock assets. D opts in with its authoritative contacts;
// existing placements, frozen cascade and tree generation remain unchanged.
export { createReferenceLandforms };
export type { ReferenceLandformOptions, ReferenceLandformAsset } from './nature-landforms';
export type { NatureLandformContacts, LandformSpringBranch } from './nature-landform-types';
