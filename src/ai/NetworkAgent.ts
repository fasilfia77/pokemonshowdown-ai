import * as tf from "@tensorflow/tfjs-node";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice, choiceIds, intToChoice } from "../battle/agent/Choice";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { encodeBattleState, sizeBattleState } from "./encodeBattleState";
import { weightedShuffle } from "./helpers";

/** NetworkAgent policy type. */
export type PolicyType = "deterministic" | "stochastic";

/** BattleAgent that interfaces with a neural network. */
export class NetworkAgent implements BattleAgent
{
    /**
     * Creates a NetworkAgent.
     * @param model Neural network for making decisions.
     * @param policy Action selection method after getting decision data.
     * `deterministic` - Choose the action deterministically with the highest
     * probability.
     * `stochastic` - Choose the action semi-randomly based on a discrete
     * probability distribution derived from the decision data.
     */
    constructor(private readonly model: tf.LayersModel,
        private readonly policy: PolicyType)
    {
        NetworkAgent.verifyModel(model);
    }

    /** @override */
    public async decide(state: ReadonlyBattleState, choices: Choice[]):
        Promise<void>
    {
        if (choices.length === 0) throw new Error("No available choices");

        const prediction = tf.tidy(() =>
        {
            const stateTensor = tf.tensor([encodeBattleState(state)]);
            return (this.model.predict(stateTensor, {}) as tf.Tensor2D)
                .squeeze().as1D();
        });
        const predictionData = await prediction.array();
        prediction.dispose();

        await this.runPolicy(predictionData, choices);
    }

    /** Runs the policy to sort the Choices array. */
    private async runPolicy(logits: readonly number[], choices: Choice[]):
        Promise<void>
    {
        switch (this.policy)
        {
            case "deterministic":
                choices.sort((a, b) =>
                    logits[choiceIds[b]] - logits[choiceIds[a]]);
                break;
            case "stochastic":
            {
                const filteredLogits = choices.map(c => logits[choiceIds[c]]);
                const weights = tf.tidy(() =>
                    tf.softmax(filteredLogits).as1D());
                weightedShuffle(await weights.array(), choices);
                break;
            }
            default:
                // istanbul ignore next: should never happen
                throw new Error(`Unknown policy type ${this.policy}`);
        }
    }

    /**
     * Verifies a neural network model to make sure its input and output shapes
     * are acceptable for constructing a NetworkAgent with. Throws if invalid.
     */
    public static verifyModel(model: tf.LayersModel): void
    {
        // loaded models must have the correct input/output shape
        if (Array.isArray(model.input))
        {
            throw new Error("Loaded LayersModel should have only one input " +
                `layer but found ${model.input.length}`);
        }
        if (!NetworkAgent.isValidInputShape(model.input.shape))
        {
            throw new Error("Loaded LayersModel has invalid input shape " +
                `(${model.input.shape.join(", ")}). Try to create a new ` +
                `model with an input shape of (, ${sizeBattleState})`);
        }
        if (Array.isArray(model.output))
        {
            throw new Error("Loaded LayersModel should have only one output " +
                `layer but found ${model.output.length}`);
        }
        if (!NetworkAgent.isValidOutputShape(model.output.shape))
        {
            throw new Error("Loaded LayersModel has invalid output shape " +
                `(${model.output.shape.join(", ")}). Try to create a new ` +
                `model with an output shape of (, ${intToChoice.length})`);
        }
    }

    /** Ensures that a network input shape is valid. */
    private static isValidInputShape(shape: Readonly<tf.Shape>): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === sizeBattleState;
    }

    /** Ensures that a network output shape is valid. */
    private static isValidOutputShape(shape: Readonly<tf.Shape>): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === intToChoice.length;
    }
}
