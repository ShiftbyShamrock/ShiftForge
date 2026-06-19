/**
 * SHIFT Card JSON Standard v1.0 — TypeScript Type Definitions
 *
 * These types mirror the JSON Schema at shift-card.schema.json and provide
 * compile-time type safety for all systems consuming SHIFT card data:
 * NFT Forge, online game, mobile app, tournament system, etc.
 *
 * @version 1.0.0
 * @see https://shiftcardgame.com/schema/v1/shift-card.schema.json
 */

// ─────────────────────────────────────────────
//  Enums & Literals
// ─────────────────────────────────────────────

/** The four card types in SHIFT. */
export type CardType = 'hero' | 'monster' | 'artifact' | 'shift_spell';

/** The 10 elemental/thematic affinities. */
export type Affinity =
  | 'fortune'
  | 'shadow'
  | 'nature'
  | 'flame'
  | 'frost'
  | 'storm'
  | 'arcane'
  | 'rift'
  | 'divine'
  | 'machine';

/** Card rarity tiers, ordered from lowest to highest. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** How an ability is invoked. */
export type AbilityType = 'passive' | 'activated' | 'triggered';

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

/** Valid targets for a SHIFT spell. */
export type ShiftTargetType =
  | 'self'
  | 'single_opponent'
  | 'all_opponents'
  | 'single_hero'
  | 'single_monster'
  | 'all_creatures'
  | 'global';

/** Artifact equipment categories. */
export type ArtifactType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest_item';

/** Card finish/treatment variants. */
export type CardFinish = 'standard' | 'holographic' | 'foil' | 'alternate_art' | 'full_art' | 'secret_rare';

/** Format legality status. */
export type LegalityStatus = 'legal' | 'banned' | 'restricted' | 'not_legal';

/** Solana token standard variants. */
export type SolanaTokenStandard = 'metaplex' | 'metaplex_core' | 'programmable_nft';

/** NFT provenance event types. */
export type ProvenanceEvent = 'minted' | 'transferred' | 'listed' | 'sold' | 'burned' | 'staked';

/** Supported animation MIME types. */
export type AnimationType = 'video/mp4' | 'video/webm' | 'image/gif' | 'model/gltf-binary' | 'text/html';

/** Sale currencies. */
export type Currency = 'SOL' | 'USDC';

// ─────────────────────────────────────────────
//  Shared Sub-Types
// ─────────────────────────────────────────────

/** Base combat statistics for heroes and monsters. */
export interface CombatStats {
  /** Base attack power. */
  attack: number;
  /** Base defense value. */
  defense: number;
  /** Base hit points. */
  hp: number;
}

/** Additive stat modifiers (can be negative for debuffs). */
export interface StatModifiers {
  attack?: number;
  defense?: number;
  hp?: number;
}

/** Cost to activate an ability. */
export interface AbilityCost {
  /** HP cost to pay. */
  hp?: number;
  /** XP cost to pay. */
  xp?: number;
  /** Number of cards to discard. */
  discard?: number;
  /** Whether the card must be tapped/exhausted. */
  tap?: boolean;
  /** Any other cost described in text. */
  custom?: string;
}

/** A card ability — passive, activated, or triggered. */
export interface Ability {
  /** Unique ability identifier for cross-referencing. */
  id?: string;
  /** Ability display name. */
  name: string;
  /** How the ability is invoked. */
  type: AbilityType;
  /** Full rules text of the ability. */
  description: string;
  /** Cost to activate (for activated abilities). */
  cost?: AbilityCost;
  /** Turns before the ability can be used again. */
  cooldown?: number;
  /** Keyword tags for this ability. */
  keywords?: string[];
}

/** Set/collection reference embedded in each card. */
export interface CardSet {
  /** Set unique identifier. */
  id: string;
  /** Short set code (e.g. 'SHF01'). */
  code: string;
  /** Full set name (e.g. 'Genesis'). */
  name: string;
}

/** Multi-resolution card art assets. */
export interface CardImages {
  /** Small thumbnail (≤128px). */
  thumbnail?: string;
  /** Small image (≤256px). */
  small?: string;
  /** Medium image (≤512px). Primary display size. */
  medium: string;
  /** Large image (≤1024px). */
  large?: string;
  /** Full resolution art file. */
  fullArt?: string;
  /** IPFS CID of the canonical art file. */
  ipfsHash?: string;
}

/** Animated or 3D asset for NFT display. */
export interface CardAnimation {
  /** URI to the animation file. */
  url: string;
  /** MIME type of the animation. */
  type: AnimationType;
  /** IPFS CID of the animation file. */
  ipfsHash?: string;
}

/** Print edition and finish information. */
export interface CardEdition {
  /** Edition name (e.g. '1st Edition'). */
  name: string;
  /** Total number of cards in this print run. */
  printRun?: number;
  /** This card's number within the print run. */
  printNumber?: number;
  /** Card finish/treatment. */
  finish: CardFinish;
}

// ─────────────────────────────────────────────
//  NFT / Blockchain Types (Solana)
// ─────────────────────────────────────────────

/** NFT creator entry for royalty distribution. */
export interface NftCreator {
  /** Creator's Solana wallet address. */
  address: string;
  /** Percentage share of royalties (0-100). */
  share: number;
  /** Whether this creator is verified on-chain. */
  verified?: boolean;
}

/** Metaplex collection reference. */
export interface NftCollection {
  /** Collection mint address. */
  address?: string;
  /** Whether the collection is verified on-chain. */
  verified?: boolean;
}

/** NFT/blockchain metadata for Solana. */
export interface NftData {
  /** Blockchain network. */
  chain: 'solana';
  /** Solana mint address (base58). */
  mintAddress?: string;
  /** Solana token standard used. */
  tokenStandard?: SolanaTokenStandard;
  /** URI to the on-chain metadata JSON. */
  metadataUri?: string;
  /** Metaplex collection group. */
  collection?: NftCollection;
  /** Royalty fee in basis points (500 = 5%). */
  sellerFeeBasisPoints?: number;
  /** Creator addresses and royalty shares. */
  creators?: NftCreator[];
  /** When the NFT was minted. */
  mintedAt?: string;
}

/** A sale price record. */
export interface ProvenancePrice {
  amount: number;
  currency: Currency;
}

/** A single provenance/ownership event. */
export interface ProvenanceEntry {
  /** Type of provenance event. */
  event: ProvenanceEvent;
  /** Sender wallet address. */
  from?: string;
  /** Receiver wallet address. */
  to?: string;
  /** When the event occurred (ISO 8601). */
  timestamp: string;
  /** Solana transaction signature. */
  txSignature?: string;
  /** Sale price if applicable. */
  price?: ProvenancePrice;
}

// ─────────────────────────────────────────────
//  Card-Type-Specific Data Blocks
// ─────────────────────────────────────────────

/** A single level in a hero's progression. */
export interface LevelProgression {
  /** The level this entry unlocks. */
  level: number;
  /** Cumulative XP needed to reach this level. */
  xpRequired: number;
  /** Stat increases granted at this level. */
  statsBonus?: StatModifiers;
  /** New abilities unlocked at this level. */
  abilitiesUnlocked?: Ability[];
}

/** Hero-specific data: XP-driven level progression. */
export interface HeroData {
  /** Starting level of the hero. */
  baseLevel: number;
  /** Maximum achievable level. */
  maxLevel: number;
  /** Abilities available at base level. */
  baseAbilities?: Ability[];
  /** Ordered list of level-up thresholds and rewards. */
  levelProgression: LevelProgression[];
}

/** Loot table entry for a monster. */
export interface LootEntry {
  /** ID of the artifact that may drop. */
  artifactId: string;
  /** Probability of dropping (0.0 to 1.0). */
  dropRate: number;
}

/** Monster-specific encounter data. */
export interface MonsterData {
  /** XP granted to the hero who defeats this monster. */
  xpReward: number;
  /** Encounter difficulty rating (1-10). */
  threatLevel: number;
  /** Abilities the monster can use. */
  abilities?: Ability[];
  /** Possible artifact drops after defeating this monster. */
  lootTable?: LootEntry[];
}

/** Equipment restrictions for an artifact. */
export interface EquipRestrictions {
  /** Minimum hero level required to equip. */
  minLevel?: number;
  /** Hero must have this affinity to equip. */
  requiredAffinity?: Affinity;
}

/** Artifact-specific item data. */
export interface ArtifactData {
  /** Category of artifact. */
  artifactType: ArtifactType;
  /** Stat changes when equipped. */
  statModifiers?: StatModifiers;
  /** Special effect text. */
  effect?: string;
  /** Uses before consumed. -1 = indestructible. */
  durability?: number;
  /** Requirements to equip or use. */
  equipRestrictions?: EquipRestrictions;
}

/** SHIFT Spell-specific data: rule-overriding effects. */
export interface ShiftData {
  /** The SHIFT spell category. */
  shiftCategory: ShiftCategory;
  /** Full description of the SHIFT spell's effect. */
  effect: string;
  /** How long the effect lasts. */
  duration?: ShiftDuration;
  /** What the SHIFT spell targets. */
  targetType?: ShiftTargetType;
  /** Whether this can chain with other SHIFT spells. */
  chainable?: boolean;
  /** How opponents can counter this. */
  counterplay?: string;
}

/** Deck construction constraints. */
export interface DeckLimits {
  /** Maximum copies allowed in a deck. */
  maxCopies: number;
}

// ─────────────────────────────────────────────
//  Main Card Type (Discriminated Union)
// ─────────────────────────────────────────────

/** Common fields shared by all SHIFT cards. */
interface ShiftCardBase {
  /** Schema version. Always "1.0.0". */
  schemaVersion: '1.0.0';
  /** Canonical card identity UUID (same across reprints). */
  id: string;
  /** Unique identifier for this specific print/edition. */
  printId: string;
  /** Card display name. */
  name: string;
  /** URL-safe identifier. */
  slug: string;
  /** Card rarity tier. */
  rarity: Rarity;
  /** Full rules/oracle text. */
  rulesText: string;
  /** Lore or flavor text. */
  flavorText?: string;
  /** Keyword abilities or tags. */
  keywords?: string[];
  /** Set/collection this card belongs to. */
  set: CardSet;
  /** Collector number within the set. */
  collectorNumber: string;
  /** Card illustrator. */
  artist?: string;
  /** Card art assets at multiple resolutions. */
  images: CardImages;
  /** Animated or 3D asset. */
  animation?: CardAnimation;
  /** Print edition and finish info. */
  edition?: CardEdition;
  /** NFT/blockchain metadata. */
  nft?: NftData;
  /** Ownership and transaction history. */
  provenance?: ProvenanceEntry[];
  /** Format legality for tournament play. */
  legality?: Record<string, LegalityStatus>;
  /** Deck construction constraints. */
  deckLimits?: DeckLimits;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last modification timestamp. */
  updatedAt: string;
  /** Internal tags for search/filter. */
  tags?: string[];
  /** Open extension object for future use. */
  meta?: Record<string, unknown>;
}

/** A Hero card — levels up via XP from defeating monsters. */
export interface HeroCard extends ShiftCardBase {
  cardType: 'hero';
  /** Hero cards require an affinity. */
  affinity: Affinity;
  /** Base combat stats. */
  stats: CombatStats;
  /** Hero progression data. */
  heroData: HeroData;
  /** Not present on hero cards. */
  monsterData?: never;
  artifactData?: never;
  shiftData?: never;
}

/** A Monster card — encountered by heroes, grants XP on defeat. */
export interface MonsterCard extends ShiftCardBase {
  cardType: 'monster';
  affinity?: Affinity;
  /** Base combat stats. */
  stats: CombatStats;
  /** Monster encounter data. */
  monsterData: MonsterData;
  /** Not present on monster cards. */
  heroData?: never;
  artifactData?: never;
  shiftData?: never;
}

/** An Artifact card — equipment, items, and consumables. */
export interface ArtifactCard extends ShiftCardBase {
  cardType: 'artifact';
  affinity?: Affinity;
  /** Artifacts don't have combat stats (they modify hero stats). */
  stats?: never;
  /** Artifact item data. */
  artifactData: ArtifactData;
  /** Not present on artifact cards. */
  heroData?: never;
  monsterData?: never;
  shiftData?: never;
}

/** A SHIFT Spell card — overrides standard rules with unpredictable effects. */
export interface ShiftSpellCard extends ShiftCardBase {
  cardType: 'shift_spell';
  affinity?: Affinity;
  /** SHIFT spells don't have combat stats. */
  stats?: never;
  /** SHIFT spell effect data. */
  shiftData: ShiftData;
  /** Not present on SHIFT spell cards. */
  heroData?: never;
  monsterData?: never;
  artifactData?: never;
}

/**
 * A SHIFT Card — the universal type.
 *
 * This is a discriminated union on `cardType`. Use type narrowing to access
 * type-specific fields:
 *
 * ```typescript
 * function processCard(card: ShiftCard) {
 *   if (card.cardType === 'hero') {
 *     console.log(card.heroData.maxLevel); // ✅ TypeScript knows this exists
 *   }
 * }
 * ```
 */
export type ShiftCard = HeroCard | MonsterCard | ArtifactCard | ShiftSpellCard;

// ─────────────────────────────────────────────
//  Collection Type
// ─────────────────────────────────────────────

/** Distribution count by affinity. */
export type AffinityDistribution = Partial<Record<Affinity, number>>;

/** Distribution count by card type. */
export type CardTypeDistribution = Partial<Record<CardType, number>>;

/** Set-level metadata for a collection. */
export interface CollectionMeta {
  /** Unique collection identifier. */
  id: string;
  /** Short set code. */
  code: string;
  /** Full collection name. */
  name: string;
  /** Narrative description. */
  description?: string;
  /** Official release date (YYYY-MM-DD). */
  releaseDate: string;
  /** Total number of unique cards. */
  totalCards: number;
  /** URL to the set symbol/icon image. */
  symbol?: string;
  /** Breakdown of cards per affinity. */
  affinityDistribution?: AffinityDistribution;
  /** Breakdown of cards per type. */
  cardTypeDistribution?: CardTypeDistribution;
}

/** A collection/set of SHIFT cards. */
export interface ShiftCollection {
  /** Schema version. Always "1.0.0". */
  schemaVersion: '1.0.0';
  /** Set-level metadata. */
  collection: CollectionMeta;
  /** Array of cards in this collection. */
  cards: ShiftCard[];
}

// ─────────────────────────────────────────────
//  Utility Types
// ─────────────────────────────────────────────

/** Extract a specific card type from the union. */
export type CardOfType<T extends CardType> = Extract<ShiftCard, { cardType: T }>;

/** A card with only gameplay-relevant fields (for game runtime). */
export type GameRuntimeCard = Pick<
  ShiftCard,
  | 'id'
  | 'name'
  | 'cardType'
  | 'affinity'
  | 'rarity'
  | 'stats'
  | 'rulesText'
  | 'keywords'
  | 'heroData'
  | 'monsterData'
  | 'artifactData'
  | 'shiftData'
  | 'legality'
  | 'deckLimits'
> & { setCode: string };

/** Minimal deck list entry. */
export interface DeckManifestEntry {
  id: string;
  name: string;
  cardType: CardType;
  count: number;
}

/** Type guard: check if a card is a Hero. */
export function isHero(card: ShiftCard): card is HeroCard {
  return card.cardType === 'hero';
}

/** Type guard: check if a card is a Monster. */
export function isMonster(card: ShiftCard): card is MonsterCard {
  return card.cardType === 'monster';
}

/** Type guard: check if a card is an Artifact. */
export function isArtifact(card: ShiftCard): card is ArtifactCard {
  return card.cardType === 'artifact';
}

/** Type guard: check if a card is a SHIFT Spell. */
export function isShiftSpell(card: ShiftCard): card is ShiftSpellCard {
  return card.cardType === 'shift_spell';
}
