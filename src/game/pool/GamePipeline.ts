import {join} from "path";
import {pipeline} from "stream/promises";
import {MessagePort} from "worker_threads";
import type * as tf from "@tensorflow/tfjs";
import {
    GamePoolConfig,
    ExperienceConfig,
    BatchPredictConfig,
} from "../../config/types";
import {generatePsPrngSeed, rng, Rng, Seeder} from "../../util/random";
import {Experience} from "../experience";
import {GamePool, GamePoolArgs, GamePoolResult} from "./GamePool";
import {GamePoolStream} from "./GamePoolStream";
import {GameAgentConfig} from "./worker";

/** Options for generating game configs. */
export interface GameArgsGenOptions {
    /** Config for the agent. */
    readonly agentConfig: GameAgentConfig;
    /** Config for the opponent agent. */
    readonly opponent: GameAgentConfig;
    /** Number of games to play. Omit to play indefinitely. */
    readonly numGames?: number;
    /** Path to the folder to store game logs in. Omit to not store logs. */
    readonly logPath?: string;
    /**
     * Exponentially reduces the amount of games that get to keep logs on disk.
     * Note that if a game encounters an error then it will always log to disk.
     */
    readonly reduceLogs?: boolean;
    /**
     * Configuration to process any Experiences that get generated by agents. If
     * omitted, experience is discarded.
     */
    readonly experienceConfig?: ExperienceConfig;
    /** Random seed generators. */
    readonly seeders?: GameArgsGenSeeders;
}

/** Random number generators used by the game and policy. */
export interface GameArgsGenSeeders {
    /** Random seed generator for the battle PRNGs. */
    readonly battle?: Seeder;
    /** Random seed generator for the random team PRNGs. */
    readonly team?: Seeder;
    /** Random seed generator for the random exploration policy. */
    readonly explore?: Seeder;
}

/** Wraps {@link GamePoolStream} into a pipeline promise. */
export class GamePipeline {
    /** Manages game threads. */
    private readonly pool: GamePool;

    /**
     * Creates a GamePipeline.
     *
     * @param name Name prefix for threads.
     * @param config Thread pool config.
     */
    public constructor(name: string, config: GamePoolConfig) {
        this.pool = new GamePool(name, config);
    }

    /**
     * Waits for in-progress games to complete then closes game threads. Calls
     * to {@link run} that are currently running may never resolve.
     */
    public async close(): Promise<void> {
        return await this.pool.close();
    }

    /**
     * Terminates in-progress games and closes the thread pool. Calls to
     * {@link run} that are currently running may never resolve.
     */
    public async terminate(): Promise<void> {
        return await this.pool.terminate();
    }

    /**
     * Makes each game thread register a unique port for requesting inferences
     * during games.
     *
     * @param name Name under which to refer to the port during calls to
     * {@link add}.
     * @param modelPort Function to create a unique message port that will be
     * held by one of the game pool workers. Must implement the ModelPort
     * protocol.
     */
    public async registerModelPort(
        name: string,
        modelPort: () => MessagePort | Promise<MessagePort>,
    ): Promise<void> {
        return await this.pool.registerModelPort(name, modelPort);
    }

    /**
     * Makes each game thread load a serialized TensorFlow model for making
     * inferences during games.
     *
     * @param name Name under which to refer to the model during games.
     * @param artifact Serialized TensorFlow model artifacts.
     * @param config Batch predict config for the model on each thread.
     */
    public async loadModel(
        name: string,
        artifact: tf.io.ModelArtifacts,
        config: BatchPredictConfig,
    ): Promise<void> {
        return await this.pool.loadModel(name, artifact, config);
    }

    /** Reloads a model from {@link loadModel} using only encoded weights. */
    public async reloadModel(
        name: string,
        data: ArrayBufferLike,
    ): Promise<void> {
        return await this.pool.reloadModel(name, data);
    }

    /**
     * Starts the game pipeline. Can be called multiple times.
     *
     * @param genArgs Generator for game configs.
     * @param callback Called for each game result, which may be out of order
     * due to thread pool scheduling.
     */
    public async run(
        genArgs: Generator<GamePoolArgs>,
        callback?: (result: GamePoolResult) => void | Promise<void>,
    ): Promise<void> {
        await pipeline(
            genArgs,
            new GamePoolStream(this.pool),
            async function handleResults(
                results: AsyncIterable<GamePoolResult>,
            ): Promise<void> {
                for await (const result of results) {
                    await callback?.(result);
                }
            },
        );
    }

    /**
     * Collects generated experience from game workers if any games and agents
     * were configured for it. Should be called frequently since workers can
     * buffer or block otherwise.
     */
    public async *collectExperience(): AsyncGenerator<Experience> {
        yield* this.pool.collectExperience();
    }

    /** Generates game configs to feed into a game thread pool. */
    public static *genArgs({
        agentConfig,
        opponent,
        numGames,
        logPath,
        reduceLogs,
        experienceConfig,
        seeders,
    }: GameArgsGenOptions): Generator<GamePoolArgs> {
        const battleRandom = seeders?.battle && rng(seeders.battle());
        const teamRandom = seeders?.team && rng(seeders.team());
        for (let id = 1; !numGames || id <= numGames; ++id) {
            yield {
                id,
                agents: [
                    GamePipeline.buildAgent(
                        agentConfig,
                        seeders?.explore,
                        teamRandom,
                    ),
                    GamePipeline.buildAgent(
                        opponent,
                        seeders?.explore,
                        teamRandom,
                    ),
                ],
                play: {
                    ...(logPath !== undefined && {
                        logPath: join(logPath, `game-${id}-${opponent.name}`),
                    }),
                    ...(reduceLogs &&
                        Math.log10(id) % 1 !== 0 && {onlyLogOnError: true}),
                    seed: generatePsPrngSeed(battleRandom),
                    ...(experienceConfig && {experienceConfig}),
                },
            };
        }
    }

    /** Fills in random seeds for agent configs. */
    private static buildAgent(
        config: GameAgentConfig,
        exploreSeedRandom?: Seeder,
        teamRandom?: Rng,
    ): GameAgentConfig {
        return {
            ...config,
            exploit:
                config.exploit.type === "random" && exploreSeedRandom
                    ? {...config.exploit, seed: exploreSeedRandom()}
                    : config.exploit,
            ...(config.explore &&
                exploreSeedRandom && {
                    explore: {...config.explore, seed: exploreSeedRandom()},
                }),
            seed: generatePsPrngSeed(teamRandom),
        };
    }
}
