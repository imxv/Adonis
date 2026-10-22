import type { RecipeId } from '../../meta/life';
import type { SupplyId } from '../../meta/profile';

export const KITCHEN_WORLD = { width: 960, height: 640 } as const;
export const KITCHEN_STATIONS = [
  { id: 'shelf', name: '食材架', x: 78, y: 178, width: 174, height: 150, approach: { x: 286, y: 370 } },
  { id: 'stove', name: '暖火灶台', x: 386, y: 208, width: 224, height: 134, approach: { x: 500, y: 390 } },
  { id: 'recipes', name: '家常食谱', x: 156, y: 410, width: 160, height: 78, approach: { x: 344, y: 514 } },
  { id: 'bag', name: '出征行囊', x: 686, y: 388, width: 172, height: 112, approach: { x: 646, y: 518 } },
  { id: 'exit', name: '返回画廊', x: 410, y: 578, width: 140, height: 60, approach: { x: 480, y: 558 } },
] as const;
export const KITCHEN_SPAWN = { x: 480, y: 482 } as const;
export const KITCHEN_WALK_BOUNDS = { minX: 64, maxX: 896, minY: 350, maxY: 570 } as const;
export type KitchenTargetId = typeof KITCHEN_STATIONS[number]['id'];
export type KitchenPoint = { x: number; y: number };
export interface KitchenSceneState {
  player: KitchenPoint & { facing: 'left' | 'right'; walking: boolean };
  target: KitchenTargetId | null;
  destination: KitchenPoint | null;
  selectedRecipe: RecipeId;
  packedSupply: SupplyId | null;
  celebration: { recipe: RecipeId; elapsed: number } | null;
  elapsed: number;
  reducedMotion: boolean;
}
export interface KitchenPixelRenderer {
  draw(ctx: CanvasRenderingContext2D, state: KitchenSceneState): void;
  dispose(): void;
}

export interface KitchenIngredientView { name: string; source: string; required: number; current: number }
export interface KitchenRecipeView {
  id: RecipeId; name: string; description: string; outputName: string; outputCount: number;
  stock: number; capacity: number; ingredients: KitchenIngredientView[];
  additionalRewards: { name: string; count: number; current: number; capacity: number }[];
  available: boolean; full: boolean; status: string;
}
export type KitchenPanelId = 'shelf' | 'stove' | 'recipes' | 'bag';
export interface KitchenViewState {
  recipes: KitchenRecipeView[];
  selectedId: RecipeId;
  panel: KitchenPanelId | null;
  readOnly: boolean;
  warning: string | null;
  sessionOnly: boolean;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  near: { id: KitchenTargetId; name: string } | null;
  fishCount: number;
  supplies: { id: SupplyId; name: string; description: string; count: number; capacity: number }[];
  packedSupply: SupplyId | null;
  inventory: { name: string; source: string; count: number; capacity: number }[];
}
