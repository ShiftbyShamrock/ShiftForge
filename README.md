# ⚡ SHIFT Card JSON Standard v1.0

> **The universal card format for the SHIFT Card Game ecosystem.**

One schema to rule them all — consumed by the NFT Forge, Tabletop Simulator, the online game, mobile app, tournament system, and NFT minting pipeline.

---

## Overview

**SHIFT** is a fantasy trading card game (TCG) driven by XP encounters, hero progression, and dynamic SHIFT effects. Heroes battle monsters to earn XP, level up, unlock powerful abilities, equip artifacts, and survive the chaos of reality-bending SHIFT spells.

This repository defines the **SHIFT Card JSON Standard** — a single source of truth for all card data, validated by JSON Schema and typed with TypeScript.

---

## Quick Start

```bash
# Install dependencies
npm install

# Validate all example cards
npm test

# Validate a specific card
node tools/validate.js examples/example-hero.json

# Validate an entire directory
node tools/validate.js examples/
```

### Minimal Hero Card

```json
{
  "schemaVersion": "1.0.0",
  "id": "c7a3e1d0-4f2b-4e8a-9c1d-5a6b7c8d9e0f",
  "printId": "d8b4f2e1-5a3c-4f9b-0d2e-6b7c8d9e0f1a",
  "name": "Kael, The Emberblade",
  "slug": "kael-the-emberblade",
  "cardType": "hero",
  "affinity": "flame",
  "rarity": "legendary",
  "rulesText": "Channels the fury of the eternal flame.",
  "stats": { "attack": 5, "defense": 3, "hp": 8 },
  "heroData": {
    "baseLevel": 1,
    "maxLevel": 5,
    "levelProgression": [
      { "level": 2, "xpRequired": 50, "statsBonus": { "attack": 1 } }
    ]
  },
  "set": { "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "code": "GEN", "name": "Genesis" },
  "collectorNumber": "001/250",
  "images": { "medium": "https://assets.shiftcardgame.com/cards/GEN/001/medium.png" },
  "createdAt": "2026-06-11T00:00:00Z",
  "updatedAt": "2026-06-11T00:00:00Z"
}
```

---

## Card Types

SHIFT has **4 card types**, each with a required type-specific data block:

| Type | Enum Value | Required Block | Description |
|------|-----------|----------------|-------------|
| **Hero** | `hero` | `heroData` + `stats` + `affinity` | Player characters that gain XP, level up, and unlock abilities |
| **Monster** | `monster` | `monsterData` + `stats` | Enemies encountered by heroes, grant XP on defeat |
| **Artifact** | `artifact` | `artifactData` | Equipment, items, and consumables that modify hero stats |
| **SHIFT Spell** | `shift_spell` | `shiftData` | Rule-overriding spells that create unpredictable outcomes |

### Hero Cards

Heroes are the player's avatar. They have base stats (ATK/DEF/HP) that grow through XP-driven leveling:

- **Level Progression**: Each level requires cumulative XP and grants stat bonuses + new abilities
- **Abilities**: Passive (always on), Activated (player chooses), Triggered (conditional)
- **Affinity**: Required — determines elemental alignment and equipment compatibility

### Monster Cards

Monsters are encountered during gameplay. Defeating them rewards XP to the hero:

- **XP Reward**: Amount of XP granted on defeat
- **Threat Level**: Difficulty rating from 1 (trivial) to 10 (world-ending)
- **Loot Table**: Probability-weighted artifact drops

### Artifact Cards

Artifacts are items that heroes can equip or consume:

- **Types**: `weapon`, `armor`, `accessory`, `consumable`, `quest_item`
- **Stat Modifiers**: +/- to ATK, DEF, HP when equipped
- **Equip Restrictions**: Minimum level and/or required affinity

### SHIFT Spell Cards

The signature mechanic — SHIFT spells override standard game rules:

- **Categories**: 6 types that define the spell's nature
- **Duration**: `instant`, `persistent`, `until_end_of_turn`, `until_triggered`
- **Targeting**: `self`, `single_opponent`, `all_opponents`, `single_hero`, `single_monster`, `all_creatures`, `global`

---

## Affinities

SHIFT features **10 affinities** — elemental/thematic alignments that define card identity:

| Affinity | Theme | Description |
|----------|-------|-------------|
| 🍀 **Fortune** | Luck & Fate | Probability manipulation, coin flips, lucky draws |
| 🌑 **Shadow** | Darkness & Stealth | Ambush, fear, debuffs, hidden mechanics |
| 🌿 **Nature** | Life & Growth | Healing, buffs, regeneration, beast synergy |
| 🔥 **Flame** | Fire & Destruction | Direct damage, burn effects, aggressive tempo |
| ❄️ **Frost** | Ice & Control | Freeze, slow, defensive stalling, attrition |
| ⚡ **Storm** | Lightning & Speed | Haste, chain damage, tempo acceleration |
| ✨ **Arcane** | Magic & Knowledge | Card draw, spell amplification, counter-magic |
| 🌀 **Rift** | Space & Chaos | Reality warping, random effects, rule-breaking |
| ☀️ **Divine** | Holy & Protection | Shields, healing, resurrection, anti-shadow |
| ⚙️ **Machine** | Tech & Constructs | Artifact synergy, automation, combo engines |

---

## SHIFT Spell Categories

| Category | Enum Value | Description |
|----------|-----------|-------------|
| **Enchanter** | `enchanter` | Buffs, enchantments, and persistent auras |
| **Chaos/Chain** | `chaos_chain` | Chain reactions, random effects, cascading triggers |
| **Political/Group** | `political_group` | Multiplayer politics, alliances, forced trades |
| **Deck Manipulation** | `deck_manipulation` | Draw, discard, shuffle, peek, mill effects |
| **XP/Power** | `xp_power` | XP gain, XP steal, level manipulation |
| **Ultra SHIFT** | `ultra_shift` | Ultimate game-breaking effects (chase rares) |

---

## Schema Structure

Every SHIFT card contains these field blocks:

```
┌─────────────────────────────────────────────────────┐
│  SHIFT Card                                         │
├─────────────────────────────────────────────────────┤
│  Identity:     schemaVersion, id, printId,          │
│                name, slug                           │
├─────────────────────────────────────────────────────┤
│  Classification: cardType, affinity, rarity         │
├─────────────────────────────────────────────────────┤
│  Gameplay:     stats, rulesText, keywords,          │
│                flavorText                           │
├─────────────────────────────────────────────────────┤
│  Type-Specific: heroData | monsterData |            │
│                 artifactData | shiftData            │
├─────────────────────────────────────────────────────┤
│  Set Info:     set, collectorNumber, artist          │
├─────────────────────────────────────────────────────┤
│  Assets:       images, animation                    │
├─────────────────────────────────────────────────────┤
│  Edition/NFT:  edition, nft, provenance             │
├─────────────────────────────────────────────────────┤
│  Tournament:   legality, deckLimits                 │
├─────────────────────────────────────────────────────┤
│  System:       createdAt, updatedAt, tags, meta     │
└─────────────────────────────────────────────────────┘
```

---

## Export Adapters

The schema is the **single source of truth**. Three adapters transform cards into platform-specific formats:

### NFT Adapter (`adapters/nft-adapter.js`)

Transforms SHIFT cards → **Solana Metaplex-compatible** NFT metadata:

```javascript
import { toMetaplexMetadata } from './adapters/nft-adapter.js';

const metaplexJson = toMetaplexMetadata(shiftCard);
// → { name, symbol: "SHIFT", description, image, attributes: [...], properties: { files, creators, category } }
```

### TTS Adapter (`adapters/tts-adapter.js`)

Transforms SHIFT card collections → **Tabletop Simulator** deck save files:

```javascript
import { toTTSSave } from './adapters/tts-adapter.js';

const ttsSave = toTTSSave(cards, {
  backImageUrl: 'https://assets.shiftcardgame.com/card-back.png',
  deckName: 'Genesis Starter Deck',
});
// → { ObjectStates: [{ Name: "Deck", CustomDeck: {...}, ContainedObjects: [...] }] }
```

### Game Runtime Adapter (`adapters/game-adapter.js`)

Transforms SHIFT cards → **optimized game runtime** format (strips art, NFT data, lore):

```javascript
import { toGameRuntime, toGameCardIndex, calculateHeroStatsAtLevel } from './adapters/game-adapter.js';

const runtime = toGameRuntime(shiftCard);
const index = toGameCardIndex(cards);       // Map<id, RuntimeCard>
const stats = calculateHeroStatsAtLevel(runtime, 3);  // { attack: 8, defense: 5, hp: 12, level: 3 }
```

---

## Consumer Systems

| System | Adapter | What It Uses |
|--------|---------|-------------|
| 🔥 **NFT Forge** | `nft-adapter` | Full card → Metaplex metadata for minting UI |
| 🎲 **Tabletop Simulator** | `tts-adapter` | Card collection → TTS deck save JSON |
| 🎮 **Online Game** | `game-adapter` + `types.ts` | Runtime format for game logic |
| 📱 **Mobile App** | `game-adapter` + `types.ts` | Runtime format + images for mobile client |
| 🏆 **Tournament System** | `game-adapter` | Runtime format + legality + deckLimits |
| ⛓️ **NFT Minting** | `nft-adapter` | Metaplex metadata + provenance tracking |

---

## Versioning Policy

The SHIFT Card Standard follows **Semantic Versioning**:

- **MAJOR** (2.0.0): Breaking schema changes (field renames, type changes, required field removals)
- **MINOR** (1.1.0): New optional fields, new enum values, new adapters
- **PATCH** (1.0.1): Documentation fixes, example corrections, validation improvements

**Rules:**
1. Every document embeds `schemaVersion` for self-describing data
2. New fields are **always optional** in minor versions
3. Existing fields are **never renamed or removed** in minor versions
4. Breaking changes require a new MAJOR version with migration guide

---

## File Structure

```
SHIFT CODE/
├── schema/
│   └── v1/
│       ├── shift-card.schema.json        # Core card schema (JSON Schema Draft 2020-12)
│       ├── shift-collection.schema.json  # Collection wrapper schema
│       └── types.ts                      # TypeScript type definitions
├── adapters/
│   ├── nft-adapter.js                    # → Solana Metaplex metadata
│   ├── tts-adapter.js                    # → Tabletop Simulator save format
│   └── game-adapter.js                   # → Optimized game runtime
├── examples/
│   ├── example-hero.json                 # Kael, The Emberblade (Legendary Hero)
│   ├── example-monster.json              # Dreadmaw Lurker (Rare Monster)
│   ├── example-artifact.json             # Aegis of the Radiant Dawn (Epic Artifact)
│   ├── example-shift-spell.json          # Reality Fracture (Mythic SHIFT Spell)
│   └── example-collection.json           # Genesis mini collection (3 cards)
├── tools/
│   └── validate.js                       # CLI schema validator
├── package.json
└── README.md
```

---

## TypeScript Usage

Import the types for compile-time safety:

```typescript
import type { ShiftCard, HeroCard, MonsterCard, ArtifactCard, ShiftSpellCard } from './schema/v1/types';
import { isHero, isMonster, isArtifact, isShiftSpell } from './schema/v1/types';

function processCard(card: ShiftCard) {
  if (isHero(card)) {
    // TypeScript knows card is HeroCard here
    console.log(`Level ${card.heroData.baseLevel} → ${card.heroData.maxLevel}`);
    console.log(`Base ATK: ${card.stats.attack}`);
  }

  if (isMonster(card)) {
    console.log(`XP Reward: ${card.monsterData.xpReward}`);
    console.log(`Threat: ${card.monsterData.threatLevel}/10`);
  }
}
```

---

## License

UNLICENSED — Proprietary. All rights reserved.
