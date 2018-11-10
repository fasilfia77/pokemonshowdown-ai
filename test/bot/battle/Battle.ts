import { expect } from "chai";
import "mocha";
import { AnyMessageListener, BattleInitArgs, RequestArgs } from
    "../../../src/bot/AnyMessageListener";
import { Choice } from "../../../src/bot/battle/Choice";
import { Type } from "../../../src/bot/battle/dex/dex-types";
import { FatigueCause, MoveEvent, PokemonDetails, PokemonID, PokemonStatus,
    TieEvent, WinEvent } from "../../../src/bot/messageData";
import * as testArgs from "../../helpers/battleTestArgs";
import { MockBattle } from "./MockBattle";

describe("Battle", function()
{
    /**
     * Adds to the responses array.
     * @param choice Response to add.
     */
    function sender(choice: Choice): void
    {
        responses.push(choice);
    }

    let responses: Choice[];
    let listener: AnyMessageListener;
    let battle: MockBattle;

    beforeEach("Initialize Battle", function()
    {
        responses = [];
        listener = new AnyMessageListener();
        battle = new MockBattle(testArgs.username[0], listener, sender);
    });

    /**
     * Checks the `side` property of a RequestArgs object.
     * @param args Args object.
     */
    function checkRequestSide(args: RequestArgs): void
    {
        const team = battle.state.teams.us;
        expect(team.size).to.equal(args.side.pokemon.length);

        for (const data of args.side.pokemon)
        {
            const details: PokemonDetails = data.details;
            const status: PokemonStatus = data.condition;
            const mon = team.pokemon.find(p => p.species === details.species)!;

            // tslint:disable-next-line:no-unused-expression
            expect(mon).to.exist;
            expect(mon.species).to.equal(details.species);
            expect(mon.level).to.equal(details.level);
            expect(mon.hp.current).to.equal(status.hp);
            expect(mon.hp.max).to.equal(status.hpMax);
            expect(mon.item).to.equal(data.item);
            expect(mon.baseAbility).to.equal(data.baseAbility);
            expect(mon.majorStatus).to.equal(status.condition);
            expect(mon.active).to.equal(data.active);

            for (let moveId of data.moves)
            {
                if (moveId.startsWith("hiddenpower"))
                {
                    const hpType = moveId.substr("hiddenpower".length)
                            .replace(/\d+/, "");
                    (Object.keys(mon.possibleHPTypes) as Type[])
                        .forEach(type => expect(mon.possibleHPTypes[type])
                            .to.be[type === hpType ? "true" : "false"]);
                    moveId = "hiddenpower";
                }

                const move = mon.getMove(moveId)!;
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.not.be.null;
                expect(move.id).to.equal(moveId);
            }
        }
    }

    /**
     * Checks the `active` property of a RequestArgs object.
     * @param args Args object.
     */
    function checkRequestActive(args: RequestArgs): void
    {
        if (!args.active) return;
        for (let i = 0; i < args.active[0].moves.length; ++i)
        {
            // tslint:disable-next-line:no-unused-expression
            expect(battle.state.teams.us.active.volatile.isDisabled(i))
                .to.be.false;
        }
    }

    describe("request", function()
    {
        for (const args of testArgs.request)
        {
            it("Should handle request", function()
            {
                listener.getHandler("request")(args);
                checkRequestSide(args);
                checkRequestActive(args);
            });
        }

        it("Should not handle request a second time", function()
        {
            listener.getHandler("request")(testArgs.request[0]);
            listener.getHandler("request")(testArgs.request[1]);
            checkRequestSide(testArgs.request[0]);
            checkRequestActive(testArgs.request[1]);
        });
    });

    describe("request + battleinit", function()
    {
        function testBattleInit(args: BattleInitArgs): void
        {
            it("Should initialize battle", async function()
            {
                // testArgs: even/0 indexes are p1, odd are p2
                const i = args.id === "p1" ? 0 : 1;
                const req: RequestArgs =
                {
                    side: {pokemon: [testArgs.request[i].side.pokemon[0]]}
                };
                await listener.getHandler("request")(req);
                checkRequestSide(req);
                await listener.getHandler("battleinit")(args);

                // shouldn't modify current team data
                checkRequestSide(req);
                expect(battle.getSide("p1")).to.equal("us");
                expect(battle.getSide("p2")).to.equal("them");
                expect(battle.state.teams.them.size).to.equal(3);

                expect(responses).to.have.lengthOf(1);
            });
        }

        const a: BattleInitArgs =
        {
            id: "p1", username: testArgs.username[0], teamSizes: {p1: 3, p2: 3},
            gameType: "singles", gen: 4,
            events:
            [
                {
                    type: "switch", id: testArgs.pokemonId[0],
                    details: testArgs.pokemonDetails[0],
                    status: testArgs.pokemonStatus[0]
                },
                {
                    type: "switch", id: testArgs.pokemonId[1],
                    details: testArgs.pokemonDetails[1],
                    status: testArgs.pokemonStatus[1]
                }
            ]
        };
        testBattleInit({...a});

        a.id = "p2";
        a.username = testArgs.username[1];
        testBattleInit(a);
    });

    describe("battleprogress", function()
    {
        // PokemonIDs of the setup teams
        const us1: Readonly<PokemonID> =
            {owner: "p1", position: "a", nickname: "Magikarp"};
        const us2: Readonly<PokemonID> =
            {owner: "p1", position: "a", nickname: "Gyarados"};
        const them1: Readonly<PokemonID> =
            {owner: "p2", position: "a", nickname: "Magikarp"};

        beforeEach("Setup state", async function()
        {
            // an initial request+battleinit is required to start tracking the
            //  state properly
            await listener.getHandler("request")({side: {pokemon: []}});
            await listener.getHandler("battleinit")(
            {
                id: "p1", username: testArgs.username[0], gameType: "singles",
                gen: 4, teamSizes: {p1: 2, p2: 2}, events: []
            });

            // clear invalid response from battleinit handler
            // tslint:disable-next-line:no-unused-expression
            expect(battle.lastChoices).to.be.empty;
            responses = [];

            // setup teams
            const us = battle.state.teams.us;
            us.size = 2;
            // tslint:disable:no-unused-expression
            expect(us.switchIn("Magikarp", 100, "M", 10, 10)).to.not.be.null;
            expect(us.reveal("Gyarados", 100, "M", 1000, 1000)).to.not.be.null;
            const them = battle.state.teams.them;
            them.size = 2;
            expect(them.switchIn("Magikarp", 100, "M", 10, 10)).to.not.be.null;
            // tslint:enable:no-unused-expression
        });

        it("Should not choose action if given empty event", async function()
        {
            await listener.getHandler("battleprogress")({events: []});
            // tslint:disable-next-line:no-unused-expression
            expect(responses).to.be.empty;
        });

        it("Should not choose moves it can't make", async function()
        {
            const mon = battle.state.teams.us.active;
            mon.revealMove("splash");
            mon.volatile.disableMove(0, true);
            mon.revealMove("tackle");

            await listener.getHandler("battleprogress")(
                {events: [], upkeep: {pre: [], post: []}, turn: 1});

            expect(battle.lastChoices).to.have.members(["move 2", "switch 2"]);
            expect(responses).to.have.lengthOf(1);
        });

        describe("event processing", function()
        {
            // sample BattleEvent
            const event: MoveEvent =
                {type: "move", id: us1, moveName: "Splash", targetId: us1};

            beforeEach("Initial assertions", function()
            {
                // move hasn't been revealed yet
                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.us.active.getMove("splash"))
                    .to.be.null;
            });

            it("Should process events", async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events: [event],
                    upkeep: {pre: [], post: []}, turn: 1
                });
            });

            it("Should process upkeep.pre", async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events: [],
                    upkeep: {pre: [event], post: []}, turn: 1
                });
            });

            it("Should process upkeep.post", async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events: [],
                    upkeep: {pre: [], post: [event]}, turn: 1
                });
            });

            afterEach("Final assertions", function()
            {
                const move = battle.state.teams.us.active.getMove("splash");
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(63);

                expect(battle.lastChoices).to.have.members(
                    ["move 1", "switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });
        });

        describe("selfSwitch", function()
        {
            const event: MoveEvent =
                {type: "move", id: us1, moveName: "U-Turn", targetId: them1};

            it("Should process selfSwitch move", async function()
            {
                await listener.getHandler("battleprogress")({events: [event]});
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            it("Should selfSwitch if opponent faints", async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events: [event, {type: "faint", id: event.targetId}]
                });
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            const event2: MoveEvent =
                {type: "move", id: them1, moveName: "U-Turn", targetId: us1};

            it("Should wait for opponent selfSwitch choice", async function()
            {
                await listener.getHandler("battleprogress")({events: [event2]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            it("Should wait for opponent selfSwitch if our pokemon faints",
            async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [event2, {type: "faint", id: event2.targetId}]});
                expect(responses).to.have.lengthOf(0);
            });
        });

        describe("abiliy", function()
        {
            it("Should set ability", async function()
            {
                expect(battle.state.teams.us.active.baseAbility).to.equal("");
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "ability", id: us1, ability: "Swift Swim"}]
                });
                expect(battle.state.teams.us.active.baseAbility)
                    .to.equal("swiftswim");
            });

            it("Should set opponent ability", async function()
            {
                expect(battle.state.teams.them.active.baseAbility).to.equal("");
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        {type: "ability", id: them1, ability: "Swift Swim"}
                    ]
                });
                expect(battle.state.teams.them.active.baseAbility)
                    .to.equal("swiftswim");
            });
        });

        describe("activate/end/start", function()
        {
            it("Should activate/end/start confusion", async function()
            {
                // tslint:disable:no-unused-expression
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.isConfused).to.be.false;
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "start", id: us1, volatile: "confusion"}]
                });
                expect(volatile.isConfused).to.be.true;
                expect(volatile.confuseTurns).to.equal(1);

                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "activate", id: us1, volatile: "confusion"}]
                });
                expect(volatile.isConfused).to.be.true;
                expect(volatile.confuseTurns).to.equal(2);

                await listener.getHandler("battleprogress")(
                    {events: [{type: "end", id: us1, volatile: "confusion"}]});
                expect(volatile.isConfused).to.be.false;
                expect(volatile.confuseTurns).to.equal(0);
                // tslint:enable:no-unused-expression
            });

            it("Should ignore invalid volatiles", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                // tslint:disable-next-line:no-unused-expression
                expect(volatile.isConfused).to.be.false;
                await listener.getHandler("battleprogress")(
                    {events: [{type: "start", id: us1, volatile: ""}]});
                // tslint:disable-next-line:no-unused-expression
                expect(volatile.isConfused).to.be.false;
            });
        });

        describe("curestatus", function()
        {
            it("Should cure status", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.majorStatus = "psn";
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "curestatus", id: us1, majorStatus: "psn"}]
                });
                expect(mon.majorStatus).to.equal("");
            });
        });

        describe("cureteam", function()
        {
            it("Should cure team", async function()
            {
                const mon1 = battle.state.teams.us.pokemon[0];
                const mon2 = battle.state.teams.us.pokemon[1];
                mon1.majorStatus = "slp";
                mon2.majorStatus = "par";
                await listener.getHandler("battleprogress")(
                    {events: [{type: "cureteam", id: us1}]});
                expect(mon1.majorStatus).to.equal("");
                expect(mon2.majorStatus).to.equal("");
            });
        });

        for (const type of ["damage", "heal"] as ("damage" | "heal")[])
        {
            describe(type, function()
            {
                it("Should set hp", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type, id: us1,
                                status: {hp: 1, hpMax: 10, condition: "brn"}
                            }
                        ]
                    });
                    const mon = battle.state.teams.us.active;
                    expect(mon.hp.current).to.equal(1);
                    expect(mon.hp.max).to.equal(10);
                    expect(mon.majorStatus).to.equal("brn");
                });
            });
        }

        describe("faint", function()
        {

            it("Should handle faint", async function()
            {
                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.us.active.fainted).to.be.false;

                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "faint", id: us1}],
                    upkeep: {pre: [], post: []}
                });

                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.us.active.fainted).to.be.true;

                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            it("Should wait for opponent replacement", async function()
            {
                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.them.active.fainted).to.be.false;

                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "faint", id: them1}],
                    upkeep: {pre: [], post: []}
                });

                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });
        });

        describe("move", function()
        {
            // sample move event
            const event: MoveEvent =
            {
                type: "move", id: us1, moveName: "Splash", targetId: us1
            };

            it("Should reveal move", async function()
            {
                const mon = battle.state.teams.us.active;
                let move = mon.getMove("splash")!;
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.be.null;

                await listener.getHandler("battleprogress")({events: [event]});

                move = mon.getMove("splash")!;
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.not.be.null;
                expect(move.id).to.equal("splash");
                expect(move.pp).to.equal(63);
            });

            describe("lockedmove", function()
            {
                it("Should activate lockedmove status and restrict choices",
                async function()
                {
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.false;
                    // certain moves cause the lockedmove status
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            }
                        ],
                        upkeep: {pre: [], post: []}, turn: 1
                    });
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.true;
                    expect(battle.lastChoices).to.have.members(["move 1"]);
                    expect(responses).to.have.lengthOf(1);
                });

                it("Should not consume pp", async function()
                {
                    let move = battle.state.teams.us.active.getMove("splash");
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.be.null;

                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Splash",
                                targetId: us1, cause: {type: "lockedmove"}
                            }
                        ]
                    });

                    move = battle.state.teams.us.active.getMove("splash")!;
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(64);
                });
            });

            describe("pressure", function()
            {
                // id of the pokemon that has the pressure ability
                const them2: PokemonID =
                    {owner: "p2", position: "a", nickname: "Zapdos"};

                beforeEach("Switchin a Pressure pokemon", function()
                {
                    battle.state.teams.them.switchIn("Zapdos", 100, "", 100,
                            100)!.baseAbility = "Pressure";
                });

                beforeEach("Reveal an attacking move", function()
                {
                    const move = battle.state.teams.us.active.revealMove(
                        "tackle");
                    expect(move.pp).to.equal(56);
                });

                it("Should use double pp if targeted", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Tackle",
                                targetId: them2
                            }
                        ]
                    });
                    const move = battle.state.teams.us.active.getMove(
                        "tackle")!;
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(54);
                });

                it("Should not use double pp not if targeted", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Tackle",
                                targetId: us1
                            }
                        ]
                    });
                    const move = battle.state.teams.us.active.getMove(
                        "tackle")!;
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(55);
                });
            });
        });

        describe("status", function()
        {
            it("Should afflict with status", async function()
            {
                const mon = battle.state.teams.us.active;
                expect(mon.majorStatus).to.equal("");
                await listener.getHandler("battleprogress")(
                    {events: [{type: "status", id: us1, majorStatus: "frz"}]});
                expect(mon.majorStatus).to.equal("frz");
            });
        });

        describe("tie/win", function()
        {
            it("Should not choose action after winning", async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [{type: "win", winner: testArgs.username[0]}]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            it("Should not choose action after losing", async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [{type: "win", winner: testArgs.username[1]}]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            it("Should not choose action after tie", async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [{type: "tie"}]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            for (const value of [true, false])
            {
                describe(`saveAlways = ${value}`, function()
                {
                    beforeEach("Set saveAlways", function()
                    {
                        battle.saveAlways = value;
                        expect(battle.saved).to.equal(false);
                    });

                    it("Should save after win", async function()
                    {
                        await listener.getHandler("battleprogress")(
                        {
                            events:
                            [
                                {type: "win", winner: testArgs.username[0]}
                            ]
                        });
                        expect(battle.saved).to.equal(true);
                    });

                    it(`Should ${value ? "" : "not "}save after loss`,
                    async function()
                    {
                        await listener.getHandler("battleprogress")(
                        {
                            events:
                            [
                                {type: "win", winner: testArgs.username[1]}
                            ]
                        });
                        expect(battle.saved).to.equal(value);
                    });

                    it(`Should ${value ? "" : "not "}save after tie`,
                    async function()
                    {
                        await listener.getHandler("battleprogress")(
                            {events: [{type: "tie"}]});
                        expect(battle.saved).to.equal(value);
                    });
                });
            }
        });

        describe("cause", function()
        {
            for (const type of ["win", "tie"] as ("win" | "tie")[])
            {
                it(`Shouldn't handle ${type} causes`, async function()
                {
                    // sample event cause
                    const cause: FatigueCause = {type: "fatigue"};
                    const event = {type, cause} as WinEvent | TieEvent;
                    if (event.type === "win")
                    {
                        event.winner = testArgs.username[0];
                    }

                    battle.state.teams.us.active.volatile.lockedMove = true;
                    await listener.getHandler("battleprogress")(
                        {events: [event]});
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.true;
                });
            }

            describe("fatigue", function()
            {
                it("Should end lockedmove status", async function()
                {
                    battle.state.teams.us.active.volatile.lockedMove = true;
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "start", id: us1, volatile: "confusion",
                                cause: {type: "fatigue"}
                            }
                        ]
                    });
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.false;
                });
            });

            describe("item", function()
            {
                it("Should reveal item", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "heal", id: us1,
                                status: {hp: 10, hpMax: 10, condition: ""},
                                cause: {type: "item", item: "Leftovers"}
                            }
                        ]
                    });
                    expect(battle.state.teams.us.active.item)
                        .to.equal("leftovers");
                });
            });
        });
    });
});
