export type PlantId = 'olive' | 'laurel' | 'iris';
export type SupplyId = 'olive-draught' | 'laurel-thread' | 'iris-vial';
export interface SupplyEffect { maxHpBonus: number; pickupRadiusMultiplier: number; dashCooldownMultiplier: number }
export interface PreparedRun { runId: string; supply: SupplyId | null; effect: SupplyEffect; assisted: boolean }
export interface RunSummary { runId: string; victory: boolean; floor: number; kills: number; elapsedSeconds: number }
export interface GardenBed { plant: PlantId; plantedAt: number }
export interface MetaProfile {
  version: 2;
  fragments: number;
  growth: number;
  seeds: Record<PlantId, number>;
  produce: Record<PlantId, number>;
  supplies: Record<SupplyId, number>;
  packedSupply: SupplyId | null;
  beds: (GardenBed | null)[];
  discoveries: string[];
  settledRuns: string[];
  preparedRuns: PreparedRun[];
  life: LifeProgress;
}
export type StorageState = 'saved' | 'memory' | 'recovered' | 'unsupported' | 'busy';
export interface ProfileState { profile: MetaProfile; storage: StorageState; warning: string | null }
export type MetaFailure = 'invalid' | 'capacity' | 'occupied' | 'empty' | 'not-ready' | 'insufficient' | 'unavailable';
export interface MetaResult extends ProfileState { applied: boolean; duplicate: boolean; reason?: MetaFailure }
export interface SettlementResult extends MetaResult { reward: { fragments: number; growth: number; seeds: number } }
export interface PreparationResult extends MetaResult { prepared: PreparedRun | null }
import type { LifeProgress } from './life-catalog';

