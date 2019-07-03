import { dex, twoTurnMoves } from "../dex/dex";
import { PokemonData, Type } from "../dex/dex-util";
import { HP } from "./HP";
import { MajorStatusCounter } from "./MajorStatusCounter";
import { Moveset } from "./Moveset";
import { PossibilityClass } from "./PossibilityClass";
import { Team } from "./Team";
import { VolatileStatus } from "./VolatileStatus";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Reference to the parent Team. */
    public readonly team?: Team;

    /** Whether this is the current active pokemon. */
    public get active(): boolean
    {
        return this._active;
    }
    private _active: boolean = false;

    /** Species/form dex data. */
    public get species(): PokemonData
    {
        return this._species;
    }
    /** Sets species data. */
    public setSpecies(species: string): void
    {
        if (!dex.pokemon.hasOwnProperty(species))
        {
            throw new Error(`Unknown species '${species}'`);
        }

        this._species = dex.pokemon[species];
        if (this._active) this._volatile.overrideSpecies = this._species.name;
        this.initBaseAbility();
    }
    private _species!: PokemonData;

    /** Current ability id name. Can temporarily change while active. */
    public get ability(): string
    {
        // ability has been overridden
        if (this.volatile.overrideAbility)
        {
            return this.volatile.overrideAbility;
        }
        // not overridden/initialized
        if (!this._baseAbility.definiteValue) return "";
        return this._baseAbility.definiteValue.name;
    }
    public set ability(ability: string)
    {
        if (!dex.abilities.hasOwnProperty(ability))
        {
            throw new Error(`Unknown ability "${ability}"`);
        }

        // narrow down baseAbility
        if (!this._baseAbility.definiteValue)
        {
            if (!this.canHaveAbility(ability))
            {
                throw new Error(`Pokemon ${this._species} can't have base \
ability ${ability}`);
            }

            this._baseAbility.narrow(ability);
        }

        // override current ability
        this.volatile.overrideAbility = ability;
    }
    /** Checks if this pokemon can have the given ability. */
    public canHaveAbility(ability: string): boolean
    {
        return this._species.abilities.includes(ability) &&
            this._baseAbility.isSet(ability);
    }
    /** Base ability possibility tracker. */
    public get baseAbility(): PossibilityClass<typeof dex.abilities[""]>
    {
        return this._baseAbility;
    }
    /** Resets base ability according to current pokemon data. */
    private initBaseAbility(): void
    {
        this._baseAbility = new PossibilityClass(dex.abilities,
            this.onBaseAbilitySet);
        this._baseAbility.narrow(...this.species.abilities);
        this.onBaseAbilitySet();
    }
    /** Callback for when ability info needs to be updated. */
    private readonly onBaseAbilitySet =
        () => { if (this.active) this.setOverrideAbility(); }
    private _baseAbility!: PossibilityClass<typeof dex.abilities[""]>;

    /** The types of this pokemon. */
    public get types(): readonly Type[]
    {
        let result: readonly Type[];
        if (this._active)
        {
            result = this.volatile.overrideTypes
                .concat(this.volatile.addedType);
        }
        else result = this._species.types;

        return result.filter(type => type !== "???");
    }
    /** Temporarily changes primary and secondary types and resets third. */
    public changeType(newTypes: readonly [Type, Type]): void
    {
        this.volatile.overrideTypes = newTypes;
        // reset added type
        this.addType("???");
    }
    /** Changes temporary tertiary type. */
    public addType(newType: Type): void
    {
        this.volatile.addedType = newType;
    }

    /** Item id name. */
    public readonly item = new PossibilityClass(dex.items);

    /** Pokemon's level from 1 to 100. */
    public get level(): number { return this._level; }
    public set level(level: number)
    {
        this._level = Math.max(1, Math.min(level, 100));
    }
    private _level = 0;

    /**
     * Indicates that a move has been used.
     * @param id ID name of the move.
     * @param targets Targets of the move.
     * @param nopp Whether to not consume pp for this move.
     */
    public useMove(id: string, targets: readonly Pokemon[], nopp?: boolean):
        void
    {
        // struggle doesn't occupy a moveslot
        if (id === "struggle") return;

        this.moveset.getOrReveal(id).pp -=
            nopp ? 0
            // mold breaker cancels pressure
            : this.ability === "moldbreaker" ? 1
            // consume 1 pp + 1 more for each target with pressure ability
            // TODO: in gen>=5, don't count allies
            : targets.filter(m => m !== this && m.ability === "pressure")
                .length + 1;

        // release two-turn move
        // while this could be the event that prepares the move, a separate
        //  event is responsible for distinguishing that
        if (twoTurnMoves.hasOwnProperty(id)) this.volatile.twoTurn = "";

        // apply move effects
        const move = dex.moves[id];
        if (move.volatileEffect === "lockedmove")
        {
            this.volatile.lockedMove.start();
        }
        if (this.team)
        {
            // wish can be used consecutively, but only the first time will
            //  count
            if (id === "wish") this.team.status.wish.start(/*restart*/false);

            this.team.status.selfSwitch = move.selfSwitch || false;
        }
    }
    /**
     * Applies the disabled volatile status to a move.
     * @param id ID name of the move.
     */
    public disableMove(id: string): void
    {
        this.volatile.disabledMoves[this.moveset.getOrRevealIndex(id)].start();
    }
    public readonly moveset = new Moveset();

    /** Pokemon's gender. M=male, F=female, null=genderless. */
    public gender?: string | null;

    /** Whether this pokemon is fainted. */
    public get fainted(): boolean
    {
        return this.hp.current === 0;
    }
    /** Info about the pokemon's hit points. */
    public readonly hp: HP;

    /** Major status turn counter manager. */
    public readonly majorStatus = new MajorStatusCounter();

    /** Minor status conditions. Cleared on switch. */
    public get volatile(): VolatileStatus
    {
        return this._volatile;
    }
    /** Minor status conditions. Cleared on switch. */
    private _volatile = new VolatileStatus();

    /**
     * Checks if the pokemon is definitely grounded, ignoring incomplete
     * information.
     */
    public get isGrounded(): boolean
    {
        if (this.team && this.team.state &&
            this.team.state.status.gravity.isActive)
        {
            return true;
        }

        const v = this._volatile;
        if (v.ingrain) return true;

        const ignoringItem = v.embargo.isActive || this.ability === "klutz";
        const item = ignoringItem || !this.item.definiteValue ?
            "" : this.item.definiteValue.name;

        // iron ball causes grounding
        if (item === "ironball") return true;

        // magnet rise and levitate lift
        return !v.magnetRise.isActive && this.ability !== "levitate" &&
            // flying type lifts
            !this.types.includes("flying");
    }
    /**
     * Checks if the pokemon may be grounded, based on incomplete information.
     * Unnarrowed ability and item classes are included here.
     */
    public get maybeGrounded(): boolean
    {
        if (this.team && this.team.state &&
            this.team.state.status.gravity.isActive)
        {
            return true;
        }

        const v = this._volatile;
        if (v.ingrain) return true;

        const ignoringItem = v.embargo.isActive ||
            v.overrideAbility === "klutz" ||
            (!v.overrideAbility && this._baseAbility.isSet("klutz"));

        // iron ball causes grounding
        if (this.item.isSet("ironball") && !ignoringItem) return true;

        // magnet rise lifts
        return !v.magnetRise.isActive &&
            // levitate lifts
            ((v.overrideAbility && v.overrideAbility !== "levitate") ||
                (!v.overrideAbility &&
                    !this._baseAbility.isSet("levitate"))) &&
            // flying type lifts
            !this.types.includes("flying");
    }

    /**
     * Creates a Pokemon.
     * @param hpPercent Whether to report HP as a percentage.
     * @param team Reference to the parent Team.
     */
    constructor(species: string, hpPercent: boolean, team?: Team)
    {
        this.setSpecies(species);
        this.hp = new HP(hpPercent);
        this.team = team;
        this._active = false;
    }

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        // sleep counter handled by in-game events
        if (this._active) this._volatile.postTurn();
    }

    /**
     * Copies volatile status state to another pokemon.
     * @param mon Pokemon that will receive the volatile status.
     */
    public copyVolatile(mon: Pokemon): void
    {
        mon._volatile = this._volatile.shallowClone();
    }

    /** Tells the pokemon that it is currently being switched in. */
    public switchIn(): void
    {
        this.setOverrideAbility();
        this._volatile.overrideSpecies = this._species.name;
        this._volatile.overrideTypes = this._species.types;
        this._active = true;
    }

    private setOverrideAbility(): void
    {
        // if not multitype and suppressed, do nothing
        if (this._volatile.isAbilitySuppressed() &&
            (!this._baseAbility.definiteValue ||
                    this._baseAbility.definiteValue.name !== "multitype"))
        {
            return;
        }

        // if multitype or not suppressed, set regardless
        if (this._baseAbility.definiteValue)
        {
            this._volatile.overrideAbility =
                this._baseAbility.definiteValue.name;
        }
        // if no definite base ability set to empty
        else this._volatile.overrideAbility = "";
    }

    /**
     * Tells the pokemon that it is currently being switched out. Clears
     * volatile status.
     */
    public switchOut(): void
    {
        this._active = false;
        this._volatile.clear();
        // toxic counter resets on switch
        if (this.majorStatus.current === "tox") this.majorStatus.resetCounter();
    }

    /** Tells the pokemon that it has fainted. */
    public faint(): void
    {
        this.hp.set(0, 0);
    }

    /**
     * Called when this pokemon is being trapped by an unknown ability.
     * @param by Opponent pokemon with the trapping ability.
     */
    public trapped(by: Pokemon): void
    {
        // opposing pokemon can have only one of these abilities here
        const abilities: string[] = [];

        // arena trap traps grounded pokemon
        if (this.isGrounded) abilities.push("arenatrap");

        // magnet pull traps steel types
        if (this.types.includes("steel")) abilities.push("magnetpull");

        // shadow tag traps all pokemon who don't have it
        if (this.ability !== "shadowtag") abilities.push("shadowtag");

        // since override ability is always known, and this method assumes that
        //  the ability is unknown, the base ability must be the culprit
        if (abilities.length > 0) by.baseAbility.narrow(...abilities);
        else throw new Error("Can't figure out why we're trapped");
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all pokemon data into a string.
     * @param indent Indentation level to use.
     * @returns The Pokemon in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}${this.stringifySpecies()} ${this.gender ? ` ${this.gender}` : ""} \
L${this.level} ${this.hp.toString()}
${s}status: ${this.majorStatus.toString()}
${s}active: ${this.active}\
${this.active ? `\n${s}volatile: ${this._volatile.toString()}` : ""}
${s}grounded: \
${this.isGrounded ? "true" : this.maybeGrounded ? "maybe" : "false"}
${s}types: ${this.stringifyTypes()}
${s}ability: ${this.stringifyAbility()}
${s}item: ${this.item.definiteValue ?
    this.item.definiteValue.name : "<unrevealed>"}
${s}moveset: [${this.moveset.toString()}]`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the species as well as whether it's overridden. */
    private stringifySpecies(): string
    {
        const base = this._species.name;
        const over = this._active ? this._volatile.overrideSpecies : "";

        if (!over || over === base) return base;
        else return `${over} (base: ${base})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays type values. */
    private stringifyTypes(): string
    {
        const result: string[] = [];

        for (let i = 0; i < this._species.types.length; ++i)
        {
            let type: string = this._species.types[i];

            // show overridden types in parentheses
            const override = this._volatile.overrideTypes[i];
            if (override !== "???" && override !== type)
            {
                if (type === "???") type = `(${override})`;
                else type += ` (${override})`;
            }

            // skip completely blank types
            if (type !== "???") result.push(type);
        }

        // include third type in parentheses
        if (this._volatile.addedType !== "???")
        {
            result.push(`(${this._volatile.addedType})`);
        }

        return `[${result.join(", ")}]`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the possible/overridden/suppressed values of the ability. */
    private stringifyAbility(): string
    {
        const baseVal = this._baseAbility.definiteValue;
        const base = baseVal ?
            baseVal.name : `possibly ${this._baseAbility.toString()}`;
        const over = this._active ? this._volatile.overrideAbility : "";

        if (!over || over === base) return base;
        else return `${over} (base: ${base})`;
    }
}
