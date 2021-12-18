/** @file Parsers related to ability activations. */
import {SideID} from "@pkmn/types";
import {BattleAgent} from "../../../../agent";
import {BattleParserContext, inference, unordered} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon} from "../../state/Pokemon";
import * as reason from "../reason";

//#region on-x Inference Parser functions.

// TODO: Allow functions to return nothing if no ability is possible.

/**
 * Creates an {@link inference.Parser} that expects an on-`switchOut` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onSwitchOut = onX(
    "onSwitchOut",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canSwitchOut(mon));
    },
    onXInferenceParser(
        "onSwitchOutInference",
        onXUnorderedParser(
            "onSwitchOutUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onSwitchOut(ctx, accept, side),
        ),
    ),
);

const onStartUnordered = onXUnorderedParser(
    "onStartUnordered",
    async (ctx, accept, ability, side) =>
        await ability.onStart(ctx, accept, side),
);

const onStartInference = onXInferenceParser(
    "onStartInference",
    onStartUnordered,
);

/**
 * Creates an {@link inference.Parser} that expects an on-`start` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onStart = onX(
    "onStart",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        // TODO(doubles): Track actual opponents.
        const otherSide = side === "p1" ? "p2" : "p1";
        const opp = ctx.state.getTeam(otherSide).active;
        return getAbilities(mon, ability => ability.canStart(mon, opp));
    },
    onStartInference,
);

/**
 * Creates an {@link inference.Parser} that expects an on-`block` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param hitBy Move+user ref that the holder is being hit by.
 * @returns An inference Parser that returns info about any blocked effects.
 */
export const onBlock = onX(
    "onBlock",
    (ctx, side, hitBy: dex.MoveAndUserRef) => {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser = {
            move: hitBy.move,
            user: ctx.state.getTeam(hitBy.userRef).active,
        };
        const foes = (Object.keys(ctx.state.teams) as SideID[]).flatMap(s =>
            s === side ? [] : ctx.state.getTeam(s).active,
        );
        return getAbilities(mon, ability =>
            ability.canBlock(ctx.state.status.weather.type, hitBy2, foes),
        );
    },
    onXInferenceParser(
        "onBlockInference",
        onXUnorderedParser(
            "onBlockUnordered",
            async (ctx, accept, ability, side, hitBy) =>
                await ability.onBlock(ctx, accept, side, hitBy),
        ),
    ),
);

// TODO(#313): Refactor hitBy to include other unboost effect sources, e.g.
// intimidate.
/**
 * Creates an {@link inference.Parser} that expects an on-`tryUnboost` ability
 * to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param source Pokemon that is the source of the boost effect.
 * @param boosts Boosts that will be applied.
 * @returns An inference Parser that returns the boosts that were blocked.
 */
export const onTryUnboost = onX(
    "onTryUnboost",
    (ctx, side, source: Pokemon, boosts: Partial<dex.BoostTable>) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability =>
            ability.canBlockUnboost(source, boosts),
        );
    },
    onXInferenceParser(
        "onTryUnboostInference",
        onXUnorderedParser(
            "onTryUnboostUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onTryUnboost(ctx, accept, side),
        ),
    ),
);

/** Damage qualifier type for {@link onMoveDamage}. */
export type MoveDamageQualifier = "damage" | "contact" | "contactKo";

/**
 * Creates an {@link inference.Parser} parser that expects an on-`moveDamage`
 * ability or its variants to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param hitBy Move+user ref the holder was hit by.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onMoveDamage = onX(
    "onMoveDamage",
    (ctx, side, qualifier: MoveDamageQualifier, hitBy: dex.MoveAndUserRef) => {
        const mon = ctx.state.getTeam(side).active;
        const on = qualifierToOn[qualifier];
        const hitBy2: dex.MoveAndUser = {
            move: hitBy.move,
            user: ctx.state.getTeam(hitBy.userRef).active,
        };
        return getAbilities(mon, ability =>
            ability.canMoveDamage(mon, on, hitBy2),
        );
    },
    onXInferenceParser(
        "onMoveDamageInference",
        onXUnorderedParser(
            "onMoveDamageUnordered",
            async (ctx, accept, ability, side, qualifier, hitBy) =>
                await ability.onMoveDamage(
                    ctx,
                    accept,
                    side,
                    qualifierToOn[qualifier],
                    hitBy,
                ),
        ),
    ),
);

const qualifierToOn: {readonly [T in MoveDamageQualifier]: dex.AbilityOn} = {
    damage: "moveDamage",
    contact: "moveContact",
    contactKo: "moveContactKo",
};

/**
 * Creates an {@link inference.Parser} parser that expects an on-`drain`
 * ability to activate if possible (e.g. Liquid Ooze).
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param source Pokemon reference receiving the drained HP.
 * @returns An inference Parser that returns whether drain damage was deducted
 * instead of healed.
 */
export const onDrain = onX(
    "onDrain",
    (ctx, side, source: SideID) => {
        // Unused arg only here to enforce typing of Ability#onDrain call.
        void source;
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canDrain());
    },
    onXInferenceParser(
        "onDrainInference",
        onXUnorderedParser(
            "onDrainUnordered",
            async (ctx, accept, ability, side, source) =>
                await ability.onDrain(ctx, accept, side, source),
        ),
    ),
);

/**
 * Creates an {@link inference.Parsaer} parser that expects an on-`weather`
 * ability to activate if possible (e.g. Ice Body).
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param weatherType Current weather. Required to be active in order to be able
 * to call this function.
 * @param weatherReasons Reasons for weather effects to happen at all.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onWeather = onX(
    "onWeather",
    (
        ctx,
        side,
        weatherType: dex.WeatherType,
        weatherReasons: ReadonlySet<inference.Reason>,
    ) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => {
            const abilityReasons = ability.canWeather(mon, weatherType);
            if (!abilityReasons) return abilityReasons;
            weatherReasons.forEach(r => abilityReasons.add(r));
            return abilityReasons;
        });
    },
    onXInferenceParser(
        "onWeatherInference",
        onXUnorderedParser(
            "onWeatherUnordered",
            async (ctx, accept, ability, side, weatherType) =>
                await ability.onWeather(ctx, accept, side, weatherType),
        ),
    ),
);

type UpdateResult = Awaited<ReturnType<dex.Ability["onUpdate"]>> | undefined;

/**
 * Creates an {@link inference.Parser} parser that expects an on-`update`
 * ability to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param excludeCopiers Whether to exclude copier abilities.
 * @param excludeSharedOnStart Whether to exclude abilities that are shared with
 * the opponent. Applies to copier abilities (e.g. trace) so ignored if
 * `excludeCopiers = true`.
 * @returns An inference Parser for handling ability possibilities.
 */
export function onUpdate(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    excludeCopiers?: boolean,
    excludeSharedOnStart?: boolean,
): unordered.Parser<"gen4", BattleAgent<"gen4">, UpdateResult> {
    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const opp = ctx.state.getTeam(side === "p1" ? "p2" : "p1").active;
    const abilities = getAbilities(mon, ability =>
        excludeCopiers && ability.data.on?.update?.copyFoeAbility
            ? null
            : ability.canUpdate(mon, opp),
    );

    const {copiers, copyable, copyableStart}: CopierInferences = excludeCopiers
        ? {
              copiers: new Set(),
              copyable: new Map(),
              copyableStart: new Map(),
          }
        : collectCopierInferences(
              mon,
              opp,
              abilities.keys(),
              excludeSharedOnStart,
          );

    return inference.parser(
        `${side} ability on-update ` +
            (excludeCopiers ? "(excluding copiers) " : "") +
            (excludeSharedOnStart ? "(excluding shared on-start) " : "") +
            `[${[...abilities.keys()].map(a => a.data.name).join(", ")}]`,
        new Set(abilities.values()),
        async (_ctx, accept) =>
            await onUpdateInference(
                _ctx,
                accept,
                side,
                abilities,
                copiers,
                copyable,
                copyableStart,
            ),
    );
}

/**
 * Inference InnerParser for {@link onUpdate}.
 *
 * @param side Ability holder reference.
 * @param abilities Inferences for abilities that could activate.
 * @param copiers Subset of `abilities` that are copier abilities (e.g. Trace).
 * @param copyable Inferences for opponent's abilities that could be copied by a
 * copier ability. Empty if `copiers` is empty.
 * @param copyableStart Subset of `copyable` containing inferences for
 * on-`start` abilities, with their activation conditions applied to the copier
 * ability's holder.
 */
async function onUpdateInference(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    abilities: ReadonlyMap<dex.Ability, inference.Reason>,
    copiers: ReadonlySet<dex.Ability>,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
): Promise<UpdateResult> {
    // No copiers, parse on-update abilities normally.
    if (copiers.size <= 0) {
        return await onUpdateInferenceNoCopy(ctx, accept, side, abilities);
    }
    // Otherwise, we need a lot of special logic shown below to handle copier
    // abilities (i.e. trace).

    const parsers: unordered.Parser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, res: UpdateResult]
    >[] = [];

    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const otherSide = side === "p1" ? "p2" : "p1";

    for (const ability of abilities.keys()) {
        // Copier abilities are handled specially.
        if (copiers.has(ability)) continue;

        // First use the normal on-update parser.
        parsers.push(
            unordered.parser(
                onXInferenceName("update", side, ability.data.name),
                async (_ctx, _accept) =>
                    await onUpdateUnordered(_ctx, _accept, ability, side),
            ),
        );
    }

    // Used to set the override copied ability for the holder after inferring
    // its copier ability.
    const postCopy: {ability?: dex.Ability} = {};

    // Handle the case where the holder has a copier ability.
    for (const copied of copyable.keys()) {
        if (copyableStart.has(copied)) {
            // Copied on-start ability could activate immediately.
            parsers.push(
                onUpdateCopyStartInference(
                    "update",
                    side,
                    otherSide,
                    copiers,
                    copied,
                    copyable,
                    copyableStart,
                    postCopy,
                ),
            );
        }
        // If neither of the above could activate, then we just need to parse
        // the copy indicator event as a last resort.
        // Note: It's important that this is the last parser in the list, since
        // the above Parsers may parse more events than just what this one
        // requires.
        parsers.push(
            onUpdateCopyUnordered(
                "update",
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                postCopy,
            ),
        );
    }

    // Parse ability possibilities and select the one that activates.
    const res = await unordered.oneOf(ctx, parsers);
    // No abilities activated.
    if (res.length <= 0) return;
    // Infer the base ability that was activated.
    const ability = abilities.get(res[0]![0]);
    // istanbul ignore if: Should never happen.
    if (!ability) {
        throw new Error(
            `Unexpected on-update ability '${res[0]![0].data.name}'; ` +
                "expected " +
                `[${[...abilities.keys()].map(a => a.data.name).join(", ")}]`,
        );
    }
    accept(ability);
    // Set the copied ability as the override ability.
    if (postCopy.ability) {
        mon.setAbility(postCopy.ability.data.name);
    }
    return res[0]![1];
}

const onUpdateUnordered = onXUnorderedParser(
    "onUpdateUnordered",
    async (ctx, accept, ability, side) =>
        await ability.onUpdate(ctx, accept, side),
);

const onUpdateInferenceNoCopy = onXInferenceParser(
    "onUpdateInferenceNoCopy",
    onUpdateUnordered,
);

type StartResult = Awaited<ReturnType<dex.Ability["onStart"]>> | undefined;

/** Result from {@link onStartCopyable}. */
export interface StartCopyableResult {
    /**
     * Delayed assertion as to whether the ability activated due to an
     * on-`update` copier effect (e.g. trace ability) or due to the holder
     * having the ability directly.
     */
    canStartDirectly?: inference.Reason;
    /** Ability that was parsed. */
    ability?: dex.Ability;
    /** Result from on-`start` ability. */
    startResult: StartResult;
}

/**
 * Creates an {@link unordered.Parser} that expects an on-`start` ability to
 * activate if possible, due to either an on-`update` copier effect (e.g. trace
 * ability) or the holder having the ability directly.
 *
 * This should be preferred over {@link onStart} if {@link onUpdate} can be
 * parsed immediately after, in order to delay certain inference steps to handle
 * corner cases.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export function onStartCopyable(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): unordered.Parser<"gen4", BattleAgent<"gen4">, StartCopyableResult> {
    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual targets.
    const opp = ctx.state.getTeam(side === "p1" ? "p2" : "p1").active;
    const abilities = getAbilities(mon, ability => ability.canStart(mon, opp));
    return unordered.parser(
        `${side} ability on-start (or on-update copyable) ` +
            `[${[...abilities.keys()].map(a => a.data.name).join(", ")}]`,
        async (_ctx, accept) =>
            await onStartCopyableImpl(_ctx, accept, side, abilities),
        () => {
            // Reject each ability one-by-one.
            for (const ability of [...abilities.keys()]) {
                abilities.get(ability)!.reject();
                abilities.delete(ability);
            }
        },
    );
}

async function onStartCopyableImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    abilities: Map<dex.Ability, inference.Reason>,
): Promise<StartCopyableResult> {
    let canStartDirectly: inference.Reason | undefined;
    let ability: dex.Ability | undefined;
    const startResult = await onStartInference(
        ctx,
        r => {
            canStartDirectly = r;
            // Reject all the other possible on-start abilities that didn't
            // activate.
            for (const a of [...abilities.keys()]) {
                const r2 = abilities.get(a)!;
                if (r2 === r) {
                    ability = a;
                    continue;
                }
                r2.reject();
                abilities.delete(a);
            }
            accept();
        },
        side,
        abilities,
    );
    return {
        ...(canStartDirectly && {canStartDirectly}),
        ...(ability && {ability}),
        startResult,
    };
}

/**
 * Creates an {@link inference.Parser} that expects an on-`update` copier
 * ability (e.g. trace) to have activated to explain the recent activation of an
 * on-`start` ability that the holder also could've had directly.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param copied On-`start` ability that activated.
 * @param canStartDirectly Reason that the holder could've just had the ability
 * directly.
 * @returns An inference Parser for handling ability possibilities.
 */
export function onUpdateCopiedStarted(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    copied: dex.Ability,
    canStartDirectly: inference.Reason,
): unordered.Parser<"gen4", BattleAgent<"gen4">, void> {
    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const otherSide = side === "p1" ? "p2" : "p1";
    const opp = ctx.state.getTeam(otherSide).active;
    const abilities = getAbilities(mon, ability => {
        if (!ability.data.on?.update?.copyFoeAbility) return null;
        const res = ability.canUpdate(mon, opp);
        if (!res) return null;
        return res;
    });
    let accepted = false;
    return (
        inference
            // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
            .parser<"gen4", BattleAgent<"gen4">, void>(
                `${side} ability on-update copier ` +
                    `[${[...abilities.keys()]
                        .map(a => a.data.name)
                        .join(", ")}]`,
                new Set(abilities.values()),
                async (_ctx, accept) =>
                    await onUpdateCopiedInferenceImpl(
                        _ctx,
                        r => {
                            accepted = true;
                            accept(r);
                        },
                        side,
                        abilities,
                        copied,
                        otherSide,
                    ),
            )
            .transform(
                "assert copied",
                res => (accepted && canStartDirectly.reject(), res),
                (name, prev) => {
                    canStartDirectly.assert();
                    prev?.(name);
                },
            )
    );
}

async function onUpdateCopiedInferenceImpl(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    abilities: Map<dex.Ability, inference.Reason>,
    copied: dex.Ability,
    copiedTarget: SideID,
): Promise<void> {
    for (const [ability, r] of abilities) {
        let accepted = false;
        await ability.copyFoeAbility(
            ctx,
            side,
            () => {
                accepted = true;
                accept(r);
            },
            copied,
            copiedTarget,
        );
        if (accepted) {
            // Set the copied ability as the override ability.
            ctx.state.getTeam(side).active.setAbility(copied.data.name);
            return;
        }
    }
}

// Note: Ability on-residual is handled specially in residual.ts.

//#endregion

//#region on-x Inference Parser helpers.

function onX<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    f: (
        ctx: BattleParserContext<"gen4">,
        side: SideID,
        ...args: TArgs
    ) => Map<dex.Ability, inference.Reason>,
    inferenceParser: inference.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [
            side: SideID,
            abilities: Map<dex.Ability, inference.Reason>,
            ...args: TArgs
        ],
        TResult
    >,
): (
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    ...args: TArgs
) => unordered.Parser<"gen4", BattleAgent<"gen4">, TResult> {
    const onString = name.match(/^on(?<str>.+)$/)?.groups?.["str"];
    // istanbul ignore if: Should never happen.
    if (!onString) throw new Error(`Invalid parser name '${name}'`);

    // Note: Use computed property to force function name in stack trace.
    return {
        [name](
            ctx: BattleParserContext<"gen4">,
            side: SideID,
            ...args: TArgs
        ): unordered.Parser<"gen4", BattleAgent<"gen4">, TResult> {
            const abilities = f(ctx, side, ...args);
            return inference.parser(
                `${side} ability on-${onString} ` +
                    `[${[...abilities.keys()]
                        .map(a => a.data.name)
                        .join(", ")}]`,
                new Set(abilities.values()),
                async (_ctx, accept) =>
                    await inferenceParser(
                        _ctx,
                        accept,
                        side,
                        abilities,
                        ...args,
                    ),
            );
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXInferenceParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    unorderedParser: unordered.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        [ability: dex.Ability, res: TResult]
    >,
): inference.InnerParser<
    "gen4",
    BattleAgent<"gen4">,
    [
        side: SideID,
        abilities: ReadonlyMap<dex.Ability, inference.Reason>,
        ...args: TArgs
    ],
    TResult | undefined
> {
    const onString = name
        .match(/^on(?<str>[a-zA-Z]+)Inference/)
        ?.groups?.["str"].replace(/^[A-Z]/, s => s.toLowerCase());
    // istanbul ignore if: Should never happen.
    if (!onString) throw new Error(`Invalid inference parser name '${name}'`);

    // Note: Use computed property to force function name in stack trace.
    return {
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: inference.AcceptCallback,
            side: SideID,
            abilities: ReadonlyMap<dex.Ability, inference.Reason>,
            ...args: TArgs
        ): Promise<TResult | undefined> {
            const parsers: unordered.Parser<
                "gen4",
                BattleAgent<"gen4">,
                [ability: dex.Ability, res: TResult]
            >[] = [];

            for (const ability of abilities.keys()) {
                parsers.push(
                    unordered.parser(
                        onXInferenceName(onString, side, ability.data.name),
                        async (_ctx, _accept) =>
                            await unorderedParser(
                                _ctx,
                                _accept,
                                ability,
                                side,
                                ...args,
                            ),
                    ),
                );
            }

            // Parse ability possibilities and select the one that activates.
            const res = await unordered.oneOf(ctx, parsers);
            // No abilities activated.
            if (res.length <= 0) return;
            // Infer the base ability that was activated.
            const ability = abilities.get(res[0]![0]);
            // istanbul ignore if: Should never happen.
            if (!ability) {
                throw new Error(
                    `Unexpected on-${onString} ability ` +
                        `'${res[0]![0].data.name}'; expected ` +
                        `[${[...abilities.keys()]
                            .map(a => a.data.name)
                            .join(", ")}]`,
                );
            }
            accept(ability);
            return res[0]![1];
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXUnorderedParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    parser: unordered.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        TResult
    >,
): unordered.InnerParser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, side: SideID, ...args: TArgs],
    [ability: dex.Ability, res: TResult]
> {
    // Note: Use computed property to force function name in stack trace.
    return {
        // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: unordered.AcceptCallback,
            ability: dex.Ability,
            side: SideID,
            ...args: TArgs
        ): Promise<[ability: dex.Ability, res: TResult]> {
            return [ability, await parser(ctx, accept, ability, side, ...args)];
        },
    }[name];
}

/**
 * Searches for possible ability pathways based on the given predicate.
 *
 * @param mon Pokemon to search.
 * @param prove Callback for filtering eligible abilities. Should return a set
 * of {@link inference.Reason reasons} that would prove that the ability could
 * activate, or `null` if it can't.
 * @returns A Map of {@link dex.Ability} to a {@link inference.Reason} modeling
 * its restrictions given by the predicate.
 */
function getAbilities(
    mon: Pokemon,
    prove: (ability: dex.Ability) => Set<inference.Reason> | null,
): Map<dex.Ability, inference.Reason> {
    const res = new Map<dex.Ability, inference.Reason>();
    if (mon.volatile.suppressAbility) return res;

    for (const name of mon.traits.ability.possibleValues) {
        const ability = dex.getAbility(mon.traits.ability.map[name]);
        const reasons = prove(ability);
        if (!reasons) continue;
        reasons.add(reason.ability.has(mon, new Set([name])));
        res.set(ability, inference.and(reasons));
    }
    return res;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const onXInferenceName = (
    onString: string,
    side: SideID,
    ability: string,
): string => `${side} ability on-${onString} inference ${ability}`;

//#region CopyFoeAbility helpers.

// eslint-disable-next-line @typescript-eslint/naming-convention
const onXInferenceCopyName = (
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    shared?: boolean,
) =>
    onXInferenceName(
        onString,
        side,
        `[${[...copiers].map(a => a.data.name).join(", ")}]`,
    ) +
    `${shared ? " speculative shared " : " "}copy of opponent ${otherSide} ` +
    `${copied.data.name}`;

/** Result from {@link collectCopierInferences}. */
interface CopierInferences {
    /**
     * Possible copier abilities that the holder may have. Can also be empty if
     * the ability is suppressed.
     */
    copiers: Set<dex.Ability>;
    /**
     * Inferences for the possible copyable abilities that the opponent may
     * have. Empty if {@link copiers} is empty.
     */
    copyable: Map<dex.Ability, inference.Reason>;
    /**
     * Subset containing on-`start` activation conditions for {@link copyable}.
     */
    copyableStart: Map<dex.Ability, inference.Reason>;
}

/**
 * Collects inferences for possible copier abilities (e.g. Trace).
 *
 * @param mon Possible ability holder.
 * @param opp Copy target.
 * @param abilities Current possible abilities that the holder may have. Used to
 * search for copier abilities.
 * @param excludeSharedOnStart Whether to exclude on-`start` abilities that are
 * shared with the opponent.
 * @returns Inferences for the copier/copyable abilities.
 * @see {@link CopierInferences} for detailed return type info.
 */
function collectCopierInferences(
    mon: Pokemon,
    opp: Pokemon,
    abilities: Iterable<dex.Ability>,
    excludeSharedOnStart?: boolean,
): CopierInferences {
    const res: CopierInferences = {
        copiers: new Set(),
        copyable: new Map(),
        copyableStart: new Map(),
    };
    if (mon.volatile.suppressAbility) return res;

    for (const a of abilities) {
        if (a.data.on?.update?.copyFoeAbility) res.copiers.add(a);
    }
    if (res.copiers.size <= 0) return res;

    // Collect inferences for possible copyable abilities (via trace ability).
    for (const name of opp.traits.ability.possibleValues) {
        const ability = dex.getAbility(opp.traits.ability.map[name]);
        // Non-copyable.
        if (ability.data.flags?.noCopy) continue;

        // Main inference that the opponent has the copied ability.
        res.copyable.set(
            ability,
            inference.and(new Set([reason.ability.has(opp, new Set([name]))])),
        );

        // Apply activation conditions for copied on-start/update abilities onto
        // the copier ability holder.
        const startReasons = ability.canStart(mon, opp);
        if (startReasons) {
            if (excludeSharedOnStart) {
                // Exclude shared on-start abilities.
                if (mon.canHaveAbility(ability.data.name)) {
                    res.copyable.delete(ability);
                    continue;
                }
            }
            // Note: Also include the copier/copied abilities in the inference.
            startReasons.add(
                reason.ability.has(
                    mon,
                    new Set([...res.copiers].map(a => a.data.name)),
                ),
            );
            startReasons.add(reason.ability.has(opp, new Set([name])));
            res.copyableStart.set(ability, inference.and(startReasons));
        }
    }
    return res;
}

/** Parses an on-`update` copier ability copying an on-`start` ability. */
function onUpdateCopyStartInference(
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, res: UpdateResult]
> {
    return inference.parser(
        onXInferenceCopyName(onString, side, otherSide, copiers, copied) +
            " on-start",
        new Set([copyableStart.get(copied)!]),
        async (ctx, accept) =>
            await onUpdateCopyStartInferenceImpl(
                ctx,
                accept,
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                copyableStart,
                postCopy,
            ),
    );
}

async function onUpdateCopyStartInferenceImpl(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): Promise<[ability: dex.Ability, res: UpdateResult]> {
    // Note: Copied on-start abilities activate before the copy indicator event.
    let accepted = false;
    await onStartUnordered(
        ctx,
        () => {
            accepted = true;
            // Set copied as override ability at the end.
            postCopy.ability = copied;
            // Infer copied ability for opponent immediately.
            copyable.get(copied)!.assert();
            accept(copyableStart.get(copied)!);
        },
        copied,
        side,
    );
    // Didn't activate.
    // Note: Fake result to satisfy typings, since this value would never make
    // it out of the final oneOf() call if the parser never accept()'d the
    // copier.
    if (!accepted) return [copied, undefined];
    // Afterwards we can parse the copy indicator event.
    let copier: dex.Ability | undefined;
    for (const _copier of copiers) {
        const res = await _copier.copyFoeAbility(
            ctx,
            side,
            undefined /*accept*/,
            copied,
            otherSide,
        );
        if (!res) continue;
        copier = _copier;
        break;
    }
    if (!copier) {
        throw new Error(
            "CopyFoeAbility ability " +
                `[${[...copiers].map(a => a.data.name).join(", ")}] ` +
                `activated for '${copied.data.name}' but no copy indicator ` +
                "event found",
        );
    }
    // Parse the copier ability (really a no-op to satisfy typings) to make the
    // inference for the holder at the final accept() call.
    return await onUpdateUnordered(ctx, () => {} /*accept*/, copier, side);
}

/** Parses an on-`update` copier ability copying a non-activating ability. */
function onUpdateCopyUnordered(
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, res: UpdateResult]
> {
    return unordered.parser(
        onXInferenceCopyName(onString, side, otherSide, copiers, copied),
        async (ctx, accept) =>
            await onUpdateCopyUnorderedImpl(
                ctx,
                accept,
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                postCopy,
            ),
    );
}

async function onUpdateCopyUnorderedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): Promise<[ability: dex.Ability, res: UpdateResult]> {
    let copier: dex.Ability | undefined;
    for (const _copier of copiers) {
        if (
            await _copier.copyFoeAbility(
                ctx,
                side,
                () => {
                    // Set copied as override ability at the end.
                    postCopy.ability = copied;
                    // Infer copied ability for opponent immediately.
                    copyable.get(copied)!.assert();
                    accept();
                },
                copied,
                otherSide,
            )
        ) {
            copier = _copier;
            break;
        }
    }
    // Didn't activate.
    // Note: Fake result to satisfy typings, since this value would never make
    // it out of the final oneOf() call if the parser never accept()'d the
    // copier.
    if (!copier) return [copied, undefined];

    // Parse the copier ability (really a no-op to satisfy typings) to make the
    // inference for the holder at the final accept() call.
    return await onUpdateUnordered(ctx, () => {} /*accept*/, copier, side);
}

//#endregion

//#endregion
