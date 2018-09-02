import { expect } from "chai";
import "mocha";
import { AnyMessageListener, RequestArgs } from
    "../../../src/AnyMessageListener";
import { requestTestArgs } from "../../RequestTestArgs";
import { MockBattle } from "./MockBattle";

describe("Battle", function()
{
    const user1 = "user1";
    const user2 = "user2";

    /**
     * Adds to the responses array.
     * @param args Responses to add.
     */
    function addResponses(...args: string[]): void
    {
        responses.push(...args);
    }

    let responses: string[];
    let listener: AnyMessageListener;
    let battle: MockBattle;

    beforeEach("Initialize Battle", function()
    {
        responses = [];
        listener = new AnyMessageListener();
        battle = new MockBattle(user1, listener, addResponses);
    });

    describe("player", function()
    {
        it("Should initialize player", function()
        {
            listener.getHandler("player")(
                {id: "p1", username: user1, avatarId: 1});
            listener.getHandler("player")(
                {id: "p2", username: user2, avatarId: 1});
            expect(battle.getSide("p1")).to.equal("us");
            expect(battle.getSide("p2")).to.equal("them");
        });
    });

    describe("request", function()
    {
        it("Should handle request", function()
        {
            const requestArgs = requestTestArgs[0];
            listener.getHandler("request")(requestArgs);
            // TODO: how to test state values?
        });

        it("Should handle request after setting teamsize", function()
        {
            const requestArgs: RequestArgs =
            {
                side: {name: user1, id: "p1", pokemon: []}, rqid: 1
            };
            listener.getHandler("player")(
                {id: "p2", username: user2, avatarId: 1});
            listener.getHandler("teamsize")({id: "p1", size: 2});
            listener.getHandler("request")(requestArgs);
            // TODO: how to test state values?
        });
    });
});
