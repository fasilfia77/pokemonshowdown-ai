import {join} from "path";
import ProgressBar from "progress";
import * as tmp from "tmp-promise";
import {ExperienceConfig, GameConfig, LearnConfig} from "../config/types";
import {Logger} from "../util/logging/Logger";
import {ModelWorker} from "./model/worker";
import {Opponent, playGames} from "./play";

/** Args for {@link episode}. */
export interface EpisodeArgs {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. */
    readonly step: number;
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
    /** ID of the model to train. */
    readonly model: number;
    /** Proportion of actions to take randomly during the rollout phase. */
    readonly exploration: number;
    /** Configuration for generating experience from rollout games. */
    readonly experienceConfig: ExperienceConfig;
    /** Opponent data for training the model. */
    readonly trainOpponents: readonly Opponent[];
    /** Opponent data for evaluating the model. */
    readonly evalOpponents: readonly Opponent[];
    /** Configuration for setting up rollout/eval games. */
    readonly gameConfig: GameConfig;
    /** Configuration for the learning process. */
    readonly learnConfig: LearnConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
}

interface EpisodeContext {
    readonly expFiles: tmp.FileResult[];
    cleanupPromise?: Promise<unknown>;
}

/** Runs a training episode. */
export async function episode(args: EpisodeArgs): Promise<void> {
    const context: EpisodeContext = {
        expFiles: [],
    };

    try {
        await episodeImpl(context, args);
    } finally {
        context.cleanupPromise ??= Promise.all(
            context.expFiles.map(async f => await f.cleanup()),
        );
        await context.cleanupPromise;
    }
}

async function episodeImpl(
    context: EpisodeContext,
    {
        name,
        step,
        models,
        model,
        exploration,
        experienceConfig,
        trainOpponents,
        evalOpponents,
        gameConfig,
        learnConfig,
        logger,
        logPath,
    }: EpisodeArgs,
): Promise<void> {
    // Play some games semi-randomly, building batches of Experience for each
    // game.
    const rolloutLog = logger.addPrefix("Rollout: ");
    rolloutLog.debug(
        "Collecting training data via policy rollout " +
            `(exploration factor = ${Math.round(exploration * 100)}%)`,
    );
    const numExamples = await playGames({
        models,
        agentConfig: {model, exploration, emitExperience: true},
        opponents: trainOpponents,
        gameConfig,
        logger: rolloutLog,
        ...(logPath && {logPath: join(logPath, "rollout")}),
        experienceConfig,
        async getExpPath(): Promise<string> {
            const expFile = await tmp.file({
                template: "psai-example-XXXXXX.tfrecord",
            });
            context.expFiles.push(expFile);
            return expFile.path;
        },
    });
    // Summary statement after rollout games.
    const numGames = trainOpponents.reduce((n, opp) => n + opp.numGames, 0);
    rolloutLog.debug(
        `Played ${numGames} games total, yielding ${numExamples} experiences ` +
            `(avg ${(numExamples / numGames).toFixed(2)} per game)`,
    );

    // Train over the experience gained from each game.
    const learnLog = logger.addPrefix("Learn: ");
    learnLog.debug("Training over experience");
    if (numExamples <= 0) {
        learnLog.error("No experience to train over");
        return;
    }

    let progress: ProgressBar | undefined;
    let numBatches: number | undefined;
    function startProgress() {
        if (!numBatches) {
            throw new Error("numBatches not initialized");
        }
        const prefixWidth =
            learnLog.prefix.length +
            "Batch /: ".length +
            2 * Math.ceil(Math.log10(numBatches));
        const postFixWidth = " loss=-0.00000000".length;
        const padding = 2;
        const barWidth =
            (process.stderr.columns || 80) -
            prefixWidth -
            postFixWidth -
            padding;
        progress = new ProgressBar(
            `${learnLog.prefix}Batch :current/:total: :bar loss=:loss`,
            {
                total: numBatches,
                head: ">",
                clear: true,
                width: barWidth,
            },
        );
        progress.render({loss: "n/a"});
    }
    await models.learn(
        model,
        {
            ...learnConfig,
            name,
            step,
            examplePaths: context.expFiles.map(f => f.path),
            numExamples,
        },
        function onStep(data) {
            switch (data.type) {
                case "start":
                    ({numBatches} = data);
                    startProgress();
                    break;

                case "epoch":
                    // Ending summary statement for the current epoch.
                    progress?.terminate();
                    learnLog.debug(
                        `Epoch ${data.epoch}/${learnConfig.epochs}: ` +
                            `Avg loss = ${data.loss}`,
                    );

                    // Restart progress bar for the next epoch.
                    if (data.epoch < learnConfig.epochs) {
                        startProgress();
                    }
                    break;
                case "batch":
                    progress?.tick({
                        batch: data.batch + 1,
                        loss: data.loss.toFixed(8),
                    });
                    break;
            }
        },
    );
    progress?.terminate();
    context.cleanupPromise = Promise.all(
        context.expFiles.map(async f => await f.cleanup()),
    );

    // Evaluation games.
    // TODO: Make a decision as to whether to accept the updated model based on
    // these results.
    const evalLog = logger.addPrefix("Eval: ");
    evalLog.debug("Evaluating new network against benchmarks");
    await playGames({
        models,
        agentConfig: {model},
        opponents: evalOpponents,
        gameConfig,
        logger: evalLog,
        ...(logPath && {logPath: join(logPath, "eval")}),
    });
}
