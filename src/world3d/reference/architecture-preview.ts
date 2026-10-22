import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadArchitectureMaterials, type ArchitectureMaterials } from './architecture-materials';
import { buildReferenceTemple } from './architecture-temple';
import { buildReferenceBridge } from './architecture-bridge';

if (!import.meta.env.DEV) throw new Error('Architecture asset lab is development only');
const VIEWS = {
  temple: { p: [27, 15, 35], t: [0, 6, 0], fov: 40, asset: 'temple' },
  front: { p: [0, 8, 37], t: [0, 7, 2], fov: 46, asset: 'temple' },
  portico: { p: [4, 3.1, 17], t: [0, 4.3, 5], fov: 50, asset: 'temple' },
  portal: { p: [-.2, 6.3, 9.4], t: [-1.87, 6.25, 6.85], fov: 48, asset: 'temple' },
  capital: { p: [9.2, 9.3, 13.6], t: [8.37, 8.9, 10.8], fov: 44, asset: 'temple' },
  side: { p: [36, 11, 0], t: [0, 6, 0], fov: 46, asset: 'temple' },
  rear: { p: [-26, 13, -33], t: [0, 6, -2], fov: 46, asset: 'temple' },
  bridge: { p: [6, 3.8, 7.5], t: [0, -.8, 0], fov: 44, asset: 'bridge' },
  'bridge-arch': { p: [0, -.9, 6.5], t: [0, -.95, 0], fov: 46, asset: 'bridge' },
} as const;
type View = keyof typeof VIEWS;
const params = new URLSearchParams(location.search);
let view: View = (params.get('view') as View) in VIEWS ? params.get('view') as View : 'temple';
let quality: 'high' | 'low' = params.get('quality') === 'low' ? 'low' : 'high';
let generation = 0, disposed = false;
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, .08, 400);
const controls = new OrbitControls(camera, renderer.domElement);controls.enableDamping = false;controls.minDistance = .25;controls.maxDistance = 100;controls.maxPolarAngle = Math.PI * .94;
const sunDirection = new THREE.Vector3(-.58, .74, .34).normalize();
scene.background = new THREE.Color('#87b4d8');
const pmrem = new THREE.PMREMGenerator(renderer);const environmentScene=new RoomEnvironment();const environment = pmrem.fromScene(environmentScene, .04);environmentScene.dispose();scene.environment = environment.texture;scene.environmentIntensity = .35;
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);sun.position.copy(sunDirection).multiplyScalar(48);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.near=.5;sun.shadow.camera.far=100;sun.shadow.bias=-.00012;sun.shadow.normalBias=.018;scene.add(sun);
const hemi = new THREE.HemisphereLight('#b9d4ef', '#635747', .35);scene.add(hemi);
const groundMat = new THREE.MeshStandardMaterial({color:'#9d9583',roughness:.96});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(180,180),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.95;ground.receiveShadow=true;scene.add(ground);
const composer = new EffectComposer(renderer);const mainPass = new RenderPass(scene,camera);composer.addPass(mainPass);
const ao = new GTAOPass(scene,camera,innerWidth,innerHeight);ao.blendIntensity=.62;ao.updateGtaoMaterial({radius:.65,thickness:.3,distanceFallOff:1,samples:12});composer.addPass(ao);const outputPass=new OutputPass();composer.addPass(outputPass);
let current: { temple:THREE.Group;bridge:THREE.Group;materials:ArchitectureMaterials } | undefined;
let load = new AbortController();
const status = document.getElementById('status')!;
function releaseModels() {
  if(!current)return;
  for(const root of [current.temple,current.bridge])releaseGeometry(root);
  current.materials.dispose();current=undefined;
}
function releaseGeometry(root:THREE.Group){const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());root.removeFromParent();}
function modelStats(root: THREE.Group) {
  let triangles=0,draws=0,geometryBytes=0;const textures=new Set<THREE.Texture>();const meshes:{name:string;triangles:number}[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh){const geometry=o.geometry as THREE.BufferGeometry;const count=(geometry.index?.count??geometry.getAttribute('position').count)/3;triangles+=count;meshes.push({name:o.name,triangles:count});for(const attr of Object.values(geometry.attributes))geometryBytes+=attr.array.byteLength;geometryBytes+=geometry.index?.array.byteLength??0;draws++;for(const mat of Array.isArray(o.material)?o.material:[o.material])for(const v of Object.values(mat))if(v instanceof THREE.Texture)textures.add(v);}});
  const bounds=new THREE.Box3().setFromObject(root);return{triangles,draws,geometryBytes,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},textures:textures.size,meshes};
}
function draw() {
  if(disposed)return;renderer.info.reset();composer.render();
  status.textContent=JSON.stringify({kind:'actual-3D-asset',ready:Boolean(current),view,quality,camera:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,canvas:[renderer.domElement.width,renderer.domElement.height],exposure:renderer.toneMappingExposure,toneMapping:'ACESFilmic',sun: sunDirection.toArray(),sunIntensity:sun.intensity,IBL:{source:'RoomEnvironment',intensity:scene.environmentIntensity},AO:ao.enabled,allPass:{triangles:renderer.info.render.triangles,draws:renderer.info.render.calls},model:current?modelStats(VIEWS[view].asset==='temple'?current.temple:current.bridge):null,memory:renderer.info.memory},null,1);
  document.body.dataset.ready=String(Boolean(current));document.body.dataset.view=view;document.body.dataset.quality=quality;
}
function updateProjection(){camera.aspect=innerWidth/innerHeight;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(VIEWS[view].fov)/2)*Math.max(1,1.15/camera.aspect)));camera.updateProjectionMatrix();}
function resize(){const pixelRatio=quality==='high'?Math.min(devicePixelRatio,1.25,Math.sqrt(1800000/(innerWidth*innerHeight))):Math.min(devicePixelRatio,.8,Math.sqrt(850000/(innerWidth*innerHeight)));renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight,false);composer.setPixelRatio(pixelRatio);composer.setSize(innerWidth,innerHeight);updateProjection();draw();}
function applyView(){const v=VIEWS[view];camera.position.fromArray([...v.p]);controls.target.fromArray([...v.t]);updateProjection();controls.update();if(current){current.temple.visible=v.asset==='temple';current.bridge.visible=v.asset==='bridge';}ground.position.y=v.asset==='temple'?-.95:-2.6;document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));draw();}
async function build(){
  const ticket=++generation;load.abort();load=new AbortController();
  status.textContent='加载原创 PBR 与实际建筑几何…';document.body.dataset.ready='false';
  let materials:ArchitectureMaterials|undefined;const partial:THREE.Group[]=[];
  try{
    materials=await loadArchitectureMaterials({quality,signal:load.signal,baseUrl:new URL('/world3d/reference/architecture/',location.origin).href});
    if(disposed||ticket!==generation){materials.dispose();return;}
    const temple=buildReferenceTemple({size:[20,15,24],quality,materials});partial.push(temple);
    const bridge=buildReferenceBridge({quality,stone:materials.bridgeStone,mortar:materials.mortar,capstone:materials.bridgeStone});partial.push(bridge);bridge.position.y=-2;
    releaseModels();current={temple,bridge,materials};scene.add(temple,bridge);
    delete document.body.dataset.error;ao.enabled=quality==='high';sun.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024);resize();applyView();
  }catch(error){
    if(materials&&current?.materials===materials)releaseModels();else{partial.forEach(releaseGeometry);materials?.dispose();}
    if(ticket===generation&&!disposed){status.textContent=`资产加载失败：${String(error)}`;document.body.dataset.error=String(error);}
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view as View;applyView();});
const select=document.getElementById('quality') as HTMLSelectElement;select.value=quality;select.onchange=()=>{quality=select.value as 'low'|'high';void build();};
document.getElementById('clean')!.onclick=()=>document.body.classList.add('clean');
const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')document.body.classList.remove('clean');};
controls.addEventListener('change',draw);window.addEventListener('resize',resize);window.addEventListener('keydown',onKey);
if(params.has('clean'))document.body.classList.add('clean');
const dispose=()=>{if(disposed)return;disposed=true;generation++;load.abort();releaseModels();controls.removeEventListener('change',draw);controls.dispose();window.removeEventListener('resize',resize);window.removeEventListener('keydown',onKey);environment.dispose();pmrem.dispose();sun.shadow.dispose();ground.geometry.dispose();groundMat.dispose();ao.dispose();mainPass.dispose();outputPass.dispose();composer.dispose();renderer.dispose();renderer.forceContextLoss();};
window.addEventListener('pagehide',dispose,{once:true});if(import.meta.hot)import.meta.hot.dispose(dispose);
void build();
