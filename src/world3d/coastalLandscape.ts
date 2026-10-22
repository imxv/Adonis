import * as THREE from 'three';
import type { ArtLayer, ArtLayerOptions } from './artLayer';
import { TREE_TRUNKS } from './botanical';

/** Painted Aegean water, sculpted headlands and cloud brushwork. No borrowed imagery. */
export function createCoastalLandscapeLayer(options: ArtLayerOptions): ArtLayer {
  const root = new THREE.Group(); root.name = 'Aegean bay / sculpted limestone headlands';
  root.userData.colliders = [
    { x: 55, z: -104, radius: 36 }, { x: 64, z: -162, radius: 44 }, { x: -45, z: -153, radius: 29 },
  ];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instanceMeshes: THREE.InstancedMesh[] = [];
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;instanceMeshes.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();};
  try {
  const trackG = <T extends THREE.BufferGeometry>(g:T) => { geometries.add(g); return g; };
  const trackM = <T extends THREE.Material>(m:T) => { materials.add(m); return m; };
  const hash = (n:number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const shoreX = (z:number) => -23 + Math.sin(z * .06) * 3;
  const rockCanvas=document.createElement('canvas');rockCanvas.width=rockCanvas.height=512;
  const rc=rockCanvas.getContext('2d')!;rc.fillStyle='#d2d2c0';rc.fillRect(0,0,512,512);
  for(let i=0;i<170;i++){
    const x=hash(i*11)*512,y=hash(i*7+9)*512,w=15+hash(i+11)*145,h=3+hash(i*6)*22;
    rc.globalAlpha=.07+hash(i*5)*.09;rc.fillStyle=['#eee2c6','#a9bdbe','#c6cdbb','#92aaa7'][i%4];
    rc.beginPath();rc.moveTo(x-w,y);rc.lineTo(x+w*.6,y-h*.6);rc.lineTo(x+w,y+h*.3);rc.lineTo(x-w*.8,y+h);rc.closePath();rc.fill();
  }
  rc.globalAlpha=.065;
  for(let i=0;i<20;i++){
    const y=i*28+hash(i*3)*9;rc.strokeStyle=i%3?'#859c9f':'#faf1dc';rc.lineWidth=.45+hash(i+50)*.65;
    rc.beginPath();rc.moveTo(0,y);rc.bezierCurveTo(140,y+15,330,y-15,512,y+5);rc.stroke();
  }
  for(let i=0;i<14;i++){
    let x=hash(i+1)*512,y=hash(i+90)*512;rc.strokeStyle='#7d9490';rc.lineWidth=.55;rc.beginPath();rc.moveTo(x,y);
    for(let j=0;j<6;j++){x+=4+hash(i*7+j)*14;y+=12+hash(i*11+j)*19;rc.lineTo(x,y);}rc.stroke();
  }
  rc.globalAlpha=1;
  const rockTexture=new THREE.CanvasTexture(rockCanvas);rockTexture.colorSpace=THREE.SRGBColorSpace;rockTexture.wrapS=rockTexture.wrapT=THREE.RepeatWrapping;rockTexture.anisotropy=4;textures.add(rockTexture);
  const stoneMat = trackM(new THREE.MeshStandardMaterial({vertexColors:true,map:rockTexture,bumpMap:rockTexture,bumpScale:.035,roughness:1}));
  function limestoneIsland(x:number,z:number,rx:number,rz:number,height:number,seed:number,greenTop=true) {
    const segments=64, levels=6, vertices:number[]=[], colors:number[]=[], indices:number[]=[],uvs:number[]=[];
    const bands=['#87a9aa','#b2c1b5','#c8cebb','#d6d5bd','#dad7bc','#78946f'];
    const haze=new THREE.Color('#b7ced0'),bareRock=new THREE.Color('#d6d4bb');
    const distanceHaze=THREE.MathUtils.clamp((Math.hypot(x,z-24)-95)/260,0,.28);
    for(let level=0;level<levels;level++) for(let i=0;i<=segments;i++) {
      const angle=i/segments*Math.PI*2;
      const scallop=1 + .09*Math.sin(angle*5+seed) + .045*Math.sin(angle*13+seed*2);
      const retreat=level===5?.72:1 - level*.025 + (hash(seed+level*93+i)-.5)*.035;
      const rimHeight=height*(.65+.2*Math.sin(angle+seed)+.15*Math.cos(angle*3+seed));
      const px=x+Math.cos(angle)*rx*scallop*retreat, pz=z+Math.sin(angle)*rz*scallop*retreat;
      const y=-1.8 + (level/(levels-1))*rimHeight + (level>0&&level<5?(hash(i+level*17+seed)-.5)*1.1:0);
      vertices.push(px,y,pz);
      uvs.push(i/segments*4,level/(levels-1)*1.15);
      const color=new THREE.Color(level===5&&!greenTop?'#c9d1c8':bands[level]);
      // Broad warm rock faces and broken green caps, with only faint sedimentary strata.
      const broadPatch=.5+.5*Math.sin(angle*2.3+level*.61+seed);
      if(level<5)color.lerp(bareRock,.14+broadPatch*.19);
      else if(greenTop)color.lerp(bareRock,THREE.MathUtils.smoothstep(Math.sin(angle*3+seed),.15,.85)*.45);
      color.multiplyScalar(.96+hash(i*31+level+seed)*.06).lerp(haze,distanceHaze);
      colors.push(color.r,color.g,color.b);
      if(level<levels-1&&i<segments){const a=level*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
    const centre=vertices.length/3;vertices.push(x,height*.82,z);uvs.push(4,2.5);const c=new THREE.Color(greenTop?'#809a72':'#bdc8be').lerp(haze,distanceHaze);colors.push(c.r,c.g,c.b);
    for(let i=0;i<segments;i++){const a=(levels-1)*(segments+1)+i;indices.push(centre,a+1,a);}
    const g=trackG(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,stoneMat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  // A crescent of white limestone across the bay, then softer overlapping blue headlands.
  limestoneIsland(-79,-24,20,34,20,17);
  limestoneIsland(-117,-91,31,42,32,39);
  limestoneIsland(-157,-164,38,43,43,62);
  limestoneIsland(55,-104,29,44,33,91);
  limestoneIsland(64,-162,38,47,45,110);
  limestoneIsland(-45,-153,22,31,32,142);

  // Exposed strata along the walking shore: irregular sedimentary ledges, not a rock fence.
  const cliffVertices:number[]=[],cliffColors:number[]=[],cliffIndices:number[]=[],cliffUvs:number[]=[];
  const rows=5, columns=96;
  for(let row=0;row<rows;row++) for(let col=0;col<=columns;col++) {
    const z=50-col*1.01;
    const edge=shoreX(z), t=row/(rows-1);
    const x=edge-3.1+t*5.5 + Math.sin(z*.43+row)*.32;
    const y=THREE.MathUtils.lerp(-1.2,options.groundHeight(edge+2.4,z)-.02,t)+Math.sin(z*.8+row)*.08;
    cliffVertices.push(x,y,z);
    cliffUvs.push(col/columns*10,t*.8);
    const color=new THREE.Color(['#6a9c9c','#aebfb1','#cbd0b8','#d7d5ba','#d8ceb0'][row]).multiplyScalar(.97+Math.sin(z*.075+row*.6)*.025+hash(col+row*123)*.035);
    cliffColors.push(color.r,color.g,color.b);
    if(row<rows-1&&col<columns){const a=row*(columns+1)+col,b=a+columns+1;cliffIndices.push(a,a+1,b,a+1,b+1,b);}
  }
  const cliffGeo=trackG(new THREE.BufferGeometry());cliffGeo.setAttribute('position',new THREE.Float32BufferAttribute(cliffVertices,3));cliffGeo.setAttribute('color',new THREE.Float32BufferAttribute(cliffColors,3));cliffGeo.setAttribute('uv',new THREE.Float32BufferAttribute(cliffUvs,2));cliffGeo.setIndex(cliffIndices);cliffGeo.computeVertexNormals();
  const cliffs=new THREE.Mesh(cliffGeo,stoneMat);cliffs.receiveShadow=true;root.add(cliffs);

  // Broad cool contact shadows anchor the small-leaf trees even on the low shadow budget.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d')!,sg=sc.createRadialGradient(64,64,4,64,64,63);
  sg.addColorStop(0,'rgba(255,255,255,.72)');sg.addColorStop(.5,'rgba(255,255,255,.35)');sg.addColorStop(1,'rgba(255,255,255,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);textures.add(shadowTexture);
  const contactMat=trackM(new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,color:'#23445a',opacity:.30,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  const contact=new THREE.InstancedMesh(trackG(new THREE.PlaneGeometry(1,1)),contactMat,TREE_TRUNKS.length),dummy=new THREE.Object3D();
  TREE_TRUNKS.forEach((tree,i)=>{dummy.position.set(tree.x,options.groundHeight(tree.x,tree.z)+.035,tree.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(i===13?8:5.6,i===13?6:4.4,1);dummy.updateMatrix();contact.setMatrixAt(i,dummy.matrix);});contact.computeBoundingSphere();root.add(contact);instanceMeshes.push(contact);

  const waterMat=trackM(new THREE.ShaderMaterial({
    uniforms:{time:{value:0},deep:{value:new THREE.Color('#0c628a')},turquoise:{value:new THREE.Color('#39b6b5')},foam:{value:new THREE.Color('#e0f1dc')},haze:{value:new THREE.Color('#b0d8df')}},
    vertexShader:`varying vec3 world; uniform float time;
      void main(){vec3 p=position;p.y+=sin(p.x*.13+p.z*.04+time*.7)*.045+sin(p.z*.21-time*.8)*.023;world=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`varying vec3 world; uniform float time; uniform vec3 deep; uniform vec3 turquoise; uniform vec3 foam; uniform vec3 haze;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){float shore=-23.+sin(world.z*.06)*3.;float d=abs(world.x-shore);float shallow=exp(-d*.045);
      float brush=noise(world.xz*vec2(.11,.32)+vec2(time*.012,0.));float ripple=sin(world.x*.68+world.z*.24+sin(world.z*.13)+time*.75)*.5+.5;
      vec3 col=mix(deep,turquoise,clamp(shallow*.83+brush*.2,0.,1.));col*=.88+brush*.19;
      float stroke=smoothstep(.86,.98,ripple)*smoothstep(.53,.79,noise(world.xz*.22));col=mix(col,foam,stroke*.22);
      float shoreline=(1.-smoothstep(.6,2.8,d))*(.48+.52*noise(world.xz*.9+time*.06));col=mix(col,foam,shoreline*.6);
      float distanceToEye=length(world-cameraPosition);col=mix(col,haze,smoothstep(155.,440.,distanceToEye)*.62);gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
      }`,side:THREE.DoubleSide,
  }));
  const seaGeo=trackG(new THREE.PlaneGeometry(740,700,52,52));seaGeo.rotateX(-Math.PI/2);seaGeo.translate(-90,-.45,40);
  const water=new THREE.Mesh(seaGeo,waterMat);water.renderOrder=-1;root.add(water);

  // Original translucent cloud brushwork. Low contrast edges disappear into the blue sky.
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=512;cloudCanvas.height=256;
  const ctx=cloudCanvas.getContext('2d')!;
  for(let i=0;i<50;i++){
    const x=65+hash(i*3+1)*380,y=115+Math.sin(i*2.1)*35;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,32+hash(i+6)*40);
    gradient.addColorStop(0,'rgba(255,249,229,.24)');gradient.addColorStop(.5,'rgba(255,248,229,.13)');gradient.addColorStop(1,'rgba(255,248,229,0)');
    ctx.fillStyle=gradient;ctx.save();ctx.translate(x,y);ctx.scale(1.45,.58);ctx.translate(-x,-y);ctx.fillRect(x-90,y-90,180,180);ctx.restore();
  }
  const cloudTexture=new THREE.CanvasTexture(cloudCanvas);cloudTexture.colorSpace=THREE.SRGBColorSpace;textures.add(cloudTexture);
  const cloudMat=trackM(new THREE.SpriteMaterial({map:cloudTexture,transparent:true,opacity:.85,depthWrite:false,fog:false,color:'#fff9e8'}));
  const clouds=new THREE.Group();root.add(clouds);
  [[-88,54,-114,130,38],[74,72,-188,150,45],[-25,62,-235,115,30],[-170,62,-50,105,31]].forEach(([x,y,z,w,h])=>{const sprite=new THREE.Sprite(cloudMat);sprite.position.set(x,y,z);sprite.scale.set(w,h,1);clouds.add(sprite);});

  return {root,setQuality(quality){clouds.visible=quality!=='low';},update(time){waterMat.uniforms.time.value=time;},dispose};
  } catch(error) { dispose(); throw error; }
}
