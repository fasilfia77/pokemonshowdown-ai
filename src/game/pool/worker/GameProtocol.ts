/** @file Defines the protocol typings for GameWorkers. */
import {MessagePort} from "worker_threads";
import {PRNGSeed} from "@pkmn/sim";
import {PortMessageBase, PortResultBase} from "../../../util/port/PortProtocol";
import {WorkerProtocol} from "../../../util/worker/WorkerProtocol";
import {SimResult} from "../../sim/playGame";
import {PlayArgs} from "../GamePool";

/** Typings for the `workerData` object given to the game worker. */
export interface GameWorkerData {
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns?: number;
}

/** GameWorker request protocol typings. */
export interface GameProtocol extends WorkerProtocol<"play"> {
    play: {message: GamePlay; result: GamePlayResult};
}

/** The types of requests that can be made to the game worker. */
export type GameRequestType = keyof GameProtocol;

/** Types of messages that the GamePool can send. */
export type GameMessage = GameProtocol[GameRequestType]["message"];

/** Base interface for game worker messages. */
type GameMessageBase<T extends GameRequestType> = PortMessageBase<T>;

/** Game request message format. */
export interface GamePlay extends GameMessageBase<"play"> {
    /** Model ports that will play against each other. */
    readonly agents: [GameAgentConfig, GameAgentConfig];
    /** Args for starting the game. */
    readonly play: PlayArgs;
}

/** Config for game worker agents. */
export interface GameAgentConfig<TWithModelPort extends boolean = true> {
    /** Name of agent. Must be different from opponent(s). */
    readonly name: string;
    /** Exploitation policy. */
    readonly exploit: AgentExploitConfig<TWithModelPort>;
    /** Exploration policy. */
    readonly explore?: AgentExploreConfig;
    /** Whether to emit Experience objs after each decision. */
    readonly emitExperience?: true;
    /** Seed used to generate the random team. */
    readonly seed?: PRNGSeed;
}

interface AgentExploitConfigBase<T extends string> {
    readonly type: T;
}

/** Exploit using a neural network model. */
export type ModelAgentExploitConfig<TWithModelPort extends boolean = true> =
    AgentExploitConfigBase<"model"> &
        (TWithModelPort extends true
            ? {
                  /**
                   * Port that uses the `ModelPort` protocol for interfacing
                   * with a model.
                   */
                  readonly port: MessagePort;
              }
            : // Used in top-level before assigning a unique port for the game.
              {
                  /** Model name from the {@link ModelWorker}. */
                  readonly model: string;
              });

/** Exploit using a random agent. */
export interface RandomAgentExploitConfig
    extends AgentExploitConfigBase<"random"> {
    /** Seed for choosing random actions. */
    readonly seed?: string;
    /** Whether to prefer moves in random actions. */
    readonly moveOnly?: true;
}

/** Config describing how the agent should behave when exploiting reward. */
export type AgentExploitConfig<TWithModelPort extends boolean = true> =
    | ModelAgentExploitConfig<TWithModelPort>
    | RandomAgentExploitConfig;

/** Config for agent exploration. */
export interface AgentExploreConfig {
    /**
     * Exploration factor. Proportion of actions to take randomly rather than
     * consulting the model.
     */
    readonly factor: number;
    /** Seed for the random number generator. */
    readonly seed?: string;
}

/** Types of messages that the GamePool can receive. */
export type GameResult = GameProtocol[GameRequestType]["result"];

/** Base interface for game worker message results. */
type GameResultBase<T extends GameRequestType> = PortResultBase<T>;

/** Result of a game after it has been completed and processed by the worker. */
export interface GamePlayResult
    extends GameResultBase<"play">,
        Omit<SimResult, "err"> {
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: Buffer;
    /** @override */
    done: true;
}
