import * as THREE from 'three';
import type { ArchitectureMaterials } from './architecture-materials';
import { ArchitectureBatch, flutedShaft, moulding, stableNoise, stoneBlock } from './architecture-geometry';
import { bakeArchitectureOcclusion } from './architecture-occlusion';
import { templeProportions } from './architecture-proportions';
import { addPedimentSculpture } from './architecture-sculpture';
import { addTemplePortal } from './architecture-portal';
import { addTempleFrieze, addTemplePilasterOrnament } from './architecture-ornament';
import { applyTempleSurface } from './architecture-temple-surface';

export interface ReferenceTempleOptions {
  size: readonly [number, number, number];
  quality: 'low' | 'high';
  materials: ArchitectureMaterials;
  variant?: number;
}

/** Ionic capital: paired front/back spiral volutes, lateral bolsters, necking and a square abacus. */
function ionicColumn(batch: ArchitectureBatch, m: ArchitectureMaterials, d: number, height: number, x: number, z: number, high: boolean, seed: number): void {
  const r = d / 2, baseH = d * .55, capH = d * .7, shaftH = height - baseH - capH;
  batch.add(stoneBlock(d * 1.42, d * .16, d * 1.42, seed), m.marble, [x, d * .08, z], [0, 0, 0], seed);
  const profile: [number, number][] = [[0, .16], [.64, .16], [.66, .21], [.64, .26], [.53, .30], [.51, .34], [.59, .38], [.60, .43], [.56, .48], [.51, .49], [.50, .55]];
  batch.add(moulding(profile.map(([a, b]) => [a * d, b * d]), high ? 48 : 32), m.marble, [x, 0, z], [0, 0, 0], seed);
  batch.add(flutedShaft(r, shaftH, high), m.marble, [x, baseH, z], [0, 0, 0], seed + 1, true);
  const capY = height - capH;
  batch.add(moulding([[.41 * d, 0], [.48 * d, .035 * d], [.49 * d, .09 * d], [.44 * d, .15 * d], [.46 * d, .20 * d], [.55 * d, .31 * d]], high ? 36 : 24), m.marble, [x, capY, z], [0, 0, 0], seed);
  // The cushion connects the volutes in volume, including the side view.
  batch.add(stoneBlock(d * 1.38, d * .22, d * .88, seed, .008), m.marble, [x, capY + .42 * d, z], [0, 0, 0], seed);
  for (const side of [-1, 1]) {
    for (const front of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 72; i++) {
        const t = i / 72, a = t * Math.PI * 4.1;
        const rad = d * (.22 * (1 - t) + .018);
        points.push(new THREE.Vector3(x + side * d * .55 + side * Math.cos(a) * rad, capY + d * .37 + Math.sin(a) * rad, z + front * d * .47));
      }
      const spiral=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),high?32:24,.032*d,high?6:5,false);
      const sp=spiral.getAttribute('position'),segments=spiral.parameters.tubularSegments,radial=spiral.parameters.radialSegments;
      for(let row=0;row<=segments;row++){
        const t=row/segments,centre=spiral.parameters.path.getPointAt(t),taper=1-.69*t;
        for(let j=0;j<=radial;j++){const index=row*(radial+1)+j;sp.setXYZ(index,centre.x+(sp.getX(index)-centre.x)*taper,centre.y+(sp.getY(index)-centre.y)*taper,centre.z+(sp.getZ(index)-centre.z)*taper);}
      }
      spiral.computeVertexNormals();batch.add(spiral, m.marble, [0, 0, 0], [0, 0, 0], seed);
      batch.add(new THREE.SphereGeometry(.055 * d, 10, 7), m.marble, [x + side * d * .55, capY + d * .37, z + front * d * .47], [0, 0, 0], seed);
    }
    batch.add(new THREE.CylinderGeometry(.16 * d, .16 * d, .86 * d, high ? 24 : 12), m.marble, [x + side * d * .55, capY + d * .37, z], [Math.PI / 2, 0, 0], seed);
  }
  for (let i = 0; i < (high ? 16 : 12); i++) {
    const a = i / (high ? 16 : 12) * Math.PI * 2;
    const egg = new THREE.SphereGeometry(.045 * d, 6, 4); egg.scale(1, 1.65, .7);
    batch.add(egg, m.marble, [x + Math.cos(a) * d * .49, capY + d * .19, z + Math.sin(a) * d * .49], [0, -a, 0], seed);
  }
  batch.add(stoneBlock(d * 1.65, d * .15, d * 1.20, seed, .006), m.marble, [x, height - d * .075, z], [0, 0, 0], seed);
}

function carvedLeaf(width:number,height:number,depth:number,high:boolean):THREE.ExtrudeGeometry{
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-width*.7,height*.3,-width*.48,height*.7,0,height);shape.bezierCurveTo(width*.48,height*.7,width*.7,height*.3,0,0);
  return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:depth*.24,bevelSize:depth*.3,bevelSegments:1,steps:1,curveSegments:high?4:3});
}

function palmette(batch: ArchitectureBatch, m: ArchitectureMaterials, x: number, y: number, z: number, scale: number, high: boolean,yaw=0): void {
  for (let i = -3; i <= 3; i++) {
    const a = i * .22;
    const leaf=carvedLeaf(scale*.16,scale*(1-.08*Math.abs(i)),scale*.026,high);leaf.rotateZ(-a);leaf.rotateY(yaw);batch.add(leaf,m.gold,[x,y,z],[0,0,0],i);
  }
}

function roofTile(x0: number, x1: number, z0: number, z1: number, roofWidth: number, eave: number, rise: number): THREE.BufferGeometry {
  const p: number[] = [], uv: number[] = [], ids: number[] = [];
  for (let v = 0; v <= 1; v++) for (let u = 0; u <= 6; u++) {
    const t = u / 6, x = x0 + (x1 - x0) * t, z = v ? z1 : z0;
    p.push(x, eave + rise * (1 - Math.abs(x) / (roofWidth / 2)) + .06 * Math.sin(Math.PI * t) + (v ? 0 : .035), z);
    uv.push(x, z);
    if (!v && u < 6) ids.push(u, u + 7, u + 1, u + 1, u + 7, u + 8);
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();return g;
}

/** Complete local-space sanctuary, front +Z and walkable floor exactly y=0. */
export function buildReferenceTemple(options: ReferenceTempleOptions): THREE.Group {
  const { materials: m, quality } = options, high = quality === 'high';
  const [w, h, depth] = options.size;
  const proportions=templeProportions(options.size);
  const {d,columnDiameter,columnHeight:colH,columnX:colX,frontZ,backZ,wallX,wallFront,wallBack,wallHeight,wallThickness,doorHalfWidth,doorHeight,eave,rise}=proportions;
  const batch = new ArchitectureBatch();
  // Stereo-bate, real stone courses and joints; the datum is the top paving, not a tall foundation box.
  for (let tier = 0; tier < 3; tier++) {
    const tw = w - tier * d * .42, td = depth - tier * d * .42;
    const y = -.70 * d + tier * .24 * d;
    const count = Math.ceil(tw / (d * 1.6));
    for (let i = 0; i < count; i++) {
      const sw = tw / count;
      for (const side of [-1, 1]) batch.add(stoneBlock(sw - .018, .24 * d - .012, .55 * d, i + tier * 10), m.limestone, [-tw / 2 + sw * (i + .5), y - .12 * d, side * (td / 2 - .275 * d)], [0, 0, 0], i + tier * 10);
    }
    const sides = Math.ceil(td / (d * 1.6));
    for (let i = 1; i < sides - 1; i++) for (const side of [-1, 1]) batch.add(stoneBlock(.55 * d, .24 * d - .012, td / sides - .018, i), m.limestone, [side * (tw / 2 - .275 * d), y - .12 * d, -td / 2 + td / sides * (i + .5)], [0, 0, 0], i);
  }
  batch.add(stoneBlock(w - d * .8, .12, depth - d * .8, 0, 0), m.mortar, [0, -.125, 0]);
  const nx = Math.ceil((w - d) / 1.6), nz = Math.ceil((depth - d) / 1.7);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const sx = (w - d) / nx, sz = (depth - d) / nz, seed = x * 7 + z * 13;
    batch.add(stoneBlock(sx - .008, .18, sz - .008, seed, .004,.012), m.marble, [-w / 2 + d / 2 + sx * (x + .5), -.09, -depth / 2 + d / 2 + sz * (z + .5)], [0, 0, 0], seed);
  }
  // The shared threshold at z=depth/2 is a real level stone connecting the stair landing.
  batch.add(stoneBlock(d*4,.18,d*.62,73,.004),m.marble,[0,-.09,depth/2-d*.30],[0,0,0],73);
  const colCount = proportions.frontColumns, sideRows = proportions.sideRows;
  for (let i = 0; i < colCount; i++) for (const z of [frontZ, backZ]) ionicColumn(batch, m, columnDiameter, colH, -colX + 2 * colX * i / (colCount - 1), z, high, i);
  for (let i = 1; i < sideRows - 1; i++) for (const x of [-colX, colX]) ionicColumn(batch, m, columnDiameter, colH, x, frontZ + (backZ - frontZ) * i / (sideRows - 1), high, 10 + i);

  const courses = Math.ceil(wallHeight / (d * .62)), courseH = wallHeight / courses;
  const wallStrip = (start: number, end: number, fixed: number, alongX: boolean, seed: number, door = false) => {
    for (let row = 0; row < courses; row++) {
      const width = d * 1.9, offset = row % 2 ? -width / 2 : 0;
      for (let s = start + offset; s < end; s += width) {
        const a = Math.max(start, s), b = Math.min(end, s + width);
        if (b - a < .06) continue;
        const y = (row + .5) * courseH;
        if (door && row*courseH < doorHeight && a < doorHalfWidth && b > -doorHalfWidth) {
          for (const [pa, pb] of [[a, Math.min(b, -doorHalfWidth)], [Math.max(a, doorHalfWidth), b]]) if (pb - pa > .06) batch.add(stoneBlock(pb - pa - .007, courseH - .006, wallThickness, row + seed,.003,.009), m.limestone, [(pa + pb) / 2, y, fixed], [0, 0, 0], row *31+seed+s);
          const lintelH=(row+1)*courseH-doorHeight,pa=Math.max(a,-doorHalfWidth),pb=Math.min(b,doorHalfWidth);
          if(lintelH>.006&&pb-pa>.02)batch.add(stoneBlock(pb-pa-.007,lintelH-.006,wallThickness,row+seed,.002,.009),m.limestone,[(pa+pb)/2,doorHeight+lintelH/2,fixed],[0,0,0],row+seed);
          continue;
        }
        batch.add(stoneBlock(alongX ? b - a - .007 : wallThickness, courseH - .006, alongX ? wallThickness : b - a - .007, row + seed,.003,.009), m.limestone, alongX ? [(a + b) / 2, y, fixed] : [fixed, y, (a + b) / 2], [0, 0, 0], row * 31 + seed + s);
      }
    }
  };
  wallStrip(-wallX, wallX, wallFront, true, 71, true);wallStrip(-wallX,wallX,wallBack,true,91);
  wallStrip(wallBack,wallFront,-wallX,false,105);wallStrip(wallBack,wallFront,wallX,false,125);
  addTemplePortal(batch,m,{d,wallFront,wallThickness,doorHalfWidth,doorHeight,quality});
  for(const side of [-1,1]){
    const px=side*d*3.2,pz=wallFront+wallThickness/2+d*.04;
    batch.add(stoneBlock(d*.82,d*5.3,d*.10,side,.004,.008),m.blue,[px,d*3,pz],[0,0,0],side);
    addTemplePilasterOrnament(batch,m,{x:px,y:d*3,z:pz+d*.055,width:d*.74,height:d*5.08,high});
  }
  // Painted coffered soffit gives the portico real enclosure and a darker ceiling material.
  // It occludes light by geometry; no black doorway sheet or baked directional shadow.
  const bays=colCount-1,bayWidth=colX*2/bays,porticoDepth=frontZ-wallFront;
  for(let i=0;i<bays;i++){
    const cx=-colX+bayWidth*(i+.5);
    batch.add(stoneBlock(bayWidth-d*.2,d*.10,porticoDepth-d*.22,i,0),m.blue,[cx,colH-d*.13,(frontZ+wallFront)/2],[0,0,0],i);
    for(const edge of [-1,1])batch.add(new THREE.BoxGeometry(d*.022,d*.018,porticoDepth-d*.34),m.gold,[cx+edge*(bayWidth/2-d*.16),colH-d*.19,(frontZ+wallFront)/2]);
    if(i<bays-1)batch.add(stoneBlock(d*.28,d*.34,porticoDepth,i,.003),m.marble,[cx+bayWidth/2,colH-d*.18,(frontZ+wallFront)/2],[0,0,0],i);
  }
  batch.add(stoneBlock(wallX*2-d*.4,d*.14,wallFront-wallBack-d*.1,0,0),m.darkStone,[0,colH-d*.15,(wallBack+wallFront)/2]);
  // Interior altar and recessed back niche. No opaque "dark doorway" billboard.
  batch.add(stoneBlock(d * 3, d * .5, d * 1.6, 91), m.marble, [0, .25 * d, wallBack + d * 2]);
  batch.add(stoneBlock(d * 3.3, d * .14, d * 1.8, 94), m.marble, [0, .57 * d, wallBack + d * 2]);

  const beam = (width: number, height: number, length: number, y: number, material: THREE.MeshStandardMaterial, alongFront: boolean, seed: number) => {
    const count = Math.max(1, Math.ceil((alongFront ? width : length) / (d * 2.5)));
    for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
      if (alongFront) batch.add(stoneBlock(width / count - .012, height, d * .95, seed + i, .007), material, [-width / 2 + width / count * (i + .5), y, side * (length / 2 - d * .475)], [0, 0, 0], seed + i);
      else batch.add(stoneBlock(d * .95, height, length / count - .012, seed + i, .007), material, [side * (width / 2 - d * .475), y, -length / 2 + length / count * (i + .5)], [0, 0, 0], seed + i);
    }
  };
  const beamW = w - d * .45, beamD = depth - d * .15;
  for (const isFront of [true, false]) {
    beam(beamW, d * .34, beamD, colH + d * .17, m.marble, isFront, 1);
    beam(beamW + d * .1, d * .08, beamD + d * .1, colH + d * .38, m.marble, isFront, 2);
    beam(beamW, d * .62, beamD, colH + d * .73, m.blue, isFront, 3);
    beam(beamW + d * .22, d * .1, beamD + d * .22, colH + d * 1.055, m.marble, isFront, 4);
    beam(beamW + d * .45, d * .12, beamD + d * .45, colH + d * 1.17, m.marble, isFront, 5);
    beam(beamW + d * .66, d * .08, beamD + d * .66, colH + d * 1.27, m.marble, isFront, 6);
  }
  // Linked tendrils, fan leaves and fine borders read as one architectural relief.
  for (const side of [-1, 1]) addTempleFrieze(batch,m,{x:0,y:colH+d*.73,z:side*(beamD/2+.012),yaw:side>0?0:Math.PI,length:beamW,height:d*.64,high});
  const dentils = Math.ceil(beamW / (d * .33));
  for (const side of [-1, 1]) for (let i = 0; i < dentils; i++) batch.add(stoneBlock(d * .15, d * .16, d * .18, i, .002), m.marble, [-beamW / 2 + (i + .5) * beamW / dentils, colH + d * 1.06, side * (beamD / 2 - .02)], [0, 0, 0], i);
  for(const side of [-1,1])addTempleFrieze(batch,m,{x:side*(beamW/2+.012),y:colH+d*.73,z:0,yaw:side*Math.PI/2,length:beamD,height:d*.64,high});
  for(const side of [-1,1])for(const edge of [-1,1]){
    const y=colH+d*(.73+edge*.268);
    batch.add(new THREE.BoxGeometry(beamW,d*.014,d*.018),m.gold,[0,y,side*(beamD/2+d*.014)]);
    batch.add(new THREE.BoxGeometry(d*.018,d*.014,beamD),m.gold,[side*(beamW/2+d*.014),y,0]);
  }

  const roofW = w - .08, roofD = depth - .08;
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape([new THREE.Vector2(-roofW / 2, eave), new THREE.Vector2(roofW / 2, eave), new THREE.Vector2(0, eave + rise)]);
    const tympanum = new THREE.ExtrudeGeometry(shape, { depth: d * .24, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, steps: 1 });
    batch.add(tympanum, m.marble, [0, 0, side > 0 ? roofD / 2 - d * .24 : -roofD / 2], [0, 0, 0], side);
    for (const slope of [-1, 1]) {
      const slopeLength = Math.hypot(roofW / 2, rise), angle = Math.atan2(rise, roofW / 2);
      for (let layer = 0; layer < 3; layer++) batch.add(stoneBlock(slopeLength + .1, d * (.12 - layer * .025), d * (.4 + layer * .16), layer, .004), m.marble, [slope * roofW / 4, eave + rise / 2 + d * layer * .07, side * (roofD / 2 + .025)], [0, 0, -slope * angle], layer);
    }
    addPedimentSculpture(batch,m,{width:roofW,rise,baseY:eave+d*.12,faceZ:side*(roofD/2+.028),frontSign:side as 1|-1,quality});
    palmette(batch,m,0,eave+rise+d*.12,side*(roofD/2),d*.62,high);
    palmette(batch,m,-roofW/2+d*.3,eave+d*.08,side*roofD/2,d*.45,high);
    palmette(batch,m,roofW/2-d*.3,eave+d*.08,side*roofD/2,d*.45,high);
  }
  // Roof has two closed planes and overlapping curved ceramic courses all the way to the back.
  const pitch = Math.atan2(rise, roofW / 2), slopeLen = Math.hypot(roofW / 2, rise);
  for (const side of [-1, 1]) batch.add(stoneBlock(slopeLen, .13, roofD, 0, 0), m.roof, [side * roofW / 4, eave + rise / 2 - .025, 0], [0, 0, -side * pitch]);
  const tileX = high ? 32 : 20, tileZ = high ? 30 : 22;
  for (let x = 0; x < tileX; x++) for (let z = 0; z < tileZ; z++) {
    const x0=-roofW/2+roofW*x/tileX, x1=-roofW/2+roofW*(x+1)/tileX, z0=-roofD/2+roofD*z/tileZ, z1=z0+roofD/tileZ+.045;
    batch.add(roofTile(x0+.006,x1-.006,z0,z1,roofW,eave,rise),m.roof,[0,0,0],[0,0,0],x*13+z,true);
  }
  batch.add(new THREE.CylinderGeometry(d*.12,d*.12,roofD,high?24:12,1,false,Math.PI/2,Math.PI),m.roof,[0,eave+rise+.025,0],[Math.PI/2,0,0]);
  const root = batch.finish('reference-temple');
  const surface = applyTempleSurface(root,{size:options.size,quality,materials:m});
  const wallH=wallHeight,thickness=wallThickness;
  const occluders:{min:[number,number,number];max:[number,number,number]}[]=[
    {min:[-wallX-thickness/2,0,wallBack],max:[-wallX+thickness/2,wallH,wallFront]},
    {min:[wallX-thickness/2,0,wallBack],max:[wallX+thickness/2,wallH,wallFront]},
    {min:[-wallX,0,wallBack-thickness/2],max:[wallX,wallH,wallBack+thickness/2]},
    {min:[-wallX,0,wallFront-thickness/2],max:[-doorHalfWidth,wallH,wallFront+thickness/2]},
    {min:[doorHalfWidth,0,wallFront-thickness/2],max:[wallX,wallH,wallFront+thickness/2]},
    {min:[-doorHalfWidth,doorHeight,wallFront-thickness/2],max:[doorHalfWidth,wallH,wallFront+thickness/2]},
    {min:[-colX,colH-d*.18,wallFront+d*.11],max:[colX,colH-d*.08,frontZ-d*.11]},
    {min:[-wallX+d*.2,colH-d*.22,wallBack+d*.05],max:[wallX-d*.2,colH-d*.08,wallFront-d*.05]},
    {min:[-w/2+d*.5,-.18,-depth/2+d*.5],max:[w/2-d*.5,0,depth/2-d*.5]},
  ];
  bakeArchitectureOcclusion(root,occluders);
  root.userData = { reference: '02-sacred-grove', units: 'metres', floorY: 0, front: '+Z', columns: colCount*2+(sideRows-2)*2, frontColumns:colCount,flutesPerColumn: 24, porticoDepth: frontZ-wallFront, proportions,surface,source: 'Original geometric authoring; no concept pixels used as a model' };
  return root;
}

export function buildReferenceIonicColumn(materials: ArchitectureMaterials, height: number, diameter: number, quality: 'low' | 'high'): THREE.Group {
  const batch = new ArchitectureBatch();ionicColumn(batch,materials,diameter,height,0,0,quality==='high',0);return batch.finish('reference-ionic-column');
}
