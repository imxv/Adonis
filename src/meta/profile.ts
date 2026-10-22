export type * from './types';
export { META_LIMITS, PLANTS, PLANT_IDS, SUPPLIES, SUPPLY_IDS } from './catalog';

// The public API is synchronous. Attach preparation to a NEW in-memory run,
// apply it once, then save preparation + modified stats in one main-run snapshot.
// The meta and main-run storage keys do not form an atomic cross-key transaction.
export { loadProfile, settleRun, claimDiscovery, prepareRun, plantSeed, harvestPlant, craftSupply, packSupply, subscribeProfile } from './service';
