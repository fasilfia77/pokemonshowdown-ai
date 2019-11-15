import { FutureMove, TwoTurnMove } from "../dex/dex";
import { BoostName, MajorStatus, StatExceptHP, Type, WeatherType } from
    "../dex/dex-util";
import { MoveData, MoveOptions } from "../state/Pokemon";
import { Side } from "../state/Side";

/**
 * Defines the type maps for each DriverEvent. Key must match the DriverEvent's
 * `#type` field.
 */
interface DriverEventMap
{
    initTeam: InitTeam;
    initOtherTeamSize: InitOtherTeamSize;
    preTurn: PreTurn;
    postTurn: PostTurn;
    activateAbility: ActivateAbility;
    gastroAcid: GastroAcid;
    activateStatusEffect: ActivateStatusEffect;
    disableMove: DisableMove;
    reenableMoves: ReenableMoves;
    activateFutureMove: ActivateFutureMove;
    updateStatusEffect: UpdateStatusEffect;
    fatigue: Fatigue;
    setThirdType: SetThirdType;
    changeType: ChangeType;
    mimic: Mimic;
    sketch: Sketch;
    trap: Trap;
    boost: Boost;
    unboost: Unboost;
    clearAllBoosts: ClearAllBoosts;
    clearNegativeBoosts: ClearNegativeBoosts;
    clearPositiveBoosts: ClearPositiveBoosts;
    copyBoosts: CopyBoosts;
    invertBoosts: InvertBoosts;
    setBoost: SetBoost;
    swapBoosts: SwapBoosts;
    inactive: Inactive;
    afflictStatus: AfflictStatus;
    cureStatus: CureStatus;
    cureTeam: CureTeam;
    formChange: FormChange;
    transform: Transform;
    transformPost: TransformPost;
    faint: Faint;
    revealItem: RevealItem;
    removeItem: RemoveItem;
    useMove: UseMove;
    prepareMove: PrepareMove;
    revealMove: RevealMove;
    mustRecharge: MustRecharge;
    setSingleMoveStatus: SetSingleMoveStatus;
    setSingleTurnStatus: SetSingleTurnStatus;
    takeDamage: TakeDamage;
    activateSideCondition: ActivateSideCondition;
    activateFieldCondition: ActivateFieldCondition;
    switchIn: SwitchIn;
    rejectSwitchTrapped: RejectSwitchTrapped;
    clearSelfSwitch: ClearSelfSwitch;
    resetWeather: ResetWeather;
    setWeather: SetWeather;
    tickWeather: TickWeather;
}

/** The types of DriverEvents that can exist. */
export type DriverEventType = keyof DriverEventMap;

/** Maps DriverEventType to a DriverEvent interface type. */
export type DriverEvent<T extends DriverEventType> = DriverEventMap[T];

/** Stands for any type of DriverEvent. */
export type AnyDriverEvent = DriverEvent<DriverEventType>;

/** Base class for all DriverEvents. */
interface DriverEventBase<T extends DriverEventType>
{
    /** The type of DriverEvent this is. */
    readonly type: T;
}

/** Initializes the client's team. */
export interface InitTeam extends DriverEventBase<"initTeam">
{
    readonly team: readonly DriverInitPokemon[];
}

/** Data for initializing a pokemon. */
export interface DriverInitPokemon extends DriverSwitchOptions
{
    /** Pokemon's stats. HP is provided in a separate field. */
    readonly stats: Readonly<Record<StatExceptHP, number>>;
    /** List of move id names. */
    readonly moves: readonly string[];
    /** Base ability id name. */
    readonly baseAbility: string;
    /** Item id name. */
    readonly item: string;

    /** Hidden Power type if applicable. */
    readonly hpType?: Type;
    /** Happiness value if applicable. */
    readonly happiness?: number;
}

/** Data for handling a switch-in. */
export interface DriverSwitchOptions
{
    /** Pokemon's species. */
    readonly species: string;
    /** Level between 1 and 100. */
    readonly level: number;
    /** Pokemon's gender. Can be M, F, or null. */
    readonly gender: string | null;
    /** Pokemon's current HP. */
    readonly hp: number;
    /** Pokemon's max HP. */
    readonly hpMax: number;
}

/** Initializes the opponent's team size. */
export interface InitOtherTeamSize extends DriverEventBase<"initOtherTeamSize">
{
    /** Size to set the opponent's team to. */
    readonly size: number;
}

/** Indicates that the turn is about to begin. */
export interface PreTurn extends DriverEventBase<"preTurn"> {}

/** Indicates that the turn is about to end. */
export interface PostTurn extends DriverEventBase<"postTurn"> {}

/** Reveals, changes, and/or activates a pokemon's ability. */
export interface ActivateAbility extends DriverEventBase<"activateAbility">
{
    /** Pokemon being associated with an ability. */
    readonly monRef: Side;
    /** Ability being activated or revealed. */
    readonly ability: string;
    /**
     * If the pokemon is receiving the ability via Trace, this should specify
     * the pokemon being Traced.
     */
    readonly traced?: Side;
}

/** Reveals and suppresses a pokemon's ability due to Gastro Acid. */
export interface GastroAcid extends DriverEventBase<"gastroAcid">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Ability being suppressed due to the Gastro Acid effect. */
    readonly ability: string;
}

/** Starts, sets, or ends a trivial status effect. */
export interface ActivateStatusEffect extends
    DriverEventBase<"activateStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type of status in question. */
    readonly status: StatusEffectType;
    /** Whether to start (true) or end (false) the status. */
    readonly start: boolean;
}

/** Typing for `ActivateStatusEffect#status`. */
export type StatusEffectType = "aquaRing" | "attract" | "bide" | "confusion" |
    "charge" | "encore" | "focusEnergy" | "foresight" | "ingrain" |
    "leechSeed" | "magnetRise" | "miracleEye" | "embargo" | "substitute" |
    "slowStart" | "taunt" | "torment" | "uproar";

/** Temporarily disables the pokemon's move. */
export interface DisableMove extends DriverEventBase<"disableMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being disabled. */
    readonly move: string;
}

/** Re-enables the pokemon's disabled moves. */
export interface ReenableMoves extends DriverEventBase<"reenableMoves">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Prepares or releases a future move. */
export interface ActivateFutureMove extends
    DriverEventBase<"activateFutureMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being disabled. */
    readonly move: FutureMove;
    /** Whether the move is being prepared (true) or released (false). */
    readonly start: boolean;
}

/**
 * Indicates that a status effect is still going. Usually this is implied at the
 * end of the turn unless the game usually sends an explicit message, which this
 * DriverEvent covers.
 */
export interface UpdateStatusEffect extends
    DriverEventBase<"updateStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type of status to update. */
    readonly status: UpdatableStatusEffectType;
}

/** Typing for `UpdateStatusEffect#status`. */
export type UpdatableStatusEffectType = "confusion" | "bide" | "uproar";

/** Indicates that the pokemon's locked move ended due to fatigue. */
export interface Fatigue extends DriverEventBase<"fatigue">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Sets the pokemon's temporary third type. */
export interface SetThirdType extends DriverEventBase<"setThirdType">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type to set. */
    readonly thirdType: Type;
}

/** Temporarily changes the pokemon's types. Also resets third type. */
export interface ChangeType extends DriverEventBase<"changeType">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Types to set. */
    readonly newTypes: readonly [Type, Type];
}

/** Indicates that the pokemon is Mimicking a move. */
export interface Mimic extends DriverEventBase<"mimic">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being Mimicked. */
    readonly move: string;
}

/** Indicates that the pokemon is Sketching a move. */
export interface Sketch extends DriverEventBase<"sketch">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being Sketched. */
    readonly move: string;
}

/** Indicates that the pokemon is being trapped by another. */
export interface Trap extends DriverEventBase<"trap">
{
    /** Pokemon being trapped. */
    readonly target: Side;
    /** Pokemon that is trapping. */
    readonly by: Side;
}

/**
 * Temporarily boosts one of the pokemon's stats by the given amount of stages.
 */
export interface Boost extends DriverEventBase<"boost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Stat to boost. */
    readonly stat: BoostName;
    /** Amount to boost by. */
    readonly amount: number;
}

/**
 * Temporarily unboosts one of the pokemon's stats by the given amount of
 * stages.
 */
export interface Unboost extends DriverEventBase<"unboost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Stat to boost. */
    readonly stat: BoostName;
    /** Amount to boost by. */
    readonly amount: number;
}

/** Clears all temporary stat boosts from the field. */
export interface ClearAllBoosts extends DriverEventBase<"clearAllBoosts"> {}

/** Clears temporary negative stat boosts from the pokemon. */
export interface ClearNegativeBoosts extends
    DriverEventBase<"clearNegativeBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Clears temporary positive stat boosts from the pokemon. */
export interface ClearPositiveBoosts extends
    DriverEventBase<"clearPositiveBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Copies temporary stat boosts from one pokemon to the other. */
export interface CopyBoosts extends DriverEventBase<"copyBoosts">
{
    /** Pokemon to get the boosts from. */
    readonly from: Side;
    /** Pokemon to copy the boosts to. */
    readonly to: Side;
}

/** Inverts all of the pokemon's temporary stat boosts. */
export interface InvertBoosts extends DriverEventBase<"invertBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Sets the pokemon's temporary stat boost to a given amount */
export interface SetBoost extends DriverEventBase<"setBoost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Stat to set the boost of. */
    readonly stat: BoostName;
    /** Stage to set the boost to. */
    readonly amount: number;
}

/** Swaps the given temporary stat boosts of two pokemon. */
export interface SwapBoosts extends DriverEventBase<"swapBoosts">
{
    /** First pokemon reference. */
    readonly monRef1: Side;
    /** Second pokemon reference. */
    readonly monRef2: Side;
    /** Stats to swap. */
    readonly stats: readonly BoostName[];
}

/** Indicates that the pokemon spent its turn being inactive. */
export interface Inactive extends DriverEventBase<"inactive">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Reason that the pokemon was inactive. */
    readonly reason?: InactiveReason;
}

/** Typing for `Inactive#reason`. */
export type InactiveReason = "recharge" | "slp" | "truant";

/** Afflicts the pokemon with a major status condition. */
export interface AfflictStatus extends DriverEventBase<"afflictStatus">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Status to afflict. */
    readonly status: MajorStatus;
}

/** Cures the pokemon of a major status condition. */
export interface CureStatus extends DriverEventBase<"cureStatus">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Status to cure. */
    readonly status: MajorStatus;
}

/** Cures all pokemon of a team of any major status conditions. */
export interface CureTeam extends DriverEventBase<"cureTeam">
{
    /** Team reference. */
    readonly teamRef: Side;
}

/** Indicates that the pokemon changed its form. */
export interface FormChange extends DriverEventBase<"formChange">,
    DriverSwitchOptions
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Whether this form change is permanent. */
    readonly perm: boolean;
}

/** Indicates that a pokemon has transformed into its target. */
export interface Transform extends DriverEventBase<"transform">
{
    /** Pokemon that is transforming. */
    readonly source: Side;
    /** Pokemon to transform into. */
    readonly target: Side;
}

/**
 * Reveals and infers more details due to Transform. The referenced pokemon
 * should already have been referenced in a recent Transform event.
 */
export interface TransformPost extends DriverEventBase<"transformPost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Transformed pokemon's moves with pp values. */
    readonly moves: readonly MoveData[];
    /** Transformed pokemon's stats. */
    readonly stats: Readonly<Record<StatExceptHP, number>>;
}

/** Indicates that the pokemon fainted. */
export interface Faint extends DriverEventBase<"faint">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Reveals that the pokemon is now holding an item. */
export interface RevealItem extends DriverEventBase<"revealItem">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Item name. */
    readonly item: string;
    /**
     * Whether the item was gained just now or being revealed. If `"recycle"`,
     * the item was recovered via the Recycle move.
     */
    readonly gained: boolean | "recycle";
}

/** Indicates that an item was just removed from the pokemon. */
export interface RemoveItem extends DriverEventBase<"removeItem">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /**
     * False if the item was removed or transferred. If the item was consumed
     * (i.e., it can be brought back using the Recycle move), this is set to
     * the item's name, or just true if the item's name is unknown.
     */
    readonly consumed: string | boolean;
}

/** Indicates that the pokemon used a move. */
export interface UseMove extends DriverEventBase<"useMove">,
    Readonly<Omit<MoveOptions, "targets">>
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Targets of the move. */
    readonly targets: readonly Side[];
}

/** Indicates that the pokemon starting to prepare a two-turn move. */
export interface PrepareMove extends DriverEventBase<"prepareMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move to prepare. */
    readonly move: TwoTurnMove;
}

/** Reveals that the pokemon knows a move. */
export interface RevealMove extends DriverEventBase<"revealMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move name. */
    readonly move: string;
}

/** Indicates that the pokemon must recharge from the previous action. */
export interface MustRecharge extends DriverEventBase<"mustRecharge">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Sets a single-move status for the pokemon. */
export interface SetSingleMoveStatus extends
    DriverEventBase<"setSingleMoveStatus">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Status to set. */
    readonly status: SingleMoveStatus;
}

/** Typing for `SetSingleMoveStatus#status`. */
export type SingleMoveStatus = "destinyBond" | "grudge";

/** Sets a single-turn status for the pokemon. */
export interface SetSingleTurnStatus extends
    DriverEventBase<"setSingleTurnStatus">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Status to set. */
    readonly status: SingleTurnStatus;
}

/** Typing for `SetSingleTurnStatus#status`. */
export type SingleTurnStatus = "stall" | "roost" | "magicCoat";

/** Indicates that a pokemon took damage (or was healed) and its HP changed. */
export interface TakeDamage extends DriverEventBase<"takeDamage">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** HP/max pair. */
    readonly newHP: readonly [number, number];
    /**
     * Whether the damage was due to poison or toxic. This is so the toxic
     * counter can be updated properly.
     */
    readonly tox: boolean;
}

/** Activates a team status condition. */
export interface ActivateSideCondition extends
    DriverEventBase<"activateSideCondition">
{
    /** Team reference. */
    readonly teamRef: Side;
    /** Name of the condition. */
    readonly condition: SideConditionType;
    /** Whether to start (`true`) or end (`false`) the condition. */
    readonly start: boolean;
    /** Optional pokemon reference to the one who caused this event. */
    readonly monRef?: Side;
}

/** Typing for `ActivateSideCondition#condition`. */
export type SideConditionType = "lightScreen" | "reflect" | "spikes" |
    "stealthRock" | "tailwind" | "toxicSpikes";

/** Activates a field status condition. */
export interface ActivateFieldCondition extends
    DriverEventBase<"activateFieldCondition">
{
    /** Name of the condition. */
    readonly condition: FieldConditionType;
    /** Whether to start (`true`) or end (`false`) the condition. */
    readonly start: boolean;
}

/** Typing for `ActivateFieldCondition#condition`. */
export type FieldConditionType = "gravity" | "trickRoom";

/** Indicates that a pokemon has switched in. */
export interface SwitchIn extends DriverEventBase<"switchIn">,
    DriverSwitchOptions
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon is being trapped by an unknown ability. */
export interface RejectSwitchTrapped extends
    DriverEventBase<"rejectSwitchTrapped">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Reference to the pokemon with the trapping ability. */
    readonly by: Side;
}

/** Clears self-switch flags for both teams. */
export interface ClearSelfSwitch extends DriverEventBase<"clearSelfSwitch"> {}

/** Resets the weather back to none. */
export interface ResetWeather extends DriverEventBase<"resetWeather"> {}

/** Sets the current weather. */
export interface SetWeather extends DriverEventBase<"setWeather">
{
    /** Who caused the weather. */
    readonly monRef: Side;
    /** Type of weather. */
    readonly weatherType: WeatherType;
    /** What action or trait caused the weather. */
    readonly cause: "move" | "ability";
}

/** Indicates that the current weather condition is still active. */
export interface TickWeather extends DriverEventBase<"tickWeather">
{
    /** Type of weather. */
    readonly weatherType: WeatherType;
}