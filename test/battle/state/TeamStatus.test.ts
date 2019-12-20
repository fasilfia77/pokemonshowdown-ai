import { expect } from "chai";
import "mocha";
import { FutureMove, futureMoves } from "../../../src/battle/dex/dex";
import { TeamStatus } from "../../../src/battle/state/TeamStatus";

describe("TeamStatus", function()
{
    let status: TeamStatus;

    beforeEach("Initialize TeamStatus", function()
    {
        status = new TeamStatus();
    });

    describe("#wish", function()
    {
        it("Should have silent=true", function()
        {
            expect(status.wish).to.have.property("silent", true);
        });
    });

    describe("#futureMoves", function()
    {
        for (const id of Object.keys(futureMoves) as FutureMove[])
        {
            describe(id, function()
            {
                it("Should have silent=true", function()
                {
                    expect(status.futureMoves[id])
                        .to.have.property("silent", true);
                });
            });
        }
    });

    describe("#postTurn()", function()
    {
        it("Should tick wish turns", function()
        {
            status.wish.start();
            expect(status.wish.turns).to.equal(1);
            status.postTurn();
            expect(status.wish.turns).to.equal(2);
            status.postTurn();
            expect(status.wish.turns).to.equal(0);
        });

        it("Should tick future move turns", function()
        {
            status.futureMoves.futuresight.start();
            expect(status.futureMoves.futuresight.turns).to.equal(1);
            status.postTurn();
            expect(status.futureMoves.futuresight.turns).to.equal(2);
            status.postTurn();
            expect(status.futureMoves.futuresight.turns).to.equal(3);
            status.postTurn();
            expect(status.futureMoves.futuresight.turns).to.equal(0);
        });

        for (const type of ["lightScreen", "reflect"] as const)
        {
            it("Should tick reflect/lightscreen turns", function()
            {
                status[type].start(/*source*/null);
                expect(status[type].turns).to.equal(0);

                status.postTurn();
                expect(status[type].turns).to.equal(1);
            });
        }

        for (const type of ["luckyChant", "tailwind"] as const)
        {
            it(`Should tick ${type} turns`, function()
            {
                status[type].start();
                expect(status[type].turns).to.equal(1);

                status.postTurn();
                expect(status[type].turns).to.equal(2);
            });
        }
    });
});
