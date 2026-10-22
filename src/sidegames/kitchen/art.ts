/** Small, original inline illustrations. Decorative; no asset or render loop. */
export function kitchenDishArt(index: number, compact = false): string {
  const colors = [
    ['#aa7652', '#9da572', '#dfc48c'],
    ['#9b8160', '#b7b674', '#d7b66b'],
    ['#867891', '#b1a9cb', '#d8bd9b'],
  ][index % 3];
  return `<svg class="akitchen-dish-art ${compact ? 'akitchen-dish-art--small' : ''}" viewBox="0 0 280 200" aria-hidden="true" focusable="false">
    <ellipse cx="140" cy="168" rx="102" ry="14" fill="#171d1b" opacity=".42"/>
    <path d="M57 111h166l-19 38c-9 18-119 18-128 0z" fill="#a27856"/>
    <path d="M76 132c24 13 103 20 138-3l-10 20c-10 17-119 17-128 0z" fill="#785842"/>
    <ellipse cx="140" cy="111" rx="83" ry="30" fill="#d3bb8b"/>
    <ellipse cx="140" cy="109" rx="72" ry="23" fill="${colors[0]}"/>
    <path d="M104 103c14-17 37-16 54-3l17-4-5 12 4 11-17-5c-21 10-43 3-53-11z" fill="${colors[2]}"/>
    <path d="m125 100 9 11m6-14 9 11" stroke="#a17c4a" stroke-width="2" fill="none"/>
    <circle cx="115" cy="102" r="2" fill="#655039"/>
    <path d="M179 95c4-12 15-16 24-11-5 10-12 13-24 11zm-14 21c5-10 16-11 23-5-6 9-13 9-23 5zm-70 1c-9 0-16-4-18-12 10-3 18 2 18 12z" fill="${colors[1]}"/>
    <path d="M117 75c-13-15 13-20 1-35m24 29c-12-16 13-23 2-40m22 46c-10-12 10-18 3-29" stroke="#dbc89b" stroke-width="3" stroke-linecap="round" fill="none" opacity=".46"/>
    <path d="M93 155c25 9 68 9 94 0" stroke="#c29c6e" stroke-width="2" fill="none"/>
  </svg>`;
}

export const KITCHEN_EMBLEM = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M5 13h22l-4 11H9zM3 13h26M9 8h14M16 5v3M10 27h12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/><path d="m12 11-1-2m10 2 1-2" stroke="currentColor" stroke-width="1.5"/></svg>';
