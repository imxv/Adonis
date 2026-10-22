import type { ReferenceLayout } from './contracts';
import { REFERENCE_GROVE_POOL, REFERENCE_LANDFORM_REVISION, REFERENCE_SACRED_WATER, REFERENCE_SHORE_APPROACH, REFERENCE_SPRING_BRANCH, REFERENCE_SPRING_SHRINE, REFERENCE_STAIR_FLIGHTS, REFERENCE_STAIR_PLACEMENTS } from './landform-layout';

export const REFERENCE_LAYOUT_REVISION = REFERENCE_LANDFORM_REVISION;
// C's finished scan uses ONE frozen metre scale in both LODs, initially set
// from the r4 width. Later body/thickness edits must NOT re-fit or move water.
// Finished local anchors: no old Z compression and no bbox re-centring.
const cascadeScale = 29 / 13.956301212310791;
const cascadeOrigin = [32, .18 - .16 * cascadeScale, -12] as const;
export const REFERENCE_CASCADE_TRANSFORM = { scale: cascadeScale, position: cascadeOrigin, yaw: 0 } as const;
const cascadePoint = (x: number, y: number, z: number) => [
  cascadeOrigin[0] + x * cascadeScale,
  cascadeOrigin[1] + y * cascadeScale,
  cascadeOrigin[2] + z * cascadeScale,
] as const;
const upperStart = cascadePoint(.35, 8.72, -1.12), upperEnd = cascadePoint(.7, 4.9, .25);
const ledgeMid = cascadePoint(.88, 4.88, .4);
const lowerStart = cascadePoint(1.15, 4.85, .58), lowerEnd = cascadePoint(1.25, .16, 1.69);

/** First coherent metric blockout derived from the three viewed references.
 * Not photogrammetry or an accepted composition. Only D changes this layout.
 * 01 controls the world: sea west, winding shore south, sanctuary up/north-east,
 * cascade east. 02/03 are closer views within that same continuous scene.
 */
export const REFERENCE_LAYOUT = {
  version: 'v3-reference-1',
  cameras: [
    { id: 'coast', position: [11, 3.22, 43], yaw: .04, pitch: .09, fov: 60, aspect: 16 / 9 },
    { id: 'grove', position: [-5, 13.72, 0], yaw: -.16, pitch: .16, fov: 60, aspect: 16 / 9 },
    { id: 'waterfall', position: [24, 3.22, 20], yaw: -.27, pitch: .09, fov: 60, aspect: 16 / 9 },
  ],
  architecture: [
    { id: 'sanctuary.main', kind: 'temple', position: [15, 22, -40], yaw: 0, size: [20, 15, 24], variant: 0 },
    { id: 'sanctuary.east-pavilion', kind: 'pavilion', position: [48, 26, -44], yaw: -.15, size: [10, 9, 12], variant: 1 },
    { id: 'sanctuary.distant', kind: 'pavilion', position: [-65, 14, -72], yaw: .2, size: [9, 8, 13], variant: 2 },
    { id: 'shore.ionic', kind: 'ionic-column', position: [18, 1.7, 31], yaw: .08, size: [1.4, 8, 1.4], variant: 0 },
    { id: 'shore.urn', kind: 'urn', position: [17.1, 1.7, 30], yaw: -.25, size: [.85, 1.25, .85], variant: 0 },
    ...REFERENCE_STAIR_PLACEMENTS,
    REFERENCE_SHORE_APPROACH.bridge,
    { id: 'grove.bridge', kind: 'bridge', position: [4.5, 14.6, -16], yaw: 0, size: [7, 2.5, 2.4], variant: 0 },
    REFERENCE_SPRING_SHRINE.placement,
    { id: 'grove.oath', kind: 'stele', position: [-3, 12, -5], yaw: -.15, size: [1.15, 1.5, .35], variant: 0 },
    { id: 'shore.mural', kind: 'mural-frame', position: [14, 4.5, 5], yaw: -.5, size: [3.5, 2.6, .7], variant: 0 },
    { id: 'valve.north', kind: 'valve-plinth', position: [-.5, 13.65, -12], yaw: 0, size: [.9, 1.0, .9], variant: 0 },
    { id: 'valve.south', kind: 'valve-plinth', position: [10, 14.2, -18], yaw: 0, size: [.9, 1.0, .9], variant: 1 },
    { id: 'valve.west', kind: 'valve-plinth', position: [20, 18.81, -25], yaw: 0, size: [.9, 1.0, .9], variant: 2 },
  ],
  nature: [
    { id: 'olive.coast-frame', kind: 'olive-hero', position: [3, 1.5, 35], yaw: .3, size: [12, 15, 14], variant: 0 },
    { id: 'olive.grove-frame', kind: 'olive-hero', position: [-8, 12, -10], yaw: -.3, size: [16, 14, 14], variant: 1 },
    { id: 'olive.pool-frame', kind: 'olive-hero', position: [5, 1.7, 13], yaw: .4, size: [10, 11, 11], variant: 2 },
    { id: 'olive.terrace', kind: 'olive', position: [8, 19, -30], yaw: .6, size: [8, 8, 7], variant: 3 },
    // C's r5 world-metre landform factory supplies the sanctuary/banks separately.
    { id: 'cliff.cascade', kind: 'cliff', position: cascadeOrigin, yaw: 0, size: [29, 33, 48], variant: 1 },
    { id: 'rocks.pool-bed', kind: 'rock-cluster', position: [29, -1.3, 11], yaw: -.2, size: [16, 2, 12], variant: 4 },
    { id: 'rocks.grove-bed', kind: 'rock-cluster', position: [10, 10.15, -12], yaw: .3, size: [9, 1.5, 8], variant: 6 },
    { id: 'rocks.shore-frame', kind: 'rock-cluster', position: [3, -.3, 35], yaw: .1, size: [12, 4, 11], variant: 5 },
    { id: 'cypress.temple-west', kind: 'cypress', position: [4, 22, -42], yaw: .1, size: [2.4, 17, 2.4], variant: 0 },
    { id: 'cypress.temple-east', kind: 'cypress', position: [28, 22, -40], yaw: -.1, size: [2, 19, 2.2], variant: 1 },
    { id: 'herbs.shore', kind: 'ground-cover', position: [18, 3, 19], yaw: 0, size: [12, 1, 16], variant: 0 },
    { id: 'herbs.grove', kind: 'ground-cover', position: [-4, 12, -12], yaw: 0, size: [13, 1, 15], variant: 1 },
  ],
  water: [
    { id: 'water.sea', kind: 'sea', controlledBySpring: false, outline: REFERENCE_SHORE_APPROACH.seaOutline },
    { id: 'water.pool', kind: 'pool', controlledBySpring: false, outline: [[16, .18, 18], [43, .18, 18], [51, .18, 5], [48, .18, -10], [28, .18, -11], [20, .18, 0]] },
    { id: 'water.grove-pool', kind: 'pool', controlledBySpring: false, outline: REFERENCE_GROVE_POOL.outlineXZ.map(([x, z]) => [x, REFERENCE_GROVE_POOL.level, z] as const) },
    { id: REFERENCE_SACRED_WATER.basin.id, kind: 'pool', controlledBySpring: true, outline: REFERENCE_SACRED_WATER.basin.outline },
    { id: 'water.cascade', kind: 'waterfall', controlledBySpring: false, tiers: [
      { top: upperStart, bottom: upperEnd, width: 2.05 * cascadeScale },
      { top: lowerStart, bottom: lowerEnd, width: 2.45 * cascadeScale },
    ] },
    { id: 'water.cascade-ledge', kind: 'stream', controlledBySpring: false, width: 2.05 * cascadeScale, points: [upperEnd, ledgeMid, lowerStart] },
    REFERENCE_SHORE_APPROACH.outlet,
    REFERENCE_SACRED_WATER.sourceReach,
    { id: 'water.sacred-source-drop', kind: 'waterfall', controlledBySpring: true, tiers: [REFERENCE_SACRED_WATER.upperDrop] },
    { id: 'water.sacred-rill', kind: 'stream', controlledBySpring: true, width: REFERENCE_SACRED_WATER.rill.width, points: REFERENCE_SACRED_WATER.rill.points },
    { id: 'water.sacred-pool-drop', kind: 'waterfall', controlledBySpring: true, tiers: [REFERENCE_SACRED_WATER.lowerDrop] },
  ],
  paths: [
    { id: 'walk.shore-to-sanctuary', width: 2.8, points: [...REFERENCE_SHORE_APPROACH.route, REFERENCE_STAIR_FLIGHTS[0].position, REFERENCE_STAIR_FLIGHTS[0].end, REFERENCE_STAIR_FLIGHTS[1].position, REFERENCE_STAIR_FLIGHTS[1].end, [15, 22, -40]] },
    { id: 'walk.pool-edge', width: 2.6, points: [[13, 2.2, 21.6], [17, 1.5, 21], [24, 1.5, 20]] },
    { id: 'walk.spring', width: REFERENCE_SPRING_BRANCH.width, points: [...REFERENCE_SPRING_BRANCH.sameStepLocalSideExit, ...REFERENCE_SPRING_BRANCH.remaining] },
    { id: 'walk.mural', width: 2.2, points: [[10, 4.5, 8], [14, 4.5, 5]] },
    { id: 'walk.oath', width: 2.2, points: [[-5, 12, 0], [-3, 12, -5], [-4, 13.1, -9]] },
  ],
  discoveries: [
    { id: 'greek.coast.navigator', position: [16, 1.7, 29], radius: 2.8 },
    { id: 'greek.coast.tide-mural', position: [13, 4.5, 6], radius: 2.8 },
    { id: 'greek.grove.olive-oath', position: [-3, 12, -5], radius: 2.8 },
    { id: 'greek.grove.spring-restored', position: [23, 18, -25], radius: 3.0 },
    { id: 'greek.temple.first-light', position: [15, 22, -40], radius: 3.0 },
  ],
  valves: [
    { id: 'valve.north', position: [-.5, 13.65, -12], radius: 2.3 },
    { id: 'valve.south', position: [10, 14.2, -18], radius: 2.3 },
    { id: 'valve.west', position: [20, 18.81, -25], radius: 2.3 },
  ],
  gate: { position: [15, 22, -27.7], yaw: 0, size: [3.2, 5.8, .6] },
} as const satisfies ReferenceLayout;
