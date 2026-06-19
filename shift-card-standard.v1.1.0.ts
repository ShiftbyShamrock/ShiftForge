/**
 * SHIFT Card JSON Standard v1.1.0 — TypeScript Type Definitions
 *
 * Updated to match the current SHIFT game:
 *   • "monster" card type renamed to "antihero"
 *   • combat model is Power / Health / XP Value (was attack/defense/hp)
 *   • affinities are Title-Case to match the Forge output
 *   • adds Forge-native fields: passive/active/ultimate ability slots,
 *     win-condition objective, synergy profile, detected traits, art treatment
 *
 * These types mirror the JSON Schema and provide compile-time type safety for all
 * systems consuming SHIFT card data: NFT Forge, online game, mobile app, tournaments.
 *
 * @version 1.1.0
 * @see https://shiftcardgame.com/schema/v1/shift-card.schema.json
 *
 * CHANGES FROM 1.0.0
 *  - CardType: 'monster' → 'antihero'
 *  - CombatStats { attack, defense, hp } → ShiftStats { power, health, xpValue }
 *  - Affinity values Title-Case ('Fortune' not 'fortune')
 *  - Rarity values Title-Case ('Legendary' not 'legendary')
 *  - HeroCard/AntiheroCard carry passive/active/ultimate AbilitySlots
 *  - Added GameObjective, SynergyProfile, DetectedTrait, art treatment fields
 *  - MonsterData → AntiheroData (xpReward kept; threatLevel kept)
 */

// ─────────────────────────────────────────────
//  Enums & Literals
// ─────────────────────────────────────────────

/** The four card types in SHIFT (v1.1: 'monster' is now 'antihero'). */
export type CardType = 'hero' | 'antihero' | 'artifact' | 'shift_spell';

/** The 10 elemental/thematic affinities (Title-Case to match the Forge). */
export type Affinity =
  | 'Fortune'
  | 'Shadow'
  | 'Nature'
  | 'Flame'
  | 'Frost'
  | 'Storm'
  | 'Arcane'
  | 'Rift'
  | 'Divine'
  | 'Machine';

/** Card rarity tiers, lowest to highest (Title-Case). */
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

/** How an ability is invoked. Maps to the card's three slots. */
export type AbilityType = 'passive' | 'active' | 'ultimate';

/** SHIFT Spell effect categories. */
export type ShiftCategory =
  | 'enchanter'
  | 'chaos_chain'
  | 'political_group'
  | 'deck_manipulation'
  | 'xp_power'
  | 'ultra_shift';

/** How long a SHIFT spell effect lasts. */
export type ShiftDuration = 'instant' | 'persistent' | 'until_end_of_turn' | 'until_triggered';

/** Valid targets for a SHIFT spell (v1.1: single_monster → single_antihero). */
export type ShiftTargetType =
  | 'self'
  | 'single_opponent'
  | 'all_opponents'
  | 'single_hero'
  | 'single_antihero'
  | 'all_creatures'
  | 'global';

/** Artifact equipment categories. */
export type ArtifactType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest_item';

/** Card finish/treatment variants. */
export type CardFinish = 'standard' | 'holographic' | 'foil' | 'alternate_art' | 'full_art' | 'secret_rare';

/** Rarity-driven art treatment applied by the Forge. */
export type ArtTreatment =
  | 'bronze-patina'
  | 'silver-tone'
  | 'golden-glow'
  | 'arcane-purple-radiance'
  | 'rainbow-foil-sheen'
  | 'animated-cosmic-aurora';

/** Format legality status. */
export type LegalityStatus = 'legal' | 'banned' | 'restricted' | 'not_legal';

/** Solana token standard variants. */
export type SolanaTokenStandard = 'metaplex' | 'metaplex_core' | 'programmable_nft' | 'compressed';

/** NFT provenance event types. */
export type ProvenanceEvent = 'minted' | 'transferred' | 'listed' | 'sold' | 'burned' | 'staked';

/** Supported animation MIME types. */
export type AnimationType = 'video/mp4' | 'video/webm' | 'image/gif' | 'model/gltf-binary' | 'text/html';

/** Sale currencies (v1.1 adds SHIFT — the in-game token used to mint). */
export type Currency = 'SOL' | 'USDC' | 'SHIFT';

// ─────────────────────────────────────────────
//  Shared Sub-Types
// ─────────────────────────────────────────────

/** Core SHIFT statistics for heroes and antiheroes (replaces CombatStats). */
export interface ShiftStats {
  /** Attack/offense value. Forge range 0–10. */
  power: number;
  /** Hit points / survivability. Forge range 0–12. */
  health: number;
  /** XP this card is worth / grants. */
  xpValue: number;
}

/** Additive stat modifiers (can be negative for debuffs). */
export interface StatModifiers {
  power?: number;
  health?: number;
  xpValue?: number;
}

/** Cost to activate an ability. */
export interface AbilityCost {
  health?: number;
  xp?: number;
  discard?: number;
  tap?: boolean;
  custom?: string;
}

/** A card ability — passive, active, or ultimate. */
export interface Ability {
  /** Unique ability identifier for cross-referencing. */
  id?: string;
  /** Ability display name. */
  name: string;
  /** Which slot this ability occupies. */
  type: AbilityType;
  /** Full rules text of the ability. */
  description: string;
  /** Cost to activate (for active/ultimate abilities). */
  cost?: AbilityCost;
  /** Turns before the ability can be used again. */
  cooldown?: number;
  /** The level at which this ability unlocks (passive=1, active=2, ultimate=5). */
  unlockLevel?: number;
  /** Keyword tags for this ability. */
  keywords?: string[];
}

/** The three ability slots every hero/antihero card carries. */
export interface AbilitySlots {
  passive: Ability;
  active: Ability;
  ultimate: Ability;
}

/** A detected or pool-assigned trait attribute. */
export interface DetectedTrait {
  /** Trait type, e.g. "Weapon", "Crown", "Wings". */
  traitType: string;
  /** Trait value, e.g. "Flaming Sword". */
  value: string;
  /** How it was sourced. */
  source: 'pool' | 'ai-detected';
}

/** Set/collection reference embedded in each card. */
export interface CardSet {
  id: string;
  code: string;
  name: string;
}

/** Multi-resolution card art assets. */
export interface CardImages {
  thumbnail?: string;
  small?: string;
  /** Primary display size. */
  medium: string;
  large?: string;
  fullArt?: string;
  /** IPFS CID of the canonical art file. */
  ipfsHash?: string;
}

/** Animated or 3D asset for NFT display. */
export interface CardAnimation {
  url: string;
  type: AnimationType;
  ipfsHash?: string;
}

/** Print edition and finish information. */
export interface CardEdition {
  name: string;
  printRun?: number;
  printNumber?: number;
  finish: CardFinish;
}

// ─────────────────────────────────────────────
//  Win Condition / Synergy (Forge-native, v1.1)
// ─────────────────────────────────────────────

/** The game objective carried on each card for reference. */
export interface GameObjective {
  /** Plain-language goal. */
  goal: string;
  /** Ways to win the game. */
  winConditions: string[];
  /** Max level (the XP win threshold). */
  maxLevel: number;
  /** This card's current level. */
  currentLevel: number;
  /** This card's XP value. */
  xpValue: number;
  /** Whether this card has reached the Level-5 win threshold. */
  atWinThreshold: boolean;
}

/** A recommended hero pairing. */
export interface HeroPairing {
  partner: string;
  result: string;
}

/** Synergy intelligence for the card. */
export interface SynergyProfile {
  /** Archetype tags this card plays as. */
  archetypes?: string[];
  /** Recommended hero pairings. */
  heroPairings?: HeroPairing[];
  /** Spell combo partner, if any. */
  spellCombo?: { spell: string; partner: string | null };
  /** Note about an artifact's role. */
  artifactNote?: string | null;
}

// ─────────────────────────────────────────────
//  NFT / Blockchain Types (Solana)
// ─────────────────────────────────────────────

export interface NftCreator {
  address: string;
  share: number;
  verified?: boolean;
}

export interface NftCollection {
  address?: string;
  verified?: boolean;
}

/** NFT/blockchain metadata for Solana. */
export interface NftData {
  chain: 'solana';
  mintAddress?: string;
  tokenStandard?: SolanaTokenStandard;
  /** URI to the on-chain (Metaplex) metadata JSON — the asset metadata URI. */
  metadataUri?: string;
  /** For compressed NFTs: the Merkle tree address. */
  merkleTree?: string;
  collection?: NftCollection;
  /** Royalty fee in basis points (500 = 5%). */
  sellerFeeBasisPoints?: number;
  creators?: NftCreator[];
  mintedAt?: string;
  /** SHIFT token paid to mint this card (gameplay gate). */
  mintFeeShift?: number;
  /** Payment transaction signature. */
  mintPaymentTx?: string;
}

export interface ProvenancePrice {
  amount: number;
  currency: Currency;
}

export interface ProvenanceEntry {
  event: ProvenanceEvent;
  from?: string;
  to?: string;
  timestamp: string;
  txSignature?: string;
  price?: ProvenancePrice;
}

// ─────────────────────────────────────────────
//  Card-Type-Specific Data Blocks
// ─────────────────────────────────────────────

/** A single level in a hero's progression. */
export interface LevelProgression {
  level: number;
  /** Cumulative XP needed to reach this level. */
  xpRequired: number;
  statsBonus?: StatModifiers;
  abilitiesUnlocked?: Ability[];
  /** Evolution note, e.g. "Ascended Form". */
  evolution?: string;
}

/** Hero-specific data: XP-driven level progression to the Level-5 win. */
export interface HeroData {
  baseLevel: number;
  /** Max achievable level (5 = win threshold; 6+ = Ascended). */
  maxLevel: number;
  /** Ordered level-up thresholds and rewards. */
  levelProgression: LevelProgression[];
  /** Whether this hero has reached an Ascended form (level 6+). */
  ascended?: boolean;
}

/** Loot table entry for an antihero. */
export interface LootEntry {
  artifactId: string;
  dropRate: number;
}

/** Antihero-specific encounter data (was MonsterData). */
export interface AntiheroData {
  /** XP granted to the hero who defeats this antihero. */
  xpReward: number;
  /** Encounter difficulty rating (1-10). */
  threatLevel: number;
  /** Compendium tier label, e.g. "Boss Antihero". */
  tier?: string;
  abilities?: Ability[];
  lootTable?: LootEntry[];
}

export interface EquipRestrictions {
  minLevel?: number;
  requiredAffinity?: Affinity;
}

/** Artifact-specific item data. */
export interface ArtifactData {
  artifactType: ArtifactType;
  statModifiers?: StatModifiers;
  effect?: string;
  /** Enchanted (upgraded) effect text. */
  enchantedEffect?: string;
  durability?: number;
  equipRestrictions?: EquipRestrictions;
}

/** SHIFT Spell-specific data: rule-overriding effects. */
export interface ShiftData {
  shiftCategory: ShiftCategory;
  effect: string;
  duration?: ShiftDuration;
  targetType?: ShiftTargetType;
  chainable?: boolean;
  counterplay?: string;
}

export interface DeckLimits {
  maxCopies: number;
}

// ─────────────────────────────────────────────
//  Main Card Type (Discriminated Union)
// ─────────────────────────────────────────────

/** Common fields shared by all SHIFT cards. */
interface ShiftCardBase {
  /** Schema version. Always "1.1.0". */
  schemaVersion: '1.1.0';
  id: string;
  printId: string;
  name: string;
  slug: string;
  rarity: Rarity;
  rulesText: string;
  flavorText?: string;
  keywords?: string[];
  set: CardSet;
  collectorNumber: string;
  artist?: string;
  images: CardImages;
  animation?: CardAnimation;
  edition?: CardEdition;
  nft?: NftData;
  provenance?: ProvenanceEntry[];
  legality?: Record<string, LegalityStatus>;
  deckLimits?: DeckLimits;
  /** Rarity-driven art treatment applied by the Forge. */
  artTreatment?: ArtTreatment;
  /** Detected/pool-assigned traits. */
  detectedTraits?: DetectedTrait[];
  /** Win-condition objective reference. */
  objective?: GameObjective;
  /** Synergy intelligence. */
  synergy?: SynergyProfile;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}

/** A Hero card — levels up via XP toward the Level-5 win. */
export interface HeroCard extends ShiftCardBase {
  cardType: 'hero';
  affinity: Affinity;
  stats: ShiftStats;
  abilities: AbilitySlots;
  heroData: HeroData;
  antiheroData?: never;
  artifactData?: never;
  shiftData?: never;
}

/** An Antihero card — creatures & villains; grants XP on defeat (was Monster). */
export interface AntiheroCard extends ShiftCardBase {
  cardType: 'antihero';
  affinity?: Affinity;
  stats: ShiftStats;
  abilities: AbilitySlots;
  antiheroData: AntiheroData;
  heroData?: never;
  artifactData?: never;
  shiftData?: never;
}

/** An Artifact card — equipment, items, and consumables. */
export interface ArtifactCard extends ShiftCardBase {
  cardType: 'artifact';
  affinity?: Affinity;
  stats?: never;
  artifactData: ArtifactData;
  heroData?: never;
  antiheroData?: never;
  shiftData?: never;
}

/** A SHIFT Spell card — overrides standard rules with unpredictable effects. */
export interface ShiftSpellCard extends ShiftCardBase {
  cardType: 'shift_spell';
  affinity?: Affinity;
  stats?: never;
  shiftData: ShiftData;
  heroData?: never;
  antiheroData?: never;
  artifactData?: never;
}

/**
 * A SHIFT Card — the universal type. Discriminated union on `cardType`.
 *
 * ```typescript
 * function processCard(card: ShiftCard) {
 *   if (card.cardType === 'hero') {
 *     console.log(card.heroData.maxLevel); // narrowed
 *   }
 * }
 * ```
 */
export type ShiftCard = HeroCard | AntiheroCard | ArtifactCard | ShiftSpellCard;

// ─────────────────────────────────────────────
//  Collection Type
// ─────────────────────────────────────────────

export type AffinityDistribution = Partial<Record<Affinity, number>>;
export type CardTypeDistribution = Partial<Record<CardType, number>>;

export interface CollectionMeta {
  id: string;
  code: string;
  name: string;
  description?: string;
  releaseDate: string;
  totalCards: number;
  symbol?: string;
  affinityDistribution?: AffinityDistribution;
  cardTypeDistribution?: CardTypeDistribution;
}

export interface ShiftCollection {
  schemaVersion: '1.1.0';
  collection: CollectionMeta;
  cards: ShiftCard[];
}

// ─────────────────────────────────────────────
//  Utility Types & Guards
// ─────────────────────────────────────────────

export type CardOfType<T extends CardType> = Extract<ShiftCard, { cardType: T }>;

export type GameRuntimeCard = Pick<
  ShiftCard,
  | 'id'
  | 'name'
  | 'cardType'
  | 'affinity'
  | 'rarity'
  | 'stats'
  | 'abilities'
  | 'rulesText'
  | 'keywords'
  | 'heroData'
  | 'antiheroData'
  | 'artifactData'
  | 'shiftData'
  | 'objective'
  | 'legality'
  | 'deckLimits'
> & { setCode: string };

export interface DeckManifestEntry {
  id: string;
  name: string;
  cardType: CardType;
  count: number;
}

export function isHero(card: ShiftCard): card is HeroCard {
  return card.cardType === 'hero';
}
export function isAntihero(card: ShiftCard): card is AntiheroCard {
  return card.cardType === 'antihero';
}
export function isArtifact(card: ShiftCard): card is ArtifactCard {
  return card.cardType === 'artifact';
}
export function isShiftSpell(card: ShiftCard): card is ShiftSpellCard {
  return card.cardType === 'shift_spell';
}
