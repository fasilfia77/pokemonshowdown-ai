import * as tf from "@tensorflow/tfjs";
import {ExperienceConfig, LearnConfig, OptimizerConfig} from "../config/types";
import {BatchTensorExperience} from "../game/experience/tensor";
import * as rewards from "../game/rewards";
import {createSupport, ModelMetadata, verifyModel} from "../model/model";
import {Metrics} from "../model/worker/Metrics";
import {intToChoice} from "../psbot/handlers/battle/agent";

/**
 * Encapsulates the learning step of training, where the model is updated based
 * on experience generated by rollout games.
 */
export class Learn {
    /** Metrics logger. */
    private readonly metrics = Metrics.get(`${this.name}/learn`);
    /** Used for calculating gradients. */
    private readonly optimizer = Learn.getOptimizer(this.config.optimizer);
    /** Collection of trainable variables in the model. */
    private readonly variables = this.model.trainableWeights.map(
        w => w.read() as tf.Variable,
    );
    /** Used for logging inputs during loss calcs. */
    private readonly hookLayers = this.model.layers.filter(l =>
        ["Dense", "SetAttention", "PoolingAttention"].includes(
            l.getClassName(),
        ),
    );

    /** Exponential decay scale for TD target. */
    private readonly tdScale = tf.scalar(
        this.expConfig.rewardDecay ** this.expConfig.steps,
        "float32",
    );

    /**
     * Support of the Q value distribution. Used for distributional RL if
     * configured.
     */
    private readonly support?: tf.Tensor;
    /** Support distribution with reward decay applied. Shape `[1, atoms]`. */
    private readonly scaledSupport?: tf.Tensor;
    /** Difference between each atom within the support. */
    private readonly atomDiff?: tf.Scalar;
    /**
     * Indices within the batch dimension. Used for batch projections of TD
     * target distribution. Shape `[batch, atoms, 1]`.
     */
    private readonly batchIndices?: tf.Tensor;

    /**
     * Creates a Learn object.
     *
     * @param name Name of the training run for logging.
     * @param model Model to train.
     * @param targetModel Model for computing TD targets. Can be set to the same
     * model to disable target model mechanism.
     * @param config Learning config.
     * @param expConfig Experience config for computing TD targets.
     */
    public constructor(
        public readonly name: string,
        private readonly model: tf.LayersModel,
        private readonly targetModel: tf.LayersModel,
        private readonly config: LearnConfig,
        private readonly expConfig: ExperienceConfig,
    ) {
        verifyModel(model);

        const metadata = model.getUserDefinedMetadata() as
            | ModelMetadata
            | undefined;
        if (metadata?.config?.dist) {
            this.support = createSupport(metadata.config.dist).reshape([
                1,
                metadata.config.dist,
            ]);
            this.scaledSupport = tf.mul(this.support, this.tdScale);
            this.atomDiff = tf.scalar(
                (rewards.max - rewards.min) / (metadata.config.dist - 1),
                "float32",
            );
            this.batchIndices = tf
                .range(0, this.config.batchSize, 1, "int32")
                .expandDims(-1)
                .broadcastTo([this.config.batchSize, metadata.config.dist])
                .expandDims(-1);
        }

        // Log initial weights.
        for (const weights of this.variables) {
            if (weights.size === 1) {
                const weightScalar = weights.asScalar();
                this.metrics?.scalar(
                    `${weights.name}/weights`,
                    weightScalar,
                    0,
                );
                tf.dispose(weightScalar);
            } else {
                this.metrics?.histogram(`${weights.name}/weights`, weights, 0);
            }
        }
    }

    /** Creates the neural network optimizer from config. */
    private static getOptimizer(config: OptimizerConfig): tf.Optimizer {
        switch (config.type) {
            case "sgd":
                return tf.train.sgd(config.learningRate);
            case "rmsprop":
                return tf.train.rmsprop(
                    config.learningRate,
                    config.decay,
                    config.momentum,
                );
            case "adam":
                return tf.train.adam(
                    config.learningRate,
                    config.beta1,
                    config.beta2,
                );
            default: {
                const unsupported: never = config;
                throw new Error(
                    "Unsupported data type " +
                        `'${(unsupported as {type: string}).type}'`,
                );
            }
        }
    }

    /**
     * Performs a single batch update step.
     *
     * @param step Step number for logging.
     * @param batch Batch to train on.
     * @returns The loss for this batch.
     */
    public step(step: number, batch: BatchTensorExperience): tf.Scalar {
        return tf.tidy(() => {
            const storeMetrics = step % this.config.metricsInterval === 0;

            const preStep = storeMetrics ? process.hrtime.bigint() : undefined;

            const target = this.calculateTarget(
                batch.reward,
                batch.nextState,
                batch.choices,
                batch.done,
            );

            const hookedInputs: {[name: string]: tf.Tensor[]} = {};
            if (storeMetrics) {
                for (const layer of this.hookLayers) {
                    layer.setCallHook(inputs => {
                        if (!Array.isArray(inputs)) {
                            inputs = [inputs];
                        }
                        for (let i = 0; i < inputs.length; ++i) {
                            // Only take one example out of the batch to prevent
                            // excessive memory usage.
                            const input = tf.keep(tf.slice(inputs[i], 0, 1));
                            let name = `${layer.name}/input`;
                            if (inputs.length > 1) {
                                name += `/${i}`;
                            }
                            (hookedInputs[name] ??= []).push(input);
                        }
                    });
                }
            }

            const {value: loss, grads} = this.optimizer.computeGradients(
                () => this.loss(batch.state, batch.action, target),
                this.variables,
            );
            this.optimizer.applyGradients(grads);

            if (storeMetrics) {
                const postStep = process.hrtime.bigint();
                const updateMs = Number((postStep - preStep!) / 1_000_000n);
                this.metrics?.scalar("update_ms", updateMs, step);
                this.metrics?.scalar(
                    "update_throughput_s",
                    this.config.batchSize /
                        (updateMs / 1e3) /*experiences per sec*/,
                    step,
                );

                this.metrics?.scalar("loss", loss, step);

                this.metrics?.histogram("target", target, step);
                target.dispose();

                for (const name in grads) {
                    if (Object.prototype.hasOwnProperty.call(grads, name)) {
                        const grad = grads[name];
                        if (grad.size === 1) {
                            this.metrics?.scalar(
                                `${name}/grads`,
                                grad.asScalar(),
                                step,
                            );
                        } else {
                            this.metrics?.histogram(
                                `${name}/grads`,
                                grad,
                                step,
                            );
                        }
                        grad.dispose();
                    }
                }

                for (const name in hookedInputs) {
                    if (
                        Object.prototype.hasOwnProperty.call(hookedInputs, name)
                    ) {
                        const inputs = hookedInputs[name];
                        const t = tf.tidy(() =>
                            tf.concat1d(inputs.map(i => i.flatten())),
                        );
                        this.metrics?.histogram(name, t, step);
                        t.dispose();
                        // Hooked inputs are tf.keep()'d so we have to dispose
                        // them manually.
                        tf.dispose(inputs);
                    }
                }
                for (const layer of this.hookLayers) {
                    layer.clearCallHook();
                }

                for (const weights of this.variables) {
                    if (weights.size === 1) {
                        this.metrics?.scalar(
                            `${weights.name}/weights`,
                            weights.asScalar(),
                            step,
                        );
                    } else {
                        this.metrics?.histogram(
                            `${weights.name}/weights`,
                            weights,
                            step,
                        );
                    }
                }
            }
            tf.dispose(grads);

            return loss;
        });
    }

    /**
     * Calculates the TD target for an experience batch.
     *
     * @param reward Reward tensor of shape `[batch]`.
     * @param nextState Tensors for next state, of shape `[batch, Ns...]`.
     * @param choices Choice legality mask for next state, bool of shape
     * `[batch, Nc]`.
     * @param done Terminal state indicator for next state, float of shape
     * `[batch]`.
     * @returns Temporal difference target of shape `[batch]`, or
     * `[batch, atoms]` if configured for distributional RL.
     */
    private calculateTarget(
        reward: tf.Tensor,
        nextState: tf.Tensor[],
        choices: tf.Tensor,
        done: tf.Tensor,
    ): tf.Tensor {
        if (!this.support && !Number.isFinite(this.expConfig.steps)) {
            // TD target reduces to Monte Carlo returns.
            return reward;
        }
        return tf.tidy(() => {
            const targetModel = this.config.target
                ? this.targetModel
                : this.model;
            let targetQ = targetModel.predictOnBatch(nextState) as tf.Tensor;
            let q: tf.Tensor;
            if (this.config.target !== "double") {
                // Vanilla DQN TD target: r + gamma * max_a(Q(s', a))
                // Or with target net: r + gamma * max_a(Qt(s', a))
                q = targetQ;
            } else {
                // Double Q target: r + gamma * Qt(s', argmax_a(Q(s', a)))
                q = this.model.predictOnBatch(nextState) as tf.Tensor;
            }
            if (this.support) {
                // Distributional RL.
                // Take the mean of the Q distribution to get the expectation of
                // the Q value.
                q = tf.sum(tf.mul(q, this.support), -1);
            }
            // Large negative number to prevent Q values of illegal actions from
            // being chosen.
            q = tf.where(choices, q, -1e9);

            // Extract the Q-values (or distribution) of the best action from
            // the next state.
            const action = tf.argMax(q, -1);
            let actionMask = tf.oneHot(action, intToChoice.length);
            if (this.support) {
                actionMask = tf.expandDims(actionMask, -1);
            }
            targetQ = tf.sum(tf.mul(targetQ, actionMask), 1);

            if (this.support) {
                // Calculate support of TD target distribution for later
                // projection.
                let targetSupport: tf.Tensor;
                if (!Number.isFinite(this.expConfig.steps)) {
                    // TD target reduces to Monte Carlo returns.
                    targetSupport = tf.broadcastTo(tf.expandDims(reward, -1), [
                        this.config.batchSize,
                        this.support.size,
                    ]);
                } else {
                    targetSupport = tf.mul(
                        this.scaledSupport!,
                        tf.sub(1, done).expandDims(-1),
                    );
                    targetSupport = tf.add(
                        targetSupport,
                        reward.expandDims(-1),
                    );
                }
                targetSupport = tf.clipByValue(
                    targetSupport,
                    rewards.min,
                    rewards.max,
                );
                // Interpolated float index for projection.
                const realIndex = tf.div(
                    tf.sub(targetSupport, rewards.min),
                    this.atomDiff!,
                );
                // Project TD target distribution onto the support of the
                // Q-value distribution.
                const lo = tf.floor(realIndex);
                const hi = tf.ceil(realIndex);
                return tf.add(
                    tf.scatterND(
                        tf.concat(
                            [
                                this.batchIndices!,
                                lo.cast("int32").expandDims(-1),
                            ],
                            -1,
                        ),
                        tf.mul(targetQ, tf.sub(hi, realIndex)),
                        [this.config.batchSize, this.support.size],
                    ),
                    tf.scatterND(
                        tf.concat(
                            [
                                this.batchIndices!,
                                hi.cast("int32").expandDims(-1),
                            ],
                            -1,
                        ),
                        tf.mul(targetQ, tf.sub(realIndex, lo)),
                        [this.config.batchSize, this.support.size],
                    ),
                );
            }

            // Apply n-step TD target normally.
            targetQ = tf.mul(targetQ, tf.sub(1, done));
            // Technically clipping isn't necessary due to the current algorithm
            // only providing reward on game-over, just a consistency check.
            return tf.clipByValue(
                tf.add(reward, tf.mul(this.tdScale, targetQ)),
                rewards.min,
                rewards.max,
            );
        });
    }

    /**
     * Calculates training loss on an experience batch.
     *
     * @param state Tensors for state, of shape `[batch, Ns...]`.
     * @param action Action ids for each state, int of shape `[batch]`.
     * @param target TD target of shape `[batch]`, or `[batch, atoms]` if
     * configured for distributional RL.
     */
    private loss(
        state: tf.Tensor[],
        action: tf.Tensor,
        target: tf.Tensor,
    ): tf.Scalar {
        return tf.tidy("loss", () => {
            // Extract Q-value of best action from current state.
            let q = this.model.predictOnBatch(state) as tf.Tensor;
            let actionMask = tf.oneHot(action, intToChoice.length);
            if (this.support) {
                actionMask = tf.expandDims(actionMask, -1);
            }
            q = tf.sum(tf.mul(q, actionMask), 1);
            if (this.support) {
                // Cross-entropy loss for distributional RL.
                return tf.mean(tf.neg(tf.sum(tf.mul(tf.log(q), target), -1)));
            }
            // Mean squared error for value-based RL.
            return tf.mean(tf.squaredDifference(target, q));
        });
    }

    /**
     * Logs optimizer weights.
     *
     * For some reason this method has to be async which is why it's separate
     * from {@link step}.
     *
     * @param step Step number.
     */
    public async logOptimizerWeights(step: number): Promise<void> {
        if (!this.metrics) {
            return;
        }
        // Have to do this manually since tf.tidy() doesn't support async.
        tf.engine().startScope("logOptimizerWeights");
        try {
            for (const weight of await this.optimizer.getWeights()) {
                const name = `opt/${weight.name}`;
                if (weight.tensor.size === 1) {
                    this.metrics.scalar(name, weight.tensor.asScalar(), step);
                } else {
                    this.metrics.histogram(name, weight.tensor, step);
                }
            }
        } finally {
            tf.engine().endScope("logOptimizerWeights");
        }
    }

    /** Cleans up dangling variables. */
    public cleanup(): void {
        this.optimizer.dispose();
        this.variables.length = 0;
        this.hookLayers.length = 0;
        this.tdScale.dispose();
        this.support?.dispose();
        this.scaledSupport?.dispose();
        this.atomDiff?.dispose();
        this.batchIndices?.dispose();
    }
}
