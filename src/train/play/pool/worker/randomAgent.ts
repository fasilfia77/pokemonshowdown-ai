import {Choice} from "../../../../psbot/handlers/battle/agent";
import {
    allocEncodedState,
    encodeState,
} from "../../../../psbot/handlers/battle/ai/encoder";
import {ReadonlyBattleState} from "../../../../psbot/handlers/battle/state";
import {shuffle} from "../../../../util/shuffle";
import {ModelPort} from "../../../model/worker";
import {ExperienceAgentData} from "../../experience";

/** BattleAgent that chooses actions randomly. */
export async function randomAgent(
    state: ReadonlyBattleState,
    choices: Choice[],
): Promise<void> {
    shuffle(choices);
    return await Promise.resolve();
}

/** ExperienceAgent that chooses actions randomly. */
export async function randomExpAgent(
    state: ReadonlyBattleState,
    choices: Choice[],
): Promise<ExperienceAgentData> {
    await randomAgent(state, choices);

    const data = allocEncodedState();
    encodeState(data, state);
    ModelPort.verifyInput(data);
    return await Promise.resolve({state: data});
}
