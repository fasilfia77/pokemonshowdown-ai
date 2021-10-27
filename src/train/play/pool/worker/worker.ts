import * as fs from "fs";
import * as stream from "stream";
import {serialize} from "v8";
import {parentPort, workerData} from "worker_threads";
import {ModelPort} from "../../../model/worker";
import {RawPortResultError} from "../../../port/PortProtocol";
import {WorkerClosed} from "../../../port/WorkerProtocol";
import {AExpEncoder} from "../../../tfrecord/encoder";
import {AugmentedExperience} from "../../experience/AugmentedExperience";
import {playGame, SimArgsAgent} from "../../sim/playGame";
import {
    GameWorkerData,
    GameMessage,
    GamePlay,
    GamePlayResult,
} from "./GameProtocol";

if (!parentPort) throw new Error("No parent port!");

// Setup input stream.

const inputStream = new stream.Readable({objectMode: true, read() {}});

// Setup game stream.

async function processMessage(msg: GamePlay): Promise<AugmentedExperience[]> {
    const modelPorts: ModelPort[] = [];

    // Should never throw since playGame wraps any caught errors, but just in
    // case it does, the caller should be able to handle it.
    try {
        const agents = msg.agents.map<SimArgsAgent>(config => {
            const modelPort = new ModelPort(config.port, msg.format);
            modelPorts.push(modelPort);
            return {agent: modelPort.getAgent("stochastic"), exp: config.exp};
        }) as [SimArgsAgent, SimArgsAgent];

        // Simulate the game.
        const gameResult = await playGame(
            msg.format,
            {agents, maxTurns: msg.maxTurns, logPath: msg.logPath},
            msg.rollout,
        );

        // Send the result back to the main thread.
        const result: GamePlayResult = {
            type: "play",
            rid: msg.rid,
            done: true,
            numAExps: gameResult.experiences.length,
            winner: gameResult.winner,
            ...(gameResult.err && {err: serialize(gameResult.err)}),
        };
        // Make sure the appropriate data is moved, not copied.
        parentPort!.postMessage(
            result,
            result.err ? [result.err.buffer] : undefined,
        );

        return gameResult.experiences;
    } finally {
        // Make sure all ports are closed at the end.
        await Promise.all(modelPorts.map(p => p.close()));
    }
}

let lastGamePromise = Promise.resolve();
const gameStream = new stream.Transform({
    objectMode: true,
    readableHighWaterMark: 64,
    transform(
        msg: GamePlay,
        encoding: BufferEncoding,
        callback: stream.TransformCallback,
    ): void {
        // Use promises to force sequential.
        const p = lastGamePromise;
        lastGamePromise = (async () => {
            await p;
            let aexps: AugmentedExperience[];
            try {
                aexps = await processMessage(msg);
            } catch (e) {
                // Transport error object to main thread for logging.
                const result: RawPortResultError = {
                    type: "error",
                    rid: msg.rid,
                    done: true,
                    err: serialize(e),
                };
                parentPort!.postMessage(result, [result.err.buffer]);
                aexps = [];
            }
            for (const aexp of aexps) this.push(aexp);
            callback();
        })();
    },
});

// Setup experience stream if configured for it.

let expStream: [stream.Transform, stream.Writable] | [] = [];
const {expPath} = workerData as GameWorkerData;
if (expPath) {
    expStream = [
        new AExpEncoder(),
        // Use append option to keep from overwriting any previous tfrecords
        // TODO: If an errored worker gets replaced, what can guarantee that the
        // tfrecord file is still valid?
        fs.createWriteStream(expPath, {encoding: "binary", flags: "a"}),
    ];
}

// Setup pipeline.
// Any errors that escape from the pipeline are propagated through the worker.
// Generally the AsyncPort that wraps this Worker should be able to handle any
// unresolved requests.
let pipelinePromise = stream.promises.pipeline(
    inputStream,
    gameStream,
    ...expStream,
);

parentPort.on("message", function handleMessage(msg: GameMessage) {
    switch (msg.type) {
        case "play":
            inputStream.push(msg);
            break;
        case "close":
            pipelinePromise = pipelinePromise.finally(() => {
                // Indicate done.
                const response: WorkerClosed = {
                    type: "close",
                    rid: msg.rid,
                    done: true,
                };
                parentPort!.postMessage(response);
            });
            // Signal end of stream.
            inputStream.push(null);
            break;
    }
});