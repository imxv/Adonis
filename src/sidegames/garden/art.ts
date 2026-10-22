import type { PlantId, SupplyId } from '../../meta/types';

// Original local SVG artwork. No external images, fonts, or rendering runtime.
const leaf = (x: number, y: number, rotate: number, color: string, size = 1) =>
  `<path d="M0 0Q-21-19 0-39Q18-17 0 0Z" fill="${color}" transform="translate(${x} ${y}) rotate(${rotate}) scale(${size})"/><path d="M0-3V-31" fill="none" stroke="#f1e5b2" opacity=".22" transform="translate(${x} ${y}) rotate(${rotate}) scale(${size})"/>`;

function oliveArt(ready: boolean): string {
  if (!ready) return `<path d="M119 151q-2-29 5-52" stroke="#8c9662" stroke-width="5" fill="none"/>${leaf(121, 126, -56, '#a8c8a2', .7)}${leaf(123, 108, 50, '#789a7a', .65)}${leaf(122, 101, -5, '#b8cda6', .5)}`;
  return `<path d="M119 151q-1-37 3-80m-1 45L84 81m38 17 35-37m-35 18-18-30" stroke="#8a8b59" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${leaf(118, 139, -58, '#8eae8e', 1)}${leaf(124, 127, 57, '#bfd0ac', .94)}${leaf(101, 98, -58, '#a3bea0', .9)}${leaf(91, 87, -22, '#6f977c', .83)}${leaf(124, 95, 10, '#b9cfa9', .88)}${leaf(144, 77, 53, '#8faf8b', .86)}${leaf(155, 65, 7, '#c9d3ac', .76)}${leaf(112, 64, -54, '#8ba987', .77)}${leaf(105, 52, -6, '#c0cba0', .67)}
    <g fill="#3f5b62" stroke="#ccd0a0" stroke-width="1"><ellipse cx="94" cy="106" rx="5" ry="8" transform="rotate(-22 94 106)"/><ellipse cx="140" cy="110" rx="5" ry="8" transform="rotate(23 140 110)"/><ellipse cx="151" cy="81" rx="5" ry="8"/></g><g fill="#e0e4bf" opacity=".8"><rect x="91" y="101" width="2" height="4"/><rect x="138" y="105" width="2" height="4"/><rect x="149" y="76" width="2" height="4"/></g>`;
}

function laurelArt(ready: boolean): string {
  if (!ready) return `<path d="M122 151q-10-28-2-49" stroke="#a49757" stroke-width="5" fill="none"/>${leaf(119, 126, -68, '#95ad66', .71)}${leaf(119, 116, 62, '#b3bc70', .7)}${leaf(120, 103, 2, '#cfcc84', .52)}`;
  return `<path d="M120 151q-22-31-27-76m27 72q23-37 25-75m-25 75V66" fill="none" stroke="#a59452" stroke-width="4" stroke-linecap="round"/>
    ${leaf(106, 127, -62, '#7e9854', .96)}${leaf(99, 111, -48, '#b1b871', .93)}${leaf(94, 94, -38, '#d0c383', .85)}${leaf(92, 77, -12, '#b6ba74', .75)}${leaf(131, 129, 62, '#a5b468', 1)}${leaf(138, 112, 49, '#d0c680', .94)}${leaf(143, 94, 38, '#a4b06a', .86)}${leaf(145, 77, 12, '#d9cd88', .75)}${leaf(120, 103, -40, '#9fac61', .81)}${leaf(120, 86, 39, '#d2ca81', .76)}${leaf(120, 68, 0, '#e3d49b', .68)}
    <g fill="#f1d996"><rect x="74" y="78" width="3" height="3"/><rect x="153" y="94" width="3" height="3"/><rect x="122" y="46" width="3" height="3"/></g>`;
}

function irisArt(ready: boolean): string {
  if (!ready) return `<path d="M119 151q-6-27 4-50m-4 50q-16-28-21-34m24 29q14-26 19-32" stroke="#719c85" stroke-width="4" fill="none"/><path d="M124 106q-17-13-5-29 15 4 5 29" fill="#969bd1"/><path d="M123 101q-2-15-4-23" stroke="#d0c2e6" fill="none"/>`;
  return `<path d="M120 151V76m-2 76q-17-27-31-42m36 42q10-39 25-57" stroke="#739a82" stroke-width="4" fill="none"/><path d="M113 153Q78 123 83 94q23 18 30 59m12 0q30-37 31-70-23 21-31 70" fill="#789d8a"/><path d="M120 78q-30-9-31-33 26-10 31 33" fill="#7e83bd"/><path d="M122 77q-8-38 7-46 21 26-7 46" fill="#c5b8de"/><path d="M123 79q18-40 35-28-2 26-35 28" fill="#9a98cc"/><path d="M120 78Q87 68 81 94q14 26 39-16" fill="#b2a9d7"/><path d="M121 80q28-10 37 9-8 33-37-9" fill="#777ab4"/><path d="M120 78q-18 16-7 40 25-1 7-40" fill="#a49bd2"/><path d="M119 80q-10 11-6 24m11-25q11 6 18 12" fill="none" stroke="#e7cc81" stroke-width="3" stroke-linecap="round"/><path d="m169 46 2-7 2 7 7 2-7 2-2 7-2-7-7-2Z" fill="#d6d2e3"/><rect x="75" y="66" width="3" height="3" fill="#d6d2e3"/>`;
}

export function plantArt(plant: PlantId | null, ready: boolean, id: string): string {
  const plantMarkup = plant === 'olive' ? oliveArt(ready) : plant === 'laurel' ? laurelArt(ready) : plant === 'iris' ? irisArt(ready) : '';
  const dots = `<g fill="#d0b97c" opacity=".4"><rect x="54" y="124" width="2" height="2"/><rect x="181" y="85" width="2" height="2"/><rect x="59" y="65" width="2" height="2"/></g>`;
  return `<svg viewBox="0 0 240 204" class="agarden-plant-art" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}-arch" x2="0" y2="1"><stop stop-color="#193b37"/><stop offset="1" stop-color="#284c40"/></linearGradient><linearGradient id="${id}-pot" x2="1" y2="1"><stop stop-color="#ca936a"/><stop offset=".5" stop-color="#ad7253"/><stop offset="1" stop-color="#805543"/></linearGradient></defs>
    <path d="M43 175V88a77 77 0 0 1 154 0v87Z" fill="url(#${id}-arch)"/><path d="M48 169V88a72 72 0 0 1 144 0v81" fill="none" stroke="#8c9665" opacity=".4"/><circle cx="120" cy="80" r="47" fill="none" stroke="#b6ad78" opacity=".12"/>${dots}<ellipse cx="120" cy="183" rx="67" ry="9" fill="#071d1c" opacity=".35"/>
    <path d="m84 149 8 30q27 15 56 0l8-30" fill="url(#${id}-pot)"/><path d="M84 157q36 10 72 0m-66 14q29 10 60 0" fill="none" stroke="#ecc18c" stroke-width="2" opacity=".45"/><ellipse cx="120" cy="150" rx="38" ry="9" fill="#d29c70"/><ellipse cx="120" cy="149" rx="32" ry="6" fill="#53483a"/><g class="agarden-foliage">${plantMarkup}</g>
    ${plant ? '' : '<path d="M110 141q9-14 20 0m-10 0v-14" stroke="#b9bd8d" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>'}<path d="m99 159 4 4-4 4-4-4Zm21 3 4 4-4 4-4-4Zm21-3 4 4-4 4-4-4Z" fill="#e7c694" opacity=".55"/></svg>`;
}

export function supplyArt(supply: SupplyId): string {
  const content = supply === 'laurel-thread'
    ? `<path d="M20 35q-13-4-10-17m18 17q13-4 10-17" stroke="#c6b46b" stroke-width="2" fill="none"/>${leaf(17, 31, -54, '#a9b474', .23)}${leaf(12, 25, -36, '#c8be7b', .23)}${leaf(11, 19, -10, '#d9c78a', .23)}${leaf(31, 31, 54, '#b4b977', .23)}${leaf(36, 25, 36, '#d0c482', .23)}${leaf(37, 19, 10, '#d9c78a', .23)}<path d="m20 35 4 3 4-3-4-3Z" fill="#dbc58a"/>`
    : `<path d="M20 11h8v9q9 5 8 15-12 6-24 0-1-10 8-15Z" fill="${supply === 'olive-draught' ? '#87ad97' : '#9d9ecb'}" stroke="#d8cfac" stroke-width="1.4"/><path d="M15 29q9 4 18 0v5q-9 4-18 0Z" fill="${supply === 'olive-draught' ? '#d6cd8c' : '#d0c0e2'}" opacity=".7"/><path d="M21 21q-6 5-5 11" stroke="#fff4d6" stroke-width="2" opacity=".5" fill="none"/><path d="M19 10h10v5H19Z" fill="#b79265"/><path d="m24 23 2 4-2 4-2-4Z" fill="#f1dfae"/>`;
  return `<svg viewBox="0 0 48 48" class="agarden-supply-art" aria-hidden="true" focusable="false">${content}</svg>`;
}
