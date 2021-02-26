import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop, hasStatus } from "../helpers";
import { dispatch, handlers as base } from "./base";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference, SubReason } from "./EventInference";
import { assertMoveType, moveIsType } from "./helpers";
import * as parsers from "./parsers";

/** Result from `expectAbilities()` and variants like `onStart()`. */
export type ExpectAbilitiesResult = ExpectEventsResult<AbilityResult>;

/**
 * Expects an on-`switchOut` ability to activate.
 * @param eligible Eligible pokemon.
 */
export async function* onSwitchOut(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        function switchoutFilter(data, monRef)
        {
            if (!data.on?.switchOut) return null;
            const mon = pstate.state.teams[monRef].active;
            // cure a major status condition
            return data.on.switchOut.cure && mon.majorStatus.current ?
                new Set() : null;
        });

    return yield* expectAbilities(pstate, "switchOut", pendingAbilities,
        /*hitByMove*/ undefined, lastEvent);
}

/**
 * Expects an on-`start` ability to activate.
 * @param eligible Eligible pokemon.
 */
export async function* onStart(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        function startFilter(data, monRef)
        {
            if (!data.on?.start) return null;
            // TODO: add trace/forewarn restrictions
            // activate on a certain status
            if (data.on.start.cure && data.statusImmunity)
            {
                const mon = pstate.state.teams[monRef].active;
                for (const statusType in data.statusImmunity)
                {
                    if (data.statusImmunity.hasOwnProperty(statusType) &&
                        hasStatus(mon, statusType as dexutil.StatusType))
                    {
                        return new Set();
                    }
                }
                return null;
            }
            if (data.on.start.revealItem)
            {
                // TODO(doubles): track actual opponents
                const opp = pstate.state.teams[otherSide(monRef)].active;
                return new Set([opponentHasItem(opp)]);
            }
            return new Set();
        });

    return yield* expectAbilities(pstate, "start", pendingAbilities,
        /*hitByMove*/ undefined, lastEvent);
}

/**
 * Expects an on-`block` ability to activate on a certain blockable effect.
 * @param eligible Eligible pokemon.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onBlock(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, userRef: Side,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    // if move user ignores the target's abilities, then this function can't be
    //  called
    const user = pstate.state.teams[userRef].active;
    if (ignoresTargetAbility(user))
    {
        return {...lastEvent && {event: lastEvent}, results: []};
    }
    const moveTypes = dexutil.getMoveTypes(hitByMove, user);

    // TODO: account for ghost flag? no move currently exists that would be
    //  affected
    const status = !hitByMove.effects?.status?.chance ?
        hitByMove.effects?.status?.hit : undefined;

    const pendingAbilities = getAbilities(pstate, eligible,
        function blockFilter(data)
        {
            if (!data.on?.block) return null;
            // block move's main status effect
            if (data.on.block.status && data.statusImmunity &&
                status?.some(s => data.statusImmunity![s]))
            {
                return new Set();
            }
            // block move based on its type
            // can't activate unless the ability could block one of the move's
            //  possible types
            if (data.on.block.move && moveTypes.has(data.on.block.move.type))
            {
                return new Set(
                [
                    moveIsType(hitByMove, user,
                        new Set([data.on.block.move.type]))
                ]);
            }
            // block move based on damp
            if (hitByMove.flags?.explosive && data.on.block.effect?.explosive)
            {
                return new Set();
            }
            return null;
        });

    return yield* expectAbilities(pstate, "block", pendingAbilities,
        hitByMove, lastEvent);
}

// TODO: refactor hitByMove to support other unboost effects, e.g. intimidate
/**
 * Expects an on-`tryUnboost` ability to activate on a certain unboost effect.
 * @param eligible Eligible pokemon.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onTryUnboost(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, userRef: Side,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    // if move user ignores the target's abilities, then this function can't be
    //  called
    const user = pstate.state.teams[userRef].active;
    if (ignoresTargetAbility(user))
    {
        return {...lastEvent && {event: lastEvent}, results: []};
    }

    const boosts =
        !hitByMove.effects?.boost?.chance && !hitByMove.effects?.boost?.set ?
            hitByMove.effects?.boost?.hit ?? {} : {};

    const pendingAbilities = getAbilities(pstate, eligible,
        function tryUnboostFilter(data)
        {
            if (!data.on?.tryUnboost) return null;
            // make sure an unboost can be blocked
            if ((Object.keys(boosts) as dexutil.BoostName[]).every(
                b => boosts[b]! >= 0 || !data.on!.tryUnboost!.block?.[b]))
            {
                return null;
            }
            return new Set();
        });

    return yield* expectAbilities(pstate, "tryUnboost", pendingAbilities,
        hitByMove, lastEvent);
}

/** Checks if a pokemon's ability definitely ignores the target's abilities. */
function ignoresTargetAbility(mon: ReadonlyPokemon): boolean
{
    if (!mon.volatile.suppressAbility)
    {
        const userAbility = mon.traits.ability;
        if ([...userAbility.possibleValues]
            .every(n => userAbility.map[n].flags?.ignoreTargetAbility))
        {
            return true;
        }
    }
    return false;
}

/**
 * Expects an on-`status` ability to activate after afflicting a status
 * condition.
 * @param eligible Eligible pokemon with the status.
 * @param statusType Status that was afflicted.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onStatus(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    statusType: dexutil.StatusType, hitByMove?: dexutil.MoveData,
    lastEvent?: events.Any): SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        d => d.on?.status?.cure && d.statusImmunity?.[statusType] ?
            new Set() : null);

    return yield* expectAbilities(pstate, "status", pendingAbilities, hitByMove,
        lastEvent);
}

/**
 * Expects an on-`moveDamage` ability (or variants of this condition) to
 * activate.
 * @param eligible Eligible pokemon.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onMoveDamage(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    qualifier: "damage" | "contact" | "contactKO", userRef: Side,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        function moveDamageFilter(data, monRef)
        {
            if (!data.on) return null;
            if (data.on.moveDamage && ["damage", "contact"].includes(qualifier))
            {
                const mon = pstate.state.teams[monRef].active;
                if (data.on.moveDamage.changeToMoveType && !mon.fainted)
                {
                    const user = pstate.state.teams[userRef].active;
                    return new Set([diffMoveType(mon, hitByMove, user)]);
                }
            }
            else if (data.on.moveContact &&
                ["contact", "contactKO"].includes(qualifier))
            {
                const chance = data.on.moveContact.chance ?? 100;
                if (chance === 100) return new Set();
                return new Set([chanceReason]);
            }
            else if (data.on.moveContactKO && qualifier === "contactKO")
            {
                return new Set();
            }
            return null;
        });

    let on: dexutil.AbilityOn;
    switch (qualifier)
    {
        case "damage": on = "moveDamage"; break;
        case "contact": on = "moveContact"; break;
        case "contactKO": on = "moveContactKO"; break;
    }

    return yield* expectAbilities(pstate, on, pendingAbilities,
        hitByMove, lastEvent);
}

/**
 * Expects an on-`moveDrain` ability to activate.
 * @param eligible Eligible pokemon.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onMoveDrain(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        d => d.on?.moveDrain ? new Set() : null);

    return yield* expectAbilities(pstate, "moveDrain", pendingAbilities,
        hitByMove, lastEvent);
}

// activateAbility SubReason builders

// TODO: make these into classes?
/** Creates a SubReason that asserts that the pokemon has the given ability. */
export function hasAbility(mon: Pokemon, abilityName: string): SubReason
{
    const {traits} = mon; // snapshot in case traits changes
    return {
        // TODO: guard against overnarrowing? need a better framework for error
        //  handling/logging
        assert: () => traits.ability.narrow(abilityName),
        reject: () => traits.ability.remove(abilityName),
        delay(cb: (held: boolean) => void): () => void
        {
            return traits.ability.onUpdate(new Set([abilityName]), cb);
        }
    };
}

/** Creates a SubReason that asserts that the opponent has a held item. */
export function opponentHasItem(opp: Pokemon): SubReason
{
    return cantHaveItem(opp, "none");
}

/**
 * Creates a SubReason that asserts that the holder isn't the same type as the
 * move being used against it.
 */
export function diffMoveType(mon: Pokemon, hitByMove: dexutil.MoveData,
    user: Pokemon): SubReason
{
    // essentially an inversion of moveIsType() but for multiple possible types
    //  with the type param being the holder's types
    const moveType = dexutil.getDefiniteMoveType(hitByMove, user);
    const {hpType, item} = user; // snapshot in case user changes
    const {types} = mon;
    return {
        assert()
        {
            // assert that the move type is not in the holder's types
            switch (hitByMove.modifyType)
            {
                case "hpType": hpType.remove(types); break;
                case "plateType":
                    item.remove((_, i) =>
                        types.includes((i.plateType ?? hitByMove.type)));
                    break;
                default:
                    if (types.includes(hitByMove.type))
                    {
                        throw new Error(`diffMoveType (colorchange) ability ` +
                            `expected holder's type [${types.join(", ")}] to ` +
                            `not match the move type '${hitByMove.type}'`);
                    }
            }
        },
        reject()
        {
            // assert that the move type is in the holder's types
            switch (hitByMove.modifyType)
            {
                case "hpType": hpType.narrow(...types); break;
                case "plateType":
                    item.narrow((_, i) =>
                        types.includes((i.plateType ?? hitByMove.type)));
                    break;
                default:
                    if (!types.includes(hitByMove.type))
                    {
                        throw new Error(`diffMoveType (colorchange) ability ` +
                            `expected holder's type [${types.join(", ")}] to ` +
                            `match the move type '${hitByMove.type}'`);
                    }
            }
        },
        delay(cb)
        {
            // early return: move type already known
            if (moveType)
            {
                cb(/*held*/ !types.includes(moveType));
                return () => {};
            }

            switch (hitByMove.modifyType)
            {
                case "hpType":
                    // types cannot be shared by hpType
                    return hpType.onUpdate(new Set(types), kept => cb(!kept));
                case "plateType":
                {
                    // item cannot cause the move to become one of the types
                    // optimization: keep subsets small
                    if (types.includes(hitByMove.type))
                    {
                        // kept=true only if the user has a plate item that's
                        //  not of the move type
                        // TODO: replace predicate with set of plate items
                        return item.onUpdate(
                            (_, i) => !!i.plateType &&
                                !types.includes(i.plateType),
                            cb);
                    }
                    // kept=false only if the user has a plate item that is of
                    //  the move type
                    return item.onUpdate(
                        (_, i) => !!i.plateType && types.includes(i.plateType),
                        kept => cb(!kept));
                }
                default:
                    // istanbul ignore next: should never happen
                    throw new Error(`Unsupported modifyType string ` +
                        `'${hitByMove.modifyType}'`);
            }
        }
    };
}

/**
 * SubReason value that asserts that the inference is dependent on random
 * factors outside what can be deduced.
 */
export const chanceReason: SubReason =
    // TODO: what should delay() do?
    {assert() {}, reject() {}, delay() { return () => {}; }};

/**
 * Creates a SubReason that asserts that the pokemon doesn't have the given
 * item.
 */
export function cantHaveItem(mon: Pokemon, itemName: string): SubReason
{
    const {item} = mon; // snapshot in case item changes
    return {
        assert: () => item.remove(itemName),
        reject: () => item.narrow(itemName),
        delay(cb: (held: boolean) => void): () => void
        {
            return item.onUpdate(new Set([itemName]), kept => cb(!kept));
        }
    };
}

/**
 * Filters out ability possibilities that don't match the given predicate.
 * @param monRefs Eligible ability holders.
 * @param f Callback for filtering eligible abilities. Should return a set of
 * reasons that prove the ability should activate, or null if it definitely
 * shouldn't.
 * @returns An object mapping the given `monRefs` keys to Maps of ability
 * possibility name to a SubInference modeling the restrictions on each ability
 * possibility.
 */
function getAbilities(pstate: ParserState,
    monRefs: {readonly [S in Side]?: any},
    f: (data: dexutil.AbilityData, monRef: Side) => Set<SubReason> | null):
    {[S in Side]?: Map<string, SubInference>}
{
    const result: {[S in Side]?: Map<string, SubInference>} = {};
    for (const monRef in monRefs)
    {
        if (!monRefs.hasOwnProperty(monRef)) continue;
        // can't activate ability if suppressed
        const mon = pstate.state.teams[monRef as Side].active;
        if (mon.volatile.suppressAbility) continue;

        // put the callback through each possible ability
        const inferences = new Map<string, SubInference>();
        for (const name of mon.traits.ability.possibleValues)
        {
            const cbResult = f(mon.traits.ability.map[name], monRef as Side);
            if (!cbResult) continue;
            cbResult.add(hasAbility(mon, name));
            inferences.set(name, {reasons: cbResult});
        }
        if (inferences.size > 0) result[monRef as Side] = inferences;
    }
    return result;
}

/**
 * Expects an ability activation.
 * @param on Context in which the ability would activate.
 * @param pendingAbilities Eligible ability possibilities.
 * @param hitByMove Move that the eligible ability holders were hit by, if
 * applicable.
 */
function expectAbilities(pstate: ParserState, on: dexutil.AbilityOn,
    pendingAbilities:
        {readonly [S in Side]?: ReadonlyMap<string, SubInference>},
    hitByMove?: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const inferences: EventInference<AbilityResult>[] = [];
    for (const monRef in pendingAbilities)
    {
        if (!pendingAbilities.hasOwnProperty(monRef)) continue;
        const abilities = pendingAbilities[monRef as Side]!;
        inferences.push(createEventInference(new Set(abilities.values()),
            async function* expectAbilitiesTaker(event, accept)
            {
                if (event.type !== "activateAbility") return {event};
                if (event.monRef !== monRef) return {event};

                // match pending ability possibilities with current item event
                const inf = abilities.get(event.ability);
                if (!inf) return {event};

                // indicate accepted event
                accept(inf);
                return yield* activateAbility(pstate, event, on,
                    hitByMove?.name);
            }));
    }
    return expectEvents(inferences, lastEvent);
}

/** Context for handling ability activation. */
interface AbilityContext
{
    /** Parser state. */
    readonly pstate: ParserState;
    /** Ability holder. */
    readonly holder: Pokemon;
    /** Ability holder Pokemon reference. */
    readonly holderRef: Side;
    /** Ability data. */
    readonly ability: dexutil.AbilityData;
    /** Circumstances in which the ability is activating. */
    readonly on: dexutil.AbilityOn | null;
    /** Move that the holder was hit by, if applicable. */
    readonly hitByMove?: dexutil.MoveData;
    // TODO: add userRef
}

// TODO: make this generic based on activateAbility()'s 'on' argument
/** Result from handling an ActivateAbility event. */
export interface AbilityResult extends SubParserResult
{
    // on-block
    /**
     * Whether the ability is the source of an immunity to the move on
     * `block`.
     */
    immune?: true;
    /** Whether the ability caused the move to fail on `block`. */
    failed?: true;
    /** Status effects being blocked for the ability holder. */
    blockStatus?: {readonly [T in dexutil.StatusType]?: true};

    // on-tryUnboost
    /** Unboost effects being blocked for the ability holder. */
    blockUnboost?: {readonly [T in dexutil.BoostName]?: true};

    // on-moveDrain
    /** Whether an invertDrain ability is activating on `damage`. */
    invertDrain?: true;
}

/**
 * Handles events within the context of an ability activation. Returns the last
 * event that it didn't handle.
 * @param on Context in which the ability is activating.
 * @param hitByMoveName Name of the move that the pokemon was just hit by, if
 * applicable.
 */
export async function* activateAbility(pstate: ParserState,
    initialEvent: events.ActivateAbility,
    on: dexutil.AbilityOn | null = null, hitByMoveName?: string):
    SubParser<AbilityResult>
{
    if (!dex.abilities.hasOwnProperty(initialEvent.ability))
    {
        throw new Error(`Unknown ability '${initialEvent.ability}'`);
    }

    const ctx: AbilityContext =
    {
        pstate, holder: pstate.state.teams[initialEvent.monRef].active,
        holderRef: initialEvent.monRef,
        ability: dex.abilities[initialEvent.ability], on,
        ...hitByMoveName && dex.moves.hasOwnProperty(hitByMoveName) &&
            {hitByMove: dex.moves[hitByMoveName]}
    };

    // infer ability being activated
    ctx.holder.setAbility(ctx.ability.name);

    // handle supported ability effects
    const baseResult = yield* dispatchEffects(ctx);

    // handle other ability effects (TODO: support)
    const result = yield* eventLoop(async function* loop(event): SubParser
    {
        switch (event.type)
        {
            case "activateFieldEffect":
                // see if the weather can be caused by the current ability
                if (event.start && dexutil.isWeatherType(event.effect) &&
                    weatherAbilities[event.effect] === ctx.ability.name)
                {
                    // fill in infinite duration (gen3-4) and source
                    return yield* base.activateFieldEffect(pstate, event,
                        ctx.holder, /*weatherInfinite*/ true);
                }
                break;
            case "immune":
                // TODO: check whether this is possible
                if (event.monRef !== ctx.holderRef) break;
                baseResult.immune = true;
                return yield* base.immune(pstate, event);
        }
        return {event};
    }, baseResult.event);
    return {...baseResult, ...result};
}

// TODO: remove lastEvent arg?
/**
 * Dispatches the effects of an ability. Assumes that the initial
 * activateAbility event has already been handled.
 * @param ctx Ability SubParser context.
 * @param lastEvent Last unconsumed event if any.
 */
async function* dispatchEffects(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    switch (ctx.on)
    {
        case "switchOut":
            if (!ctx.ability.on?.switchOut)
            {
                throw new Error("On-switchOut effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            if (ctx.ability.on.switchOut.cure)
            {
                return yield* cureMajorStatus(ctx, lastEvent);
            }
            // if nothing is set, then the ability shouldn't have activated
            throw new Error("On-switchOut effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "start":
            if (!ctx.ability.on?.start)
            {
                throw new Error("On-start effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            if (ctx.ability.on.start.cure && ctx.ability.statusImmunity)
            {
                return yield* cure(ctx, lastEvent);
            }
            if (ctx.ability.on.start.copyFoeAbility)
            {
                return yield* copyFoeAbility(ctx, lastEvent);
            }
            if (ctx.ability.on.start.revealItem)
            {
                return yield* revealItem(ctx, lastEvent);
            }
            if (ctx.ability.on.start.warnStrongestMove)
            {
                return yield* warnStrongestMove(ctx, lastEvent);
            }
            // if nothing is set, then the ability just reveals itself
            return {...lastEvent && {event: lastEvent}};
        case "block":
            if (!ctx.ability.on?.block)
            {
                throw new Error("On-block effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            // TODO: assert non-ignoreTargetAbility (moldbreaker) after handling
            if (ctx.ability.on.block.status && ctx.ability.statusImmunity)
            {
                return yield* blockStatus(ctx, ctx.ability.statusImmunity,
                    lastEvent);
            }
            if (ctx.ability.on.block.move)
            {
                // TODO: allow for multiple effects
                const effectContainer = ctx.ability.on.block.move;
                const effect = effectContainer.boost ??
                    effectContainer.percentDamage ?? effectContainer.status;
                return yield* blockMove(ctx, ctx.ability.on.block.move.type,
                    effect, lastEvent);
            }
            if (ctx.ability.on.block.effect)
            {
                return yield* blockEffect(ctx,
                    ctx.ability.on.block.effect.explosive, lastEvent);
            }
            throw new Error("On-block effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "tryUnboost":
            if (!ctx.ability.on?.tryUnboost)
            {
                throw new Error("On-tryUnboost effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            // TODO: assert non-ignoreTargetAbility (moldbreaker) after handling
            if (ctx.ability.on.tryUnboost.block)
            {
                return yield* blockUnboost(ctx, ctx.ability.on.tryUnboost.block,
                    lastEvent);
            }
            throw new Error("On-tryUnboost effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "status":
            if (!ctx.ability.on?.status)
            {
                throw new Error("On-status effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            if (ctx.ability.on.status.cure && ctx.ability.statusImmunity)
            {
                return yield* cure(ctx, lastEvent);
            }
            throw new Error("On-status effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "moveContactKO":
            if (ctx.ability.on?.moveContactKO)
            {
                // TODO: track hitByMove user
                return yield* moveContactKO(ctx, otherSide(ctx.holderRef),
                    ctx.ability.on.moveContactKO.percentDamage,
                    ctx.ability.on.moveContactKO.explosive, lastEvent);
            }
            // if no moveContactKO effects registered, try moveContact
            // fallthrough
        case "moveContact":
            if (ctx.ability.on?.moveContact &&
                // try moveContact if on=moveContactKO and the moveContact
                //  effect doesn't target the ability holder
                (ctx.on !== "moveContactKO" ||
                    ctx.ability.on.moveContact.tgt !== "holder"))
            {
                // TODO: track hitByMove user
                const targetRef = ctx.ability.on.moveContact.tgt === "holder" ?
                    ctx.holderRef : otherSide(ctx.holderRef);
                // TODO: allow for multiple effects
                const effectContainer = ctx.ability.on.moveContact;
                const effect = effectContainer.percentDamage ??
                    effectContainer.status;
                return yield* moveContact(ctx, targetRef, effect,
                    lastEvent);
            }
            // if no moveContact effects registered, try moveDamage
            // fallthrough
        case "moveDamage":
            if (ctx.ability.on?.moveDamage &&
                // try moveDamage if on=moveContactKO and the moveDamage
                //  effect doesn't target the ability holder
                (ctx.on !== "moveContactKO" ||
                    !ctx.ability.on.moveDamage.changeToMoveType))
            {
                if (ctx.ability.on.moveDamage.changeToMoveType)
                {
                    return yield* changeToMoveType(ctx, lastEvent);
                }
                // if nothing is set, then the ability shouldn't have activated
                throw new Error(`On-${ctx.on} effect shouldn't activate for ` +
                    `ability '${ctx.ability.name}'`);
            }
            throw new Error(`On-${ctx.on} effect shouldn't activate for ` +
                `ability '${ctx.ability.name}'`);
        case "moveDrain":
            if (!ctx.ability.on?.moveDrain) break;
            if (ctx.ability.on.moveDrain.invert)
            {
                return yield* invertDrain(ctx, lastEvent);
            }
            // if nothing is set, then the ability shouldn't have activated
            throw new Error("On-moveDrain effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
    }
    return {...lastEvent && {event: lastEvent}};
}

// on-switchOut handlers

async function* cureMajorStatus(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    const next = lastEvent ?? (yield);
    if (next.type !== "activateStatusEffect" || next.start ||
        next.monRef !== ctx.holderRef || !dexutil.isMajorStatus(next.effect))
    {
        // TODO: better error messages
        throw new Error(`On-${ctx.on} cure effect failed`);
    }
    return yield* base.activateStatusEffect(ctx.pstate, next);
}

// on-start handlers

/**
 * Handles events due to a statusImmunity ability curing a status (e.g.
 * Insomnia).
 */
async function* cure(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    const next = lastEvent ?? (yield);
    if (next.type !== "activateStatusEffect" || next.start ||
        next.monRef !== ctx.holderRef ||
        !ctx.ability.statusImmunity?.[next.effect])
    {
        // TODO: better error messages
        throw new Error(`On-${ctx.on} cure effect failed`);
    }
    return yield* base.activateStatusEffect(ctx.pstate, next);
}

/** Handles events due to a copeFoeAbility ability (e.g. Trace). */
async function* copyFoeAbility(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // handle trace events
    // activateAbility holder <ability> (copied ability)
    const next = lastEvent ?? (yield);
    if (next.type !== "activateAbility" || next.monRef !== ctx.holderRef)
    {
        throw new Error("On-start copyFoeAbility effect failed");
    }
    ctx.holder.volatile.overrideTraits =
        ctx.holder.baseTraits.divergeAbility(next.ability);

    // TODO: these should be revealAbility events and delegated to base handler
    // activateAbility target <ability> (describe trace target)
    const next2 = yield;
    if (next2.type !== "activateAbility" || next2.monRef === ctx.holderRef ||
        next2.ability !== next.ability)
    {
        throw new Error("On-start copyFoeAbility effect failed");
    }
    const targetRef = next2.monRef;
    const target = ctx.pstate.state.teams[targetRef].active;
    target.setAbility(next2.ability);

    // possible on-start activation for holder's new ability
    // if no activation, don't need to consume anymore events
    // TODO: call onStart?
    const next3 = yield;
    if (next3.type !== "activateAbility") return {event: next3};
    if (next3.monRef !== ctx.holderRef) return {event: next3};
    if (next3.ability !== next.ability) return {event: next3};
    const data = dex.abilities[next3.ability];
    if (!data?.on?.start) return {event: next3};
    return yield* activateAbility(ctx.pstate, next3, "start");
}

/** Handles events due to a revealItem ability (e.g. Frisk). */
async function* revealItem(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // handle frisk events
    // revealItem target <item>
    const next = lastEvent ?? (yield);
    if (next.type !== "revealItem" || next.monRef === ctx.holderRef ||
        next.gained)
    {
        throw new Error("On-start revealItem effect failed");
    }
    return yield* base.revealItem(ctx.pstate, next);
}

/** Handles events due to a warnStrongestMove ability (e.g. Forewarn). */
async function* warnStrongestMove(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // handle forewarn events
    // revealMove target <move>
    const next = lastEvent ?? (yield);
    if (next.type !== "revealMove" || next.monRef === ctx.holderRef)
    {
        throw new Error("On-start warnStrongestMove effect failed");
    }
    const subResult = yield* base.revealMove(ctx.pstate, next);

    // rule out moves stronger than this one
    const {moveset} = ctx.pstate.state.teams[next.monRef].active;
    const bp = getForewarnPower(next.move);
    const strongerMoves = [...moveset.constraint]
        .filter(m => getForewarnPower(m) > bp);
    moveset.inferDoesntHave(strongerMoves);

    return subResult;
}

/**
 * Looks up the base power of a move based on how the Forewarn ability evaluates
 * it.
 */
function getForewarnPower(move: string): number
{
    const data = dex.moves[move];
    // ohko moves
    if (data.damage === "ohko") return 160;
    // counter moves
    if (data.damage === "counter" || data.damage === "metalburst") return 120;
    // fixed damage/variable power moves (hiddenpower, lowkick, etc)
    if (!data.basePower && data.category !== "status") return 80;
    // regular base power, eruption/waterspout and status moves
    return data.basePower;
}

// TODO: track weather in AbilityData

// TODO: move to dex ability effects
/** Maps weather type to the ability that can cause it. */
const weatherAbilities: {readonly [T in dexutil.WeatherType]: string} =
{
    Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
    SunnyDay: "drought"
};

// on-block handlers

/**
 * Handles events due to a status-blocking ability (e.g. Immunity).
 * @param statuses Map of the statuses being blocked.
 */
async function* blockStatus(ctx: AbilityContext,
    statuses: {readonly [T in dexutil.StatusType]?: true},
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    // should have a fail or immune event
    const next = lastEvent ?? (yield);
    if (next.type !== "fail" &&
        (next.type !== "immune" || next.monRef !== ctx.holderRef))
    {
        throw new Error("On-block status effect failed");
    }
    return {...yield* dispatch(ctx.pstate, next), blockStatus: statuses};
}

/**
 * Handles events due to an ability immunity to a move (e.g. Water Absorb).
 * @param blockType Type of move to block.
 * @param effect Effect that happens once blocked. Either self-inflicted
 * boost/status or self-damage.
 */
async function* blockMove(ctx: AbilityContext, blockType: dexutil.Type,
    effect?: Partial<dexutil.BoostTable<number>> | number | dexutil.StatusType,
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    if (!ctx.hitByMove)
    {
        throw new Error("On-block move effect failed: " +
            "Attacking move not specified.");
    }

    // TODO(doubles): track actual hitByMove user
    const opp = ctx.pstate.state.teams[otherSide(ctx.holderRef)].active;
    assertMoveType(ctx.hitByMove, blockType, opp);

    let silent: boolean;
    switch (typeof effect)
    {
        case "object": // boost table
        {
            const boostResult = yield* parsers.boost(ctx.pstate,
                ctx.holderRef, effect, /*set*/ false, /*silent*/ true,
                lastEvent);
            if (Object.keys(boostResult.remaining).length > 0)
            {
                throw new Error("On-block move boost effect failed");
            }
            // TODO: permHalt check?
            lastEvent = boostResult.event;
            silent = !!boostResult.allSilent;
            break;
        }
        case "number": // percent-damage
        {
            const damageResult = yield* parsers.percentDamage(ctx.pstate,
                ctx.holderRef, effect, lastEvent);
            if (!damageResult.success)
            {
                throw new Error("On-block move percentDamage effect " +
                    "failed");
            }
            lastEvent = damageResult.event;
            silent = damageResult.success === "silent";
            break;
        }
        case "string": // status
        {
            const statusResult = yield* parsers.status(ctx.pstate,
                ctx.holderRef, [effect], lastEvent);
            if (!statusResult.success)
            {
                throw new Error("On-block move status effect failed");
            }
            lastEvent = statusResult.event;
            silent = statusResult.success === true;
            break;
        }
        case "undefined": silent = true; break;
        default:
            // istanbul ignore next: should never happen
            throw new Error(`Unknown on-block move effect '${effect}'`);
    }

    // if the ability effects can't cause an explicit game event, then the least
    //  it can do is give an immune event
    if (silent)
    {
        lastEvent ??= yield;
        if (lastEvent.type !== "immune" || lastEvent.monRef !== ctx.holderRef)
        {
            throw new Error("On-block move effect failed");
        }
        return {...yield* base.immune(ctx.pstate, lastEvent), immune: true};
    }

    return {...lastEvent && {event: lastEvent}, immune: true};
}

/**
 * Handles events due to a certain effect type being blocked (e.g. Damp vs
 * Explosion)
 * @param explosive Explosive effect flag.
 */
async function* blockEffect(ctx: AbilityContext, explosive?: boolean,
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    // should see a fail event
    const next = lastEvent ?? (yield);
    if (next.type !== "fail")
    {
        throw new Error(`On-block effect${explosive ? " explosive" : ""} ` +
            "failed");
    }

    return {...yield* base.fail(ctx.pstate, next), failed: true};
}

// on-tryUnboost handlers

/**
 * Handles events due to an unboost-blocking ability (e.g. Clear Body).
 * @param boosts Map of the unboosts being blocked.
 */
async function* blockUnboost(ctx: AbilityContext,
    boosts: {readonly [T in dexutil.BoostName]?: true}, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // should see a fail event
    const next = lastEvent ?? (yield);
    if (next.type !== "fail")
    {
        throw new Error("On-tryUnboost block effect failed");
    }
    const subResult = yield* base.fail(ctx.pstate, next);
    return {...subResult, blockUnboost: boosts};
}

// on-moveContactKO handlers

/**
 * Handles events due to a moveContactKO ability (e.g. Aftermath).
 * @param targetRef Target of ability effects.
 * @param percentDamage Expected percent-damage effect.
 * @param explosive Explosive effect flag, meaning this ability's effects are
 * blocked by abilities with `#on.block.effect.explosive=true` (e.g. Damp).
 */
async function* moveContactKO(ctx: AbilityContext, targetRef: Side,
    percentDamage?: number, explosive?: boolean, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    let silent = true;
    if (percentDamage)
    {
        const damageResult = yield* parsers.percentDamage(ctx.pstate,
            targetRef, percentDamage, lastEvent);
        if (!damageResult.success)
        {
            throw new Error("On-moveContactKO " +
                `${explosive ? "explosive " : ""} percentDamage effect failed`);
        }
        // TODO: permHalt check?
        lastEvent = damageResult.event;
        silent = damageResult.success === "silent";
        lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
    }

    // if the ability effects can't cause an explicit game event, then it
    //  shouldn't have activated in the first place
    if (silent) throw new Error("On-moveContactKO effect failed");

    if (explosive)
    {
        // assert non-explosive-blocking ability
        const target = ctx.pstate.state.teams[targetRef].active;
        if (!target.volatile.suppressAbility)
        {
            const {ability} = target.traits;
            ability.remove((_, a) => !!a.on?.block?.effect?.explosive);
        }
    }

    return {...lastEvent && {event: lastEvent}};
}

// on-moveContact handlers

/**
 * Handles events due to a moveContact ability (e.g. Rough Skin).
 * @param targetRef Target of ability effects.
 * @param effect Expected effect, either inflicted damage or random status.
 */
async function* moveContact(ctx: AbilityContext, targetRef: Side,
    effect?: number | readonly dexutil.StatusType[],
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    let silent: boolean;
    switch (typeof effect)
    {
        case "undefined": silent = true; break;
        case "number":
        {
            const damageResult = yield* parsers.percentDamage(ctx.pstate,
                targetRef, effect, lastEvent);
            if (!damageResult.success)
            {
                throw new Error("On-moveContact percentDamage effect " +
                    "failed");
            }
            lastEvent = damageResult.event;
            silent = damageResult.success === "silent";
            break;
        }
        default:
            if (Array.isArray(effect))
            {
                const statusResult = yield* parsers.status(ctx.pstate,
                    targetRef, effect, lastEvent);
                if (!statusResult.success)
                {
                    throw new Error("On-moveContact status effect failed");
                }
                lastEvent = statusResult.event;
                silent = statusResult.success === true;
                break;
            }
            // istanbul ignore next: should never happen
            throw new Error(`Unknown on-moveContact effect '${effect}'`);
    }

    // if the ability effects can't cause an explicit game event, then it
    //  shouldn't have activated in the first place
    if (silent) throw new Error("On-moveContact effect failed");

    lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
    return {...lastEvent && {event: lastEvent}};
}

// on-moveDamage handlers

/**
 * Handles events due to a changeMoveType ability (e.g. Color Change). Always
 * targets ability holder.
 */
async function* changeToMoveType(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    if (!ctx.hitByMove)
    {
        throw new Error("On-moveDamage changeToMoveType effect failed: " +
            "Attacking move not specified.");
    }

    const next = lastEvent ?? (yield);
    if (next.type !== "changeType" || next.monRef !== ctx.holderRef)
    {
        throw new Error("On-moveDamage changeToMoveType effect failed");
    }
    if (next.newTypes[1] !== "???")
    {
        throw new Error("On-moveDamage changeToMoveType effect failed: " +
            `Expected one type but got multiple (${next.newTypes.join(", ")})`);
    }

    // TODO(doubles): track actual hitByMove user
    const opp = ctx.pstate.state.teams[otherSide(ctx.holderRef)].active;
    assertMoveType(ctx.hitByMove, next.newTypes[0], opp);

    return yield* base.changeType(ctx.pstate, next);
}

// on-moveDrain handlers

/**
 * Handles events due to an invertDrain ability (e.g. Liquid Ooze). Always
 * targets the drain move's user.
 */
async function* invertDrain(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // TODO: track hitByMove user
    const userRef = otherSide(ctx.holderRef);

    // expect the takeDamage event
    const damageResult = yield* parsers.damage(ctx.pstate, userRef,
        /*from*/ null, -1, lastEvent);
    if (!damageResult.success)
    {
        throw new Error("On-moveDrain invert effect failed");
    }
    lastEvent = damageResult.event;
    lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;

    // TODO: include damage delta
    return {
        ...lastEvent && {event: lastEvent}, invertDrain: true
    };
}
