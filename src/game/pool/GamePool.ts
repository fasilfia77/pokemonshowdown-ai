import {resolve} from "path";
import {MessagePort} from "worker_threads";
import {PRNGSeed} from "@pkmn/sim";
import {ExperienceConfig, GamePoolConfig} from "../../config/types";
import {ThreadPool} from "../../util/pool/ThreadPool";
import {SimResult} from "../sim/playGame";
import {
    GameAgentConfig,
    GameProtocol,
    GameWorkerData,
    GameWorker,
} from "./worker";

/** Args for {@link GamePool.add}. */
export interface GamePoolArgs {
    /** Unique identifier for logging. */
    readonly id: number;
    /** Config for the models that will play against each other. */
    readonly agents: readonly [GamePoolAgentConfig, GamePoolAgentConfig];
    /** Used to request model ports for the game workers. */
    readonly requestModelPort: (
        name: string,
    ) => MessagePort | Promise<MessagePort>;
    /** Args for starting the game. */
    readonly play: PlayArgs;
}

/** Config for {@link GamePool.add} agents. */
export type GamePoolAgentConfig = GameAgentConfig<false /*TWithModelPort*/>;

/** Args for starting a game. */
export interface PlayArgs {
    /**
     * Path to the file to store game logs in. If not specified, and the
     * simulator encounters an error, then the logs will be stored in a temp
     * file.
     */
    readonly logPath?: string;
    /**
     * If true, logs should only be written to disk (either to {@link logPath}
     * or a tmp file) if an error is encountered, and discarded if no error.
     */
    readonly onlyLogOnError?: true;
    /** Seed for the battle PRNG. */
    readonly seed?: PRNGSeed;
    /**
     * Configuration to process any Experiences that get generated by agents. If
     * omitted, experience is discarded.
     */
    readonly experienceConfig?: ExperienceConfig;
    /** Path to store Experiences for this game, or discard if omitted. */
    readonly expPath?: string;
}

/** {@link GamePool} stream output type. */
export interface GamePoolResult extends SimResult {
    /** Unique identifier for logging. */
    readonly id: number;
}

/** Path to the GameWorker script. */
const workerScriptPath = resolve(__dirname, "worker", "worker.js");

/** Uses a thread pool to dispatch parallel games. */
export class GamePool {
    /** Number of threads in the thread pool. */
    public get numThreads(): number {
        return this.pool.numThreads;
    }

    /** Wrapped thread pool for managing game workers. */
    private readonly pool: ThreadPool<
        GameWorker,
        GameProtocol,
        keyof GameProtocol,
        GameWorkerData
    >;

    /**
     * Creates a GamePool.
     *
     * @param name Name prefix for threads.
     * @param config Config for creating the thread pool.
     */
    public constructor(name: string, config: GamePoolConfig) {
        this.pool = new ThreadPool(
            config.numThreads,
            workerScriptPath,
            GameWorker,
            i => ({
                name: `${name}-${i}`,
                ...(config.maxTurns && {maxTurns: config.maxTurns}),
            }) /*workerData*/,
            config.resourceLimits,
        );
    }

    /**
     * Queues a game to be played.
     *
     * @param args Game args.
     * @param callback Called when a worker has been assigned to the game.
     * @param experienceCallback Callback to handle generated Experience objects
     * if the game is configured for it.
     * @returns A Promise to get the results of the game. Also wraps and returns
     * any errors.
     */
    public async add(
        args: GamePoolArgs,
        callback?: () => void,
    ): Promise<GamePoolResult> {
        // Grab a free worker.
        const port = await this.pool.takePort();
        try {
            callback?.();
            return await port.playGame(args);
        } catch (e) {
            return {
                id: args.id,
                agents: [args.agents[0].name, args.agents[1].name],
                err: e as Error,
            };
        } finally {
            this.pool.givePort(port);
        }
    }

    /** Waits for in-progress games to complete then closes the thread pool. */
    public async close(): Promise<void> {
        return await this.pool.close();
    }

    /** Terminates in-progress games and closes the thread pool. */
    public async terminate(): Promise<void> {
        return await this.pool.terminate();
    }
}
