/** One shared source for authored geometry and its collision envelope. Metres, front +Z. */
export function templeProportions(size: readonly [number, number, number]) {
  const [width, height, depth] = size;
  const d = Math.min(width / 18.2, height / 13.8);
  const columnDiameter = d * 1.08, columnHeight = d * 8.6;
  const columnX = width / 2 - d * 1.9, frontZ = depth / 2 - d * 1.1;
  const wallX = width * .28, wallFront = frontZ - d * 4, wallBack = -depth / 2 + d * 2.7;
  const eave = columnHeight + d * 1.29, rise = Math.max(width * .155, height - eave - .55 * d);
  return {
    d, columnDiameter, columnHeight, columnX, frontZ, backZ: -frontZ,
    frontColumns: 4, sideRows: 8, wallX, wallFront, wallBack,
    wallHeight: columnHeight - d * .25, wallThickness: d * .65,
    doorHalfWidth: d * 1.72, doorHeight: d * 5.8, eave, rise,
  } as const;
}
