import {GenderName, SideID} from "@pkmn/types";
import {BattleState, ReadonlyBattleState} from "./BattleState";
import {Pokemon, ReadonlyPokemon} from "./Pokemon";
import {ReadonlyTeamStatus, TeamStatus} from "./TeamStatus";

/** Readonly {@link Team} representation. */
export interface ReadonlyTeam {
    /** Reference to the parent BattleState. */
    readonly state?: ReadonlyBattleState;
    /** Which side this Team is on. */
    readonly side: SideID;
    /** Current active pokemon. */
    readonly active: ReadonlyPokemon;
    /**
     * Size of the team. This should be set before the battle officially starts,
     * or the entire list of pokemon will be cleared.
     */
    readonly size: number;
    /**
     * The pokemon that compose this team. First one is always active. `null`
     * means unrevealed while undefined means nonexistent.
     */
    readonly pokemon: readonly (ReadonlyPokemon | null | undefined)[];
    /** Team-related status conditions. */
    readonly status: ReadonlyTeamStatus;

    /**
     * Encodes all team data into a string.
     *
     * @param indent Indentation level to use.
     */
    readonly toString: (indent?: number) => string;
}

/** Data for handling a switch-in. */
export interface SwitchOptions {
    /** Species id name. */
    readonly species: string;
    /** Level between 1 and 100. */
    readonly level: number;
    /** Pokemon's gender. Can be `"M"`, `"F"`, or `"N"`. */
    readonly gender: GenderName;
    /** Pokemon's current HP. */
    readonly hp: number;
    /** Pokemon's max HP. */
    readonly hpMax: number;
}

/** Options for {@link Team.reveal}. */
export interface TeamRevealOptions extends SwitchOptions {
    /** Moveset to fill in. */
    readonly moves?: readonly string[];
}

/** Team state. */
export class Team implements ReadonlyTeam {
    /** Maximum team size. */
    public static readonly maxSize = 6;

    /** @override */
    public readonly state?: BattleState;
    /** @override */
    public readonly side: SideID;

    /** @override */
    public get active(): Pokemon {
        if (!this._pokemon[0]) {
            throw new Error("No active pokemon");
        }
        return this._pokemon[0];
    }

    /**
     * Size of the team. This should be set before the battle officially starts,
     * or the entire list of pokemon will be cleared.
     */
    public get size(): number {
        return this._size;
    }
    public set size(size: number) {
        this._size = Math.max(1, Math.min(size, Team.maxSize));

        // Clear pokemon array.
        // Team has `size` unrevealed pokemon and `maxSize - size` nonexistent.
        this._pokemon.fill(null, 0, this._size);
        this._pokemon.fill(undefined, this._size);
        this.unrevealed = 0;
    }

    /** @override */
    public get pokemon(): readonly (Pokemon | null | undefined)[] {
        return this._pokemon;
    }
    private readonly _pokemon = new Array<Pokemon | null | undefined>(
        Team.maxSize,
    );
    /** Team size for this battle. */
    private _size = 0;

    /** @override */
    public readonly status: TeamStatus = new TeamStatus();

    /**
     * Index of the next pokemon that hasn't been revealed to the user yet.
     * Indexes to the {@link pokemon} field after or equal to this value point
     * to unrevealed or nonexistent slots.
     */
    private unrevealed = 0;

    /**
     * Creates a Team object.
     *
     * @param side The Side this Team is on.
     * @param state Reference to the parent BattleState.
     * @param size Total known size of team.
     */
    public constructor(side: SideID, state?: BattleState, size = Team.maxSize) {
        this.state = state;
        this.side = side;

        size = Math.max(1, Math.min(size, Team.maxSize));
        this._pokemon.fill(null, 0, size);
    }

    /** Called at the beginning of every turn to update temp statuses. */
    public preTurn(): void {
        for (const mon of this._pokemon) {
            mon?.preTurn();
        }
    }

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void {
        this.status.postTurn();
        for (const mon of this._pokemon) {
            mon?.postTurn();
        }
    }

    /**
     * Indicates that a new pokemon has been switched in and will replace the
     * current active pokemon.
     *
     * @returns The new active pokemon, or `null` if invalid.
     */
    public switchIn(options: SwitchOptions): Pokemon | null {
        // See if we already know this pokemon.
        let index = -1;
        for (let i = 0; i < this.unrevealed; ++i) {
            const m = this._pokemon[i];
            // TODO(gen5): Check everything since it could be Illusion ability.
            if (m?.baseSpecies === options.species) {
                index = i;
                break;
            }
        }

        // Revealing a new pokemon.
        if (index < 0) {
            index = this.revealIndex(options);
        }

        // Trying to access an invalid pokemon.
        if (index < 0 || index >= this.unrevealed) {
            return null;
        }

        const mon = this._pokemon[index];
        if (!mon) {
            throw new Error(`Uninitialized pokemon slot ${index}`);
        }

        if (mon.active) {
            throw new Error(
                `Switching active pokemon '${options.species}' into itself`,
            );
        }

        // Switch active status.
        mon.switchInto(
            index === 0 ? null : this._pokemon[0],
            this.status.selfSwitch,
        );
        // Consume pending self-switch/copyvolatile flag.
        this.status.selfSwitch = null;

        // Swap active slot with new pokemon.
        [this._pokemon[0], this._pokemon[index]] = [
            this._pokemon[index],
            this._pokemon[0],
        ];
        return this.active;
    }

    /**
     * Indicates that a new pokemon has been revealed.
     *
     * @returns The new pokemon, or `null` if the operation would overflow the
     * current team {@link size}.
     */
    public reveal(options: TeamRevealOptions): Pokemon | null {
        const index = this.revealIndex(options);
        if (index < 0) {
            return null;
        }
        return this._pokemon[index] ?? null;
    }

    /**
     * Indicates that a new pokemon has been revealed.
     *
     * @returns The index of the new pokemon, or `-1` if the operation would
     * overflow the current team {@link size}.
     */
    private revealIndex({
        species,
        level,
        gender,
        hp,
        hpMax,
        moves,
    }: TeamRevealOptions): number {
        // Team already full.
        if (this.unrevealed === this._size) {
            return -1;
        }

        const newMon = new Pokemon(species, level, moves, gender, this);
        this._pokemon[this.unrevealed] = newMon;

        // Initialize new pokemon.
        newMon.hp.set(hp, hpMax);
        const isOurSide = this.state?.ourSide === this.side;
        if (isOurSide) {
            newMon.stats.hp.set(hpMax);
        }

        return this.unrevealed++;
    }

    /** Cures all pokemon of any major status conditions. */
    public cure(): void {
        for (const mon of this._pokemon) {
            mon?.majorStatus.cure();
        }
    }

    // istanbul ignore next: Only used for logging.
    /**
     * Encodes all team data into a string.
     *
     * @param indent Indentation level to use.
     * @returns The Team in string form.
     */
    public toString(indent = 0): string {
        const s = " ".repeat(indent);
        let res = `${s}status: ${this.status.toString()}`;
        for (let i = 0; i < this._pokemon.length; ++i) {
            const mon = this._pokemon[i];
            res += `\n${s}pokemon${i + 1}: `;
            if (mon === null) {
                res += "<unrevealed>";
            } else if (!mon) {
                res += "<empty>";
            } else {
                const isOurSide = this.state?.ourSide === this.side;
                res += mon.toString(indent + 4, !isOurSide);
            }
        }
        return res;
    }
}
