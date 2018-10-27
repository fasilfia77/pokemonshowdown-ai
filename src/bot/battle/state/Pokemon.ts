import { dex } from "../../../data/dex";
import { PokemonData } from "../../../data/dex-types";
import { MajorStatus, majorStatuses } from "../../../messageData";
import { HP } from "./HP";
import { Move } from "./Move";
import { VolatileStatus } from "./VolatileStatus";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Whether this pokemon is fainted. */
    public get fainted(): boolean
    {
        return this.hp.current === 0;
    }

    /** Whether this is the current active pokemon. */
    public get active(): boolean
    {
        return this._active;
    }

    /** Species/form name. */
    public get species(): string
    {
        return this.speciesName;
    }
    public set species(species: string)
    {
        this.speciesName = species;
        this.data = dex.pokemon[species];
        this._species = this.data.uid;
    }

    /** Ability id name. */
    public get baseAbility(): string
    {
        return this.baseAbilityName;
    }
    public set baseAbility(baseAbility: string)
    {
        this.baseAbilityName = baseAbility.toLowerCase().replace(/[ -]+/g, "");
        if (!this.data)
        {
            throw new Error("Base ability set before species data");
        }
        this._baseAbility = this.data.abilities[baseAbility];
    }

    /** Item id name. */
    public get item(): string
    {
        return this.itemName;
    }
    public set item(item: string)
    {
        this.itemName = item.toLowerCase().replace(/[ -]+/g, "");
        this._item = dex.items[item];
    }

    /** Pokemon's level. */
    public get level(): number
    {
        return this._level;
    }
    public set level(level: number)
    {
        this._level = Math.max(1, Math.min(level, 100));
    }

    /** Known moveset. */
    public get moves(): Move[]
    {
        return this._moves.slice(0, this.unrevealedMove);
    }

    /** Pokemon's gender. */
    public gender: string | null;

    /** Whether this is the current active pokemon. */
    private _active: boolean = false;
    /** Dex data. */
    private data?: PokemonData;
    /** ID name of the species. */
    private speciesName = "";
    /** Pokemon species/form unique identifier. */
    private _species = 0;
    /** ID name of the held item. */
    private itemName = "";
    /** Item the pokemon is holding. */
    private _item = 0;
    /** ID name of the base ability. */
    private baseAbilityName = "";
    /**
     * Base ability relative to its species. Can be 1 or 2 indicating which
     * ability that is.
     */
    private _baseAbility?: number;
    /** Pokemon's level from 1 to 100. */
    private _level = 0;
    /** Known moveset. */
    private readonly _moves: Move[] = [];
    /** First index of the part of the moveset that is unknown. */
    private unrevealedMove = 0;
    /** Info about the pokemon's hit points. */
    private hp: HP = new HP();
    /** Current major status condition. Not cleared on switch. */
    private majorStatus: MajorStatus = "";
    /** Minor status conditions. Cleared on switch. */
    private volatileStatus = new VolatileStatus();

    /** Creates a Pokemon. */
    constructor()
    {
        this._active = false;

        // initialize moveset
        for (let i = 0; i < 4; ++i)
        {
            this._moves[i] = new Move();
        }
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * @param active Whether to include active pokemon data, e.g. volatile
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(active: boolean): number
    {
        // gender
        return 2 +
            dex.numPokemon +
            dex.numItems +
            // base ability
            2 +
            // level
            1 +
            Move.getArraySize() * 4 +
            HP.getArraySize() +
            // major statuses excluding empty status
            Object.keys(majorStatuses).length - 1 +
            (active ? VolatileStatus.getArraySize() : 0);
    }

    /**
     * Formats pokemon info into an array of numbers.
     * @returns All pokemon data in array form.
     */
    public toArray(): number[]
    {
        // one-hot encode categorical data
        const species = Array.from({length: dex.numPokemon},
            (v, i) => i === this._species ? 1 : 0);
        const item = Array.from({length: dex.numItems},
            (v, i) => i === this._item ? 1 : 0);
        const baseAbility = Array.from({length: 2},
            (v, i) => i === this._baseAbility ? 1 : 0);
        // only include actual statuses, not the empty string
        const majorStatus = Array.from(
            {length: Object.keys(majorStatuses).length - 1},
            (v, i) => i + 1 === majorStatuses[this.majorStatus] ? 1 : 0);

        const a =
        [
            this.gender === "M" ? 1 : 0, this.gender === "F" ? 1 : 0,
            ...species, ...item, ...baseAbility,
            this._level,
            ...([] as number[]).concat(
                ...this._moves.map(move => move.toArray())),
            ...this.hp.toArray(),
            ...majorStatus
        ];
        if (this._active)
        {
            a.push(...this.volatileStatus.toArray());
        }
        return a;
    }

    /**
     * Tells the pokemon that it is currently being switched in.
     * @param volatile Volatile status to set for this pokemon.
     */
    public switchIn(volatile?: VolatileStatus): void
    {
        this._active = true;
        if (volatile)
        {
            this.volatileStatus = volatile;
        }
        else
        {
            this.volatileStatus.clear();
        }
    }

    /**
     * Tells the pokemon that it is currently being switched out.
     * @returns Volatile status before switching out.
     */
    public switchOut(): VolatileStatus
    {
        this._active = false;
        const v = this.volatileStatus.shallowClone();
        this.volatileStatus.clear();
        return v;
    }

    /** Tells the pokemon that it has fainted. */
    public faint(): void
    {
        this.setHP(0, 0);
    }

    /**
     * Sets the pokemon's HP.
     * @param current Current HP.
     * @param max Maximum HP. Omit to assume a percentage.
     */
    public setHP(current: number, max?: number): void
    {
        this.hp = new HP(max);
        this.hp.current = current;
    }

    /**
     * Reveals a move to the client.
     * @param id ID name of the move.
     * @returns The new move.
     */
    public revealMove(id: string): Move
    {
        const move = new Move();
        move.id = id;
        this._moves[this.unrevealedMove++] = move;
        return move;
    }

    /**
     * Indicates that a move has been used.
     * @param id ID name of the move.
     * @param pp Amount of PP to use.
     * @param from ID name of the effect that caused the move.
     */
    public useMove(id: string, pp: number, from?: string): void
    {
        const move = this.getMove(id) || this.revealMove(id);
        // could be locked into using a move, where no pp is consumed
        if (from !== "lockedmove")
        {
            move.use(pp);
        }
    }

    /**
     * Checks whether a move can be made.
     * @param index Index of the move.
     * @returns Whether the move can be made.
     */
    public canMove(index: number): boolean
    {
        return index < this._moves.length && index < this.unrevealedMove &&
            this._moves[index].pp > 0 && !this.volatileStatus.isDisabled(index);
    }

    /**
     * Gets the pokemon's move by name.
     * @param id ID name of the move.
     * @returns The pokemon's move that matches the ID name, or null if not
     * found.
     */
    public getMove(id: string): Move | null
    {
        const index = this.moves.findIndex(move => move.id === id);
        return index !== -1 ? this.moves[index] : null;
    }

    /**
     * Sets the data about a move.
     * @param index Index of the move.
     * @param id Move ID name.
     * @param pp Current PP.
     * @param ppMax Maximum PP.
     */
    public setMove(index: number, id: string, pp: number, ppMax: number): void
    {
        this.unrevealedMove = index + 1; // TODO: remake this method to reveal?
        this._moves[index].set(dex.moves[id].uid, pp, ppMax);
    }

    /**
     * Disables a certain move.
     * @param index Index of the move.
     * @param disabled Disabled status. Omit to assume true.
     */
    public disableMove(index: number, disabled: boolean = true): void
    {
        this.volatileStatus.disableMove(index, disabled);
    }

    /**
     * Afflicts the pokemon with a major status condition.
     * @param status Name of condition.
     */
    public afflict(status: MajorStatus): void
    {
        this.majorStatus = status;
    }

    /** Cures the pokemon of a major status condition. */
    public cure(): void
    {
        this.afflict("");
    }

    /**
     * Sets the confusion flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public confuse(flag: boolean): void
    {
        this.volatileStatus.confuse(flag);
    }

    /**
     * Checks whether the pokemon is using a locked move.
     * @returns Locked move flag.
     */
    public isLocked(): boolean
    {
        return this.volatileStatus.lockedMove;
    }

    /**
     * Sets the lockedmove flag.
     * @param flag Value of the flag.
     */
    public lockMove(flag: boolean): void
    {
        this.volatileStatus.lockedMove = flag;
    }

    /**
     * Encodes all pokemon data into a string.
     * @param indent Indentation level to use.
     * @returns The Pokemon in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}${this.speciesName}
${s}active: ${this.active}
${s}level: ${this._level}
${s}gender: ${this.gender ? this.gender : "genderless"}
${s}item: ${this.itemName ? this.itemName : "<unknown>"}
${s}ability: ${this.baseAbilityName ? this.baseAbilityName : "<unknown>"}
${s}hp: ${this.hp.toString()}
${s}majorStatus: ${this.majorStatus ? this.majorStatus : "none"}
${this._moves.map(
        (move, i) => `${s}move${i + 1}:${i < this.unrevealedMove ?
                `\n${move.toString(indent + 4)}` : " <unrevealed>"}`)
    .join("\n")}
${s}volatile: ${this.volatileStatus.toString()}`;
    }
}
