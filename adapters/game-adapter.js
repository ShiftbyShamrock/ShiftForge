/**
 * @fileoverview SHIFT Card → Game Runtime Format Adapter
 *
 * Transforms full SHIFT Card JSON into a minimal, optimized runtime
 * representation for the game engine.  All visual, NFT, provenance, and
 * editorial metadata is stripped; only mechanically relevant fields are
 * retained.
 *
 * Also provides utilities for building O(1) card indexes, minimal deck
 * manifests, and hero stat calculations at arbitrary levels.
 *
 * @module game-adapter
 * @version 1.0.0
 */

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Safely deep-clone a JSON-serializable value.
 *
 * @param {*} val
 * @returns {*}
 */
function clone(val) {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val));
}

/**
 * Extract only the ability ID (or name as fallback) from an ability object.
 * Used to flatten level progression ability references for a lookup-table model.
 *
 * @param {Object} ability - An ability object from the schema.
 * @returns {string} Ability ID (UUID) or name string.
 */
function abilityRef(ability) {
  if (!ability) return '';
  return ability.id || ability.name || '';
}

/**
 * Flatten a hero's `levelProgression` entry to use ability ID references
 * instead of full ability objects.
 *
 * @param {Object} progression - A single level progression entry.
 * @returns {Object} Flattened progression entry.
 */
function flattenProgression(progression) {
  if (!progression) return progression;

  const flat = {
    level: progression.level,
    xpRequired: progression.xpRequired,
  };

  if (progression.statsBonus) {
    flat.statsBonus = clone(progression.statsBonus);
  }

  if (Array.isArray(progression.abilitiesUnlocked) && progression.abilitiesUnlocked.length > 0) {
    flat.abilitiesUnlocked = progression.abilitiesUnlocked.map(abilityRef);
  }

  return flat;
}

/**
 * Process heroData for the runtime format.
 * - Keeps baseLevel, maxLevel
 * - Flattens levelProgression ability references to IDs only
 * - Retains full baseAbilities (needed at runtime)
 *
 * @param {Object} heroData - Full heroData from the SHIFT Card.
 * @returns {Object} Runtime heroData.
 */
function processHeroData(heroData) {
  if (!heroData) return undefined;

  /** @type {Object} */
  const runtime = {
    baseLevel: heroData.baseLevel,
    maxLevel: heroData.maxLevel,
  };

  if (Array.isArray(heroData.baseAbilities)) {
    runtime.baseAbilities = clone(heroData.baseAbilities);
  }

  if (Array.isArray(heroData.levelProgression)) {
    runtime.levelProgression = heroData.levelProgression.map(flattenProgression);
  }

  return runtime;
}

/**
 * Process monsterData for the runtime format.
 * Retains all fields since they are all mechanically relevant.
 *
 * @param {Object} monsterData
 * @returns {Object|undefined}
 */
function processMonsterData(monsterData) {
  if (!monsterData) return undefined;
  return clone(monsterData);
}

/**
 * Process artifactData for the runtime format.
 * Retains all fields.
 *
 * @param {Object} artifactData
 * @returns {Object|undefined}
 */
function processArtifactData(artifactData) {
  if (!artifactData) return undefined;
  return clone(artifactData);
}

/**
 * Process shiftData for the runtime format.
 * Retains all fields.
 *
 * @param {Object} shiftData
 * @returns {Object|undefined}
 */
function processShiftData(shiftData) {
  if (!shiftData) return undefined;
  return clone(shiftData);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Export: toGameRuntime
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RuntimeCard
 * @property {string}  id        - Card UUID.
 * @property {string}  name      - Card name.
 * @property {string}  cardType  - "hero" | "monster" | "artifact" | "shift_spell".
 * @property {string}  [affinity]  - Card affinity.
 * @property {string}  rarity    - Rarity tier.
 * @property {string}  setCode   - Short set code (e.g. "GEN").
 * @property {string}  rulesText - Full rules text.
 * @property {Array<string>} [keywords] - Keyword abilities.
 * @property {Object}  [stats]   - { attack, defense, hp }.
 * @property {Object}  [heroData]     - Processed hero data.
 * @property {Object}  [monsterData]  - Processed monster data.
 * @property {Object}  [artifactData] - Processed artifact data.
 * @property {Object}  [shiftData]    - Processed shift spell data.
 * @property {Object}  [legality]     - Format legality map.
 * @property {Object}  [deckLimits]   - Deck construction limits.
 */

/**
 * Transform a full SHIFT Card JSON object into an optimized game runtime
 * representation.
 *
 * **Stripped fields:** images, animation, edition, nft, provenance, artist,
 * flavorText, tags, meta, set.id, set.name (set.code is kept as `setCode`).
 *
 * **Retained fields:** id, name, cardType, affinity, rarity, stats, rulesText,
 * keywords, heroData (flattened), monsterData, artifactData, shiftData,
 * legality, deckLimits.
 *
 * @param {Object} shiftCard - A valid SHIFT Card JSON object (schema v1.0.0).
 * @returns {RuntimeCard} Optimized runtime card object.
 * @throws {TypeError} If input is falsy or missing required fields.
 *
 * @example
 * import { toGameRuntime } from './game-adapter.js';
 * const rt = toGameRuntime(fullCard);
 * // rt has only mechanically relevant fields, ready for the game engine.
 */
export function toGameRuntime(shiftCard) {
  if (!shiftCard || typeof shiftCard !== 'object') {
    throw new TypeError('toGameRuntime requires a valid SHIFT Card object.');
  }
  if (!shiftCard.id || !shiftCard.cardType) {
    throw new TypeError('SHIFT Card must have "id" and "cardType" fields.');
  }

  /** @type {RuntimeCard} */
  const runtime = {
    id: shiftCard.id,
    name: shiftCard.name || '',
    cardType: shiftCard.cardType,
    rarity: shiftCard.rarity || 'common',
    rulesText: shiftCard.rulesText || '',
  };

  // ── Optional core fields ──────────────────────────────────────────────
  if (shiftCard.affinity) runtime.affinity = shiftCard.affinity;
  if (shiftCard.set?.code) runtime.setCode = shiftCard.set.code;

  // ── Keywords ──────────────────────────────────────────────────────────
  if (Array.isArray(shiftCard.keywords) && shiftCard.keywords.length > 0) {
    runtime.keywords = [...shiftCard.keywords];
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  if (shiftCard.stats) {
    runtime.stats = {
      attack: shiftCard.stats.attack ?? 0,
      defense: shiftCard.stats.defense ?? 0,
      hp: shiftCard.stats.hp ?? 1,
    };
  }

  // ── Type-specific data ────────────────────────────────────────────────
  const heroData = processHeroData(shiftCard.heroData);
  if (heroData) runtime.heroData = heroData;

  const monsterData = processMonsterData(shiftCard.monsterData);
  if (monsterData) runtime.monsterData = monsterData;

  const artifactData = processArtifactData(shiftCard.artifactData);
  if (artifactData) runtime.artifactData = artifactData;

  const shiftData = processShiftData(shiftCard.shiftData);
  if (shiftData) runtime.shiftData = shiftData;

  // ── Legality & Deck Limits ────────────────────────────────────────────
  if (shiftCard.legality && Object.keys(shiftCard.legality).length > 0) {
    runtime.legality = clone(shiftCard.legality);
  }

  if (shiftCard.deckLimits && Object.keys(shiftCard.deckLimits).length > 0) {
    runtime.deckLimits = clone(shiftCard.deckLimits);
  }

  return runtime;
}

// ──────────────────────────────────────────────────────────────────────────────
// Card Index
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build an O(1) lookup index from an array of SHIFT Cards.
 *
 * Each card is transformed via {@link toGameRuntime} before being stored.
 * Duplicate IDs are silently overwritten (last card wins).
 *
 * @param {Array<Object>} shiftCards - Array of SHIFT Card JSON objects.
 * @returns {Map<string, RuntimeCard>} Map keyed by card `id`.
 * @throws {TypeError} If input is not an array.
 *
 * @example
 * import { toGameCardIndex } from './game-adapter.js';
 * const index = toGameCardIndex(allCards);
 * const card = index.get('550e8400-e29b-41d4-a716-446655440000');
 */
export function toGameCardIndex(shiftCards) {
  if (!Array.isArray(shiftCards)) {
    throw new TypeError('toGameCardIndex requires an array of SHIFT Card objects.');
  }

  /** @type {Map<string, RuntimeCard>} */
  const index = new Map();

  for (const card of shiftCards) {
    try {
      const runtime = toGameRuntime(card);
      index.set(runtime.id, runtime);
    } catch {
      // Skip invalid cards — log in production
      continue;
    }
  }

  return index;
}

// ──────────────────────────────────────────────────────────────────────────────
// Deck Manifest
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DeckManifestEntry
 * @property {string} id       - Card UUID.
 * @property {string} name     - Card name.
 * @property {string} cardType - Card type.
 * @property {number} count    - Number of copies in the deck.
 */

/**
 * Build a minimal deck manifest from an array of SHIFT Cards.
 *
 * Duplicate cards (same `id`) are collapsed into a single entry with an
 * incremented `count`.  The result is sorted by cardType then name.
 *
 * @param {Array<Object>} shiftCards - Array of SHIFT Card JSON objects
 *   representing the contents of a deck (may include duplicates).
 * @returns {Array<DeckManifestEntry>} Sorted deck list.
 * @throws {TypeError} If input is not an array.
 *
 * @example
 * import { toGameDeckManifest } from './game-adapter.js';
 * const manifest = toGameDeckManifest(deckCards);
 * // → [{ id: '...', name: 'Shadow Knight', cardType: 'hero', count: 2 }, ...]
 */
export function toGameDeckManifest(shiftCards) {
  if (!Array.isArray(shiftCards)) {
    throw new TypeError('toGameDeckManifest requires an array of SHIFT Card objects.');
  }

  /** @type {Map<string, DeckManifestEntry>} */
  const entries = new Map();

  for (const card of shiftCards) {
    if (!card?.id) continue;

    if (entries.has(card.id)) {
      entries.get(card.id).count += 1;
    } else {
      entries.set(card.id, {
        id: card.id,
        name: card.name || 'Unknown',
        cardType: card.cardType || 'unknown',
        count: 1,
      });
    }
  }

  // Sort: cardType ascending, then name ascending
  const TYPE_ORDER = { hero: 0, monster: 1, artifact: 2, shift_spell: 3 };
  return [...entries.values()].sort((a, b) => {
    const typeA = TYPE_ORDER[a.cardType] ?? 99;
    const typeB = TYPE_ORDER[b.cardType] ?? 99;
    if (typeA !== typeB) return typeA - typeB;
    return a.name.localeCompare(b.name);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Hero Stats Calculator
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ComputedStats
 * @property {number} attack  - Total attack at the requested level.
 * @property {number} defense - Total defense at the requested level.
 * @property {number} hp      - Total HP at the requested level.
 * @property {number} level   - The effective level (clamped to baseLevel–maxLevel).
 */

/**
 * Calculate a hero's total combat stats at a given level by summing base stats
 * with all applicable level progression bonuses.
 *
 * If the card is not a hero or lacks stats/heroData, the function returns
 * the base stats (or zeroes) with `level: 0` to indicate no progression
 * was applied.
 *
 * The requested level is clamped to `[heroData.baseLevel, heroData.maxLevel]`.
 *
 * @param {RuntimeCard} runtimeCard - A runtime card object (from toGameRuntime).
 * @param {number}      level       - Desired level to compute stats for.
 * @returns {ComputedStats} Computed stats at the given level.
 *
 * @example
 * import { toGameRuntime, calculateHeroStatsAtLevel } from './game-adapter.js';
 * const rt = toGameRuntime(shadowKnight);
 * const lv3 = calculateHeroStatsAtLevel(rt, 3);
 * // → { attack: 7, defense: 4, hp: 20, level: 3 }
 */
export function calculateHeroStatsAtLevel(runtimeCard, level) {
  // ── Guard: non-hero or missing data ──────────────────────────────────
  if (!runtimeCard || runtimeCard.cardType !== 'hero' || !runtimeCard.heroData) {
    return {
      attack: runtimeCard?.stats?.attack ?? 0,
      defense: runtimeCard?.stats?.defense ?? 0,
      hp: runtimeCard?.stats?.hp ?? 1,
      level: 0,
    };
  }

  const hd = runtimeCard.heroData;

  // Clamp to valid range
  const effectiveLevel = Math.max(
    hd.baseLevel ?? 1,
    Math.min(level, hd.maxLevel ?? level),
  );

  // Start from base stats
  let attack = runtimeCard.stats?.attack ?? 0;
  let defense = runtimeCard.stats?.defense ?? 0;
  let hp = runtimeCard.stats?.hp ?? 1;

  // Accumulate bonuses from each level progression entry up to effectiveLevel
  if (Array.isArray(hd.levelProgression)) {
    for (const prog of hd.levelProgression) {
      if (prog.level <= effectiveLevel && prog.statsBonus) {
        attack += prog.statsBonus.attack ?? 0;
        defense += prog.statsBonus.defense ?? 0;
        hp += prog.statsBonus.hp ?? 0;
      }
    }
  }

  return { attack, defense, hp, level: effectiveLevel };
}

// ──────────────────────────────────────────────────────────────────────────────
// Self-test (run directly: node game-adapter.js)
// ──────────────────────────────────────────────────────────────────────────────

/*
 * Uncomment and run to verify:
 *
 * const sampleHero = {
 *   schemaVersion: '1.0.0',
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   printId: '550e8400-e29b-41d4-a716-446655440001',
 *   name: 'Shadow Knight',
 *   slug: 'shadow-knight',
 *   cardType: 'hero',
 *   affinity: 'shadow',
 *   rarity: 'epic',
 *   rulesText: 'When Shadow Knight levels up, deal 2 damage to all enemies.',
 *   flavorText: 'The darkness is his blade.',
 *   keywords: ['haste', 'lifesteal'],
 *   stats: { attack: 5, defense: 3, hp: 20 },
 *   heroData: {
 *     baseLevel: 1,
 *     maxLevel: 5,
 *     baseAbilities: [
 *       { id: 'ab-001', name: 'Shadow Strike', type: 'activated', description: 'Deal 3 shadow damage.' },
 *     ],
 *     levelProgression: [
 *       {
 *         level: 2, xpRequired: 100,
 *         statsBonus: { attack: 1 },
 *         abilitiesUnlocked: [{ id: 'ab-002', name: 'Dark Veil', type: 'passive', description: 'Gain stealth.' }],
 *       },
 *       {
 *         level: 3, xpRequired: 250,
 *         statsBonus: { attack: 1, defense: 1 },
 *         abilitiesUnlocked: [],
 *       },
 *       {
 *         level: 4, xpRequired: 500,
 *         statsBonus: { hp: 5 },
 *         abilitiesUnlocked: [{ id: 'ab-003', name: 'Umbral Slash', type: 'activated', description: 'AoE 4 damage.' }],
 *       },
 *       {
 *         level: 5, xpRequired: 1000,
 *         statsBonus: { attack: 3, defense: 2, hp: 10 },
 *         abilitiesUnlocked: [{ id: 'ab-004', name: 'Shadow Form', type: 'triggered', description: 'Become invulnerable for 1 turn.' }],
 *       },
 *     ],
 *   },
 *   set: { id: '00000000-0000-0000-0000-000000000001', code: 'GEN', name: 'Genesis' },
 *   collectorNumber: '042/250',
 *   artist: 'Jane Doe',
 *   images: { medium: 'https://cdn.shift.gg/cards/shadow-knight.png' },
 *   nft: { chain: 'solana' },
 *   legality: { standard: 'legal', legacy: 'legal' },
 *   deckLimits: { maxCopies: 2 },
 *   createdAt: '2025-01-01T00:00:00Z',
 *   updatedAt: '2025-06-01T00:00:00Z',
 * };
 *
 * console.log('=== Runtime Card ===');
 * const rt = toGameRuntime(sampleHero);
 * console.log(JSON.stringify(rt, null, 2));
 *
 * console.log('\n=== Stats at Level 3 ===');
 * console.log(calculateHeroStatsAtLevel(rt, 3));
 * // → { attack: 7, defense: 4, hp: 20, level: 3 }
 *
 * console.log('\n=== Stats at Level 5 (Max) ===');
 * console.log(calculateHeroStatsAtLevel(rt, 5));
 * // → { attack: 10, defense: 6, hp: 35, level: 5 }
 *
 * console.log('\n=== Card Index ===');
 * const index = toGameCardIndex([sampleHero]);
 * console.log('Index size:', index.size);
 *
 * console.log('\n=== Deck Manifest ===');
 * const manifest = toGameDeckManifest([sampleHero, sampleHero, sampleHero]);
 * console.log(JSON.stringify(manifest, null, 2));
 * // → [{ id: '...', name: 'Shadow Knight', cardType: 'hero', count: 3 }]
 */
