import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createNatureMaterials } from './nature-materials';
import { createAncientOlive } from './nature-trees';
import { createScannedLimestoneFormation } from './nature-rocks';

if (!import.meta.env.DEV) throw new Error('Asset preview is development only');
type Quality='low'|'high';
type View=keyof typeof VIEWS;
const VIEWS={
  'tree-front':{p:[13,7,21],t:[0,4.3,0],asset:'tree',fov:44},
  'tree-close':{p:[3.1,2.1,5.2],t:[-.35,2.65,.1],asset:'tree',fov:46},
  'tree-root':{p:[4.8,1.9,6.8],t:[0,.75,0],asset:'tree',fov:48},
  'tree-side':{p:[-15,7,-14],t:[0,4.4,0],asset:'tree',fov:48},
  'tree-far':{p:[26,9.8,43],t:[0,4.3,0],asset:'tree',fov:46},
  'rock-front':{p:[13,8.7,23],t:[0,4,0],asset:'rock',fov:45},
  'rock-close':{p:[-4.8,3.6,8.1],t:[-2.2,3.9,1.1],asset:'rock',fov:48},
  'rock-side':{p:[-15,8,-12],t:[0,4,0],asset:'rock',fov:48},
  'rock-far':{p:[26,11,43],t:[0,4,0],asset:'rock',fov:46},
} as const;
const scene=new THREE.Scene();scene.background=new THREE.Color('#9ab2bf');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.08,180);
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();const environment=pmrem.fromScene(room,.06);room.dispose();scene.environment=environment.texture;scene.environmentIntensity=.38;
const hemi=new THREE.HemisphereLight('#c9dfed','#514c3b',.85);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff1d6',3.2);sun.position.set(-18,24,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.camera.near=1;sun.shadow.camera.far=70;sun.shadow.bias=-.00024;sun.shadow.normalBias=.025;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#a1987a',roughness:.96}));ground.rotation.x=-Math.PI/2;ground.position.y=-.13;ground.receiveShadow=true;scene.add(ground);
const status=document.getElementById('status')!;
const parameters=new URLSearchParams(location.search);
let quality:Quality=parameters.get('quality')==='low'?'low':'high';
const variant=Number(parameters.get('variant'))||0;
let view:View=(parameters.get('view') as View) in VIEWS ? parameters.get('view') as View:'tree-front';
let current:{tree:THREE.Group;rock:THREE.Group;materials:ReturnType<typeof createNatureMaterials>}|null=null;
let generation=0,disposed=false,building=false;
let buildController:AbortController|null=null;
let modelStats={triangles:0,draws:0};
if(parameters.has('clean'))document.body.classList.add('clean');
function disposeModel(){if(!current)return;const geometries=new Set<THREE.BufferGeometry>();current.tree.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);if(o instanceof THREE.InstancedMesh)o.dispose();}});current.rock.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});current.tree.removeFromParent();current.rock.removeFromParent();geometries.forEach(g=>g.dispose());current.materials.dispose();current=null;}
function draw(){if(disposed)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.info.reset();renderer.render(scene,camera);modelStats={triangles:renderer.info.render.triangles,draws:renderer.info.render.calls};
  const direction=camera.getWorldDirection(new THREE.Vector3());
  status.textContent=JSON.stringify({kind:'actual-WebGL-model',view,quality,camera:camera.position.toArray(),target:VIEWS[view].t,yaw:Math.atan2(-direction.x,-direction.z),pitch:Math.asin(direction.y),eyeHeight:camera.position.y,fov:camera.fov,frame:[renderer.domElement.width,renderer.domElement.height],exposure:1.08,toneMapping:'ACESFilmic',sun:[-18,24,15],sunColor:'#fff1d6',hemiIntensity:.85,environmentIntensity:.38,wholeRenderIncludingShadow:modelStats,gpuObjects:{...renderer.info.memory},models:current?{tree:current.tree.userData,rock:current.rock.userData}:null},null,1);
  document.body.dataset.ready=String(Boolean(current)&&!building);document.body.dataset.view=view;
}
function applyView(){const v=VIEWS[view];camera.position.fromArray([...v.p]);camera.fov=v.fov;camera.lookAt(new THREE.Vector3(...v.t));if(current){current.tree.visible=v.asset==='tree';current.rock.visible=v.asset==='rock';}draw();}
async function build(){
  const ticket=++generation;buildController?.abort();const controller=new AbortController();buildController=controller;
  building=true;document.body.dataset.ready='false';status.textContent='正在加载实际 PBR 与扫描岩壁网格';
  const materials=createNatureMaterials(quality);
  let rejectAborted:(reason:DOMException)=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAborted=reject;});
  const cancelPending=()=>{materials.dispose();rejectAborted(new DOMException('Preview build cancelled','AbortError'));};
  controller.signal.addEventListener('abort',cancelPending,{once:true});
  let rock:THREE.Group|null=null;
  try{
    await Promise.race([materials.ready,aborted]);
    if(disposed||ticket!==generation){materials.dispose();return;}
    rock=await createScannedLimestoneFormation({quality,materials,signal:controller.signal});
    if(disposed||ticket!==generation){rock.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.dispose();return;}
    const tree=createAncientOlive({quality,variant,materials});
    controller.signal.removeEventListener('abort',cancelPending);
    disposeModel();current={tree,rock,materials};scene.add(tree,rock);building=false;renderer.shadowMap.enabled=quality==='high';(ground.material as THREE.Material).needsUpdate=true;applyView();
  }catch(error){
    rock?.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.dispose();
    if(ticket===generation&&!disposed){building=false;status.textContent=`材质/模型加载失败：${String(error)}`;document.body.dataset.ready='false';}
  }finally{
    controller.signal.removeEventListener('abort',cancelPending);
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>{view=button.dataset.view as View;applyView();});
const select=document.getElementById('quality') as HTMLSelectElement;select.value=quality;select.onchange=()=>{quality=select.value as Quality;void build();};
document.getElementById('clean')!.onclick=()=>document.body.classList.add('clean');
const restore=(event:KeyboardEvent)=>{if(event.key==='Escape')document.body.classList.remove('clean');};window.addEventListener('keydown',restore);
window.addEventListener('resize',draw);
const dispose=()=>{if(disposed)return;disposed=true;generation++;buildController?.abort();disposeModel();window.removeEventListener('resize',draw);window.removeEventListener('keydown',restore);environment.dispose();pmrem.dispose();sun.shadow.dispose();ground.geometry.dispose();(ground.material as THREE.Material).dispose();renderer.dispose();renderer.forceContextLoss();};
window.addEventListener('pagehide',dispose,{once:true});if(import.meta.hot)import.meta.hot.dispose(dispose);
void build();
