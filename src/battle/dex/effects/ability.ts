/** @file Describes ability effects. */
import * as effects from "./effects";

/** Ability effect interface. */
export type Ability = AbilityBase &
    (AbilityEffect | effects.Chance<effects.Status>);

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Name of the circumstance that should activate the ability effect.  
 * `"contact"` - Hit by a damaging contact move.
 * `"contactKO"` - Knocked out by a damaging contact move.
 * `"damaged"` - Hit by a damaging move.
 */
// tslint:enable: no-trailing-whitespace
export type On = "contact" | "contactKO" | "damaged";

/** Base interface for Ability effects. */
interface AbilityBase
{
    /** Target of the effect. */
    readonly tgt: Target;
    /** Ability that blocks this effect. */
    readonly blockedBy?: string;
}

/** Base viable ability effects. */
export type AbilityEffect = effects.PercentDamage | effects.TypeChange |
    effects.Status;

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Target of the ability effect.
 * `"hit"` - Opponent that caused the ability to activate.
 * `"self"` - Owner of the ability. Cancels if fainted by a move before
 * activating.
 */
// tslint:enable: no-trailing-whitespace
// TODO: restrict hit based on AbilityOn container/generic
export type Target = "hit" | "self";