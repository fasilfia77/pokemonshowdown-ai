import { expect } from "chai";
import "mocha";
import { StatExceptHP, statsExceptHP, Type } from
    "../../../../src/battle/dex/dex-util";
import { AbilityContext } from
    "../../../../src/battle/driver/context/AbilityContext";
import { BaseContext } from "../../../../src/battle/driver/context/BaseContext";
import { DriverContext } from
    "../../../../src/battle/driver/context/DriverContext";
import { MoveContext } from "../../../../src/battle/driver/context/MoveContext";
import { SwitchContext } from
    "../../../../src/battle/driver/context/SwitchContext";
import { AnyDriverEvent, CountableStatusType, DriverSwitchOptions,
    FieldConditionType, InitTeam, SideConditionType, SingleMoveStatus,
    SingleTurnStatus, StatusEffectType, UpdatableStatusEffectType } from
    "../../../../src/battle/driver/DriverEvent";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyTeamStatus } from "../../../../src/battle/state/TeamStatus";
import { ReadonlyVolatileStatus } from
    "../../../../src/battle/state/VolatileStatus";
import { Logger } from "../../../../src/Logger";
import { ditto, smeargle } from "../helpers";

describe("BaseContext", function()
{
    let state: BattleState;
    let ctx: BaseContext;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    beforeEach("Initialize BaseContext", function()
    {
        ctx = new BaseContext(state, Logger.null);
    });

    function initTeam(teamRef: Side, options: readonly DriverSwitchOptions[]):
        Pokemon[]
    {
        const team = state.teams[teamRef];
        team.size = options.length;
        return options.map(op => team.switchIn(op)!);
    }

    function initActive(monRef: Side, options = smeargle): Pokemon
    {
        return initTeam(monRef, [options])[0];
    }

    function handle(event: AnyDriverEvent,
        instance?: new(...args: any[]) => DriverContext): void
    {
        if (instance) expect(ctx.handle(event)).to.be.an.instanceOf(instance);
        else expect(ctx.handle(event)).to.equal("stop");
    }

    describe("#handle()", function()
    {
        describe("activateAbility", function()
        {
            it("Should return AbilityContext", function()
            {
                const mon = initActive("them");
                expect(mon.ability).to.be.empty;
                handle(
                {
                    type: "activateAbility", monRef: "them",
                    ability: "swiftswim"
                },
                    AbilityContext);
                expect(mon.ability).to.equal("swiftswim");
            });
        });

        describe("activateFieldCondition", function()
        {
            function test(name: string, condition: FieldConditionType)
            {
                it(`Should activate ${name}`, function()
                {
                    expect(state.status[condition].isActive).to.be.false;

                    // start the condition
                    handle(
                    {
                        type: "activateFieldCondition", condition, start: true
                    });

                    expect(state.status[condition].isActive).to.be.true;

                    // end the condition
                    handle(
                    {
                        type: "activateFieldCondition", condition, start: false
                    });

                    expect(state.status[condition].isActive).to.be.false;
                });
            }

            test("Gravity", "gravity");
            test("Trick Room", "trickRoom");
        });

        describe("activateFutureMove", function()
        {
            it("Should prepare and release future move", function()
            {
                const ts = state.teams.us.status;
                // prepare move
                handle(
                {
                    type: "activateFutureMove", monRef: "us",
                    move: "doomdesire", start: true
                });
                expect(ts.futureMoves.doomdesire.isActive).to.be.true;

                // release the move
                handle(
                {
                    type: "activateFutureMove", monRef: "us",
                    move: "doomdesire", start: false
                });
                expect(ts.futureMoves.futuresight.isActive).to.be.false;
            });
        });

        describe("activateSideCondition", function()
        {
            function testItemCondition(name: string,
                condition: "lightScreen" | "reflect")
            {
                it(`Should activate ${name}`, function()
                {
                    const team = state.teams.them;
                    expect(team.status[condition].isActive).to.be.false;

                    // start the condition
                    handle(
                    {
                        type: "activateSideCondition", teamRef: "them",
                        condition, start: true
                    });
                    expect(team.status[condition].isActive).to.be.true;
                    expect(team.status[condition].source).to.be.null;

                    // end the condition
                    handle(
                    {
                        type: "activateSideCondition", teamRef: "them",
                        condition, start: false
                    });
                    expect(team.status[condition].isActive).to.be.false;
                });
            }

            testItemCondition("Light Screen", "lightScreen");
            testItemCondition("Reflect", "reflect");

            function testHazard(name: string,
                condition: "spikes" | "stealthRock" | "toxicSpikes")
            {
                it(`Should activate ${name}`, function()
                {
                    const team = state.teams.us;
                    expect(team.status[condition]).to.equal(0);

                    // start the condition
                    handle(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: true
                    });
                    expect(team.status[condition]).to.equal(1);

                    // end the condition
                    handle(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: false
                    });
                    expect(team.status[condition]).to.equal(0);
                });
            }

            testHazard("Spikes", "spikes");
            testHazard("Stealth Rock", "stealthRock");
            testHazard("Toxic Spikes", "toxicSpikes");

            function testStatus(name: string, condition: SideConditionType,
                getter: (ts: ReadonlyTeamStatus) => boolean)
            {
                it(`Should activate ${name}`, function()
                {
                    const ts = state.teams.us.status;
                    expect(getter(ts)).to.be.false;

                    // start the condition
                    handle(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: true
                    });
                    expect(getter(ts)).to.be.true;

                    // end the condition
                    handle(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: false
                    });
                    expect(getter(ts)).to.be.false;
                });
            }

            testStatus("Healing Wish", "healingWish", ts => ts.healingWish);
            testStatus("Lucky Chant", "luckyChant",
                ts => ts.luckyChant.isActive);
            testStatus("Mist", "mist", ts => ts.mist.isActive);
            testStatus("Safeguard", "safeguard", ts => ts.safeguard.isActive);
            testStatus("Tailwind", "tailwind", ts => ts.tailwind.isActive);
        });

        describe("activateStatusEffect", function()
        {
            function test(name: string, status: StatusEffectType,
                getter: (v: ReadonlyVolatileStatus) => boolean)
            {
                it(`Should activate ${name}`, function()
                {
                    const v = initActive("us").volatile;
                    expect(getter(v)).to.be.false;

                    // start the status
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us", status,
                        start: true
                    });
                    expect(getter(v)).to.be.true;

                    // end the status
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us", status,
                        start: false
                    });
                    expect(getter(v)).to.be.false;
                });
            }

            test("Aqua Ring", "aquaRing", v => v.aquaRing);
            test("Attract", "attract", v => v.attract);
            test("Bide", "bide", v => v.bide.isActive);
            test("confusion", "confusion", v => v.confusion.isActive);
            test("Charge", "charge", v => v.charge.isActive);
            test("Curse", "curse", v => v.curse);
            test("Embargo", "embargo", v => v.embargo.isActive);
            test("Encore", "encore", v => v.encore.isActive);
            test("Focus Energy", "focusEnergy", v => v.focusEnergy);
            test("Foresight", "foresight", v => v.identified === "foresight");
            test("Heal Block", "healBlock", v => v.healBlock.isActive);
            test("Imprison", "imprison", v => v.imprison);
            test("Ingrain", "ingrain", v => v.ingrain);
            test("Leech Seed", "leechSeed", v => v.leechSeed);
            test("Magnete Rise", "magnetRise", v => v.magnetRise.isActive);
            test("Miracle Eye", "miracleEye",
                v => v.identified === "miracleEye");
            test("Mud Sport", "mudSport", v => v.mudSport);
            test("Nightmare", "nightmare", v => v.nightmare);
            test("Power Trick", "powerTrick", v => v.powerTrick);
            test("Substitute", "substitute", v => v.substitute);
            test("Slow Start", "slowStart", v => v.slowStart.isActive);
            test("Taunt", "taunt", v => v.taunt.isActive);
            test("Torment", "torment", v => v.torment);
            test("Uproar", "uproar", v => v.uproar.isActive);
            test("Water Sport", "waterSport", v => v.waterSport);
            test("Yawn", "yawn", v => v.yawn.isActive);

            it("Should throw if invalid status", function()
            {
                // the type system should guarantee that StateDriver handles
                //  all StatusEffectTypes, so we need to pass in an invalid one
                //  through an any assertion
                expect(function()
                {
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        status: "invalid" as any, start: true
                    });
                })
                    .to.throw(Error, "Invalid status effect 'invalid'");
            });
        });

        describe("afflictStatus", function()
        {
            it("Should afflict status", function()
            {
                const mon = initActive("us");
                expect(mon.majorStatus.current).to.be.null;
                handle({type: "afflictStatus", monRef: "us", status: "brn"});
                expect(mon.majorStatus.current).to.equal("brn");
            });
        });

        describe("boost", function()
        {
            it("Should add stat boost", function()
            {
                const boosts = initActive("us").volatile.boosts;
                handle({type: "boost", monRef: "us", stat: "atk", amount: 2});
                expect(boosts.atk).to.equal(2);
            });

            it("Should accumulate stat boost", function()
            {
                const boosts = initActive("us").volatile.boosts;
                handle({type: "boost", monRef: "us", stat: "atk", amount: 2});
                handle({type: "boost", monRef: "us", stat: "atk", amount: 3});
                expect(boosts.atk).to.equal(5);
            });
        });

        describe("changeType", function()
        {
            it("Should change types", function()
            {
                const mon = initActive("us");
                const newTypes: [Type, Type] = ["bug", "dragon"];
                handle({type: "changeType", monRef: "us", newTypes});
                expect(mon.types).to.deep.equal(newTypes);
            });

            it("Should also reset third type", function()
            {
                const mon = initActive("us");
                mon.volatile.addedType = "ghost";

                handle(
                {
                    type: "changeType", monRef: "us", newTypes: ["fire", "???"]
                });
                expect(mon.volatile.addedType).to.equal("???");
            });
        });

        describe("clearAllBoosts", function()
        {
            it("Should clear all boosts from both sides", function()
            {
                const us = initActive("us").volatile.boosts;
                const them = initActive("them").volatile.boosts;
                us.accuracy = 2;
                them.spe = -2;

                handle({type: "clearAllBoosts"});
                expect(us.accuracy).to.equal(0);
                expect(them.spe).to.equal(0);
            });
        });

        describe("clearNegativeBoosts", function()
        {
            it("Should clear negative boosts", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.evasion = 2;
                boosts.spa = -3;

                handle({type: "clearNegativeBoosts", monRef: "us"});
                expect(boosts.evasion).to.equal(2);
                expect(boosts.spa).to.equal(0);
            });
        });

        describe("clearPositiveBoosts", function()
        {
            it("Should clear negative boosts", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.spd = 3;
                boosts.def = -1;

                handle({type: "clearPositiveBoosts", monRef: "us"});

                expect(boosts.spd).to.equal(0);
                expect(boosts.def).to.equal(-1);
            });
        });

        describe("clearSelfSwitch", function()
        {
            it("Should clear self-switch flags", function()
            {
                state.teams.them.status.selfSwitch = true;
                handle({type: "clearSelfSwitch"});
                expect(state.teams.them.status.selfSwitch).to.be.false;
            });
        });

        describe("copyBoosts", function()
        {
            it("Should copy boosts", function()
            {
                const us = initActive("us").volatile.boosts;
                const them = initActive("them").volatile.boosts;
                us.atk = 2;
                them.atk = -2;

                handle({type: "copyBoosts", from: "us", to: "them"});
                expect(us.atk).to.equal(2);
                expect(them.atk).to.equal(2);
            });
        });

        describe("countStatusEffect", function()
        {
            function test(name: string, status: CountableStatusType): void
            {
                it(`Should update ${name} count`, function()
                {
                    const v = initActive("us").volatile;
                    expect(v[status]).to.equal(0);
                    handle(
                    {
                        type: "countStatusEffect", monRef: "us", status,
                        turns: 2
                    });
                    expect(v[status]).to.equal(2);
                });
            }

            test("Perish Song", "perish");
            test("Stockpile", "stockpile");
        });

        describe("crit", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "crit", monRef: "us"});
            });
        });

        describe("cureStatus", function()
        {
            it("Should cure status", function()
            {
                const mon = initActive("us");
                mon.majorStatus.afflict("par");
                expect(mon.majorStatus.current).to.equal("par");
                handle({type: "cureStatus", monRef: "us", status: "par"});
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should throw if a different status was mentioned", function()
            {
                const mon = initActive("us");
                mon.majorStatus.afflict("tox");

                expect(() =>
                    ctx.handle(
                        {type: "cureStatus", monRef: "us", status: "psn"}))
                    .to.throw(Error,
                        "MajorStatus 'tox' was expected to be 'psn'");
                expect(mon.majorStatus.current).to.equal("tox");
            });
        });

        describe("cureTeam", function()
        {
            it("Should cure team", function()
            {
                state.teams.them.size = 2;
                const [mon1, mon2] = initTeam("them", [smeargle, ditto]);
                mon1.majorStatus.afflict("slp");
                mon2.majorStatus.afflict("frz");

                expect(mon1.majorStatus.current).to.equal("slp");
                expect(mon2.majorStatus.current).to.equal("frz");
                handle({type: "cureTeam", teamRef: "them"});
                expect(mon1.majorStatus.current).to.be.null;
                expect(mon2.majorStatus.current).to.be.null;
            });
        });

        describe("disableMove", function()
        {
            it("Should disable move", function()
            {
                const mon = initActive("them");
                handle({type: "disableMove", monRef: "them", move: "tackle"});
                expect(mon.volatile.disabled).to.not.be.null;
                expect(mon.volatile.disabled!.name).to.equal("tackle");
                expect(mon.volatile.disabled!.ts.isActive).to.be.true;
            });
        });

        describe("fail", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "fail", monRef: "us"});
            });
        });

        describe("faint", function()
        {
            it("Should faint pokemon", function()
            {
                const mon = initActive("us");
                handle({type: "faint", monRef: "us"});
                expect(mon.fainted).to.be.true;
            });
        });

        describe("fatigue", function()
        {
            it("Should reset lockedMove status", function()
            {
                const v = initActive("them").volatile;
                v.lockedMove.start("outrage");
                handle({type: "fatigue", monRef: "them"});
                expect(v.lockedMove.isActive).to.be.false;
            });
        });

        describe("feint", function()
        {
            it("Should break stall", function()
            {
                const v = initActive("them").volatile;
                v.stall(true);
                expect(v.stalling).to.be.true;
                expect(v.stallTurns).to.equal(1);

                // assume "us" uses Feint
                handle({type: "feint", monRef: "them"});
                expect(v.stalling).to.be.false;
                // should not reset stall turns
                expect(v.stallTurns).to.equal(1);
            });
        });

        describe("formChange", function()
        {
            it("Should change form", function()
            {
                const mon = initActive("us", smeargle);
                expect(mon.species).to.equal("smeargle");

                handle(
                {
                    type: "formChange", monRef: "us", species: "gyarados",
                    // TODO: (how) would hp/level change?
                    gender: "M", level: 100, hp: 300, hpMax: 300, perm: false
                });

                expect(mon.species).to.equal("gyarados");
            });
        });

        describe("gameOver", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "gameOver"});
            });
        });

        describe("gastroAcid", function()
        {
            it("Should reveal and suppress ability", function()
            {
                const mon = initActive("them");
                handle(
                {
                    type: "gastroAcid", monRef: "them", ability: "voltabsorb"
                });
                expect(mon.ability).to.equal("voltabsorb");
                expect(mon.volatile.gastroAcid).to.be.true;
            });
        });

        describe("hitCount", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "hitCount", monRef: "us", count: 4});
            });
        });

        describe("immune", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "immune", monRef: "them"});
            });
        });

        describe("inactive", function()
        {
            it("Should reset single-move statuses as if a move was attempted",
            function()
            {
                const v = initActive("us").volatile;
                v.destinyBond = true;

                handle({type: "inactive", monRef: "us"});
                expect(v.destinyBond).to.be.false;
            });

            it("Should reveal move if provided", function()
            {
                const moveset = initActive("them").moveset;
                expect(moveset.get("splash")).to.be.null;

                handle({type: "inactive", monRef: "them", move: "splash"});
                expect(moveset.get("splash")).to.not.be.null;
            });

            it("Should reveal move for both sides if imprison", function()
            {
                const us = initActive("us").moveset;
                const them = initActive("them").moveset;
                expect(us.get("splash")).to.be.null;
                expect(them.get("splash")).to.be.null;

                handle(
                {
                    type: "inactive", monRef: "them", reason: "imprison",
                    move: "splash"
                });
                expect(us.get("splash")).to.not.be.null;
                expect(them.get("splash")).to.not.be.null;
            });

            it("Should consume recharge turn", function()
            {
                const v = initActive("us").volatile;
                v.mustRecharge = true;

                handle({type: "inactive", monRef: "us", reason: "recharge"});
                expect(v.mustRecharge).to.be.false;
            });

            it("Should tick sleep counter", function()
            {
                const ms = initActive("us").majorStatus;
                ms.afflict("slp");
                expect(ms.current).to.equal("slp");
                expect(ms.turns).to.equal(1);

                handle({type: "inactive", monRef: "us", reason: "slp"});
                expect(ms.turns).to.equal(2);
            });

            describe("Truant ability", function()
            {
                it("Should flip Truant state", function()
                {
                    // first make sure the pokemon has truant
                    const mon = initActive("us");
                    mon.traits.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;

                    // also flipped back on postTurn to sync with this event
                    handle({type: "inactive", monRef: "us", reason: "truant"});
                    expect(mon.volatile.willTruant).to.be.true;
                });

                it("Should overlap truant turn with recharge turn", function()
                {
                    // first make sure the pokemon has truant
                    const mon = initActive("us");
                    mon.traits.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;

                    // indicate that the next turn is a recharge turn
                    mon.volatile.mustRecharge = true;

                    handle({type: "inactive", monRef: "us", reason: "truant"});
                    expect(mon.volatile.willTruant).to.be.true;
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });

            describe("initOtherTeamSize", function()
            {
                it("Should init other team's size", function()
                {
                    handle({type: "initOtherTeamSize", size: 2});
                    expect(state.teams.them.size).to.equal(2);
                });
            });

            describe("initTeam", function()
            {
                /** Base InitTeam event for testing. */
                const initTeamEvent: InitTeam =
                {
                    type: "initTeam",
                    team:
                    [
                        {
                            species: "smeargle", level: 50, gender: "F",
                            hp: 115, hpMax: 115,
                            stats:
                            {
                                atk: 25, def: 40, spa: 25, spd: 50, spe: 80
                            },
                            moves: ["splash", "tackle"],
                            baseAbility: "technician", item: "lifeorb"
                        }
                    ]
                };
                function checkInitTeam(team: ReadonlyTeam, event: InitTeam):
                    void
                {
                    expect(team.size).to.equal(event.team.length);

                    for (const data of event.team)
                    {
                        const mon = team.pokemon.find(
                            p => !!p && p.species === data.species)!;
                        expect(mon).to.exist;

                        expect(mon.species).to.equal(data.species);
                        expect(mon.traits.stats.level).to.equal(data.level);
                        expect(mon.item.definiteValue).to.equal(data.item);
                        expect(mon.traits.ability.definiteValue)
                            .to.equal(data.baseAbility);

                        // check stats
                        // first check hp
                        const table = mon.traits.stats;
                        expect(table.hp.hp).to.be.true;
                        expect(table.hp.min).to.equal(data.hpMax);
                        expect(table.hp.max).to.equal(data.hpMax);
                        expect(mon.hp.current).to.equal(data.hp);
                        expect(mon.hp.max).to.equal(data.hpMax);
                        // then check other stats
                        for (const stat of Object.keys(statsExceptHP) as
                            StatExceptHP[])
                        {
                            expect(table[stat].hp).to.be.false;
                            expect(table[stat].min).to.equal(data.stats[stat]);
                            expect(table[stat].max).to.equal(data.stats[stat]);
                        }

                        // check moves
                        expect(mon.moveset.moves)
                            .to.have.lengthOf(data.moves.length);
                        for (const name of data.moves)
                        {
                            const move = mon.moveset.get(name);
                            expect(move).to.not.be.null;
                            expect(move!.name).to.equal(name);
                        }

                        // check optional data

                        if (data.hpType)
                        {
                            expect(mon.hpType.definiteValue)
                                .to.equal(data.hpType);
                        }
                        else expect(mon.hpType.definiteValue).to.be.null;

                        if (data.happiness)
                        {
                            expect(mon.happiness).to.equal(data.happiness);
                        }
                        else expect(mon.happiness).to.be.null;
                    }
                }

                it("Should init our team", function()
                {
                    handle(initTeamEvent);
                    checkInitTeam(state.teams.us, initTeamEvent);
                });

                it("Should init our team with hp type and happiness", function()
                {
                    const event: InitTeam =
                    {
                        ...initTeamEvent,
                        team:
                        [
                            {
                                ...initTeamEvent.team[0], hpType: "fire",
                                happiness: 255
                            },
                            ...initTeamEvent.team.slice(1)
                        ]
                    };
                    handle(event);
                    checkInitTeam(state.teams.us, event);
                });
            });
        });

        describe("invertBoosts", function()
        {
            it("Should invert boosts", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.spe = 1;
                boosts.atk = -1;

                handle({type: "invertBoosts", monRef: "us"});
                expect(boosts.spe).to.equal(-1);
                expect(boosts.atk).to.equal(1);
            });
        });

        describe("lockOn", function()
        {
            it("Should set Lock-On status", function()
            {
                const us = initActive("us").volatile;
                const them = initActive("them").volatile;
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.be.null;
                expect(us.lockOnTurns.isActive).to.be.false;
                expect(them.lockedOnBy).to.be.null;
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;

                handle({type: "lockOn", monRef: "us", target: "them"});
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.equal(them);
                expect(us.lockOnTurns.isActive).to.be.true;
                expect(them.lockedOnBy).to.equal(us);
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;
            });
        });

        describe("mimic", function()
        {
            it("Should Mimic move", function()
            {
                const mon = initActive("them");
                mon.moveset.reveal("mimic");

                handle({type: "mimic", monRef: "them", move: "splash"});
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.baseMoveset.get("splash")).to.be.null;
                expect(mon.baseMoveset.get("mimic")).to.not.be.null;
            });
        });

        describe("miss", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "miss", monRef: "them"});
            });
        });

        describe("modifyPP", function()
        {
            it("Should modify pp amount of move", function()
            {
                const {moveset} = initActive("them");

                handle(
                {
                    type: "modifyPP", monRef: "them", move: "splash", amount: -4
                });
                const move = moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(60);
                expect(move!.maxpp).to.equal(64);

                handle(
                {
                    type: "modifyPP", monRef: "them", move: "splash", amount: 3
                });
                expect(move!.pp).to.equal(63);
                expect(move!.maxpp).to.equal(64);
            });

            describe("amount=deplete", function()
            {
                it("Should fully deplete pp", function()
                {
                    const {moveset} = initActive("them");
                    handle(
                    {
                        type: "modifyPP", monRef: "them", move: "splash",
                        amount: "deplete"
                    });

                    const move = moveset.get("splash");
                    expect(move).to.not.be.null;
                    expect(move!.pp).to.equal(0);
                    expect(move!.maxpp).to.equal(64);
                });
            });
        });

        describe("mustRecharge", function()
        {
            it("Should indicate recharge", function()
            {
                const v = initActive("us").volatile;
                expect(v.mustRecharge).to.be.false;
                handle({type: "mustRecharge", monRef: "us"});
                expect(v.mustRecharge).to.be.true;
            });
        });

        describe("preTurn", function()
        {
            it("TODO", function()
            {
                handle({type: "preTurn"});
            });
        });

        describe("prepareMove", function()
        {
            it("Should prepare two-turn move", function()
            {
                const vts = initActive("them").volatile.twoTurn;
                handle({type: "prepareMove", monRef: "them", move: "dive"});

                expect(vts.isActive).to.be.true;
                expect(vts.type).to.equal("dive");
            });
        });

        describe("postTurn", function()
        {
            it("TODO", function()
            {
                handle({type: "postTurn"});
            });
        });

        describe("reenableMoves", function()
        {
            it("Should re-enable disabled moves", function()
            {
                const v = initActive("them").volatile;
                v.disableMove("tackle");
                expect(v.disabled).to.not.be.null;

                handle({type: "reenableMoves", monRef: "them"});
                expect(v.disabled).to.be.null;
            });
        });

        describe("rejectSwitchTrapped", function()
        {
            it("Should infer trapping ability if kept from switching",
            function()
            {
                // bring in a pokemon that can have a trapping ability
                const mon = initActive("them",
                {
                    species: "dugtrio", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                });
                expect(mon.ability).to.be.empty;
                expect(mon.traits.ability.possibleValues).to.have.all.keys(
                    "arenatrap", "sandveil");

                // bring in a pokemon that can be trapped
                initActive("us");

                handle({type: "rejectSwitchTrapped", monRef: "us", by: "them"});
                expect(mon.ability).to.equal("arenatrap");
            });
        });

        describe("removeItem", function()
        {
            it("Should remove item", function()
            {
                const mon = initActive("them");
                const oldItem = mon.item;
                expect(mon.item.definiteValue).to.be.null;

                handle({type: "removeItem", monRef: "them", consumed: false});
                expect(mon.item).to.not.equal(oldItem);
                expect(mon.item.definiteValue).to.equal("none");
            });
        });

        describe("resetWeather", function()
        {
            it("Should reset weather back to normal", function()
            {
                // modify the weather
                state.status.weather.start(null, "Hail");
                expect(state.status.weather.type).to.equal("Hail");

                // set it back to normal
                handle({type: "resetWeather"});
                expect(state.status.weather.type).to.equal("none");
            });
        });

        describe("resisted", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "resisted", monRef: "them"});
            });
        });

        describe("restoreMoves", function()
        {
            it("Should restore all move's PP", function()
            {
                const {moveset} = initActive("them");
                moveset.reveal("splash").pp -= 4;
                moveset.reveal("tackle").pp = 0;

                handle({type: "restoreMoves", monRef: "them"});

                const splash = moveset.get("splash");
                expect(splash).to.not.be.null;
                expect(splash!.pp).to.equal(splash!.maxpp);

                const tackle = moveset.get("tackle");
                expect(tackle).to.not.be.null;
                expect(tackle!.pp).to.equal(tackle!.maxpp);
            });
        });

        describe("revealItem", function()
        {
            it("Should reveal item", function()
            {
                const {item} = initActive("them");
                expect(item.definiteValue).to.be.null;

                handle(
                {
                    type: "revealItem", monRef: "them", item: "leftovers",
                    gained: false
                });
                expect(item.definiteValue).to.equal("leftovers");
            });
        });

        describe("revealMove", function()
        {
            it("Should reveal move", function()
            {
                const {moveset} = initActive("them");
                expect(moveset.get("tackle")).to.be.null;

                handle({type: "revealMove", monRef: "them", move: "tackle"});
                expect(moveset.get("tackle")).to.not.be.null;
            });
        });

        describe("setBoost", function()
        {
            it("Should set boost", function()
            {
                const {boosts} = initActive("us").volatile;
                expect(boosts.def).to.equal(0);
                handle(
                    {type: "setBoost", monRef: "us", stat: "def", amount: 6});

                expect(boosts.def).to.equal(6);
            });
        });

        describe("setSingleMoveStatus", function()
        {
            function test(name: string, status: SingleMoveStatus)
            {
                it(`Should set ${name}`, function()
                {
                    const v = initActive("us").volatile;
                    expect(v[status]).to.be.false;

                    handle({type: "setSingleMoveStatus", monRef: "us", status});
                    expect(v[status]).to.be.true;
                });
            }

            test("Destiny Bond", "destinyBond");
            test("Grudge", "grudge");
            test("Rage", "rage");
        });

        describe("setSingleTurnStatus", function()
        {
            function test(name: string, status: SingleTurnStatus)
            {
                it(`Should set ${name}`, function()
                {
                    const v = initActive("us").volatile;
                    if (status === "endure" || status === "protect")
                    {
                        expect(v.stallTurns).to.equal(0);
                        expect(v.stalling).to.be.false;
                    }
                    else expect(v[status]).to.be.false;

                    handle({type: "setSingleTurnStatus", monRef: "us", status});

                    if (status === "endure" || status === "protect")
                    {
                        expect(v.stallTurns).to.equal(1);
                        expect(v.stalling).to.be.true;
                    }
                    else expect(v[status]).to.be.true;
                });
            }

            test("Endure", "endure");
            test("Magic Coat", "magicCoat");
            test("Protect", "protect");
            test("Roost", "roost");
            test("Snatch", "snatch");
        });

        describe("setThirdType", function()
        {
            it("Should set third type", function()
            {
                const v = initActive("us").volatile;
                handle({type: "setThirdType", monRef: "us", thirdType: "bug"});
                expect(v.addedType).to.equal("bug");
            });
        });

        describe("setWeather", function()
        {
            it("Should set weather", function()
            {
                handle({type: "setWeather", weatherType: "Sandstorm"});

                expect(state.status.weather.type).to.equal("Sandstorm");
                expect(state.status.weather.duration).to.not.be.null;
                expect(state.status.weather.source).to.be.null;
            });
        });

        describe("sketch", function()
        {
            it("Should Sketch move", function()
            {
                const mon = initActive("them");
                mon.moveset.reveal("sketch");

                handle({type: "sketch", monRef: "them", move: "tackle"});
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("sketch")).to.be.null;
                expect(mon.baseMoveset.get("tackle")).to.not.be.null;
                expect(mon.baseMoveset.get("sketch")).to.be.null;
            });
        });

        describe("stall", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "stall", monRef: "us"});
            });
        });

        describe("superEffective", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "superEffective", monRef: "us"});
            });
        });

        describe("swapBoosts", function()
        {
            it("Should swap stat boosts", function()
            {
                const us = initActive("us").volatile.boosts;
                const them = initActive("them").volatile.boosts;
                us.accuracy = 4;
                them.spd = -1;

                handle(
                {
                    type: "swapBoosts", monRef1: "us", monRef2: "them",
                    stats: ["accuracy", "spd"]
                });
                expect(us.accuracy).to.equal(0);
                expect(us.spd).to.equal(-1);
                expect(them.accuracy).to.equal(4);
                expect(them.spd).to.equal(0);
            });
        });

        describe("switchIn", function()
        {
            it("Should return SwitchContext", function()
            {
                handle({type: "switchIn", monRef: "us", ...smeargle},
                    SwitchContext);
            });
        });

        describe("takeDamage", function()
        {
            it("Should change hp", function()
            {
                const mon = initActive("us", smeargle);
                expect(mon.hp.current).to.equal(smeargle.hp);

                handle(
                {
                    type: "takeDamage", monRef: "us", newHP: [50, 100],
                    tox: false
                });
                expect(mon.hp.current).to.equal(50);
            });
        });

        describe("tickWeather", function()
        {
            it("Should tick weather", function()
            {
                // first set the weather
                handle({type: "setWeather", weatherType: "Sandstorm"});
                expect(state.status.weather.turns).to.equal(0);

                handle({type: "tickWeather", weatherType: "Sandstorm"});
                expect(state.status.weather.turns).to.equal(1);
            });

            it("Should throw if a different weather is mentioned", function()
            {
                // first set the weather
                handle({type: "setWeather", weatherType: "RainDance"});
                expect(state.status.weather.turns).to.equal(0);

                expect(() =>
                        ctx.handle(
                            {type: "tickWeather", weatherType: "Sandstorm"}))
                    .to.throw(Error,
                        "Weather is 'RainDance' but ticked weather is " +
                        "'Sandstorm'");
                expect(state.status.weather.type).to.equal("RainDance");
                expect(state.status.weather.turns).to.equal(0);
            });
        });

        describe("transform", function()
        {
            it("Should transform pokemon", function()
            {
                const us = initActive("us", smeargle);
                const them = initActive("them", ditto);

                handle({type: "transform", source: "them", target: "us"});
                expect(them.volatile.transformed).to.be.true;
                expect(them.species).to.equal(us.species);
            });
        });

        describe("transformPost", function()
        {
            it("TODO");
        });

        describe("trap", function()
        {
            it("Should trap pokemon", function()
            {
                const us = initActive("us").volatile;
                const them = initActive("them").volatile;

                handle({type: "trap", target: "us", by: "them"});
                expect(us.trapped).to.equal(them);
                expect(us.trapping).to.be.null;
                expect(them.trapped).to.be.null;
                expect(them.trapping).to.equal(us);
            });
        });

        describe("unboost", function()
        {
            it("Should subtract stat boost", function()
            {
                const {boosts} = initActive("us").volatile;
                handle({type: "unboost", monRef: "us", stat: "atk", amount: 2});
                expect(boosts.atk).to.equal(-2);
            });
        });

        describe("updateStatusEffect", function()
        {
            function test(name: string, status: UpdatableStatusEffectType)
            {
                it(`Should update ${name}`, function()
                {
                    const v = initActive("us").volatile;
                    expect(v[status].isActive).to.be.false;

                    // first start the status
                    v[status].start();
                    expect(v[status].isActive).to.be.true;
                    expect(v[status].turns).to.equal(1);

                    // then update it
                    handle({type: "updateStatusEffect", monRef: "us", status});
                    expect(v[status].isActive).to.be.true;
                    expect(v[status].turns).to.equal(2);
                });
            }

            test("Bide", "bide");
            test("confusion", "confusion");
            test("Uproar", "uproar");
        });

        describe("useMove", function()
        {
            it("Should return MoveContext", function()
            {
                const {moveset} = initActive("them");
                expect(moveset.get("tackle")).to.be.null;

                handle({type: "useMove", monRef: "them", move: "tackle"},
                    MoveContext);
                const move = moveset.get("tackle");
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(55);
            });
        });
    });

    describe("#expire()", function()
    {
        it("Should throw", function()
        {
            expect(() => ctx.expire()).to.throw(Error,
                "BaseContext should never expire");
        });
    });
});