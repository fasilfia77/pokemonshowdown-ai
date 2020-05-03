import { BattleAgent } from "../battle/agent/BattleAgent";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { Choice, choiceIds } from "../battle/agent/Choice";
import { weightedShuffle } from "./helpers";

/**
 * Policy type for `policyAgent()`.
 * @see policyAgent
 */
export type PolicyType = "deterministic" | "stochastic";

/** Function type for sorters. Both arrays must have the same length. */
type Sorter = (logits: Float32Array, choices: Choice[]) => void;
/** Choice sorters for each PolicyType. */
const sorters: {readonly [T in PolicyType]: Sorter} =
{
    deterministic(logits, choices)
    {
        choices.sort((a, b) =>
            logits[choiceIds[b]] - logits[choiceIds[a]]);
    },
    stochastic(logits, choices)
    {
        const filteredLogits = choices.map(c => logits[choiceIds[c]]);
        // apply softmax function to get a probability distribution
        const expLogits = filteredLogits.map(Math.exp);
        const sumExpLogits = expLogits.reduce((a, b) => a + b, 0);
        const weights = expLogits.map(n => n / sumExpLogits);
        weightedShuffle(weights, choices);
    }
};

/**
 * Creates a BattleAgent that runs a deterministic or stochastic policy.
 * @param getLogits Function for getting the weights of each choice.
 * @param type Action selection method after getting decision data.
 * `deterministic` - Choose the action deterministically with the highest
 * probability.
 * `stochastic` - Choose the action semi-randomly based on a discrete
 * probability distribution derived from the decision data.
 */
export function policyAgent(
    getLogits: (state: ReadonlyBattleState) =>
            Float32Array | Promise<Float32Array>, type: PolicyType): BattleAgent
{
    const sorter = sorters[type];
    return async function(state: ReadonlyBattleState, choices: Choice[]):
        Promise<void>
    {
        const logits = await getLogits(state);
        sorter(logits, choices);
    };
}