import * as THREE from 'three';
import type { GreekWorldQuality } from '../types';
import type { ArchitecturePlacement, ReferenceCollider, ReferenceLayer, ReferenceLayerOptions, ReferenceVec3 } from './contracts';
import { loadArchitectureMaterials, type ArchitectureMaterials } from './architecture-materials';
import { buildReferenceTemple, buildReferenceIonicColumn } from './architecture-temple';
import { buildReferenceBridge } from './architecture-bridge';
import { templeProportions } from './architecture-proportions';
import { buildAuthoritativeStairFlight, buildAuthoritativeStairLanding, referenceStairSpecification } from './architecture-stairs-layout';
import { buildAuthoritativeSpringShrine } from './architecture-spring-layout';

function releaseGeometry(root: THREE.Group): void {
  const all=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)all.add(o.geometry);});all.forEach(g=>g.dispose());root.clear();
}

function worldPoint(p: ArchitecturePlacement, local: ReferenceVec3): ReferenceVec3 {
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return [p.position[0]+local[0]*c+local[2]*s,p.position[1]+local[1],p.position[2]-local[0]*s+local[2]*c];
}

/** Reference assets: temple, bridge, column, r5 stairs and the compact high spring source.
 * Unimplemented placement kinds are reported in root.userData, never replaced with placeholders.
 * No scene, lights, input, storage or animation loop is created by this layer.
 */
export async function createReferenceArchitecture(options: ReferenceLayerOptions): Promise<ReferenceLayer> {
  const root=new THREE.Group();root.name='reference-architecture-v3';
  const anchors:Record<string,ReferenceVec3>={};let colliders:ReferenceCollider[]=[];
  let current:{root:THREE.Group;materials:ArchitectureMaterials}|undefined;
  let controller:AbortController|undefined,disposed=false,generation=0,requested:GreekWorldQuality|undefined=options.quality;
  let pending:Promise<void>=Promise.resolve();
  const check=()=>{if(disposed||options.signal.aborted)throw options.signal.reason??new DOMException('Architecture cancelled','AbortError');};
  const releaseCurrent=()=>{if(!current)return;current.root.removeFromParent();releaseGeometry(current.root);current.materials.dispose();current=undefined;};
  const rebuild=async(quality:GreekWorldQuality)=>{
    const ticket=++generation;controller?.abort();controller=new AbortController();check();
    const assetQuality=quality==='high'?'high':'low';let materials:ArchitectureMaterials|undefined;const candidate=new THREE.Group();
    const nextColliders:ReferenceCollider[]=[];const nextAnchors:Record<string,ReferenceVec3>={};const unsupported:string[]=[];
    try{
      const baseUrl=import.meta.env.DEV?new URL('/world3d/reference/architecture/',location.origin).href:undefined;
      materials=await loadArchitectureMaterials({quality:assetQuality,signal:controller.signal,baseUrl});check();
      for(const material of Object.values(materials))if(material instanceof THREE.MeshStandardMaterial){material.envMap=options.lighting.environment;material.needsUpdate=true;}
      for(const p of options.layout.architecture){
        let model:THREE.Group;
        if(p.kind==='temple'){
          model=buildReferenceTemple({size:p.size,quality:assetQuality,materials,variant:p.variant});
          const {columnDiameter,columnX:colX,frontZ:front,frontColumns,sideRows,wallX,wallFront,wallBack,wallHeight:wallH,wallThickness,doorHalfWidth:door}=templeProportions(p.size);
          for(let i=0;i<frontColumns;i++)for(const z of [front,-front]){const point=worldPoint(p,[-colX+2*colX*i/(frontColumns-1),0,z]);nextColliders.push({id:`${p.id}.column.${i}.${z>0?'front':'rear'}`,kind:'circle',x:point[0],z:point[2],radius:columnDiameter*.75});}
          for(let i=1;i<sideRows-1;i++)for(const x of [-colX,colX]){const point=worldPoint(p,[x,0,front-2*front*i/(sideRows-1)]);nextColliders.push({id:`${p.id}.column.side.${i}.${x>0?'east':'west'}`,kind:'circle',x:point[0],z:point[2],radius:columnDiameter*.75});}
          for(const side of [-1,1])nextColliders.push({id:`${p.id}.wall.side.${side}`,kind:'box',position:worldPoint(p,[side*wallX,wallH/2,(wallBack+wallFront)/2]),size:[wallThickness,wallH,wallFront-wallBack],yaw:p.yaw});
          nextColliders.push({id:`${p.id}.wall.back`,kind:'box',position:worldPoint(p,[0,wallH/2,wallBack]),size:[wallX*2,wallH,wallThickness],yaw:p.yaw});
          const sideW=wallX-door;
          for(const side of [-1,1])nextColliders.push({id:`${p.id}.wall.front.${side}`,kind:'box',position:worldPoint(p,[side*(door+sideW/2),wallH/2,wallFront]),size:[sideW,wallH,wallThickness],yaw:p.yaw});
          const depth=p.size[2];
          nextAnchors[`${p.id}.threshold`]=worldPoint(p,[0,0,depth/2]);nextAnchors[`${p.id}.interior`]=worldPoint(p,[0,0,0]);
        }else if(p.kind==='bridge'){
          model=buildReferenceBridge({quality:assetQuality,stone:materials.bridgeStone,mortar:materials.mortar,capstone:materials.bridgeStone});model.position.y=-2;
          const wrapper=new THREE.Group();wrapper.userData={...model.userData,deckOriginY:0,bridgeLocalYOffset:-2};wrapper.add(model);model=wrapper;
          nextAnchors[`${p.id}.deck`]=p.position;nextAnchors[`${p.id}.west`]=worldPoint(p,[-3.6,-.4,0]);nextAnchors[`${p.id}.east`]=worldPoint(p,[3.6,-.4,0]);
        }else if(p.kind==='spring-shrine'){
          const authored=buildAuthoritativeSpringShrine(p,options.layout,materials,assetQuality);
          if(!authored){unsupported.push(`${p.id}:${p.kind}`);continue;}
          authored.root.name=p.id;candidate.add(authored.root);
          nextAnchors[`${p.id}.spout`]=authored.worldSpout;
          continue; // The assembly frame is already applied; never apply placement a second time.
        }else if(p.kind==='stairs'){
          const authored=buildAuthoritativeStairFlight(p,materials,assetQuality),spec=referenceStairSpecification(p);
          if(!authored||!spec){unsupported.push(`${p.id}:${p.kind}`);continue;}
          model=authored;
          nextAnchors[`${p.id}.first-tread`]=worldPoint(p,[0,spec.treadTopY[0]+spec.surfaceOffset,0]);
          nextAnchors[`${p.id}.last-tread`]=worldPoint(p,[0,spec.treadTopY[spec.treadTopY.length-1]+spec.surfaceOffset,-p.size[2]]);
          nextAnchors[`${p.id}.design-end`]=spec.flight.end;
        }else if(p.kind==='ionic-column'){
          const diameter=Math.min(p.size[0],p.size[2])/1.65;model=buildReferenceIonicColumn(materials,p.size[1],diameter,assetQuality);
          nextColliders.push({id:p.id,kind:'circle',x:p.position[0],z:p.position[2],radius:diameter*.6});
        }else{unsupported.push(`${p.id}:${p.kind}`);continue;}
        model.name=p.id;model.position.add(new THREE.Vector3(...p.position));model.rotation.y=p.yaw;candidate.add(model);
      }
      const stairLanding=buildAuthoritativeStairLanding(options.layout,materials,assetQuality);
      if(stairLanding)candidate.add(stairLanding);
      check();if(ticket!==generation){releaseGeometry(candidate);materials.dispose();return;}
      releaseCurrent();current={root:candidate,materials};root.add(candidate);colliders=nextColliders;
      for(const key of Object.keys(anchors))delete anchors[key];Object.assign(anchors,nextAnchors);
      root.userData={quality,assetQuality,supportedKinds:['temple','bridge','ionic-column','stairs','spring-shrine'],authoredStairIds:options.layout.architecture.filter(p=>p.kind==='stairs'&&referenceStairSpecification(p)).map(p=>p.id),authoredLanding:stairLanding?.name??null,unimplementedPlacements:unsupported,reference:'world3d-v3/02',stage:'asset-proof-not-visual-acceptance'};
    }catch(error){releaseGeometry(candidate);materials?.dispose();if(ticket===generation)requested=undefined;throw error;}
  };
  const dispose=()=>{if(disposed)return;disposed=true;generation++;controller?.abort();releaseCurrent();root.clear();colliders=[];options.signal.removeEventListener('abort',dispose);};
  options.signal.addEventListener('abort',dispose,{once:true});
  const handle:ReferenceLayer={root,anchors,get colliders(){return colliders;},setQuality(quality){if(disposed||quality===requested)return;requested=quality;pending=rebuild(quality);void pending.catch(()=>undefined);},update(){},whenReady(){return pending;},dispose};
  try{pending=rebuild(options.quality);await pending;return handle;}catch(error){dispose();throw error;}
}
