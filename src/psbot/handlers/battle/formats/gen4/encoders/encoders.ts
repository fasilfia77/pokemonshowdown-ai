/** @file Formats BattleState objects into data usable by the neural network. */
import {
    assertEncoder,
    augment,
    concat,
    Encoder,
    map,
    nullable,
    optional,
} from "../../../ai/encoder/Encoder";
import {
    booleanEncoder,
    checkLength,
    fillEncoder,
    limitedStatusTurns,
    numberEncoder,
    oneHotEncoder,
    zeroEncoder,
} from "../../../ai/encoder/helpers";
import * as dex from "../dex/dex";
import {
    boostKeys,
    hpTypeKeys,
    majorStatuses,
    majorStatusKeys,
    rolloutKeys,
    statKeys,
    Type,
    typeKeys,
    weatherKeys,
} from "../dex/dex-util";
import {ReadonlyBattleState} from "../state/BattleState";
import {ReadonlyHp} from "../state/Hp";
import {ReadonlyItemTempStatus} from "../state/ItemTempStatus";
import {ReadonlyMajorStatusCounter} from "../state/MajorStatusCounter";
import {ReadonlyMove} from "../state/Move";
import {Moveset, ReadonlyMoveset} from "../state/Moveset";
import {ReadonlyPokemon} from "../state/Pokemon";
import {ReadonlyPokemonTraits} from "../state/PokemonTraits";
import {ReadonlyPossibilityClass} from "../state/PossibilityClass";
import {ReadonlyRoomStatus} from "../state/RoomStatus";
import {ReadonlyStatRange, StatRange} from "../state/StatRange";
import {ReadonlyStatTable} from "../state/StatTable";
import {ReadonlyTeam, Team} from "../state/Team";
import {ReadonlyTeamStatus} from "../state/TeamStatus";
import {ReadonlyTempStatus} from "../state/TempStatus";
import {ReadonlyVariableTempStatus} from "../state/VariableTempStatus";
import {
    ReadonlyMoveStatus,
    ReadonlyVolatileStatus,
} from "../state/VolatileStatus";

/**
 * Creates a PossibilityClass encoder.
 *
 * @template T The key type of the PossibilityClass.
 * @param keys Class names to encode.
 */
export function possibilityClassEncoder<T extends string>(
    keys: readonly T[],
): Encoder<ReadonlyPossibilityClass<T>> {
    return {
        encode(arr, pc) {
            checkLength(arr, keys.length);
            if (pc.size < 0) {
                arr.fill(0);
                return;
            }

            const sumR = 1 / pc.size;
            for (let i = 0; i < keys.length; ++i) {
                arr[i] = pc.isSet(keys[i]) ? sumR : 0;
            }
        },
        size: keys.length,
    };
}

/** Encodes temporary status info. */
export const tempStatusEncoder: Encoder<ReadonlyTempStatus> = {
    encode(arr, ts) {
        checkLength(arr, 1);
        arr[0] = tempStatusEncoderImpl(ts);
    },
    size: 1,
};

/** Encodes TempStatus data into a number. */
function tempStatusEncoderImpl(ts: ReadonlyTempStatus): number {
    return limitedStatusTurns(ts.turns + (ts.isActive ? 1 : 0), ts.duration);
}

/**
 * Creates an Encoder for an ItemTempStatus.
 *
 * @param keys Status types to encode.
 */
export function itemTempStatusEncoder<TStatusType extends string>(
    keys: readonly TStatusType[],
): Encoder<ReadonlyItemTempStatus<TStatusType>> {
    const size = keys.length + 1;
    return {
        encode(arr, its) {
            checkLength(arr, size);

            // Modify one-hot value to interpolate status turns/duration.
            let one: number;
            // Not applicable.
            if (its.type === "none") one = 0;
            // Infinite duration.
            else if (its.duration === null) one = 1;
            // Currently assuming short duration but could have extension item.
            else if (
                its.duration === its.durations[0] &&
                its.source &&
                !its.source.definiteValue &&
                its.source.isSet(its.items[its.type])
            ) {
                // Take average of both durations since either is likely.
                // TODO: Interpolate instead by the likelihood that the source
                // has the item.
                one = limitedStatusTurns(
                    its.turns + 1,
                    (its.durations[0] + its.durations[1]) / 2,
                );
            }
            // Extension item possibility (and therefore duration) is definitely
            // known.
            else one = limitedStatusTurns(its.turns + 1, its.duration);

            for (let i = 0; i < keys.length; ++i) {
                arr[i] = keys[i] === its.type ? one : 0;
            }
            // Indicate whether the extended duration is being used.
            arr[keys.length] = its.duration === its.durations[1] ? 1 : 0;
        },
        size,
    };
}

/**
 * Creates an Encoder for a VariableTempStatus.
 *
 * @param keys Status types to encode.
 */
export function variableTempStatusEncoder<TStatusType extends string>(
    keys: readonly TStatusType[],
): Encoder<ReadonlyVariableTempStatus<TStatusType>> {
    const size = keys.length;
    return {
        encode(arr, vts) {
            checkLength(arr, size);

            // One-hot encode status type, with the 1 also encoding the amount
            // of turns left.
            for (let i = 0; i < keys.length; ++i) {
                arr[i] =
                    keys[i] === vts.type
                        ? limitedStatusTurns(vts.turns + 1, vts.duration)
                        : 0;
            }
        },
        size,
    };
}

/** Max possible base stat. */
export const maxBaseStat = 255;
/** Max possible normal stat. */
export const maxStat = StatRange.calcStat(
    false /*hp*/,
    maxBaseStat,
    100 /*level*/,
    252 /*ev*/,
    31 /*iv*/,
    1.1 /*nature*/,
);
/** Max possible hp stat. */
export const maxStatHp = StatRange.calcStat(
    true /*hp*/,
    maxBaseStat,
    100 /*level*/,
    252 /*ev*/,
    31 /*iv*/,
    1 /*nature*/,
);

/** Encoder for a StatRange. */
export const statRangeEncoder: Encoder<ReadonlyStatRange> = {
    encode(arr, sr) {
        checkLength(arr, 3);
        // Normalize based on max possible stats.
        const reference = sr.hp ? maxStatHp : maxStat;
        arr[0] = sr.min / reference;
        arr[1] = sr.max / reference;
        arr[2] = sr.base / maxBaseStat;
    },
    size: 3,
};

/** Encoder for an unknown StatRange. */
export const unknownStatRangeEncoder: Encoder<null> =
    // Halve max stat as a guess.
    fillEncoder(0.5, statRangeEncoder.size);

/** Encoder for a nonexistent StatRange. */
export const emptyStatRangeEncoder: Encoder<undefined> = fillEncoder(
    -1,
    statRangeEncoder.size,
);

/** Encoder for a StatTable. */
export const statTableEncoder: Encoder<ReadonlyStatTable> = concat(
    ...statKeys.map(statName =>
        augment((st: ReadonlyStatTable) => st[statName], statRangeEncoder),
    ),
    augment(st => (st.level ?? 0) / 100, numberEncoder), // Level out of 100.
    augment(st => st.hpType, possibilityClassEncoder(hpTypeKeys)),
);

/** Encoder for an unknown StatTable. */
export const unknownStatTableEncoder: Encoder<null> = concat(
    ...Array.from(statKeys, () => unknownStatRangeEncoder),
    fillEncoder(0.8, 1), // Level out of 100 (guess).
    fillEncoder(1 / hpTypeKeys.length, hpTypeKeys.length), // Hp type.
);

/** Encoder for a nonexistent StatTable. */
export const emptyStatTableEncoder: Encoder<undefined> = concat(
    ...Array.from(statKeys, () => emptyStatRangeEncoder),
    fillEncoder(-1, 1), // No level.
    fillEncoder(0, hpTypeKeys.length), // No hp type possibilities.
);

/** Types without `???` type. */
const filteredTypes = typeKeys.filter(t => t !== "???") as Exclude<
    Type,
    "???"
>[];

/** Args for {@link pokemonTraitsEncoder}. */
export interface PokemonTraitsEncoderArgs {
    /** Traits object. */
    readonly traits: ReadonlyPokemonTraits;
    /** Optional third type. */
    readonly addedType?: Type;
}

/** Encoder for a PokemonTraits object. */
export const pokemonTraitsEncoder: Encoder<PokemonTraitsEncoderArgs> = concat(
    // Species.
    augment(
        ({
            traits: {
                species: {uid},
            },
        }) => ({id: uid}),
        oneHotEncoder(dex.pokemonKeys.length),
    ),
    // Ability.
    augment(
        ({traits: {ability}}) => ability,
        possibilityClassEncoder(dex.abilityKeys),
    ),
    // Stats.
    augment(({traits: {stats}}) => stats, statTableEncoder),
    // Multi-hot encode.
    {
        encode(arr, {traits: {types: monTypes}, addedType}) {
            checkLength(arr, this.size);
            for (let i = 0; i < this.size; ++i) {
                const type = filteredTypes[i];
                arr[i] = monTypes.includes(type) || type === addedType ? 1 : 0;
            }
        },
        size: filteredTypes.length,
    },
);

/** Encoder for an unknown PokemonTraits object. */
export const unknownPokemonTraitsEncoder: Encoder<null> = concat(
    fillEncoder(1 / dex.abilityKeys.length, dex.abilityKeys.length),
    fillEncoder(1 / dex.pokemonKeys.length, dex.pokemonKeys.length),
    unknownStatTableEncoder,
    // Could be any one or two of these types (avg 1 or 2 types).
    fillEncoder(1.5 / filteredTypes.length, filteredTypes.length),
);

/** Encoder for a nonexistent PokemonTraits object. */
export const emptyPokemonTraitsEncoder: Encoder<undefined> = concat(
    fillEncoder(-1, dex.abilityKeys.length + dex.pokemonKeys.length),
    emptyStatTableEncoder,
    fillEncoder(-1, filteredTypes.length),
);

/** Encoder for a volatile MoveStatus. */
export const moveStatusEncoder: Encoder<ReadonlyMoveStatus> = augment(
    ms =>
        ms.ts.isActive && ms.move
            ? {
                  id: dex.moves[ms.move].uid,
                  one: tempStatusEncoderImpl(ms.ts),
              }
            : {id: null},
    oneHotEncoder(dex.moveKeys.length),
);

/** Maximum boost value. */
const maxBoost = 6;

/** Encoder for a VolatileStatus. */
export const volatileStatusEncoder: Encoder<ReadonlyVolatileStatus> = concat(
    // Passable.
    augment(vs => vs.aquaring, booleanEncoder),
    {
        encode(arr, vs: ReadonlyVolatileStatus) {
            checkLength(arr, boostKeys.length);
            for (let i = 0; i < boostKeys.length; ++i) {
                arr[i] = vs.boosts[boostKeys[i]] / maxBoost;
            }
        },
        size: boostKeys.length,
    },
    augment(vs => vs.confusion, tempStatusEncoder),
    augment(vs => vs.curse, booleanEncoder),
    augment(vs => vs.embargo, tempStatusEncoder),
    augment(vs => vs.focusenergy, booleanEncoder),
    augment(vs => vs.ingrain, booleanEncoder),
    augment(vs => vs.leechseed, booleanEncoder),
    augment(
        vs => vs.lockedOnBy?.lockOnTurns,
        nullable(tempStatusEncoder, zeroEncoder(tempStatusEncoder.size)),
    ),
    augment(vs => vs.lockOnTurns, tempStatusEncoder),
    augment(vs => vs.magnetrise, tempStatusEncoder),
    augment(vs => vs.nightmare, booleanEncoder),
    augment(
        vs => (vs.perish <= 0 ? 0 : limitedStatusTurns(vs.perish, 3)),
        numberEncoder,
    ),
    augment(vs => vs.powertrick, booleanEncoder),
    augment(vs => vs.substitute, booleanEncoder),
    augment(vs => vs.suppressAbility, booleanEncoder),
    augment(vs => !!vs.trapped, booleanEncoder),
    augment(vs => !!vs.trapping, booleanEncoder),

    augment(
        vs => ({id: vs.lastMove ? dex.moves[vs.lastMove].uid : null}),
        oneHotEncoder(dex.moveKeys.length),
    ),

    // Non-passable.
    augment(vs => vs.attract, booleanEncoder),
    augment(vs => vs.bide, tempStatusEncoder),
    augment(vs => vs.charge, tempStatusEncoder),
    augment(
        vs => ({id: vs.choiceLock ? dex.moves[vs.choiceLock].uid : null}),
        oneHotEncoder(dex.moveKeys.length),
    ),
    augment(vs => vs.damaged, booleanEncoder),
    augment(vs => vs.defensecurl, booleanEncoder),
    augment(vs => vs.destinybond, booleanEncoder),
    augment(vs => vs.disabled, moveStatusEncoder),
    augment(vs => vs.encore, moveStatusEncoder),
    augment(vs => vs.flashfire, booleanEncoder),
    augment(vs => vs.focus, booleanEncoder),
    augment(vs => vs.grudge, booleanEncoder),
    augment(vs => vs.healblock, tempStatusEncoder),
    augment(vs => vs.identified === "foresight", booleanEncoder),
    augment(vs => vs.identified === "miracleeye", booleanEncoder),
    augment(vs => vs.imprison, booleanEncoder),
    augment(vs => vs.lockedMove, variableTempStatusEncoder(dex.lockedMoveKeys)),
    augment(vs => vs.magiccoat, booleanEncoder),
    augment(vs => vs.micleberry, booleanEncoder),
    augment(vs => vs.minimize, booleanEncoder),
    augment(
        vs => ({id: vs.mirrormove ? dex.moves[vs.mirrormove].uid : null}),
        oneHotEncoder(dex.moveKeys.length),
    ),
    augment(vs => vs.mudsport, booleanEncoder),
    augment(vs => vs.mustRecharge, booleanEncoder),
    augment(
        vs => ({traits: vs.overrideTraits!, addedType: vs.addedType}),
        pokemonTraitsEncoder,
    ),
    augment(vs => vs.rage, booleanEncoder),
    augment(vs => vs.rollout, variableTempStatusEncoder(rolloutKeys)),
    augment(vs => vs.roost, booleanEncoder),
    augment(vs => vs.slowstart, tempStatusEncoder),
    augment(vs => vs.snatch, booleanEncoder),
    // Stall fail rate.
    // Halves each time a stalling move is used, capped at min 12.5% success
    // rate in gen4.
    augment(vs => {
        const successRate = 2 ** -vs.stallTurns;
        return Math.min(0.875, 1 - successRate);
    }, numberEncoder),
    augment(vs => vs.stockpile / 3, numberEncoder),
    augment(vs => vs.taunt, tempStatusEncoder),
    augment(vs => vs.torment, booleanEncoder),
    augment(vs => vs.transformed, booleanEncoder),
    augment(vs => vs.twoTurn, variableTempStatusEncoder(dex.twoTurnMoveKeys)),
    augment(vs => vs.unburden, booleanEncoder),
    augment(vs => vs.uproar, tempStatusEncoder),
    augment(vs => vs.watersport, booleanEncoder),
    augment(vs => vs.willTruant, booleanEncoder),
    augment(vs => vs.yawn, tempStatusEncoder),
);

/** Encoder for a MajorStatusCounter. */
export const majorStatusCounterEncoder: Encoder<ReadonlyMajorStatusCounter> =
    augment(
        msc => ({
            id: msc.current && majorStatuses[msc.current],
            one:
                msc.current === "tox"
                    ? // %hp taken by toxic damage next turn, capped at 15/16.
                      // Note: Damage is actually turns * max(1, floor(hp/16)).
                      Math.min(15 / 16, msc.turns / 16)
                    : msc.current === "slp"
                    ? // Chance of staying asleep.
                      limitedStatusTurns(msc.turns, msc.duration!)
                    : // Irrelevant.
                      1,
        }),
        oneHotEncoder(majorStatusKeys.length),
    );

/** Encoder for an unknown MajorStatusCounter. */
export const unknownMajorStatusCounterEncoder: Encoder<null> = fillEncoder(
    0,
    majorStatusCounterEncoder.size,
);

/** Encoder for a nonexistent MajorStatusCounter. */
export const emptyMajorStatusCounterEncoder: Encoder<undefined> = fillEncoder(
    0,
    majorStatusCounterEncoder.size,
);

// TODO: Move to dex.
/** Max PP of any move. */
export const maxPossiblePp = 64;

/** Encoder for an unknown Move's PP value. */
const unknownPpEncoder: Encoder<unknown> = {
    encode(arr) {
        checkLength(arr, 2);
        arr[0] = 1; // Ratio of pp to maxpp.
        arr[1] = 0.5; // Ratio of maxpp to max possible pp (TODO: guess).
    },
    size: 2,
};

/** Encoder for a Move. */
export const moveEncoder: Encoder<ReadonlyMove> = concat(
    augment(m => ({id: m.data.uid}), oneHotEncoder(dex.moveKeys.length)),
    // Ratio of pp to maxpp.
    augment(m => m.pp / m.maxpp, numberEncoder),
    // Ratio of maxpp to max possible pp.
    augment(m => m.maxpp / maxPossiblePp, numberEncoder),
);

/** Args for {@link constrainedMoveEncoder}. */
export interface ConstrainedMoveArgs {
    readonly move: "constrained";
    /** Mapping of move name to number of mentions. */
    readonly constraint: {readonly [name: string]: number};
    /**
     * Total number of mentions, i.e. the sum of all the {@link constraint}
     * entries.
     */
    readonly total: number;
}

/** Encoder for an unknown Move slot with a constraint. */
export const constrainedMoveEncoder: Encoder<ConstrainedMoveArgs> = concat(
    {
        encode(arr, {constraint, total}) {
            checkLength(arr, dex.moveKeys.length);
            // Encode constraint data.
            for (let i = 0; i < dex.moveKeys.length; ++i) {
                arr[i] = (constraint[dex.moveKeys[i]] ?? 0) / total;
            }
        },
        size: dex.moveKeys.length,
    } as Encoder<ConstrainedMoveArgs>,
    unknownPpEncoder,
);

/** Encoder for an unknown Move slot. */
export const unknownMoveEncoder: Encoder<null> = concat(
    // Assume each move is equally probable.
    fillEncoder(1 / dex.moveKeys.length, dex.moveKeys.length),
    unknownPpEncoder,
);

/** Encoder for an empty Move slot. */
export const emptyMoveEncoder: Encoder<undefined> =
    // No likelihood for any move type + 0 pp.
    fillEncoder(0, dex.moveKeys.length + 2);

/** Args for {@link moveEncoder} to indicate that the Move is known. */
export interface KnownMoveArgs {
    /** Move to encode. */
    readonly move: ReadonlyMove;
}

/** Args for {@link moveSlotEncoder}. */
export type MoveSlotArgs = KnownMoveArgs | ConstrainedMoveArgs | undefined;

/** Encoder for a Move slot within a Moveset. */
export const moveSlotEncoder: Encoder<MoveSlotArgs> = {
    encode(arr, args) {
        checkLength(arr, this.size);
        if (!args) emptyMoveEncoder.encode(arr, args);
        else if (args.move === "constrained") {
            constrainedMoveEncoder.encode(arr, args);
        } else moveEncoder.encode(arr, args.move);
    },
    size: moveEncoder.size,
};
/** Encoder for a known Moveset. */
export const movesetEncoder: Encoder<ReadonlyMoveset> = augment(
    ms => getMoveArgs(ms),
    map(Moveset.maxSize, moveSlotEncoder),
);

/**
 * Gets data about every moveslot in the given Moveset.
 *
 * @param ms Moveset to extract from.
 * @returns An array of partially-encoded {@link moveEncoder} args.
 */
function getMoveArgs(ms: ReadonlyMoveset): MoveSlotArgs[] {
    const result: MoveSlotArgs[] = [];
    // Known.
    for (const move of ms.moves.values()) result.push({move});
    // Unknown.
    if (ms.moves.size < ms.size) {
        // Precalculate unknown move encoding.
        const constraint: {[name: string]: number} = {};
        let total = ms.constraint.size;
        for (const name of ms.constraint) constraint[name] = 1;
        for (const moveConstraint of ms.moveSlotConstraints) {
            for (const name of moveConstraint) {
                constraint[name] = (constraint[name] ?? 0) + 1;
            }
            total += moveConstraint.size;
        }
        const constrainedArgs: ConstrainedMoveArgs = {
            move: "constrained",
            constraint,
            total,
        };
        for (let i = ms.moves.size; i < ms.size; ++i) {
            result.push(constrainedArgs);
        }
    }
    // Empty.
    for (let i = ms.size; i < Moveset.maxSize; ++i) {
        result.push(undefined);
    }
    return result;
}

/** Encoder for an unknown Moveset. */
export const unknownMovesetEncoder: Encoder<null> = concat(
    ...Array.from({length: Moveset.maxSize}, () => unknownMoveEncoder),
);

/** Encoder for a nonexistent Moveset. */
export const emptyMovesetEncoder: Encoder<undefined> = concat(
    ...Array.from({length: Moveset.maxSize}, () => emptyMoveEncoder),
);

/** Encoder for an Hp object. */
export const hpEncoder: Encoder<{
    readonly hp: ReadonlyHp;
    readonly ours: boolean;
}> = {
    encode(arr, {hp, ours}) {
        checkLength(arr, 2);
        arr[0] = hp.max === 0 ? 0 : hp.current / hp.max;
        if (!ours) arr[1] = 0.5;
        else arr[1] = hp.max / maxStatHp; // TODO: Guess hp stat.
    },
    size: 2,
};

/** Encoder for an unknown Hp object. */
export const unknownHpEncoder: Encoder<null> = {
    encode(arr) {
        // TODO: Guess hp stat.
        arr[0] = 1; // Full hp.
        arr[1] = 0.5; // Middle of possible hp range.
    },
    size: 2,
};

/** Encoder for a nonexistent Hp object. */
export const emptyHpEncoder: Encoder<undefined> = fillEncoder(-1, 2);

/** Encoder for an inactive Pokemon. */
export const inactivePokemonEncoder: Encoder<{
    readonly mon: ReadonlyPokemon;
    readonly ours: boolean;
}> = concat(
    augment(({mon: p}) => ({traits: p.traits}), pokemonTraitsEncoder),
    augment(({mon: p}) => p.item, possibilityClassEncoder(dex.itemKeys)),
    augment(({mon: p}) => p.lastItem, possibilityClassEncoder(dex.itemKeys)),
    augment(({mon: p}) => p.moveset, movesetEncoder),
    augment(({mon: p}) => p.gender === "M", booleanEncoder),
    augment(({mon: p}) => p.gender === "F", booleanEncoder),
    augment(({mon: p}) => p.gender === null, booleanEncoder),
    augment(({mon: p}) => (p.happiness ?? /*half*/ 127.5) / 255, numberEncoder),
    augment(({mon: p, ours}) => ({hp: p.hp, ours}), hpEncoder),
    augment(({mon: p}) => p.majorStatus, majorStatusCounterEncoder),
    augment(({mon: p}) => {
        const {grounded} = p;
        if (grounded === true) return [1, 0];
        if (grounded === false) return [0, 1];
        return [0.5, 0.5];
    }, map(2, numberEncoder)),
);

/** Encoder for an unrevealed Pokemon. */
export const unknownPokemonEncoder: Encoder<null> = concat(
    unknownPokemonTraitsEncoder,
    zeroEncoder(2 * dex.itemKeys.length), // Item + lastItem.
    unknownMovesetEncoder,
    fillEncoder(1 / 3, 3), // Gender possibilities.
    fillEncoder(1, 1), // Happiness guess.
    unknownHpEncoder,
    unknownMajorStatusCounterEncoder,
    fillEncoder(0.5, 2), // Grounded guess.
);

/** Encoder for an empty Pokemon slot. */
export const emptyPokemonEncoder: Encoder<undefined> = concat(
    emptyPokemonTraitsEncoder,
    fillEncoder(0, 2 * dex.itemKeys.length), // Item + lastItem.
    emptyMovesetEncoder,
    fillEncoder(-1, 4), // Gender + happiness.
    emptyHpEncoder,
    emptyMajorStatusCounterEncoder,
    fillEncoder(-1, 2), // Grounded.
);

/** Encoder for a benched Pokemon slot, which may be unknown or empty. */
export const benchedPokemonEncoder = optional(
    inactivePokemonEncoder,
    unknownPokemonEncoder,
    emptyPokemonEncoder,
);

// TODO: Should Team manage active slots and VolatileStatus?
/** Encoder for an active Pokemon. */
export const activePokemonEncoder: Encoder<{
    readonly mon: ReadonlyPokemon;
    readonly ours: boolean;
}> = concat(
    inactivePokemonEncoder,
    augment(({mon: p}) => p.volatile, volatileStatusEncoder),
);

/** Encoder for a {@link TeamStatus}. */
export const teamStatusEncoder: Encoder<ReadonlyTeamStatus> = concat(
    ...dex.futureMoveKeys.map(fm =>
        augment(
            (ts: ReadonlyTeamStatus) => ts.futureMoves[fm],
            tempStatusEncoder,
        ),
    ),
    augment(ts => ts.healingwish, booleanEncoder),
    augment(ts => ts.lightscreen, itemTempStatusEncoder(["lightscreen"])),
    augment(ts => ts.luckychant, tempStatusEncoder),
    augment(ts => ts.lunardance, booleanEncoder),
    augment(ts => ts.mist, tempStatusEncoder),
    augment(ts => ts.reflect, itemTempStatusEncoder(["reflect"])),
    augment(ts => ts.safeguard, tempStatusEncoder),
    augment(ts => !!ts.selfSwitch, booleanEncoder),
    augment(ts => ts.selfSwitch === "copyvolatile", booleanEncoder),
    augment(ts => ts.spikes / 3, numberEncoder),
    augment(ts => ts.stealthrock, numberEncoder),
    augment(ts => ts.toxicspikes / 2, numberEncoder),
    augment(ts => ts.tailwind, tempStatusEncoder),
    augment(ts => ts.wish, tempStatusEncoder),
);

/** Args for {@link teamEncoder}. */
interface TeamEncoderArgs {
    /** Team to encode. */
    readonly team: ReadonlyTeam;
    /** Whether this is the client's team. */
    readonly ours: boolean;
}

/** Encoder for a {@link Team}. */
export const teamEncoder: Encoder<TeamEncoderArgs> = concat(
    assertEncoder(({team: t}) => {
        if (!t.active) {
            throw new Error("Team does not have an active Pokemon");
        }
        // istanbul ignore next: Should never happen.
        if (t.active !== t.pokemon[0]) {
            throw new Error("Active Pokemon is not in the right Team slot");
        }
        // istanbul ignore next: Should never happen.
        if (!t.active.active) {
            throw new Error("Active Pokemon is not active");
        }
        for (let i = 1; i < t.pokemon.length; ++i) {
            // istanbul ignore next: Should never happen.
            if (t.pokemon[i]?.active) {
                throw new Error(`Pokemon in Team slot ${i} is active`);
            }
        }
    }),
    augment(({team: t, ours}) => ({mon: t.active, ours}), activePokemonEncoder),
    ...Array.from({length: Team.maxSize - 1}, (_, i) =>
        augment(
            ({team: t, ours}: TeamEncoderArgs) =>
                // Note: Treat fainted mons as nonexistent since they're
                // permanently removed from the game.
                t.pokemon[i]?.fainted
                    ? undefined
                    : t.pokemon[i] && {mon: t.pokemon[i]!, ours},
            benchedPokemonEncoder,
        ),
    ),
    augment(({team: t}) => t.status, teamStatusEncoder),
);

/** Encoder for a RoomStatus. */
export const roomStatusEncoder: Encoder<ReadonlyRoomStatus> = concat(
    augment(rs => rs.gravity, tempStatusEncoder),
    augment(rs => rs.trickroom, tempStatusEncoder),
    augment(rs => rs.weather, itemTempStatusEncoder(weatherKeys)),
);

/** Encoder for a BattleState. */
export const battleStateEncoder: Encoder<ReadonlyBattleState> = concat(
    assertEncoder(state => {
        if (!state.ourSide) throw new Error("state.ourSide is undefined");
    }),
    augment(bs => bs.status, roomStatusEncoder),
    augment(bs => ({team: bs.getTeam(bs.ourSide!), ours: true}), teamEncoder),
    augment(
        bs => ({
            team: bs.getTeam(bs.ourSide === "p1" ? "p2" : "p1"),
            ours: false,
        }),
        teamEncoder,
    ),
);