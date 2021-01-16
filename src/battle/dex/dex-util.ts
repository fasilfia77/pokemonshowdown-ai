import { ReadonlyPokemon } from "../state/Pokemon";
import * as effects from "./effects";

/** Set of Type names. Each type has a 0-based unique index. */
export const types =
{
    bug: 0, dark: 1, dragon: 2, fire: 3, flying: 4, ghost: 5, electric: 6,
    fighting: 7, grass: 8, ground: 9, ice: 10, normal: 11, poison: 12,
    psychic: 13, rock: 14, steel: 15, water: 16, "???": 17
} as const;
/** Sorted array of all types. */
export const typeKeys = Object.keys(types).sort() as readonly Type[];
/** The different types a pokemon can have. */
export type Type = keyof typeof types;

/** Set of HPType names. Each type has a 0-based unique index. */
export const hpTypes =
{
    bug: 0, dark: 1, dragon: 2, fire: 3, flying: 4, ghost: 5, electric: 6,
    fighting: 7, grass: 8, ground: 9, ice: 10, poison: 11, psychic: 12,
    rock: 13, steel: 14, water: 15
} as const;
/** Sorted array of all hidden power types. */
export const hpTypeKeys = Object.keys(hpTypes).sort() as readonly HPType[];
/** The different hidden power types a pokemon can have. */
export type HPType = keyof typeof hpTypes;

/** Data for the Natural Gift move. */
export interface NaturalGiftData
{
    /** Move's base power. */
    readonly basePower: number;
    /** Move's type. */
    readonly type: Type;
}

/** List of moves that transfer items to the user. */
export const itemTransferMoves: readonly string[] =
    ["thief", "covet", "trick", "switcheroo", "recycle"];

/** List of moves that remove an item from its target. */
export const itemRemovalMoves: readonly string[] =
    [...itemTransferMoves, "knockoff"];

/** Hold the set of all major status names. Maps status name to a unique id. */
export const majorStatuses =
{
    brn: 0, par: 1, psn: 2, tox: 3, slp: 4, frz: 5
} as const;
/** Sorted array of all major statuses. */
export const majorStatusKeys = Object.keys(majorStatuses).sort() as
    readonly MajorStatus[]
/** Major pokemon status conditions. */
export type MajorStatus = keyof typeof majorStatuses;
/**
 * Checks if a value matches a major status.
 * @param status Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isMajorStatus(status: any): status is MajorStatus
{
    return majorStatuses.hasOwnProperty(status);
}

/** Holds the set of all stat names except HP. */
export const statsExceptHP =
    {atk: true, def: true, spa: true, spd: true, spe: true} as const;
/** Names of pokemon stats except HP. */
export type StatExceptHP = keyof typeof statsExceptHP;

/** Holds the set of all stat names. */
export const statNames =
    {hp: true, ...statsExceptHP} as const;
/** Sorted array of all stat names. */
export const statKeys = Object.keys(statNames).sort() as readonly StatName[]
/** Names of pokemon stats. */
export type StatName = keyof typeof statNames;

/** Holds the set of all boostable stat names. */
export const boostNames =
    {...statsExceptHP, accuracy: true, evasion: true} as const;
/** Sorted array of all boost names. */
export const boostKeys = Object.keys(boostNames).sort() as readonly BoostName[];
/** Names of pokemon stats that can be boosted. */
export type BoostName = keyof typeof boostNames;
/**
 * Checks if a value matches a boost name.
 * @param stat Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isBoostName(stat: any): stat is BoostName
{
    return boostNames.hasOwnProperty(stat);
}
/** Boost table mapped type. */
export type BoostTable<T = number> = {readonly [U in BoostName]: T};

// TODO: make weather types lowercase, shorten
/** Holds the set of all weather types, mapping to its extension item. */
export const weatherItems =
{
    SunnyDay: "heatrock", RainDance: "damprock", Sandstorm: "smoothrock",
    Hail: "icyrock"
} as const;
/** Sorted array of all weather types. */
export const weatherKeys = Object.keys(weatherItems).sort() as
    readonly WeatherType[];
/** Types of weather conditions. */
export type WeatherType = keyof typeof weatherItems;
/**
 * Checks if a value matches a weather type.
 * @param type Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isWeatherType(type: any): type is WeatherType
{
    return weatherItems.hasOwnProperty(type);
}

// TODO: move to dex, rename to momentum moves
/** Moves similar to Rollout. */
export const rolloutMoves = {rollout: true, iceball: true} as const;
/** Sorted array of all rollout moves. */
export const rolloutKeys = Object.keys(rolloutMoves).sort() as
    readonly RolloutMove[];
/** Moves that are similar to Rollout. */
export type RolloutMove = keyof typeof rolloutMoves;
/**
 * Checks if a value matches a Rollout-like move.
 * @param type Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isRolloutMove(type: any): type is RolloutMove
{
    return rolloutMoves.hasOwnProperty(type);
}

/** Base interface for dex data entries. */
export interface DexData
{
    /** Unique ID number that belongs to a single entry only. */
    readonly uid: number;
    /** Entry name. */
    readonly name: string;
    /** Display name. */
    readonly display: string;
}

/** Format of each pokemon entry in the Dex. */
export interface PokemonData extends DexData
{
    /** ID number in the Pokedex. */
    readonly id: number;
    /** Species this pokemon is derived from. */
    readonly baseSpecies?: string;
    /** Alternate form this pokemon is derived from. */
    readonly baseForm?: string;
    /** Alternate form name. */
    readonly form?: string;
    /** Alternate forms of this pokemon. */
    readonly otherForms?: readonly string[];
    /** Id names of the abilities this species can have. */
    readonly abilities: readonly string[];
    /** Types of the pokemon. */
    readonly types: readonly [Type, Type];
    /** Base stats. */
    readonly baseStats: {readonly [S in StatName]: number};
    /** Pokemon's weight in kg. Affected by certain moves. */
    readonly weightkg: number;
    /** All the possible moves this pokemon can have. */
    readonly movepool: readonly string[];
}

/** Format for each ability entry in the dex. */
export interface AbilityData extends DexData
{
    // TODO: make these effects mutually exclusive within each `on` obj
    /**
     * Specifies conditions for activating this ability to describe or interrupt
     * an effect.
     */
    readonly on?:
    {
        /** Whenever the holder is about to switch out (except when fainted). */
        readonly switchOut?:
        {
            /**
             * Whether to cure any major statuses (e.g. naturalcure). This
             * generally happens silently but some indicators on cartridge and
             * PS makes the ability known to both players in most cases.
             */
            readonly cure?: true;
        }
        /**
         * Whenever the holder switches in or gains the ability. Leaving this
         * field defined but empty means it will reveal itself with no
         * additional effects (e.g. moldbreaker, pressure, etc).
         */
        readonly start?:
        {
            // TODO: document/handle conditions to not activate
            /**
             * Whether this ability cures statuses specified by
             * `#statusImmunity`.
             */
            readonly cure?: true;
            /** Whether this ability copies the foe's ability. */
            readonly copyFoeAbility?: true;
            /**
             * Reveal a random opponent's held item, or don't activate if the
             * opponents don't have items.
             */
            readonly revealItem?: true;
            /**
             * Reveal the opponent's strongest move by base-power according to
             * Forewarn rules.
             */
            readonly warnStrongestMove?: true;
        };
        /**
         * Whenever a move or effect is about to hit the ability holder and the
         * ability has an opportunity to block the effect under the given
         * circumstances described by this object.
         */
        readonly block?:
        {
            /** Block certain statuses specified by `#statusImmunity`. */
            readonly status?: true;
            /** Block certain moves. */
            readonly move?:
            {
                /** Block moves of a specific type. */
                readonly type: Type;
                /**
                 * Effects that should happen to the ability holder if possible
                 * once the move is blocked. If empty or all the effects are
                 * unapplicable, then the ability should at least mention the
                 * immunity to the move.
                 */
                readonly effects?: readonly effects.ability.Absorb[];
            };
            /** Block effects that contain a certain flag. */
            readonly effect?:
            {
                /** Block explosive effects (e.g. Aftermath, Explosion, etc). */
                readonly explosive?: true
            };
        };
        /**
         * Whenever the ability holder has the opportunity to block an unboost
         * effect.
         */
        readonly tryUnboost?:
        {
            /** Block certain unboost effects from the opponent. */
            readonly block?: Partial<BoostTable<true>>;
        };
        /** Whenever the ability holder gets statused. */
        readonly status?:
        {
            /**
             * Whether this ability cures statuses specified by
             * `#statusImmunity`.
             */
            readonly cure?: true;
        };
        /**
         * Whenever a damaging move makes contact and KOs the ability holder.
         */
        readonly moveContactKO?:
        {
            /** Whether this is an explosive effect (i.e., blocked by Damp). */
            readonly explosive?: true;
            /**
             * Effects that should happen if possible. Can only apply to
             * attacker.
             */
            readonly effects: readonly effects.ability.MoveContactKO[];
        };
        /**
         * Whenver a damaging move makes contact with the ability holder. Also
         * applies to `#moveContactKO` if the effect targets the user.
         */
        readonly moveContact?:
        {
            /**
             * Percent chance of this ability activating. Omit to assume that it
             * always activates.
             */
            readonly chance?: number;
            /** Target of the effect, either the ability holder or move user. */
            readonly tgt: "holder" | "user";
            /** One of these effects is equally likely to happen. */
            readonly effects: readonly effects.ability.MoveContact[];
        };
        /**
         * Whenever a move deals damage to the ability holder. Also applies to
         * `#moveContact`.
         */
        readonly moveDamage?:
        {
            /**
             * Change the holder's type to the type of the move used against it.
             */
            readonly changeToMoveType?: true;
        };
        /** Whenever a draining move or effect is about to heal the user. */
        readonly moveDrain?:
        {
            /** Invert the drain healing effect. */
            readonly invert?: true;
        };
    };

    /** Status immunities granted by this ability. */
    readonly statusImmunity?: {readonly [T in effects.StatusType]?: true};

    // TODO: rename to passive effects? or add a separate field?
    /** Additional ability flags. */
    readonly flags?:
    {
        // TODO: pressure flag
        /** Whether this ability suppresses all weather effects. */
        readonly suppressWeather?: true;
        /** Whether this ability ignores held item. */
        readonly ignoreItem?: true;
        /**
         * Whether this ability ignores the target's ability when using a move.
         */
        readonly ignoreTargetAbility?: true;
        // TODO: support inferences for this
        /**
         * Whether to make multi-hit moves used by the holder hit for the max
         * amount of times.
         */
        readonly maxMultihit?: true;
        /**
         * Whether this ability silently blocks all indirect damage or just
         * recoil.
         */
        readonly noIndirectDamage?: true | "recoil";
    };
}

/** Ability "callback" object types. */
export type AbilityOn = keyof NonNullable<AbilityData["on"]>;

/** Format for each move entry in the dex. */
export interface MoveData extends DexData
{
    /** Move category. */
    readonly category: MoveCategory;
    /** Move's base power. */
    readonly basePower: number;
    /** Whether this is a fixed damage move, and what the rules are for this. */
    readonly damage?: MoveDamage;
    /** Type of move. */
    readonly type: Type;
    // tslint:disable: no-trailing-whitespace (force newline in doc)
    /**
     * Type modification when used in battle.  
     * `"hpType"` - User's base hiddenpower type (pre-Transform).  
     * `"plateType"` - Type of held plate item, if any. Defaults to the original
     * move type if no plate.
     */
    // tslint:enable: no-trailing-whitespace
    readonly modifyType?: "hpType" | "plateType";
    /** Target of the move. */
    readonly target: MoveTarget;
    /**
     * Target of the move if the user is not ghost-type. Defaults to whatever
     * `#target` is.
     */
    readonly nonGhostTarget?: MoveTarget;
    /** Base power point range. */
    readonly pp: readonly [number, number];
    /** Multi-hit move's range for the number of hits. */
    readonly multihit?: readonly [number, number];

    /** Optional move flags. */
    readonly flags?:
    {
        /** Whether this is a damaging contact move. */
        readonly contact?: true;
        /**
         * Whether this is an explosive move (e.g. Explosion), i.e., it's
         * blocked by abilities that block explosive effects (e.g. Damp).
         */
        readonly explosive?: true;
        /** Whether this move requires `VolatileStatus#focus` to execute. */
        readonly focus?: true;
        /** Whether this move ignores type immunities when dealing damage. */
        readonly ignoreImmunity?: true;
        /** Whether this move ignores Subtitute. */
        readonly ignoreSub?: true;
        /**
         * Whether this move can intercept the target's switch-in before it
         * would normally be used.
         */
        readonly interceptSwitch?: true;
        /**
         * Whether this move can't be copied by Mirror Move. This should only be
         * present for targeted moves.
         */
        readonly noMirror?: true;
        /** Whether this move can't be copied by Copycat. */
        readonly noCopycat?: true;
        /** Whether this move can be reflected by Magic Coat. */
        readonly reflectable?: true;
    };

    /** Additional move effects */
    readonly effects?:
    {
        /** Call effect. */
        readonly call?: effects.CallType;

        /** Transform the user into the target. */
        readonly transform?: true;

        /** Damage delay effect. */
        readonly delay?: {readonly type: "future"} |
        {
            readonly type: "twoTurn";
            /** Whether the delay is shortened during sun. */
            readonly solar?: true;
        };

        // TODO: verify order
        /** Damage effects in addition to main move damage (not recoil). */
        readonly damage?:
        {
            /** Damage dealt as a percentage of max HP. */
            readonly type: "percent";
            /** Pokemon receiving the damage. */
            readonly target: MoveEffectTarget;
            /** Damage dealt as a percentage of max hp. Positive heals. */
            readonly percent: number;
            /**
             * Whether this effect can only activate if the user is ghost type.
             */
            readonly ghost?: true;
        } |
        {
            /**
             * The user's and opponent's current HP stats are averaged and set
             * to the result (limited by max HP).
             */
            readonly type: "split"
        };

        // TODO: separate stockpile from perish
        /** Status effect to count. */
        readonly count?: effects.CountableStatusType;

        // TODO: should these boost effects be mutually exclusive?
        /** Boost effects. */
        readonly boost?:
        {
            /** Chance of the effect happening. */
            readonly chance?: number;
            /** Whether boosts are being set or added. */
            readonly set?: true;
            /**
             * Whether this effect can only activate if the user is not ghost
             * type.
             */
            readonly noGhost?: true;
        } &
            {readonly [T in MoveEffectTarget]?: Partial<BoostTable>};
        /** Boosts to swap with the target. */
        readonly swapBoosts?: Partial<BoostTable<boolean>>;
        // TODO: other boost effects

        // TODO: what about ending/curing statuses?
        /** Possible status effects to start. */
        readonly status?:
        {
            /** Chance of the effect happening. */
            readonly chance?: number;
            /**
             * Whether this effect can only activate if the user is ghost type.
             */
            readonly ghost?: true;
        } &
            {readonly [T in MoveEffectTarget]?: readonly effects.StatusType[]};

        /** Team effect to start. */
        readonly team?: {readonly [T in MoveEffectTarget]?: effects.TeamType};

        /** Field effect to start. */
        readonly field?: effects.FieldType;

        /**
         * Change the target's type to the type of one of the target's known
         * moves.
         */
        readonly changeType?: "conversion";

        /** Disable the target's last used move. */
        readonly disableMove?: true;

        /** Fraction of move damage being healed by the user. */
        readonly drain?: readonly [number, number];

        // ability on-moveDamage, etc

        /** Fraction of move damage being dealt to the user. */
        readonly recoil?: readonly [number, number];

        // TODO: item removal (trick, knockoff, covet, etc)

        // item on-postMoveDamage
        // faint event if applicable

        /** Whether the user will faint after using the move. */
        readonly selfFaint?: MoveSelfFaint;

        /** Self-switch effect. */
        readonly selfSwitch?: effects.SelfSwitchType;
    };

    /** Implicit effects on the user. */
    readonly implicit?:
    {
        /** Implicit status effect. */
        readonly status?: effects.ImplicitStatusType;
        /** Implicit team effect. */
        readonly team?: effects.ImplicitTeamType;
    };
}

/** Types of categories for a move. */
export type MoveCategory = "physical" | "special" | "status";

// tslint:disable: no-trailing-whitespace (force newline in doc)
/**
 * Fixed damage move specification.  
 * `number` - Damage amount.  
 * `"ohko"` - OHKO move.  
 * `"level"` - User's level.  
 * `"half"` - Half of target's remaining HP.  
 * `"bide"` - Double the damage accumulated during Bide status.  
 * `"counter"` - Double damage received from the last attack matching this
 * move's category this turn.  
 * `"metalburst"` - 1.5x damage received from the last attack this turn.  
 * `"psywave"` - Random, 0.5x to 1.5x the user's level.  
 * `"hpdiff"` - Difference between target's hp and user's hp.
 */
// tslint:enable: no-trailing-whitespace
export type MoveDamage = number | "ohko" | "level" | "half" | "bide" |
    "counter" | "metalburst" | "psywave" | "hpdiff";

/** Types of targets for a move. */
export type MoveTarget = "adjacentAlly" | "adjacentAllyOrSelf" | "adjacentFoe" |
    "all" | "allAdjacent" | "allAdjacentFoes" | "allies" | "allySide" |
    "allyTeam" | "any" | "foeSide" | "normal" | "randomNormal" | "scripted" |
    "self";


/** Gets all the possible types of a move based on its user. */
export function getMoveTypes(move: MoveData, user: ReadonlyPokemon): Set<Type>
{
    switch (move.modifyType)
    {
        // TODO: also include naturalgift and others
        case "hpType": return new Set(user.hpType.possibleValues) as Set<Type>;
        case "plateType":
        {
            const result = new Set<Type>();
            for (const n of user.item.possibleValues)
            {
                result.add(user.item.map[n].plateType ?? "normal");
            }
            return result;
        }
        default: return new Set([move.type]);
    }
}

/**
 * Gets the move's type based on its user if the user's currently revealed
 * traits guarantees it, or null if not enough information has been revealed.
 */
export function getDefiniteMoveType(move: MoveData, user: ReadonlyPokemon):
    Type | null
{
    switch (move.modifyType)
    {
        // TODO: also include naturalgift and others
        case "hpType": return user.hpType.definiteValue as Type | null;
        case "plateType":
            if (!user.item.definiteValue) return null;
            return user.item.map[user.item.definiteValue].plateType ?? null;
        default: return move.type;
    }
}

/** Target of move effect. */
export type MoveEffectTarget = "self" | "hit";

// tslint:disable: no-trailing-whitespace (force newline in doc)
/**
 * Move self-faint description.  
 * `"always"` - Immediately on move use, unless the move fails.  
 * `"ifHit"` - Like `"always"` but also includes misses.
 */
// tslint:enable: no-trailing-whitespace
export type MoveSelfFaint = "always" | "ifHit";

/** Format for each item entry in the dex. */
export interface ItemData extends DexData
{
    /** Whether this is a choice item. */
    readonly isChoice?: true;
    /** Plate type if this is a plate item. Used for handling Arceus types. */
    readonly plateType?: Type;
    /**
     * Specifies conditions for activating this item to describe or interrupt
     * an effect.
     */
    readonly on?:
    {
        /** After a move has dealt damage. Affects the user. */
        readonly movePostDamage?: readonly effects.item.MovePostDamage[];
        /** End of turn. */
        readonly turn?:
        {
            /** Holder is poison-type. */
            readonly poison?: readonly effects.item.Turn[];
            /** Holder is not poison-type. */
            readonly noPoison?: readonly effects.item.Turn[];
            /** Additional effects. */
            readonly effects?: readonly effects.item.Turn[];
        };
    };
    /** Like `#on` but for consumable items. */
    readonly consumeOn?:
    {
        /** Whether this item shortens charging (twoTurn) moves. */
        readonly moveCharge?: "shorten";
    };
    // TODO: passive effects
}

/** Item "callback" object types. */
export type ItemOn = keyof NonNullable<ItemData["on"]>;

/** Item "callback" object types for consumable items. */
export type ItemConsumeOn = keyof NonNullable<ItemData["consumeOn"]>;
