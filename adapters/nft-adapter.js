/**
 * @fileoverview SHIFT Card → Solana Metaplex NFT Metadata Adapter
 *
 * Transforms a SHIFT Card JSON object (conforming to shift-card.schema.json v1.0)
 * into a Metaplex Token Metadata–compatible JSON structure suitable for on-chain
 * storage (Arweave / IPFS) and marketplace display.
 *
 * Also provides a partial reverse mapping from Metaplex JSON back to a SHIFT Card
 * stub for import/migration workflows.
 *
 * @module nft-adapter
 * @version 1.0.0
 * @see https://docs.metaplex.com/programs/token-metadata/token-standard
 */

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Metaplex symbol used for all SHIFT cards. */
const SHIFT_SYMBOL = 'SHIFT';

/** Animation MIME types that Metaplex treats as "video" category. */
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
]);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Push a trait into the attributes array, skipping undefined/null values.
 *
 * @param {Array<Object>} attrs  - Target attributes array.
 * @param {string}        trait  - Metaplex `trait_type` label.
 * @param {*}             value  - Attribute value.
 * @param {string}        [displayType] - Optional Metaplex `display_type` (e.g. "number").
 */
function pushAttr(attrs, trait, value, displayType) {
  if (value === undefined || value === null) return;
  const entry = { trait_type: trait, value };
  if (displayType) entry.display_type = displayType;
  attrs.push(entry);
}

/**
 * Determine the best image URL from a SHIFT Card's `images` block.
 * Prefers fullArt → large → medium → small → thumbnail.
 *
 * @param {Object} images - SHIFT Card `images` object.
 * @returns {string|undefined}
 */
function bestImage(images) {
  if (!images) return undefined;
  return images.fullArt || images.large || images.medium || images.small || images.thumbnail;
}

/**
 * Build the Metaplex `properties.files` array from SHIFT Card assets.
 *
 * @param {Object}  images    - SHIFT Card `images` object.
 * @param {Object}  [animation] - SHIFT Card `animation` object.
 * @returns {Array<Object>}
 */
function buildFiles(images, animation) {
  const files = [];

  const imageUrl = bestImage(images);
  if (imageUrl) {
    files.push({ uri: imageUrl, type: 'image/png' });
  }

  if (animation?.url && animation?.type) {
    files.push({ uri: animation.url, type: animation.type });
  }

  return files;
}

/**
 * Determine the Metaplex `properties.category` value.
 *
 * @param {Object} [animation] - SHIFT Card `animation` object.
 * @returns {"image"|"video"|"html"|"vr"}
 */
function resolveCategory(animation) {
  if (!animation?.type) return 'image';
  if (VIDEO_MIME_TYPES.has(animation.type)) return 'video';
  if (animation.type === 'image/gif') return 'image';
  if (animation.type === 'model/gltf-binary') return 'vr';
  if (animation.type === 'text/html') return 'html';
  return 'image';
}

// ──────────────────────────────────────────────────────────────────────────────
// Build Attributes
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the full Metaplex `attributes` array from every relevant SHIFT Card
 * field.  Numeric values receive `display_type: "number"`.
 *
 * @param {Object} card - A valid SHIFT Card JSON object.
 * @returns {Array<Object>}
 */
function buildAttributes(card) {
  /** @type {Array<Object>} */
  const attrs = [];

  // ── Core ─────────────────────────────────────────────────────────────────
  pushAttr(attrs, 'Card Type', card.cardType);
  pushAttr(attrs, 'Rarity', card.rarity);
  pushAttr(attrs, 'Affinity', card.affinity);
  pushAttr(attrs, 'Set', card.set?.code);
  pushAttr(attrs, 'Collector Number', card.collectorNumber);
  pushAttr(attrs, 'Current Level', card.objective?.currentLevel ?? card.level ?? 1, 'number');
  pushAttr(attrs, 'Max Level', card.objective?.maxLevel ?? 5, 'number');

  // ── Edition / Finish ─────────────────────────────────────────────────────
  if (card.edition) {
    pushAttr(attrs, 'Edition', card.edition.name);
    pushAttr(attrs, 'Finish', card.edition.finish);
    pushAttr(attrs, 'Print Number', card.edition.printNumber, 'number');
    pushAttr(attrs, 'Print Run', card.edition.printRun, 'number');
  }

  // ── Combat Stats ─────────────────────────────────────────────────────────
  if (card.stats) {
    pushAttr(attrs, 'Attack', card.stats.attack, 'number');
    pushAttr(attrs, 'Defense', card.stats.defense, 'number');
    pushAttr(attrs, 'HP', card.stats.hp, 'number');
  }

  // ── Keywords ─────────────────────────────────────────────────────────────
  if (Array.isArray(card.keywords)) {
    card.keywords.forEach((kw) => pushAttr(attrs, 'Keyword', kw));
  }

  // ── Hero Data ────────────────────────────────────────────────────────────
  if (card.heroData) {
    pushAttr(attrs, 'Base Level', card.heroData.baseLevel, 'number');
    pushAttr(attrs, 'Max Level', card.heroData.maxLevel, 'number');

    const totalLevels = card.heroData.levelProgression?.length ?? 0;
    pushAttr(attrs, 'Level Progression Steps', totalLevels, 'number');

    if (Array.isArray(card.heroData.baseAbilities)) {
      card.heroData.baseAbilities.forEach((ab) =>
        pushAttr(attrs, 'Base Ability', ab.name),
      );
    }
  }

  // ── Monster Data ─────────────────────────────────────────────────────────
  if (card.monsterData) {
    pushAttr(attrs, 'XP Reward', card.monsterData.xpReward, 'number');
    pushAttr(attrs, 'Threat Level', card.monsterData.threatLevel, 'number');

    if (Array.isArray(card.monsterData.abilities)) {
      card.monsterData.abilities.forEach((ab) =>
        pushAttr(attrs, 'Monster Ability', ab.name),
      );
    }

    if (Array.isArray(card.monsterData.lootTable)) {
      pushAttr(attrs, 'Loot Table Size', card.monsterData.lootTable.length, 'number');
    }
  }

  // ── Artifact Data ────────────────────────────────────────────────────────
  if (card.artifactData) {
    pushAttr(attrs, 'Artifact Type', card.artifactData.artifactType);
    pushAttr(attrs, 'Durability', card.artifactData.durability, 'number');

    if (card.artifactData.statModifiers) {
      const sm = card.artifactData.statModifiers;
      pushAttr(attrs, 'ATK Modifier', sm.attack, 'number');
      pushAttr(attrs, 'DEF Modifier', sm.defense, 'number');
      pushAttr(attrs, 'HP Modifier', sm.hp, 'number');
    }

    if (card.artifactData.equipRestrictions) {
      pushAttr(attrs, 'Min Equip Level', card.artifactData.equipRestrictions.minLevel, 'number');
      pushAttr(attrs, 'Required Affinity', card.artifactData.equipRestrictions.requiredAffinity);
    }
  }

  // ── SHIFT Spell Data ─────────────────────────────────────────────────────
  if (card.shiftData) {
    pushAttr(attrs, 'SHIFT Category', card.shiftData.shiftCategory);
    pushAttr(attrs, 'Duration', card.shiftData.duration);
    pushAttr(attrs, 'Target Type', card.shiftData.targetType);
    pushAttr(attrs, 'Chainable', card.shiftData.chainable?.toString());
  }

  // ── Artist ───────────────────────────────────────────────────────────────
  pushAttr(attrs, 'Artist', card.artist);

  return attrs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Forward Transform: SHIFT Card → Metaplex
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Transform a SHIFT Card JSON object into Solana Metaplex–compatible NFT
 * metadata.
 *
 * The output conforms to the Metaplex Token Metadata standard and is ready for
 * upload to Arweave / IPFS and subsequent on-chain registration.
 *
 * @param {Object} shiftCard - A valid SHIFT Card JSON object (schema v1.0.0).
 * @returns {Object} Metaplex-compatible metadata JSON.
 * @throws {TypeError} If `shiftCard` is falsy or missing required fields.
 *
 * @example
 * import { toMetaplexMetadata } from './nft-adapter.js';
 * const metaplex = toMetaplexMetadata(myHeroCard);
 * // → { name, symbol, description, image, attributes, properties, ... }
 */
export function toMetaplexMetadata(shiftCard) {
  if (!shiftCard || typeof shiftCard !== 'object') {
    throw new TypeError('toMetaplexMetadata requires a valid SHIFT Card object.');
  }
  if (!shiftCard.name) {
    throw new TypeError('SHIFT Card must have a "name" field.');
  }

  const imageUrl = bestImage(shiftCard.images);

  /** @type {Object} */
  const metaplex = {
    name: shiftCard.name,
    symbol: SHIFT_SYMBOL,
    description: shiftCard.rulesText || '',
    image: imageUrl || '',
    external_url: `https://shiftcardgame.com/cards/${shiftCard.slug || shiftCard.id}`,
    attributes: buildAttributes(shiftCard),
    properties: {
      files: buildFiles(shiftCard.images, shiftCard.animation),
      category: resolveCategory(shiftCard.animation),
    },
  };

  // ── Animation URL ────────────────────────────────────────────────────────
  if (shiftCard.animation?.url) {
    metaplex.animation_url = shiftCard.animation.url;
  }

  // ── Seller Fee / Royalties ───────────────────────────────────────────────
  if (shiftCard.nft?.sellerFeeBasisPoints !== undefined) {
    metaplex.seller_fee_basis_points = shiftCard.nft.sellerFeeBasisPoints;
  } else {
    // Metaplex requires this field — default to 5 %
    metaplex.seller_fee_basis_points = 500;
  }

  // ── Creators ─────────────────────────────────────────────────────────────
  if (Array.isArray(shiftCard.nft?.creators) && shiftCard.nft.creators.length > 0) {
    metaplex.properties.creators = shiftCard.nft.creators.map((c) => ({
      address: c.address,
      share: c.share,
      ...(c.verified !== undefined ? { verified: c.verified } : {}),
    }));
  }

  // ── Collection ───────────────────────────────────────────────────────────
  if (shiftCard.nft?.collection) {
    metaplex.collection = {
      name: shiftCard.set?.name || shiftCard.name,
      family: 'SHIFT Card Game',
    };
    if (shiftCard.nft.collection.address) {
      metaplex.collection.address = shiftCard.nft.collection.address;
    }
    if (shiftCard.nft.collection.verified !== undefined) {
      metaplex.collection.verified = shiftCard.nft.collection.verified;
    }
  }

  return metaplex;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reverse Transform: Metaplex → SHIFT Card (partial)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to reconstruct a partial SHIFT Card JSON object from Metaplex
 * metadata.  Because Metaplex attributes are lossy (abilities, level
 * progression detail, loot tables, etc. are not stored), the result is a
 * *stub* suitable for review and manual enrichment.
 *
 * @param {Object} metaplexJson - A Metaplex-compatible NFT metadata object.
 * @returns {Object} Partial SHIFT Card JSON stub.
 * @throws {TypeError} If input is falsy.
 *
 * @example
 * import { fromMetaplexMetadata } from './nft-adapter.js';
 * const stub = fromMetaplexMetadata(onChainMeta);
 * // → { name, cardType, rarity, affinity, stats, ... }
 */
export function fromMetaplexMetadata(metaplexJson) {
  if (!metaplexJson || typeof metaplexJson !== 'object') {
    throw new TypeError('fromMetaplexMetadata requires a valid Metaplex metadata object.');
  }

  /** @type {Object} */
  const card = {
    schemaVersion: '1.0.0',
    name: metaplexJson.name || '',
    rulesText: metaplexJson.description || '',
  };

  // ── Parse attributes into a lookup ─────────────────────────────────────
  /** @type {Map<string, Array<*>>} */
  const attrMap = new Map();
  if (Array.isArray(metaplexJson.attributes)) {
    for (const attr of metaplexJson.attributes) {
      const key = attr.trait_type;
      if (!attrMap.has(key)) attrMap.set(key, []);
      attrMap.get(key).push(attr.value);
    }
  }

  /**
   * Get the first attribute value for a given trait.
   * @param {string} trait
   * @returns {*}
   */
  const first = (trait) => attrMap.get(trait)?.[0];

  // ── Core fields ────────────────────────────────────────────────────────
  if (first('Card Type')) card.cardType = first('Card Type');
  if (first('Rarity')) card.rarity = first('Rarity');
  if (first('Affinity')) card.affinity = first('Affinity');
  if (first('Artist')) card.artist = first('Artist');
  if (first('Collector Number')) card.collectorNumber = first('Collector Number');

  // ── Set (partial) ────────────────────────────────────────────────────────
  const setCode = first('Set');
  if (setCode) {
    card.set = { code: setCode, id: '', name: metaplexJson.collection?.name || '' };
  }

  // ── Images (from primary image URL) ─────────────────────────────────────
  if (metaplexJson.image) {
    card.images = { medium: metaplexJson.image };
    // Promote to fullArt when it appears to be high-res
    card.images.fullArt = metaplexJson.image;
  }

  // ── Animation ─────────────────────────────────────────────────────────
  if (metaplexJson.animation_url) {
    // Infer MIME from properties.files if possible
    const animFile = metaplexJson.properties?.files?.find(
      (f) => f.uri === metaplexJson.animation_url,
    );
    card.animation = {
      url: metaplexJson.animation_url,
      type: animFile?.type || 'video/mp4',
    };
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const attack = first('Attack');
  const defense = first('Defense');
  const hp = first('HP');
  if (attack !== undefined || defense !== undefined || hp !== undefined) {
    card.stats = {
      attack: Number(attack) || 0,
      defense: Number(defense) || 0,
      hp: Number(hp) || 1,
    };
  }

  // ── Keywords (all entries under "Keyword") ──────────────────────────────
  const keywords = attrMap.get('Keyword');
  if (keywords && keywords.length > 0) {
    card.keywords = [...new Set(keywords)];
  }

  // ── Edition ──────────────────────────────────────────────────────────────
  const editionName = first('Edition');
  const finish = first('Finish');
  if (editionName || finish) {
    card.edition = {
      name: editionName || 'Unknown',
      finish: finish || 'standard',
    };
    const printNum = first('Print Number');
    const printRun = first('Print Run');
    if (printNum !== undefined) card.edition.printNumber = Number(printNum);
    if (printRun !== undefined) card.edition.printRun = Number(printRun);
  }

  // ── Hero Data (partial) ──────────────────────────────────────────────────
  const baseLevel = first('Base Level');
  const maxLevel = first('Max Level');
  if (baseLevel !== undefined || maxLevel !== undefined) {
    card.heroData = {
      baseLevel: Number(baseLevel) || 1,
      maxLevel: Number(maxLevel) || 1,
      levelProgression: [],
    };
  }

  // ── Monster Data (partial) ───────────────────────────────────────────────
  const xpReward = first('XP Reward');
  const threatLevel = first('Threat Level');
  if (xpReward !== undefined || threatLevel !== undefined) {
    card.monsterData = {
      xpReward: Number(xpReward) || 0,
      threatLevel: Number(threatLevel) || 1,
    };
  }

  // ── Artifact Data (partial) ──────────────────────────────────────────────
  const artifactType = first('Artifact Type');
  if (artifactType) {
    card.artifactData = { artifactType };
    const atkMod = first('ATK Modifier');
    const defMod = first('DEF Modifier');
    const hpMod = first('HP Modifier');
    if (atkMod !== undefined || defMod !== undefined || hpMod !== undefined) {
      card.artifactData.statModifiers = {
        ...(atkMod !== undefined ? { attack: Number(atkMod) } : {}),
        ...(defMod !== undefined ? { defense: Number(defMod) } : {}),
        ...(hpMod !== undefined ? { hp: Number(hpMod) } : {}),
      };
    }
    const durability = first('Durability');
    if (durability !== undefined) card.artifactData.durability = Number(durability);
  }

  // ── SHIFT Spell Data (partial) ───────────────────────────────────────────
  const shiftCat = first('SHIFT Category');
  if (shiftCat) {
    card.shiftData = {
      shiftCategory: shiftCat,
      effect: card.rulesText || '',
    };
    const dur = first('Duration');
    if (dur) card.shiftData.duration = dur;
    const tt = first('Target Type');
    if (tt) card.shiftData.targetType = tt;
    const chainable = first('Chainable');
    if (chainable !== undefined) card.shiftData.chainable = chainable === 'true';
  }

  // ── NFT fields ───────────────────────────────────────────────────────────
  if (
    metaplexJson.seller_fee_basis_points !== undefined ||
    metaplexJson.properties?.creators
  ) {
    card.nft = { chain: 'solana' };
    if (metaplexJson.seller_fee_basis_points !== undefined) {
      card.nft.sellerFeeBasisPoints = metaplexJson.seller_fee_basis_points;
    }
    if (Array.isArray(metaplexJson.properties?.creators)) {
      card.nft.creators = metaplexJson.properties.creators.map((c) => ({
        address: c.address,
        share: c.share,
        ...(c.verified !== undefined ? { verified: c.verified } : {}),
      }));
    }
    if (metaplexJson.collection?.address) {
      card.nft.collection = {
        address: metaplexJson.collection.address,
        verified: metaplexJson.collection.verified ?? false,
      };
    }
  }

  // ── Timestamps (placeholders) ────────────────────────────────────────────
  const now = new Date().toISOString();
  card.createdAt = now;
  card.updatedAt = now;

  return card;
}

// ──────────────────────────────────────────────────────────────────────────────
// Self-test (run directly: node nft-adapter.js)
// ──────────────────────────────────────────────────────────────────────────────

/*
 * Uncomment and run `node --experimental-vm-modules adapters/nft-adapter.js`
 * to verify round-trip behavior.
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
 *     baseAbilities: [{ name: 'Shadow Strike', type: 'activated', description: 'Deal 3 shadow damage.' }],
 *     levelProgression: [
 *       { level: 2, xpRequired: 100, statsBonus: { attack: 1 }, abilitiesUnlocked: [] },
 *       { level: 3, xpRequired: 250, statsBonus: { attack: 1, defense: 1 }, abilitiesUnlocked: [] },
 *     ],
 *   },
 *   set: { id: '00000000-0000-0000-0000-000000000001', code: 'GEN', name: 'Genesis' },
 *   collectorNumber: '042/250',
 *   artist: 'Jane Doe',
 *   images: {
 *     thumbnail: 'https://cdn.shift.gg/cards/shadow-knight-thumb.png',
 *     medium: 'https://cdn.shift.gg/cards/shadow-knight-med.png',
 *     fullArt: 'https://cdn.shift.gg/cards/shadow-knight-full.png',
 *   },
 *   nft: {
 *     chain: 'solana',
 *     sellerFeeBasisPoints: 500,
 *     creators: [{ address: 'ABCDwallet123', share: 100 }],
 *     collection: { address: 'COLLwallet456', verified: true },
 *   },
 *   createdAt: '2025-01-01T00:00:00Z',
 *   updatedAt: '2025-06-01T00:00:00Z',
 * };
 *
 * const metaplexOut = toMetaplexMetadata(sampleHero);
 * console.log('=== Metaplex Output ===');
 * console.log(JSON.stringify(metaplexOut, null, 2));
 *
 * const roundTrip = fromMetaplexMetadata(metaplexOut);
 * console.log('\n=== Round-trip SHIFT Card Stub ===');
 * console.log(JSON.stringify(roundTrip, null, 2));
 */
