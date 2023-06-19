import {Protocol} from "@pkmn/protocol";
import {expect} from "chai";
import "mocha";
import {Logger} from "../utils/logging/Logger";
import {Verbose} from "../utils/logging/Verbose";
import {BattleDriver} from "./BattleDriver";
import {Action} from "./agent";
import {consume, verify} from "./parser/parsing";

export const test = () =>
    describe("BattleDriver", function () {
        it("Should correctly manage underlying BattleParser", async function () {
            let requested = false;
            const bh = new BattleDriver({
                username: "username",
                // Fake BattleParser for demonstration.
                async parser(ctx) {
                    // Initializer event.
                    await verify(ctx, "|request|");
                    await consume(ctx);

                    await verify(ctx, "|start|");
                    await consume(ctx);
                    await verify(ctx, "|turn|");
                    await consume(ctx);

                    await verify(ctx, "|request|");
                    requested = true;
                    let choices: Action[] = ["move 1", "move 2"];
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .false;
                    await consume(ctx);

                    await verify(ctx, "|turn|");
                    await consume(ctx);

                    await verify(ctx, "|request|");
                    requested = true;
                    choices = ["move 1", "move 2"];
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .false;
                    await consume(ctx);

                    await verify(ctx, "|tie|");
                    await consume(ctx);
                },
                // Fake BattleAgent for demonstration.
                agent: async (state, choices) => {
                    if (requested) {
                        [choices[0], choices[1]] = [choices[1], choices[0]];
                    }
                    return await Promise.resolve();
                },
                // Fake executor for demonstration.
                sender: msg => {
                    expect(msg).to.equal("|/choose move 2");
                    return true;
                },
                logger: new Logger(Logger.null, Verbose.None),
            });

            // Turn 1.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 1,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await bh.handle({args: ["start"], kwArgs: {}});
            await bh.handle({args: ["turn", "1" as Protocol.Num], kwArgs: {}});
            bh.halt();
            // Wait an extra tick to allow for the choice to be sent and
            // verified.
            await new Promise<void>(res => setImmediate(res));

            // Turn 2.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 2,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await bh.handle({args: ["turn", "2" as Protocol.Num], kwArgs: {}});
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Turn 3: Game-over.
            await bh.handle({args: ["tie"], kwArgs: {}});
            bh.halt();
            await bh.finish();
        });

        it("Should handle choice rejection and retrying due to unknown info", async function () {
            let executorState = 0;
            const bh = new BattleDriver({
                username: "username",
                async parser(ctx) {
                    // Initializer event.
                    await verify(ctx, "|request|");
                    await consume(ctx);

                    await verify(ctx, "|start|");
                    await consume(ctx);
                    await verify(ctx, "|turn|");
                    await consume(ctx);

                    await verify(ctx, "|request|");
                    let choices: Action[] = ["move 1", "move 2"];
                    // Try move 1.
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .true;
                    // Try move 2 after move 1 was rejected.
                    choices.shift();
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .false;
                    // Move 2 was accepted.
                    await consume(ctx);

                    await verify(ctx, "|turn|");
                    await consume(ctx);

                    await verify(ctx, "|request|");
                    choices = ["move 2", "move 1"];
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .false;
                    await consume(ctx);

                    await verify(ctx, "|tie|");
                    await consume(ctx);
                },
                agent: async (state, choices) => {
                    void state, choices;
                    return await Promise.resolve();
                },
                sender: msg => {
                    if (executorState === 0) {
                        expect(msg).to.equal("|/choose move 1");
                    } else {
                        expect(msg).to.equal("|/choose move 2");
                    }
                    ++executorState;
                    return true;
                },
                logger: new Logger(Logger.null, Verbose.None),
            });

            // Turn 1.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 1,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await bh.handle({args: ["start"], kwArgs: {}});
            await bh.handle({args: ["turn", "1" as Protocol.Num], kwArgs: {}});
            bh.halt();
            // Wait an extra tick to allow for the choice to be sent and
            // verified.
            await new Promise<void>(res => setImmediate(res));

            // First choice is rejected.
            await bh.handle({
                args: ["error", "[Invalid choice]" as Protocol.Message],
                kwArgs: {},
            });
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Turn 2 after retried choice is accepted.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 2,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await bh.handle({args: ["turn", "2" as Protocol.Num], kwArgs: {}});
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Turn 3: Game-over.
            await bh.handle({args: ["tie"], kwArgs: {}});
            bh.halt();
            await bh.finish();
            expect(executorState).to.equal(3);
        });

        it("Should handle choice rejection and retrying due to newly revealed info", async function () {
            let executorState = 0;
            const bh = new BattleDriver({
                username: "username",
                async parser(ctx) {
                    // Initializer event.
                    await verify(ctx, "|request|");
                    await consume(ctx);

                    await verify(ctx, "|start|");
                    await consume(ctx);
                    await verify(ctx, "|turn|");
                    await consume(ctx);

                    await verify(ctx, "|request|");
                    let choices: Action[] = ["move 1", "move 2", "move 3"];
                    // Try move 1.
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.equal(
                        "disabled",
                    );
                    // Move 1 is disabled, instead try move 2.
                    choices.shift();
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.equal(
                        "disabled",
                    );
                    // Move 2 is also disabled, try final move 3.
                    choices.shift();
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .false;
                    await consume(ctx);

                    await verify(ctx, "|turn|");
                    await consume(ctx);

                    await verify(ctx, "|request|");
                    choices = ["move 3", "move 1"];
                    await ctx.agent(ctx.state, choices);
                    await expect(ctx.executor(choices[0])).to.eventually.be
                        .false;
                    await consume(ctx);

                    await verify(ctx, "|tie|");
                    await consume(ctx);
                },
                agent: async (state, choices) => {
                    void state, choices;
                    return await Promise.resolve();
                },
                sender: msg => {
                    if (executorState === 0) {
                        expect(msg).to.equal("|/choose move 1");
                    } else if (executorState === 1) {
                        expect(msg).to.equal("|/choose move 2");
                    } else {
                        expect(msg).to.equal("|/choose move 3");
                    }
                    ++executorState;
                    return true;
                },
                logger: new Logger(Logger.null, Verbose.None),
            });

            // Turn 1.
            await bh.handle({
                args: [
                    "request",
                    // Minimal json to get the test to run.
                    JSON.stringify({
                        requestType: "move",
                        active: [{moves: [{}]}],
                        side: {
                            pokemon: [
                                {
                                    ident: "p1a: Smeargle",
                                    condition: "100/100",
                                },
                            ],
                        },
                        rqid: 1,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await bh.handle({args: ["start"], kwArgs: {}});
            await bh.handle({args: ["turn", "1" as Protocol.Num], kwArgs: {}});
            bh.halt();
            // Wait an extra tick to allow for the choice to be sent and
            // verified.
            await new Promise<void>(res => setImmediate(res));

            // First choice is rejected.
            await bh.handle({
                args: [
                    "error",
                    "[Unavailable choice] Can't move" as Protocol.Message,
                ],
                kwArgs: {},
            });
            bh.halt();
            // Agent makes new choice using updated info.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "move",
                        active: [{moves: [{}]}],
                        side: {
                            pokemon: [
                                {
                                    ident: "p1a: Smeargle",
                                    condition: "100/100",
                                },
                            ],
                        },
                        rqid: 2,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Second choice is rejected.
            await bh.handle({
                args: [
                    "error",
                    "[Unavailable choice] Can't move" as Protocol.Message,
                ],
                kwArgs: {},
            });
            bh.halt();
            // Agent makes new choice using updated info.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "move",
                        active: [{moves: [{}]}],
                        side: {
                            pokemon: [
                                {
                                    ident: "p1a: Smeargle",
                                    condition: "100/100",
                                },
                            ],
                        },
                        rqid: 3,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Turn 2 after accepting retried choice.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 4,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await bh.handle({args: ["turn", "2" as Protocol.Num], kwArgs: {}});
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Turn 3: Game-over.
            await bh.handle({args: ["tie"], kwArgs: {}});
            bh.halt();
            await bh.finish();
            expect(executorState).to.equal(4);
        });
    });
