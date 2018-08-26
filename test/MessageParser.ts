import { expect } from "chai";
import { ChallengesFrom, PokemonStatus, PokemonID, PokemonDetails, RoomType,
    PlayerID } from "../src/parser/MessageData";
import { MessageParser } from "../src/parser/MessageParser";
import "mocha";

describe("MessageParser", function()
{
    let parser: MessageParser;

    beforeEach("Initialize MessageParser", function()
    {
        parser = new MessageParser();
    });

    it("Should handle multiple messages", function()
    {
        let count = 2;
        parser.on("", "init", () =>
        {
            --count;
        })
        .parse("|init|chat\n|init|chat");
        expect(count).to.equal(0);
    });

    describe("Room name", function()
    {
        const room = "myroomname"

        it("Should handle empty string", function()
        {
            parser.parse("");
            expect(parser.room).to.equal("");
        });

        it("Should parse room name without messages", function()
        {
            parser.parse(`>${room}`);
            expect(parser.room).to.equal(room);
        });

        it("Should parse room name with messages", function()
        {
            parser.parse(`>${room}\n|init|battle`);
            expect(parser.room).to.equal(room);
        });

        it("Should handle unfamiliar rooms", function(done)
        {
            parser.on(null, "init", () =>
            {
                done();
            })
            .parse(">some-random-room\n|init|chat");
        });
    });

    describe("Message types", function()
    {
        describe("challstr", function()
        {
            it("Should parse challstr", function(done)
            {
                // not an actual challstr
                const givenChallstr = "4|12352361236737sdagwflk";
                parser.on("", "challstr", (challstr: string) =>
                {
                    expect(challstr).to.equal(givenChallstr);
                    done();
                })
                .parse(`|challstr|${givenChallstr}`);
            });
        });

        describe("error", function()
        {
            it("Should parse error", function(done)
            {
                const givenReason = "because i said so";
                parser.on("", "error", (reason: string) =>
                {
                    expect(reason).to.equal(givenReason);
                    done();
                })
                .parse(`|error|${givenReason}`);
            });
        });

        describe("init", function()
        {
            const initTypes: RoomType[] = ["chat", "battle"];
            for (const initType of initTypes)
            {
                it(`Should handle ${initType} init message`, function(done)
                {
                    parser.on("", "init", (type: RoomType) =>
                    {
                        expect(type).to.equal(initType);
                        done();
                    })
                    .parse(`|init|${initType}`);
                });
            };
        });


        describe("request", function()
        {
            it("Should not parse empty request", function()
            {
                parser.on("", "request", () =>
                {
                    throw new Error("Parsed empty request");
                })
                .parse("|request|");
            });

            it("Should parse request", function(done)
            {
                const givenTeam: object = {}; // TODO
                parser.on("", "request", (team: object) =>
                {
                    expect(team).to.deep.equal(givenTeam);
                    done();
                })
                .parse(`|request|${JSON.stringify(givenTeam)}`);
            });
        });

        describe("switch", function()
        {
            // message can be switch or drag, depending on whether the switch
            //  was intentional or unintentional
            const prefixes = ["switch", "drag"];
            // expected value when the corresponding switchInfo is parsed
            const givenInfos =
            [
                [
                    {owner: "p1", position: "a", nickname: "Lucky"},
                    {species: "Magikarp", shiny: true, gender: "M", level: 100},
                    {hp: 65, hpMax: 200, condition: "par"},
                ],
                [
                    {owner: "p2", position: "b", nickname: "Rage"},
                    {species: "Gyarados", shiny: false, gender: "F", level: 50},
                    {hp: 1, hpMax: 1, condition: ""}
                ],
                [
                    {owner: "p1", position: "c", nickname: "Mew2"},
                    {species: "Mewtwo", shiny: false, gender: null, level: 100},
                    {hp: 100, hpMax: 100, condition: "slp"}
                ]
            ];
            // contains the indexes of each switch parameter
            const infoNames: {[infoName: string]: number} =
                { id: 0, details: 1, status: 2 };
            // unparsed givenInfos
            let switchInfos: string[][];

            beforeEach(function()
            {
                // these values can be sabotaged in some later test cases to
                //  observe how the parser handles it
                switchInfos =
                [
                    ["p1a: Lucky", "Magikarp, shiny, M", "65/200 par"],
                    ["p2b: Rage", "Gyarados, F, L50", "1/1"],
                    ["p1c: Mew2", "Mewtwo", "100/100 slp"]
                ];
            });

            for (const prefix of prefixes)
            {
                // try parsing with each set of switch info
                for (let i = 0; i < givenInfos.length; ++i)
                {
                    it(`Should parse ${prefix} with valid info ${i + 1}`,
                    function(done)
                    {
                        parser.on("", "switch", (id: PokemonID,
                            details: PokemonDetails, status: PokemonStatus) =>
                        {
                            // match each id/details/status object
                            const info = [id, details, status];
                            for (let j = 0; j < givenInfos[i].length; ++j)
                            {
                                expect(info[j]).to.deep.equal(givenInfos[i][j]);
                            }
                            done();
                        })
                        .parse(`|switch|${switchInfos[i].join("|")}`);
                    });
                }

                // only need to test sabotage values for one set
                for (const infoName in infoNames)
                {
                    it(`Should not parse ${prefix} with invalid ${infoName}`,
                    function()
                    {
                        // if any one of PokemonID, PokemonDetails, or
                        //  PokemonStatus are omitted or invalid, the entire
                        //  message can't be parsed
                        switchInfos[0][infoNames[infoName]] = "";

                        parser.on("", "switch", () =>
                        {
                            throw new Error(`Parsed with invalid ${infoName}`);
                        })
                        .parse(`|switch|${switchInfos[0].join("|")}`);
                    });
                }
            }
        });

        describe("teamsize", function()
        {
            const givenIds = ["p1", "p2"];
            const givenSize = 1;
            for (let i = 0; i < givenIds.length; ++i)
            {
                it(`Should parse teamsize ${givenIds[i]}`, function(done)
                {
                    parser.on("", "teamsize", (id: PlayerID, size: number) =>
                    {
                        expect(id).to.equal(givenIds[i]);
                        expect(size).to.equal(givenSize);
                        done();
                    })
                    .parse(`|teamsize|${givenIds[i]}|${givenSize}`);
                });
            }

            it("Should not parse empty player", function()
            {
                parser.on("", "teamsize", (id: PlayerID, size: number) =>
                {
                    throw new Error("Parsed with empty player");
                })
                .parse(`|teamsize||${givenSize}`);
            });

            it("Should not parse empty size", function()
            {
                parser.on("", "teamsize", (id: PlayerID, size: number) =>
                {
                    throw new Error("Parsed with empty size");
                })
                .parse(`|teamsize|${givenIds[0]}|`);
            });
        });

        describe("turn", function()
        {
            it("Should parse turn", function(done)
            {
                const givenTurn = 1;
                parser.on("", "turn", (turn: number) =>
                {
                    expect(turn).to.equal(givenTurn);
                    done();
                })
                .parse(`|turn|${givenTurn}`);
            });
        });

        describe("updatechallenges", function()
        {
            it("Should parse updatechallenges", function(done)
            {
                const givenChallengesFrom: ChallengesFrom =
                    { somebody: "gen4ou" };
                parser.on("", "updatechallenges",
                    (challengesFrom: ChallengesFrom) =>
                {
                    expect(challengesFrom).to.deep.equal(givenChallengesFrom);
                    done();
                })
                .parse(`|updatechallenges|{"challengesFrom":\
${JSON.stringify(givenChallengesFrom)}}`);
            });
        });

        describe("updateuser", function()
        {
            it("Should parse updateuser", function(done)
            {
                const givenUsername = "somebody";
                const guest = 0;
                const avatarId = 21;
                parser.on("", "updateuser",
                    (username: string, isGuest: boolean) =>
                {
                    expect(username).to.equal(givenUsername);
                    expect(isGuest).to.equal(!guest);
                    done();
                })
                .parse(`|updateuser|${givenUsername}|${guest}|${avatarId}`);
            });

            for (const msg of ["updateuser", "updateuser|user"])
            {
                it(`Should not parse empty ${msg}`, function()
                {
                    parser.on("", "updateuser", () =>
                    {
                        throw new Error("Parsed empty updateuser");
                    })
                    .parse(`|${msg}`);
                });
            }
        });
    });
});
