import type { ArchitecturePlacement, ReferenceVec3 } from './contracts';

/** D-owned metric authority for the r5 terrain/route slice.
 * A/C consume these exact contours and flights; never copy the planning JSON.
 * Main scanned cascade transform/tiers remain in layout.ts and are frozen.
 */
export const REFERENCE_LANDFORM_REVISION = 'v3-reference-r5-grounded-terraces';
/** Visible stone top is 18mm above the analytic foot floor, for both A and D. */
export const REFERENCE_WALK_SURFACE_OFFSET = .018;
/** C bearing stays 14cm below the analytic foot floor, not below the offset top. */
export const REFERENCE_STAIR_GROUND_CLEARANCE = .14;

export const REFERENCE_TERRACE_CONTOURS = [
  {
    "y": 20.9,
    "outlineXZ": [
      [
        3.8,
        -34
      ],
      [
        3.8,
        -29
      ],
      [
        5,
        -27.3
      ],
      [
        11.3,
        -27.2
      ],
      [
        15,
        -27.4
      ],
      [
        20.9,
        -27
      ],
      [
        26.2,
        -28.6
      ],
      [
        26.5,
        -34.8
      ],
      [
        24,
        -37
      ],
      [
        7,
        -37
      ]
    ],
    "constraint": "support A lower base around Y20.98; do not expose a rectangular platform edge"
  },
  {
    "y": 17.7,
    "outlineXZ": [
      [
        1.8,
        -35.6
      ],
      [
        2.4,
        -28.5
      ],
      [
        6.7,
        -25.2
      ],
      [
        10.5,
        -23
      ],
      [
        14.1,
        -22
      ],
      [
        19.4,
        -21
      ],
      [
        24.7,
        -24
      ],
      [
        28,
        -30
      ],
      [
        27.8,
        -35.8
      ],
      [
        22,
        -38
      ],
      [
        7,
        -38
      ]
    ],
    "constraint": "broken natural ledges and steps; no uniform horizontal band around body"
  },
  {
    "y": 14.0,
    "outlineXZ": [
      [
        -1.5,
        -32
      ],
      [
        1,
        -25
      ],
      [
        6,
        -20.2
      ],
      [
        9.5,
        -17.4
      ],
      [
        14.1,
        -16.4
      ],
      [
        18.6,
        -18.8
      ],
      [
        26.8,
        -22
      ],
      [
        29,
        -30
      ],
      [
        28,
        -36
      ]
    ],
    "constraint": "irregular lower toe; keep actual step/landing ground up to tread-.14 where needed"
  }
] as const;

export const REFERENCE_GROVE_POOL = {
  "level": 11.7,
  "outlineXZ": [
    [
      2,
      -14.6
    ],
    [
      4,
      -12
    ],
    [
      6.8,
      -9
    ],
    [
      12.7,
      -9.5
    ],
    [
      16,
      -11.8
    ],
    [
      16.6,
      -15.3
    ],
    [
      14,
      -17.2
    ],
    [
      11,
      -16.5
    ],
    [
      10,
      -14.6
    ],
    [
      7.7,
      -14.4
    ],
    [
      6.6,
      -16.2
    ],
    [
      5.7,
      -18.2
    ],
    [
      3.8,
      -18
    ]
  ],
  "bedYRange": [
    10.5,
    11.3
  ],
  "outerFootTargetXZ": {
    "x": [
      -0.5,
      19
    ],
    "z": [
      -23.5,
      3.5
    ]
  },
  "downhillBlendWidthM": [
    8,
    14
  ],
  "notes": [
    "open a real dry notch at bridge east and north bank, not terrain through water",
    "foot shape is a rounded irregular slope/ridge, not a vertical extruded outline",
    "proposed outline still needs D actual embankment surface and B mask integration"
  ]
} as const;

export const REFERENCE_STAIR_FLIGHTS = [
  {
    "id": "sanctuary.steps.lower",
    "kind": "stairs",
    "position": [
      10.9,
      14.2,
      -18.2
    ],
    "end": [
      19.5,
      17.9,
      -20.3
    ],
    "yaw": -1.3312970608847374,
    "size": [
      3.2,
      3.6999999999999993,
      8.852683209061533
    ],
    "levels": 21,
    "risePerStep": 0.17619047619047615,
    "runPerStep": 0.42155634328864444
  },
  {
    "id": "sanctuary.steps.upper",
    "kind": "stairs",
    "position": [
      20.5,
      17.9,
      -23.8
    ],
    "end": [
      15,
      22,
      -28
    ],
    "yaw": 0.9186249150378268,
    "size": [
      3.2,
      4.100000000000001,
      6.920260110718382
    ],
    "levels": 23,
    "risePerStep": 0.17826086956521744,
    "runPerStep": 0.3008808743790601
  }
] as const;

export const REFERENCE_STAIR_PLACEMENTS = [
  {
    "id": "sanctuary.steps.lower",
    "kind": "stairs",
    "position": [
      10.9,
      14.2,
      -18.2
    ],
    "yaw": -1.3312970608847374,
    "size": [
      3.2,
      3.6999999999999993,
      8.852683209061533
    ],
    "variant": 0
  },
  {
    "id": "sanctuary.steps.upper",
    "kind": "stairs",
    "position": [
      20.5,
      17.9,
      -23.8
    ],
    "yaw": 0.9186249150378268,
    "size": [
      3.2,
      4.100000000000001,
      6.920260110718382
    ],
    "variant": 1
  }
] as const satisfies readonly ArchitecturePlacement[];

export const REFERENCE_STAIR_LANDING = {
  "from": [
    19.5,
    17.9,
    -20.3
  ],
  "to": [
    20.5,
    17.9,
    -23.8
  ],
  "width": 3.2,
  "level": 17.9,
  "outlineXZ": [
    [
      19.12045405662311,
      -21.854331006210117
    ],
    [
      19.528938234620433,
      -22.52837149771723
    ],
    [
      21.471061765379567,
      -25.07162850228277
    ],
    [
      19.87954594337689,
      -18.745668993789884
    ]
  ],
  "minimumBodyRadius": 0.28
} as const;

export const REFERENCE_SPRING_BRANCH = {
  "revision": "r5-spring-route-fix-02",
  "width": 0.76,
  "centerHalfWidth": 0.08,
  // C-only vertical reserve for actual-vs-canonical floors; D walk heights stay unchanged.
  "additionalSupportClearance": 0.16,
  "sameStepLocalSideExit": [
    [
      18.706521739130434,
      19.23695652173913,
      -25.169565217391305
    ],
    [
      20.163114387199787,
      19.23695652173913,
      -27.07700797081546
    ]
  ],
  "remaining": [
    [
      20.8,
      19.23695652173913,
      -27.07700797081546
    ],
    [
      23,
      18,
      -25
    ]
  ],
  "note": "same-step local +X exit, short level outer turn, then shrine rear; allowed centres stay within .08m and C clears this plus .28m body radius; the former [20,18.81,-25] turn re-entered the upper flight, landing and A wall"
} as const;

export const REFERENCE_BRIDGE_EAST_CAUSEWAY = {
  "axis": [
    [
      8.1,
      14.2,
      -16
    ],
    [
      10.9,
      14.2,
      -18.2
    ]
  ],
  "groundCrestY": 14.06,
  "crestWidth": 2.8,
  "footWidthMax": 9,
  "excludeBridgeSpan": {
    "center": [
      4.5,
      14.6,
      -16
    ],
    "localAbsXBelow": 3.6,
    "halfWidth": 1.2
  }
} as const;

export const REFERENCE_SACRED_WATER = {
  "source": [
    24.6,
    20.3,
    -22.8
  ],
  "sourceReach": {
    "id": "water.sacred-spring",
    "kind": "stream",
    "controlledBySpring": true,
    "width": 0.3,
    "points": [
      [
        24.6,
        20.3,
        -22.8
      ],
      [
        24.6,
        20.3,
        -22.72
      ]
    ]
  },
  "upperDrop": {
    "kind": "waterfall",
    "controlledBySpring": true,
    "width": 0.3,
    "top": [
      24.6,
      20.3,
      -22.8
    ],
    "bottom": [
      24.6,
      17.02,
      -21.2
    ]
  },
  "rill": {
    "kind": "stream",
    "controlledBySpring": true,
    "width": 0.4,
    "points": [
      [
        24.6,
        17.02,
        -21.2
      ],
      [
        23,
        16.8,
        -20.8
      ],
      [
        22,
        16.75,
        -20
      ],
      [
        21.5,
        16.6,
        -20
      ],
      [
        21,
        15.48,
        -20
      ],
      [
        19.7,
        14.82,
        -18
      ],
      [
        18.7,
        14.56,
        -16.5
      ],
      [
        17.8,
        14.45,
        -15.9
      ]
    ]
  },
  "lowerDrop": {
    "kind": "waterfall",
    "controlledBySpring": true,
    "width": 0.3,
    "top": [
      17.8,
      14.45,
      -15.9
    ],
    "bottom": [
      16.2,
      11.72,
      -15.2
    ]
  },
  "carrierContacts": {
    "rearDryContact": [
      23,
      17.86,
      -25
    ],
    "frontRockContact": [
      24.6,
      16.48,
      -21.2
    ],
    "foundationDeckY": 18,
    "catchBasinWaterY": 17.02,
    "spillLipLengthM": 1.08,
    "note": "short real arch/deck/abutments; no tall wall to lower ground. Well facade above Y18 is not implemented."
  },
  "validationScope": "candidate static envelope on frozen C, not B final GPU/foam envelope; new D terrain/steps need a new finite check",
  "contacts": {
    "rearDryContact": [
      23,
      17.86,
      -25
    ],
    "frontRockContact": [
      24.6,
      16.48,
      -21.2
    ],
    "foundationDeckY": 18,
    "catchBasinWaterY": 17.02,
    "spillLipLengthM": 1.08,
    "note": "short real arch/deck/abutments; no tall wall to lower ground. Well facade above Y18 is not implemented."
  },
  "basin": {
    "id": "water.sacred-basin",
    "kind": "pool",
    "controlledBySpring": true,
    "center": [
      24.6,
      17.02,
      -21.2
    ],
    "innerDiameter": 1.05,
    "outline": [
      [
        25.105,
        17.02,
        -21.2
      ],
      [
        25.037342828911143,
        17.02,
        -20.947499999999998
      ],
      [
        24.852500000000003,
        17.02,
        -20.762657171088858
      ],
      [
        24.6,
        17.02,
        -20.695
      ],
      [
        24.3475,
        17.02,
        -20.762657171088858
      ],
      [
        24.16265717108886,
        17.02,
        -20.947499999999998
      ],
      [
        24.095000000000002,
        17.02,
        -21.2
      ],
      [
        24.16265717108886,
        17.02,
        -21.4525
      ],
      [
        24.3475,
        17.02,
        -21.63734282891114
      ],
      [
        24.6,
        17.02,
        -21.705
      ],
      [
        24.852500000000003,
        17.02,
        -21.63734282891114
      ],
      [
        25.037342828911143,
        17.02,
        -21.4525
      ]
    ]
  }
} as const;

/** Same mid-tread convention used by the actual visible stair asset. */
export function referenceFlightFloor(flight: (typeof REFERENCE_STAIR_FLIGHTS)[number], x: number, z: number): number | undefined {
  const dx = x - flight.position[0], dz = z - flight.position[2], c = Math.cos(flight.yaw), s = Math.sin(flight.yaw);
  const side = c * dx - s * dz, depth = -(s * dx + c * dz);
  if (Math.abs(side) > flight.size[0] / 2 + 1e-8 || depth < -1e-8 || depth > flight.size[2] + 1e-8) return undefined;
  const index = Math.max(0, Math.min(flight.levels - 1, Math.floor(depth / flight.size[2] * flight.levels)));
  return flight.position[1] + flight.size[1] * (index + .5) / flight.levels;
}
export function referenceFlightStepCenter(flight: (typeof REFERENCE_STAIR_FLIGHTS)[number], index: number): ReferenceVec3 {
  const t = (index + .5) / flight.levels, depth = flight.size[2] * t;
  return [flight.position[0] - Math.sin(flight.yaw) * depth, flight.position[1] + flight.size[1] * t, flight.position[2] - Math.cos(flight.yaw) * depth];
}
export function referenceFlightTreadTop(flight: (typeof REFERENCE_STAIR_FLIGHTS)[number], index: number): number {
  return referenceFlightStepCenter(flight, index)[1] + REFERENCE_WALK_SURFACE_OFFSET;
}

/** Bounded correction of the old high road/sea coincidence; reuse A bridge asset. */
export const REFERENCE_SHORE_APPROACH = {
  "reason": "Old [2,8,3] shared the sea boundary XZ, and grove approach was <1m inland. A narrow walk overlay alone would re-create 8-12m soil walls. Coastline now wraps the broad actual foot; low natural outlet crosses one reused frozen bridge. Main cascade/pool/grove bridge unchanged.",
  "seaOutline": [
    [
      -180,
      0,
      100
    ],
    [
      8,
      0,
      100
    ],
    [
      8,
      0,
      44
    ],
    [
      11,
      0,
      31
    ],
    [
      10,
      0,
      18
    ],
    [
      -8,
      0,
      17
    ],
    [
      -22,
      0,
      8
    ],
    [
      -30,
      0,
      -1
    ],
    [
      -31,
      0,
      -12
    ],
    [
      -28,
      0,
      -30
    ],
    [
      -24,
      0,
      -45
    ],
    [
      -34,
      0,
      -67
    ],
    [
      -180,
      0,
      -100
    ]
  ],
  "outlet": {
    "id": "water.outlet",
    "kind": "stream",
    "controlledBySpring": false,
    "width": 2.4,
    "points": [
      [
        17.8,
        0.18,
        16.5
      ],
      [
        13,
        0.1,
        18
      ],
      [
        8.8,
        0,
        19.6
      ]
    ]
  },
  "bridge": {
    "id": "shore.outlet-bridge",
    "kind": "bridge",
    "position": [
      13,
      2.6,
      18
    ],
    "yaw": 1.5707963267948966,
    "size": [
      7,
      2.5,
      2.4
    ],
    "variant": 1
  },
  "route": [
    [
      11,
      1.5,
      43
    ],
    [
      17,
      2,
      28
    ],
    [
      13,
      2.2,
      21.6
    ],
    [
      13,
      2.6,
      18
    ],
    [
      13,
      2.2,
      14.4
    ],
    [
      10,
      4.5,
      8
    ],
    [
      2,
      8,
      3
    ],
    [
      -5,
      12,
      0
    ],
    [
      -4,
      13.1,
      -9
    ],
    [
      0.9,
      14.2,
      -16
    ],
    [
      4.5,
      14.6,
      -16
    ],
    [
      8.1,
      14.2,
      -16
    ]
  ],
  "channelBedY": -0.4,
  "outletMouthContacts": {
    "poolMouth": [
      17.8,
      0.18,
      16.5
    ],
    "seaMouth": [
      8.8,
      0,
      19.6
    ],
    "width": 2.4,
    "requiredFullWidthOverlapM": 0.3,
    "reason": "r5 first candidate touched main pool only at one corner and sea at half width; ends now sit inside actual frozen pool/new sea with full width and overlap, water levels unchanged"
  }
} as const;

/** Actual D carrier frame; A consumes it for the compact high source facade. */
export const REFERENCE_SPRING_SHRINE = {
  "placement": {
    "id": "grove.spring",
    "kind": "spring-shrine",
    "position": [
      23,
      18,
      -25
    ],
    "yaw": 0.39922076957525304,
    "size": [
      1.72,
      2.8,
      3.473110997362451
    ],
    "variant": 0
  },
  "frame": {
    "origin": [
      23,
      18,
      -25
    ],
    "front": [
      24.35,
      18,
      -21.8
    ],
    "yaw": 0.39922076957525304,
    "width": 1.72,
    "length": 3.473110997362451,
    "deckY": 18,
    "localRange": {
      "x": [
        -0.86,
        0.86
      ],
      "z": [
        0,
        3.473110997362451
      ]
    },
    "supportPolygon": [
      [
        22.207626821575836,
        18,
        -24.665717565352306
      ],
      [
        23.792373178424164,
        18,
        -25.334282434647694
      ],
      [
        25.142373178424165,
        18,
        -22.134282434647695
      ],
      [
        23.557626821575838,
        18,
        -21.465717565352307
      ]
    ]
  },
  "spout": {
    "world": [
      24.6,
      20.3,
      -22.8
    ],
    "local": [
      0.6190415456438776,
      2.3000000000000007,
      2.648921962755196
    ],
    "worldDirection": [
      0,
      0,
      1
    ],
    "localDirection": [
      -0.3887005054042955,
      0,
      0.9213641609583288
    ],
    "mouthWidth": 0.3,
    "localWidthDirection": [
      0.9213641609583288,
      0,
      0.3887005054042955
    ]
  },
  "access": {
    "rearClearLength": 1.05,
    "facadeLocalZRange": [
      1.05,
      3.473110997362451
    ],
    "rearArrivalWorld": [
      23,
      18,
      -25
    ],
    "minimumBodyRadius": 0.28,
    "note": "Keep at least the rear 1.05m free of facade/props so the existing valve and discovery path arrive from the dry side."
  },
  "constraints": [
    "A uses this actual short carrier frame, never the old 6x6x4 placeholder.",
    "Do not enlarge or move D bearing, fixed source, basin, rill or any main cascade point.",
    "Spout is world +Z, not carrier local +Z; it sits only .24096m from local right edge.",
    "A publishes grove.spring.spout in world metres for D matching."
  ]
} as const;
