import { BattleState } from "./BattleState";
import { Pokemon } from "./Pokemon";
import { Side } from "./Side";
import { TeamStatus } from "./TeamStatus";

/** Options for switchin methods. */
export interface SwitchInOptions
{
    /** Whether volatile status should be copied onto the replacing pokemon. */
    readonly copyVolatile?: boolean;
}

/** Team state. */
export class Team
{
    /** Maximum team size. */
    public static readonly maxSize = 6;

    /** Reference to the parent BattleState. */
    public readonly state?: BattleState;
    /** Which Side this Team is on. */
    public readonly side: Side;

    /** Gets the active pokemon. */
    public get active(): Pokemon
    {
        // as long as at least one pokemon was revealed, this will be valid
        return this._pokemon[0]!;
    }

    /**
     * Size of the team. This should be set before the battle officially starts,
     * or the entire list of pokemon will be cleared.
     */
    public get size(): number
    {
        return this._size;
    }
    public set size(size: number)
    {
        this._size = Math.max(1, Math.min(size, Team.maxSize));

        // clear pokemon array
        // team has `size` unrevealed pokemon and `maxSize - size` nonexistent
        this._pokemon.fill(null, 0, this._size);
        this._pokemon.fill(undefined, this._size);
        this.unrevealed = 0;
    }

    /**
     * The pokemon that compose this team. First one is always active. Null
     * means unrevealed while undefined means nonexistent.
     */
    public get pokemon(): readonly (Pokemon | null | undefined)[]
    {
        return this._pokemon;
    }
    private readonly _pokemon =
        new Array<Pokemon | null | undefined>(Team.maxSize);
    /** Team size for this battle. */
    private _size = 0;

    /** Team-related status conditions. */
    public readonly status: TeamStatus = new TeamStatus();

    /**
     * Index of the next pokemon that hasn't been revealed to the user yet.
     * Indexes to the `pokemon` field after or equal to this value point to
     * newly constructed Pokemon objects that haven't been fully initialized
     * yet.
     */
    private unrevealed = 0;

    /**
     * Creates a Team object.
     * @param side The Side this Team is on.
     * @param state Reference to the parent BattleState.
     * @param size Total known size of team.
     */
    constructor(side: Side, state?: BattleState, size = Team.maxSize)
    {
        this.state = state;
        this.side = side;

        size = Math.max(1, Math.min(size, Team.maxSize));
        this._pokemon.fill(null, 0, size);
    }

    /**
     * Indicates that a new pokemon has been switched in and will replace the
     * current active pokemon.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP.
     * @param options Circumstances of switchin.
     * @returns The new active pokemon, or null if invalid.
     */
    public switchIn(species: string, level: number, gender: string | null,
        hp: number, hpMax: number, options: SwitchInOptions = {}):
        Pokemon | null
    {
        // see if we already know this pokemon
        let index = -1;
        for (let i = 0; i < this.unrevealed; ++i)
        {
            const m = this._pokemon[i];
            // TODO: in gen5 check everything since it could be illusion
            if (m && m.species.name === species)
            {
                index = i;
                break;
            }
        }

        if (index < 0)
        {
            // revealing a new pokemon
            index = this.revealIndex(species, level, gender, hp, hpMax);
        }

        // trying to access an invalid pokemon
        if (index < 0 || index >= this.unrevealed) return null;

        const mon = this._pokemon[index];
        if (!mon) throw new Error(`Uninitialized pokemon slot ${index}`);

        // switch active status
        if (options.copyVolatile)
        {
            this.active.copyVolatile(mon);
        }
        this.active.switchOut();
        mon.switchIn();

        // swap active with new pokemon
        [this._pokemon[0], this._pokemon[index]] =
            [this._pokemon[index], this._pokemon[0]];
        return this.active;
    }

    /**
     * Indicates that a new pokemon has been revealed.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP.
     * @returns The new pokemon, or null if the operation would overflow the
     * current team size.
     */
    public reveal(species: string, level: number, gender: string | null,
        hp: number, hpMax: number): Pokemon | null
    {
        const index = this.revealIndex(species, level, gender, hp, hpMax);
        if (index < 0) return null;
        return this._pokemon[index] || null;
    }

    /**
     * Indicates that a new pokemon has been revealed.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP.
     * @returns The index of the new pokemon, or -1 if the operation would
     * overflow the current team size.
     */
    private revealIndex(species: string, level: number, gender: string | null,
        hp: number, hpMax: number): number
    {
        // team already full
        if (this.unrevealed === this._size) return -1;

        const newMon =
            new Pokemon(species, /*hpPercent*/ this.side === "them", this);
        this._pokemon[this.unrevealed] = newMon;

        // initialize new pokemon
        newMon.level = level;
        newMon.gender = gender;
        newMon.hp.set(hp, hpMax);

        return this.unrevealed++;
    }

    /** Cures all pokemon of any major status conditions. */
    public cure(): void
    {
        for (const mon of this._pokemon) if (mon) mon.cure();
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all team data into a string.
     * @param indent Indentation level to use.
     * @returns The Team in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}status: ${this.status.toString()}
${this._pokemon.map(
    (mon, i) => `${s}mon${i + 1}:${
        mon === null ? " <unrevealed>"
        : !mon ? " <empty>"
        : `\n${mon.toString(indent + 4)}`}`)
    .join("\n")}`;
    }
}
