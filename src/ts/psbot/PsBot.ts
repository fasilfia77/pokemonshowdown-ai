import {URL} from "url";
import {Protocol} from "@pkmn/protocol";
import fetch, {RequestInit} from "node-fetch";
import {client as WSClient} from "websocket";
import {HaltEvent, RoomEvent} from "../protocol/Event";
import {EventParser} from "../protocol/EventParser";
import {Logger} from "../utils/logging/Logger";
import * as handlers from "./handlers";

/** Options for login. */
export interface LoginOptions {
    /** Account username. */
    readonly username: string;
    /** Account password. */
    readonly password?: string;
    /** Server url used for login. */
    readonly loginUrl: string;
}

/**
 * Function type for sending responses to a server.
 *
 * @param responses Messages to send.
 * @returns False if the messages can't be sent, true otherwise.
 */
export type Sender = (...responses: string[]) => boolean;

/**
 * Creates a RoomHandler for a room that the PsBot has joined.
 *
 * @param room Room name.
 * @param username Username of the PsBot.
 * @param sender The function that will be used for sending responses.
 */
export type HandlerFactory = (
    room: string,
    username: string,
    sender: Sender,
) => handlers.RoomHandler | Promise<handlers.RoomHandler>;

/** Manages the connection to a PokemonShowdown server. */
export class PsBot {
    /** Websocket client. Used for connecting to the server. */
    private readonly client = new WSClient();
    /** Current active rooms. */
    private readonly rooms = new Map<Protocol.RoomID, handlers.RoomHandler>();
    /** Dictionary of accepted formats for battle challenges. */
    private readonly formats = new Map<string, HandlerFactory>();

    /** Whether we've already logged in. */
    private loggedIn = false;
    /** Username of the client. Initialized on login. */
    private username?: string;

    /** Sends a response to the server. */
    private sender: Sender = () => {
        throw new Error("Sender not initialized");
    };

    /** Promise that resolves once we've connected to the server. */
    private readonly connected: Promise<void>;
    /** Callback to resolve the {@link connected} Promise. */
    private connectedRes: (err?: Error) => void = () => {};

    /** Used for handling global PS events. */
    private readonly globalHandler = new handlers.global.GlobalHandler();
    /** Stream used for parsing PS protocol events. */
    private readonly parser = new EventParser(
        this.logger.addPrefix("EventParser: "),
    );

    /**
     * Creates a PsBot.
     *
     * @param logger Used to log debug info.
     */
    public constructor(private readonly logger: Logger) {
        this.connected = new Promise<void>(
            (res, rej) =>
                (this.connectedRes = err => {
                    this.connectedRes = () => {};
                    if (!err) {
                        res();
                    } else {
                        rej(err);
                    }
                }),
        );

        this.addHandler("" as Protocol.RoomID, this.globalHandler);
        this.initClient();
        this.globalHandler.updateUser = username => this.updateUser(username);
        this.globalHandler.respondToChallenge = (user, format) =>
            this.respondToChallenge(user, format);

        // Setup async event parser.
        // TODO: Tie this to a method that can be awaited after setting up the
        // PsBot.
        void this.parserReadLoop();
    }

    /**
     * Allows the PsBot to accept battle challenges for the given format.
     *
     * @param format Name of the format to use.
     * @param f Room handler factory function.
     */
    public acceptChallenges(format: string, f: HandlerFactory): void {
        this.formats.set(format, f);
        this.logger.info(`Registered format '${format}'`);
    }

    /**
     * Adds a handler for a room.
     *
     * @param roomid Room id.
     * @param handler Object that handles events coming from the given room.
     */
    public addHandler(
        roomid: Protocol.RoomID,
        handler: handlers.RoomHandler,
    ): void {
        if (this.rooms.has(roomid)) {
            throw new Error(`Already have a handler for room '${roomid}'`);
        }
        this.rooms.set(roomid, handler);
    }

    // TODO: Support reconnect/disconnect.
    /**
     * Connects to the server through websocket and starts handling messages.
     */
    public async connect(route: string): Promise<void> {
        this.client.connect(new URL("showdown/websocket", route).href);
        return await this.connected;
    }

    /**
     * Sets up this PsBot to login once connected.
     *
     * @param options Login options.
     * @returns A Promise that resolves once logged in.
     */
    public async login(options: LoginOptions): Promise<void> {
        if (this.loggedIn) {
            // TODO: Add logout functionality?
            this.logger.debug("Cannot login: Already logged in");
            return;
        }

        this.logger.info(`Logging in under username '${options.username}'`);

        const challstr = await this.globalHandler.challstr;

        const init: RequestInit = {
            method: "POST",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
        };

        // Get the assertion string used to confirm login.
        let assertion: string;

        const loginServer = new URL("~~showdown/action.php", options.loginUrl);

        if (!options.password) {
            // Login without password.
            init.body =
                `act=getassertion&userid=${options.username}` +
                `&challstr=${challstr}`;
            const result = await fetch(loginServer.href, init);
            assertion = await result.text();

            if (assertion.startsWith(";")) {
                // Login attempt was rejected.
                if (assertion.startsWith(";;")) {
                    // Error message was provided.
                    throw new Error(assertion.substring(2));
                }
                throw new Error(
                    `A password is required for user '${options.username}'`,
                );
            }
        } else {
            // Login with password.
            init.body =
                `act=login&name=${options.username}` +
                `&pass=${options.password}&challstr=${challstr}`;
            const result = await fetch(loginServer.href, init);
            const text = await result.text();
            // Response text returns "]" followed by json.
            const json = JSON.parse(text.substring(1)) as {
                assertion: string;
                actionsuccess: string;
            };

            ({assertion} = json);
            if (!json.actionsuccess) {
                // Login attempt was rejected.
                if (assertion.startsWith(";;")) {
                    // Error message was provided.
                    throw new Error(assertion.substring(2));
                }
                throw new Error("Invalid password");
            }
        }

        // Complete the login.
        this.loggedIn = this.addResponses(
            "",
            `|/trn ${options.username},0,${assertion}`,
        );
    }

    /** Sets avatar id. */
    public setAvatar(avatar: string): void {
        this.addResponses("", `|/avatar ${avatar}`);
    }

    private initClient(): void {
        this.client.on("connect", connection => {
            this.logger.debug("Connected");

            this.sender = (...responses: string[]) => {
                if (!connection.connected) {
                    return false;
                }
                for (const response of responses) {
                    connection.sendUTF(response);
                    this.logger.debug(`Sent: ${response}`);
                }
                return true;
            };

            connection.on("error", error =>
                this.logger.error(`Connection error: ${error.toString()}`),
            );
            connection.on("close", (code, reason) =>
                this.logger.debug(`Closing connection (${code}): ${reason}`),
            );
            connection.on("message", data => {
                if (data.type === "utf8" && data.utf8Data) {
                    this.parser.write(data.utf8Data);
                }
            });

            this.connectedRes();
        });
        this.client.on("connectFailed", err => {
            this.logger.error(`Failed to connect: ${err.stack ?? err}`);
            this.connectedRes(err);
        });
    }

    private updateUser(username: string): void {
        this.username = username;
    }

    private respondToChallenge(user: string, format: string): void {
        this.logger.info(`Received challenge from ${user}: ${format}`);
        if (this.formats.has(format)) {
            this.addResponses("", `|/accept ${user}`);
        } else {
            this.logger.info(`Format '${format}' is unknown`);
            this.logger.info(
                "Supported formats: " + [...this.formats.keys()].join(", "),
            );
            this.addResponses("", `|/reject ${user}`);
        }
    }

    /**
     * Sets up a read loop from the EventParser stream and dispatches parsed
     * events to their respective room handlers.
     */
    private async parserReadLoop(): Promise<void> {
        for await (const event of this.parser) {
            await this.dispatch(event as RoomEvent | HaltEvent);
        }
    }

    /** Handles parsed protocol events received from the PS serer. */
    private async dispatch({
        roomid,
        args,
        kwArgs,
    }: RoomEvent | HaltEvent): Promise<void> {
        if (args[0] === "deinit") {
            // The roomid defaults to lobby if the |deinit event didn't come
            // from a room.
            this.rooms.delete(roomid || ("lobby" as Protocol.RoomID));
            return;
        }

        let handler = this.rooms.get(roomid);
        if (!handler) {
            // First msg when joining a battle room must be an |init|battle
            // event.
            if (args[0] !== "init" || args[1] !== "battle") {
                this.logger.error(
                    `Could not join chat room '${roomid}': No handlers found`,
                );
                return;
            }

            // Battle room name format: battle-<format>-<id>
            const [, format] = roomid.split("-");
            const handlerFactory = this.formats.get(format);
            if (!handlerFactory) {
                this.logger.error(
                    `Could not join battle room '${roomid}': ` +
                        `Format '${format}' not supported`,
                );
                return;
            }

            if (!this.username) {
                this.logger.error(
                    `Could not join battle room '${roomid}': ` +
                        "Username not initialized",
                );
                return;
            }

            const sender: Sender = (...responses: string[]) =>
                this.addResponses(roomid, ...responses);

            handler = await handlerFactory(roomid, this.username, sender);
            this.addHandler(roomid, handler);
        }

        // Dispatch special "halt" event or regular event from EventParser.
        if (args[0] === "halt") {
            await handler.halt();
        } else {
            await handler.handle({args, kwArgs});
        }

        // Leave respectfully once the battle ends.
        // TODO: Move this to BattleHandler.
        if (args[0] === "tie" || args[0] === "win") {
            this.addResponses(roomid, "|gg", "|/leave");
        }
    }

    /**
     * Sends a list of responses to the server.
     *
     * @param room Room to send the response from. Can be empty if no room in
     * particular.
     * @param responses Responses to be sent to the server.
     * @returns False if the messages can't be sent, true otherwise.
     */
    private addResponses(room: string, ...responses: string[]): boolean {
        return this.sender(...responses.map(res => room + res));
    }
}
