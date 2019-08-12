import { pluralTurns } from "./utility";

/**
 * TempStatus whose duration depends on the type of status that's currently
 * active. Similar to a set of mutually exclusive TempStatuses.
 * @template TStatusType String union of status types that this object can
 * represent. This excludes the `"none"` type, which is automatically added.
 */
export class VariableTempStatus<TStatusType extends string>
{
    // all fields are initialized on #reset() in the constructor

    /** Whether this status is currently active. */
    public get isActive(): boolean { return this._type !== "none"; }

    /** Current status type. */
    public get type(): TStatusType | "none"
    {
        return this._type;
    }
    private _type!: TStatusType | "none";

    /**
     * Number of turns this status has been active. This is 0-based, so this
     * will return 0 if the status was started this turn, and 1 after the end
     * of this turn.
     */
    public get turns(): number
    {
        return this._turns;
    }
    private _turns!: number;

    /**
     * Creates a VariableTempStatus.
     * @param map Used to provide type info.
     * @param duration Number of `#tick()` calls this status should last.
     * @param silent Whether to implicitly `#reset()` when the duration is
     * surpassed, i.e. once `duration + 1` ticks have been called. Default
     * false.
     */
    constructor(public readonly map: {readonly [T in TStatusType]: any},
        public readonly duration: number, public readonly silent = false)
    {
        this.reset();
    }

    /** Resets status to `none`. */
    public reset(): void
    {
        this._type = "none";
        this._turns = 0;
    }

    /** Starts a status. */
    public start(type: TStatusType): void
    {
        this._type = type;
        this._turns = 0;
    }

    /** Indicates that the status lasted another turn. */
    public tick(): void
    {
        // no need to increment turns if it's infinite or none
        if (this._type === "none") return;

        ++this._turns;
        if (this._turns > this.duration)
        {
            if (!this.silent)
            {
                throw new Error(`Status '${this._type}' went longer than ` +
                    `expected (duration=${this.duration}, ` +
                    `turns=${this._turns})`);
            }
            else this.reset();
        }
    }

    // istanbul ignore next: only used in logging
    /** Encodes status data into a log string. */
    public toString(): string
    {
        if (this._type === "none") return "inactive";
        return pluralTurns(this._type, this._turns, this.duration);
    }
}