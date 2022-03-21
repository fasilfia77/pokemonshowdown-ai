/** @file Defines the protocol typings for GameWorkers. */
import {MessagePort} from "worker_threads";
import {PortMessageBase, PortResultBase} from "../../../port/PortProtocol";
import {WorkerProtocol} from "../../../port/WorkerProtocol";
import {SimResult} from "../../sim/playGame";
import {GamePoolAgentConfig, PlayArgs} from "../GamePool";

/** Typings for the `workerData` object given to the GameWorker. */
export interface GameWorkerData {
    /** Path to store experience files as tfrecords. */
    expPath?: string;
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
export interface GameAgentConfig extends Omit<GamePoolAgentConfig, "model"> {
    /** Port that uses the `ModelPort` protocol for interfacing with a model. */
    readonly port: MessagePort;
}

/** Types of messages that the GamePool can receive. */
export type GameResult = GameProtocol[GameRequestType]["result"];

/** Base interface for game worker message results. */
type GameResultBase<T extends GameRequestType> = PortResultBase<T>;

/** Result of a game after it has been completed and processed by the worker. */
export interface GamePlayResult
    extends GameResultBase<"play">,
        Omit<SimResult, "err"> {
    /** Number of TrainingExamples that were saved, if enabled. */
    numExamples?: number;
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: Buffer;
    /** @override */
    done: true;
}
