import { BoostableStatName, boostableStatNames } from "../../helpers";
import { numTwoTurnMoves, twoTurnMoves } from "../dex/dex";
import { oneHot, tempStatusTurns } from "./utility";

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    // passed when copying

    /** Stat boost stages. */
    public get boosts(): {readonly [N in BoostableStatName]: number}
    {
        return this._boosts;
    }
    private _boosts: {[N in BoostableStatName]: number};

    /** Whether the pokemon is confused. */
    public get isConfused(): boolean
    {
        return this.confuseTurns !== 0;
    }
    /**
     * Number of turns this pokemon has been confused, including the turn it
     * started.
     */
    public get confuseTurns(): number
    {
        return this._confuseTurns;
    }
    private _confuseTurns: number;

    // not passed when copying

    /** Turns for the disable status on each move. */
    private disableTurns: number[];

    /** Whether the pokemon is locked into a move and is unable to switch. */
    public lockedMove: boolean;

    /** Two-turn move currently being prepared. */
    public twoTurn: keyof typeof twoTurnMoves | "";

    /** Whether this pokemon must recharge on the next turn. */
    public mustRecharge: boolean;

    /** Number of turns this pokemon has used a stalling move, e.g. Protect. */
    public get stallTurns(): number
    {
        return this._stallTurns;
    }
    private _stallTurns: number;

    /** Creates a VolatileStatus object. */
    constructor()
    {
        this.clear();
    }

    /**
     * Increments temporary status turns. Should be called once per turn by the
     * parent Pokemon object.
     */
    public updateStatusTurns(): void
    {
        // confusion is handled separately since it depends on a message

        // update disabled move turns
        for (let i = 0; i < this.disableTurns.length; ++i)
        {
            if (this.disableTurns[i])
            {
                ++this.disableTurns[i];
            }
        }

        // if twoTurn was set this turn, the two-turn move must be completed or
        //  interrupted on the next turn
        this.twoTurn = "";
    }

    /**
     * Creates a shallow clone of this VolatileStatus.
     * @returns A shallow clone of this object.
     */
    public shallowClone(): VolatileStatus
    {
        const v = new VolatileStatus();
        v._boosts = this._boosts;
        v._confuseTurns = this._confuseTurns;
        return v;
    }

    /**
     * Clears all volatile status conditions. This does not affect shallow
     * clones.
     */
    public clear(): void
    {
        this._boosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this._confuseTurns = 0;
        this.disableTurns = [0, 0, 0, 0];
        this.lockedMove = false;
        this.twoTurn = "";
        this.mustRecharge = false;
        this._stallTurns = 0;
    }

    /**
     * Boosts a stat.
     * @param stat Stat to be boosted.
     * @param amount Whole number of stages to boost the stat by.
     */
    public boost(stat: BoostableStatName, amount: number): void
    {
        this._boosts[stat] += amount;
    }

    /**
     * Sets the confusion flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public confuse(flag: boolean): void
    {
        this._confuseTurns = flag ? this._confuseTurns + 1 : 0;
    }

    /**
     * Checks whether a move is disabled.
     * @param move Index of the move.
     * @returns Whether the move is disabled.
     */
    public isDisabled(move: number): boolean
    {
        return !!this.disableTurns[move];
    }

    /**
     * Disables a certain move. If the move slot's index is not known, use the
     * Pokemon class' interface.
     * @param index Index of the move.
     */
    public disableMove(move: number): void
    {
        this.disableTurns[move] = 1;
    }

    /** Clears the disabled status. */
    public enableMoves(): void
    {
        this.disableTurns = [0, 0, 0, 0];
    }

    /**
     * Sets the stall flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public stall(flag: boolean): void
    {
        this._stallTurns = flag ? this._stallTurns + 1 : 0;
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // boostable stats
        return /*boostable stats*/Object.keys(boostableStatNames).length +
            /*confuse*/1 + /*disable*/4 + /*locked move*/1 +
            /*two-turn status*/numTwoTurnMoves + /*must recharge*/1 +
            /*stall turns*/1;
    }

    // istanbul ignore next: unstable, hard to test
    /**
     * Formats volatile status info into an array of numbers.
     * @returns All volatile status data in array form.
     */
    public toArray(): number[]
    {
        // one-hot encode categorical data
        const twoTurn = oneHot(this.twoTurn ? twoTurnMoves[this.twoTurn] : -1,
                numTwoTurnMoves);

        // encode temporary status turns
        const confused = tempStatusTurns(this._confuseTurns);
        const disabled = this.disableTurns.map(tempStatusTurns);

        const a =
        [
            ...Object.keys(this._boosts).map(
                (key: BoostableStatName) => this._boosts[key]),
            confused, ...disabled, this.lockedMove ? 1 : 0, ...twoTurn,
            this.mustRecharge ? 1 : 0, this._stallTurns
        ];
        return a;
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes all volatile status data into a string.
     * @returns The VolatileStatus in string form.
     */
    public toString(): string
    {
        return `[${
            Object.keys(this._boosts)
            .filter((key: BoostableStatName) => this._boosts[key] !== 0)
            .map((key: BoostableStatName) =>
                `${key}: ${VolatileStatus.plus(this._boosts[key])}`)
            .concat(
                this._confuseTurns ? [`confused for ${this._confuseTurns - 1} \
${VolatileStatus.pluralTurns(this._confuseTurns)}`] : [],
                this.disableTurns
                    .filter(d => d !== 0)
                    .map((d, i) => `disabled move ${i + 1} for ${d} \
${VolatileStatus.pluralTurns(d)}`),
                this.lockedMove ? ["lockedmove"] : [],
                this.twoTurn ? [`preparing ${this.twoTurn}`] : [],
                this.mustRecharge ? ["must recharge"] : [],
                this._stallTurns ?
                    [`stalling for ${this._stallTurns - 1} \
${VolatileStatus.pluralTurns(this._stallTurns)}`] : [])
            .join(", ")}]`;
    }

    // istanbul ignore next: only used in logging
    /**
     * Converts a number to a string where positive numbers are preceded by a
     * `+` symbol.
     * @param n Number to convert.
     * @returns The number in string form with explicit sign.
     */
    private static plus(n: number): string
    {
        return (n > 0 ? "+" : "") + n;
    }

    // istanbul ignore next: only used in logging
    /**
     * Pluralizes the word "turns" if the turns parameter is not 1.
     * @param turns Number of turns.
     * @returns `turn` if 1, or `turns` if not 1.
     */
    private static pluralTurns(turns: number): string
    {
        return `turn${turns !== 1 ? "s" : ""}`;
    }
}