/** @file Contains test arguments for battle messages. */
import { BattleInitArgs, BattleProgressArgs, RequestArgs } from
    "../../src/bot/AnyMessageListener";
import { BattleEvent, Cause, PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/bot/messageData";

export const username: string[] = ["user1", "user2"];

/** Test PokemonIDs. */
export const pokemonId: PokemonID[] =
[
    {owner: "p1", position: "a", nickname: "hi"},
    {owner: "p2", position: "b", nickname: "nou"},
    {owner: "p1", position: "a", nickname: "Pentagon"}
];

/** Test PokemonDetails. */
export const pokemonDetails: PokemonDetails[] =
[
    {species: "Magikarp", shiny: true, gender: "M", level: 50},
    {species: "Mewtwo", shiny: false, gender: null, level: 100},
    {species: "Porygon", shiny: false, gender: null, level: 100}
];

/** Test PokemonStatuses. */
export const pokemonStatus: PokemonStatus[] =
[
    {hp: 100, hpMax: 100, condition: "par"},
    {hp: 9001, hpMax: 9001, condition: ""},
    {hp: 0, hpMax: 0, condition: ""}
];

/** Test Causes. */
export const cause: Cause[] =
[
    {type: "fatigue"}, {type: "item", item: "Leftovers"}, {type: "lockedmove"}
];

/** Test BattleEvents. */
export const battleEvent: BattleEvent[] =
[
    {type: "ability", id: pokemonId[0], ability: "Pressure"},
    {type: "activate", id: pokemonId[1], volatile: "ingrain"},
    {type: "curestatus", id: pokemonId[0], majorStatus: "psn"},
    {type: "cureteam", id: pokemonId[2]},
    {type: "damage", id: pokemonId[1], status: pokemonStatus[1]},
    {type: "end", id: pokemonId[2], volatile: "confusion"},
    {type: "faint", id: pokemonId[2]},
    {
        type: "heal", id: pokemonId[1], status: pokemonStatus[1],
        cause: cause[1]
    },
    {
        type: "move", id: pokemonId[0], moveName: "Splash",
        targetId: pokemonId[1]
    },
    {
        type: "move", id: pokemonId[1], moveName: "Splash",
        targetId: pokemonId[0], cause: cause[2]
    },
    {type: "start", id: pokemonId[0], volatile: "confusion", cause: cause[0]},
    {type: "status", id: pokemonId[0], majorStatus: "slp"},
    {
        type: "switch", id: pokemonId[0], details: pokemonDetails[0],
        status: pokemonStatus[0]
    },
    {
        type: "switch", id: pokemonId[1], details: pokemonDetails[1],
        status: pokemonStatus[1]
    },
    {type: "tie"}, {type: "win", winner: username[1]}
];

/** Test BattleInitArgs. */
export const battleInit: BattleInitArgs[] =
[
    {
        id: "p1", username: username[0], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: [battleEvent[0], battleEvent[1], battleEvent[2]]
    }
];

/** Test BattleProgressArgs. */
export const battleProgress: BattleProgressArgs[] =
[
    {
        events: [battleEvent[3], battleEvent[4]],
        upkeep: {pre: [battleEvent[5], battleEvent[6]], post: []},
        turn: 2
    },
    {
        events: [battleEvent[7], battleEvent[8]],
        upkeep:
        {
            pre: [battleEvent[9]], post: [battleEvent[10], battleEvent[11]]
        },
        turn: 100
    },
    {
        events: [battleEvent[12], battleEvent[13], battleEvent[14]],
        upkeep: {pre: [], post: [battleEvent[15]]},
        turn: 9
    }
];

/** Test RequestArgs. */
export const request: RequestArgs[] =
[
    {
        active:
        [
            {
                moves:
                [
                    {
                        move: "Splash", id: "splash", pp: 24, maxpp: 24,
                        target: "self", disabled: false
                    }
                ]
            }
        ],
        side:
        {
            name: username[0], id: "p1",
            pokemon:
            [
                {
                    ident: pokemonId[0],
                    details: pokemonDetails[0],
                    condition: pokemonStatus[0],
                    active: true,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["splash"], baseAbility: "swiftswim",
                    item: "choiceband", pokeball: "masterball"
                },
                {
                    ident: pokemonId[1],
                    details: pokemonDetails[1],
                    condition: pokemonStatus[1],
                    active: false,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["hyperbeam"], baseAbility: "pressure",
                    item: "choicespecs", pokeball: "nestball"
                },
                {
                    ident: pokemonId[2],
                    details: pokemonDetails[2],
                    condition: pokemonStatus[2],
                    active: false,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["tackle"], baseAbility: "trace",
                    item: "choicescarf", pokeball: "greatball"
                }
            ]
        },
        rqid: 10
    }
];
