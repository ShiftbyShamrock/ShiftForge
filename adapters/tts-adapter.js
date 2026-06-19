/**
 * @fileoverview SHIFT Card Collection → Tabletop Simulator Deck Save Adapter
 *
 * Converts an array of SHIFT Card JSON objects into a Tabletop Simulator (TTS)
 * saved-object JSON file.  The output can be imported directly into TTS as a
 * custom deck via "Saved Objects → Import".
 *
 * TTS custom decks use sprite sheets (10 × 7 grid = 70 cells, last cell is the
 * card back).  If more than 69 cards are provided, the adapter splits them
 * across multiple sheets automatically.
 *
 * @module tts-adapter
 * @version 1.0.0
 * @see https://kb.tabletopsimulator.com/custom-content/custom-deck/
 */

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Default TTS sprite sheet layout: 10 columns × 7 rows. */
const DEFAULT_NUM_WIDTH = 10;
const DEFAULT_NUM_HEIGHT = 7;

/** Maximum usable card slots per sheet (last cell = card back). */
const DEFAULT_CARDS_PER_SHEET = DEFAULT_NUM_WIDTH * DEFAULT_NUM_HEIGHT - 1; // 69

/** Hex character set for GUID generation. */
const HEX = '0123456789abcdef';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random 6-character hex GUID for TTS objects.
 *
 * @returns {string} A 6-char lowercase hex string.
 */
function randomGuid() {
  let guid = '';
  for (let i = 0; i < 6; i++) {
    guid += HEX[Math.floor(Math.random() * 16)];
  }
  return guid;
}

/**
 * Capitalize the first letter of a string.
 *
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format a card type enum for display.
 * "shift_spell" → "SHIFT Spell", "hero" → "Hero", etc.
 *
 * @param {string} cardType
 * @returns {string}
 */
function formatCardType(cardType) {
  if (cardType === 'shift_spell') return 'SHIFT Spell';
  return capitalize(cardType);
}

// ──────────────────────────────────────────────────────────────────────────────
// Card Description Builder
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate a human-readable TTS card description from a SHIFT Card.
 *
 * The description includes type line, stats, keywords, abilities, and
 * type-specific information (hero levels, monster XP, artifact modifiers,
 * SHIFT spell category).  TTS supports basic rich text via `[b]`, `[i]`,
 * and `[color]` tags.
 *
 * @param {Object} shiftCard - A valid SHIFT Card JSON object.
 * @returns {string} Formatted description string for TTS.
 *
 * @example
 * import { generateCardDescription } from './tts-adapter.js';
 * const desc = generateCardDescription(heroCard);
 * // → "[b]Hero — Shadow — Epic[/b]\nATK 5 | DEF 3 | HP 20\n..."
 */
export function generateCardDescription(shiftCard) {
  if (!shiftCard) return '';

  const lines = [];

  // ── Type line ──────────────────────────────────────────────────────────
  const typeParts = [formatCardType(shiftCard.cardType)];
  if (shiftCard.affinity) typeParts.push(capitalize(shiftCard.affinity));
  if (shiftCard.rarity) typeParts.push(capitalize(shiftCard.rarity));
  lines.push(`[b]${typeParts.join(' — ')}[/b]`);

  // ── Stats ──────────────────────────────────────────────────────────────
  if (shiftCard.stats) {
    const { attack, defense, hp } = shiftCard.stats;
    lines.push(`ATK ${attack ?? '—'} | DEF ${defense ?? '—'} | HP ${hp ?? '—'}`);
  }

  // ── Keywords ───────────────────────────────────────────────────────────
  if (Array.isArray(shiftCard.keywords) && shiftCard.keywords.length > 0) {
    lines.push(`[i]${shiftCard.keywords.map(capitalize).join(', ')}[/i]`);
  }

  // ── Rules Text ─────────────────────────────────────────────────────────
  if (shiftCard.rulesText) {
    lines.push('');
    lines.push(shiftCard.rulesText);
  }

  // ── Hero-specific ──────────────────────────────────────────────────────
  if (shiftCard.heroData) {
    const hd = shiftCard.heroData;
    lines.push('');
    lines.push(`[b]Hero Lv ${hd.baseLevel}–${hd.maxLevel}[/b]`);

    if (Array.isArray(hd.baseAbilities) && hd.baseAbilities.length > 0) {
      lines.push('Base abilities:');
      hd.baseAbilities.forEach((ab) => {
        lines.push(`  • ${ab.name} (${ab.type}): ${ab.description}`);
      });
    }

    if (Array.isArray(hd.levelProgression) && hd.levelProgression.length > 0) {
      lines.push('Level progression:');
      hd.levelProgression.forEach((lp) => {
        const bonusParts = [];
        if (lp.statsBonus) {
          if (lp.statsBonus.attack) bonusParts.push(`+${lp.statsBonus.attack} ATK`);
          if (lp.statsBonus.defense) bonusParts.push(`+${lp.statsBonus.defense} DEF`);
          if (lp.statsBonus.hp) bonusParts.push(`+${lp.statsBonus.hp} HP`);
        }
        const bonusStr = bonusParts.length > 0 ? ` (${bonusParts.join(', ')})` : '';
        lines.push(`  Lv ${lp.level}: ${lp.xpRequired} XP${bonusStr}`);

        if (Array.isArray(lp.abilitiesUnlocked)) {
          lp.abilitiesUnlocked.forEach((ab) => {
            lines.push(`    ↳ Unlocks: ${ab.name}`);
          });
        }
      });
    }
  }

  // ── Monster-specific ───────────────────────────────────────────────────
  if (shiftCard.monsterData) {
    const md = shiftCard.monsterData;
    lines.push('');
    lines.push(`[b]Threat ${md.threatLevel} | XP Reward: ${md.xpReward}[/b]`);

    if (Array.isArray(md.abilities) && md.abilities.length > 0) {
      lines.push('Abilities:');
      md.abilities.forEach((ab) => {
        lines.push(`  • ${ab.name} (${ab.type}): ${ab.description}`);
      });
    }

    if (Array.isArray(md.lootTable) && md.lootTable.length > 0) {
      lines.push(`Loot drops: ${md.lootTable.length} possible item(s)`);
    }
  }

  // ── Artifact-specific ──────────────────────────────────────────────────
  if (shiftCard.artifactData) {
    const ad = shiftCard.artifactData;
    lines.push('');
    lines.push(`[b]${capitalize(ad.artifactType)}[/b]`);

    if (ad.statModifiers) {
      const mods = [];
      if (ad.statModifiers.attack) mods.push(`${ad.statModifiers.attack > 0 ? '+' : ''}${ad.statModifiers.attack} ATK`);
      if (ad.statModifiers.defense) mods.push(`${ad.statModifiers.defense > 0 ? '+' : ''}${ad.statModifiers.defense} DEF`);
      if (ad.statModifiers.hp) mods.push(`${ad.statModifiers.hp > 0 ? '+' : ''}${ad.statModifiers.hp} HP`);
      if (mods.length > 0) lines.push(`Modifiers: ${mods.join(', ')}`);
    }

    if (ad.durability !== undefined) {
      lines.push(`Durability: ${ad.durability === -1 ? 'Indestructible' : ad.durability}`);
    }

    if (ad.effect) lines.push(`Effect: ${ad.effect}`);

    if (ad.equipRestrictions) {
      const reqs = [];
      if (ad.equipRestrictions.minLevel) reqs.push(`Lv ${ad.equipRestrictions.minLevel}+`);
      if (ad.equipRestrictions.requiredAffinity) reqs.push(`${capitalize(ad.equipRestrictions.requiredAffinity)} only`);
      if (reqs.length > 0) lines.push(`Requires: ${reqs.join(', ')}`);
    }
  }

  // ── SHIFT Spell-specific ───────────────────────────────────────────────
  if (shiftCard.shiftData) {
    const sd = shiftCard.shiftData;
    lines.push('');
    const catLabel = sd.shiftCategory
      ? sd.shiftCategory.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Unknown';
    lines.push(`[b]SHIFT — ${catLabel}[/b]`);
    if (sd.duration) lines.push(`Duration: ${sd.duration.replace(/_/g, ' ')}`);
    if (sd.targetType) lines.push(`Target: ${sd.targetType.replace(/_/g, ' ')}`);
    if (sd.chainable) lines.push('[i]Chainable[/i]');
    if (sd.effect) lines.push(`Effect: ${sd.effect}`);
    if (sd.counterplay) lines.push(`Counterplay: ${sd.counterplay}`);
  }

  // ── Set / Collector Number ─────────────────────────────────────────────
  if (shiftCard.set?.code || shiftCard.collectorNumber) {
    lines.push('');
    const setInfo = [shiftCard.set?.code, shiftCard.collectorNumber].filter(Boolean).join(' #');
    lines.push(`[i]${setInfo}[/i]`);
  }

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Build TTS Card Object
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a single TTS "Card" contained-object entry.
 *
 * @param {Object} shiftCard  - SHIFT Card JSON object.
 * @param {number} cardID     - TTS CardID (sheetId * 100 + indexOnSheet).
 * @param {number} sheetId    - Which CustomDeck sheet this card belongs to.
 * @returns {Object} TTS contained-object entry.
 */
function buildTTSCard(shiftCard, cardID, sheetId) {
  return {
    GUID: randomGuid(),
    Name: 'Card',
    Transform: {
      posX: 0, posY: 0, posZ: 0,
      rotX: 0, rotY: 180, rotZ: 180,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    },
    Nickname: shiftCard.name || 'Unnamed Card',
    Description: generateCardDescription(shiftCard),
    CardID: cardID,
    CustomDeck: {
      // TTS needs the sheet reference on each card too
      [sheetId]: null, // placeholder — will be filled by parent
    },
    SidewaysCard: false,
    Locked: false,
    Tooltip: true,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Export: toTTSSave
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TTSOptions
 * @property {string}  [backImageUrl='']     - URL for the shared card-back image.
 * @property {string}  [deckName='SHIFT Deck'] - Display name of the deck in TTS.
 * @property {number}  [cardsPerSheet=69]    - Max cards per sprite sheet (default 69).
 * @property {Function} [faceUrlResolver]    - `(sheetIndex: number) => string` callback
 *   that returns the sprite sheet FaceURL for a given sheet index.  If not
 *   provided, each card's `images.medium` is used as a placeholder (single-card
 *   sheets).
 */

/**
 * Transform an array of SHIFT Card JSON objects into a Tabletop Simulator
 * saved-object JSON structure.
 *
 * The output is a complete TTS save file with an `ObjectStates` root array
 * containing a single Deck (or DeckCustom) object.  Cards are grouped into
 * sprite sheets of `cardsPerSheet` (default 69 — 10 × 7 grid with the last
 * cell reserved for the card back).
 *
 * @param {Array<Object>} shiftCards - Array of SHIFT Card JSON objects.
 * @param {TTSOptions}    [options={}] - Configuration options.
 * @returns {Object} TTS-compatible saved-object JSON.
 * @throws {TypeError} If shiftCards is not an array or is empty.
 *
 * @example
 * import { toTTSSave } from './tts-adapter.js';
 * const ttsSave = toTTSSave(myCards, {
 *   backImageUrl: 'https://cdn.shift.gg/card-back.png',
 *   deckName: 'Genesis Set',
 *   faceUrlResolver: (i) => `https://cdn.shift.gg/sheets/gen-sheet-${i}.png`,
 * });
 * // Write JSON.stringify(ttsSave) to a .json file and import into TTS.
 */
export function toTTSSave(shiftCards, options = {}) {
  if (!Array.isArray(shiftCards) || shiftCards.length === 0) {
    throw new TypeError('toTTSSave requires a non-empty array of SHIFT Card objects.');
  }

  const {
    backImageUrl = '',
    deckName = 'SHIFT Deck',
    cardsPerSheet = DEFAULT_CARDS_PER_SHEET,
    faceUrlResolver,
  } = options;

  const maxPerSheet = Math.max(1, Math.min(cardsPerSheet, DEFAULT_CARDS_PER_SHEET));

  // ── Group cards into sheets ────────────────────────────────────────────
  /** @type {Array<Array<Object>>} */
  const sheets = [];
  for (let i = 0; i < shiftCards.length; i += maxPerSheet) {
    sheets.push(shiftCards.slice(i, i + maxPerSheet));
  }

  // ── Build CustomDeck map ───────────────────────────────────────────────
  /** @type {Object<string, Object>} */
  const customDeck = {};

  sheets.forEach((_, sheetIndex) => {
    const sheetId = sheetIndex + 1; // TTS sheet IDs are 1-based
    const faceURL = typeof faceUrlResolver === 'function'
      ? faceUrlResolver(sheetIndex)
      : ''; // Placeholder — caller must provide sheet URLs

    customDeck[sheetId] = {
      FaceURL: faceURL,
      BackURL: backImageUrl,
      NumWidth: DEFAULT_NUM_WIDTH,
      NumHeight: DEFAULT_NUM_HEIGHT,
      BackIsHidden: true,
      UniqueBack: false,
      Type: 0,
    };
  });

  // ── Build contained card objects ───────────────────────────────────────
  /** @type {Array<Object>} */
  const containedObjects = [];
  /** @type {Array<number>} */
  const deckIDs = [];

  sheets.forEach((sheetCards, sheetIndex) => {
    const sheetId = sheetIndex + 1;

    sheetCards.forEach((card, indexOnSheet) => {
      const cardID = sheetId * 100 + indexOnSheet;
      const ttsCard = buildTTSCard(card, cardID, sheetId);

      // Replace the placeholder CustomDeck with the real one
      ttsCard.CustomDeck = { [sheetId]: customDeck[sheetId] };

      containedObjects.push(ttsCard);
      deckIDs.push(cardID);
    });
  });

  // ── Assemble Deck ObjectState ──────────────────────────────────────────
  const deckObject = {
    GUID: randomGuid(),
    Name: containedObjects.length === 1 ? 'Card' : 'Deck',
    Transform: {
      posX: 0, posY: 1, posZ: 0,
      rotX: 0, rotY: 180, rotZ: 180,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    },
    Nickname: deckName,
    Description: `SHIFT Card Game deck — ${shiftCards.length} card(s)`,
    CustomDeck: customDeck,
    DeckIDs: deckIDs,
    ContainedObjects: containedObjects,
    Locked: false,
    Tooltip: true,
  };

  // ── TTS Save wrapper ──────────────────────────────────────────────────
  return {
    SaveName: deckName,
    Date: new Date().toISOString(),
    VersionNumber: '13.2.1',
    GameMode: '',
    GameType: '',
    GameComplexity: '',
    Tags: ['SHIFT', 'Card Game'],
    Gravity: 0.5,
    PlayArea: 0.5,
    Table: '',
    Sky: '',
    Note: `Auto-generated from SHIFT Card Standard v1.0 — ${shiftCards.length} cards`,
    Rules: '',
    XmlUI: '',
    LuaScript: '',
    LuaScriptState: '',
    ObjectStates: [deckObject],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Self-test (run directly: node tts-adapter.js)
// ──────────────────────────────────────────────────────────────────────────────

/*
 * Uncomment and run to see sample TTS output:
 *
 * const sampleCards = [
 *   {
 *     name: 'Shadow Knight',
 *     cardType: 'hero',
 *     affinity: 'shadow',
 *     rarity: 'epic',
 *     rulesText: 'When Shadow Knight levels up, deal 2 damage to all enemies.',
 *     keywords: ['haste', 'lifesteal'],
 *     stats: { attack: 5, defense: 3, hp: 20 },
 *     heroData: { baseLevel: 1, maxLevel: 5, baseAbilities: [], levelProgression: [] },
 *     set: { code: 'GEN' },
 *     collectorNumber: '042',
 *     images: { medium: 'https://cdn.shift.gg/cards/shadow-knight.png' },
 *   },
 *   {
 *     name: 'Flame Wisp',
 *     cardType: 'monster',
 *     affinity: 'flame',
 *     rarity: 'common',
 *     rulesText: 'Burns adjacent creatures for 1 damage at end of turn.',
 *     stats: { attack: 2, defense: 1, hp: 5 },
 *     monsterData: { xpReward: 15, threatLevel: 2, abilities: [] },
 *     set: { code: 'GEN' },
 *     collectorNumber: '101',
 *     images: { medium: 'https://cdn.shift.gg/cards/flame-wisp.png' },
 *   },
 * ];
 *
 * const save = toTTSSave(sampleCards, {
 *   backImageUrl: 'https://cdn.shift.gg/card-back.png',
 *   deckName: 'Genesis Starter Deck',
 * });
 *
 * console.log(JSON.stringify(save, null, 2));
 */
