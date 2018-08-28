import * as readline from "readline";
import * as logger from "../logger";
import { otherId, PlayerID, PokemonDetails, PokemonID, PokemonStatus } from
    "../parser/MessageData";
import { AnyMessageListener } from "../parser/MessageListener";
import { BattleState, Side } from "../state/BattleState";

const rl = readline.createInterface(process.stdin, process.stdout);

/**
 * Controls the AI's actions during a battle.
 *
 * Info that the AI needs to make an informed decision:
 * * Known aspects of the opponent's team.
 * * All aspects of the AI's team.
 */
export class BattleAI
{
    /** Manages battle state and neural network input. */
    private readonly state = new BattleState();
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides: {[ID in PlayerID]: Side};
    /** Used to send response messages to the server. */
    private readonly addResponses: (...responses: string[]) => void;

    /**
     * Creates a BattleAI object.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param addResponses Used to send response messages to the server.
     */
    constructor(username: string, listener: AnyMessageListener,
        addResponses: (...respones: string[]) => void)
    {
        this.addResponses = addResponses;
        listener
        .on("error", (reason: string) =>
        {
            logger.error(reason);
            this.ask();
        })
        .on("player", (id: PlayerID, givenUser: string) =>
        {
            if (givenUser !== username)
            {
                // them
                this.sides = {} as any;
                this.sides[id] = "them";
                this.sides[otherId(id)] = "us";
            }
        })
        .on("request", (team: object) =>
        {
            // fill in team info (how exactly?)
        })
        .on("switch", (id: PokemonID, details: PokemonDetails,
            status: PokemonStatus) =>
        {
            // switch out active pokemon and what we know about them (how?)
        })
        .on("teamsize", (id: PlayerID, size: number) =>
        {
            // TODO: initialize this.sides
            this.state.setTeamSize(this.sides[id], size);
        })
        .on("turn", (turn: number) =>
        {
            logger.debug(`new turn: ${turn}`);
            this.ask();
        });
    }

    /** Asks for and sends user input to the server once it's received. */
    private ask(): void
    {
        rl.question("ai> ", answer =>
        {
            if (answer)
            {
                logger.debug("received ai input");
                this.addResponses(answer);
            }
            else
            {
                logger.error("no ai input");
            }
        });
    }
}
