import { AnyBattleEvent, Cause } from
    "../../src/bot/dispatcher/BattleEvent";
import { BattleInitMessage, BattleProgressMessage, RequestMessage } from
    "../../src/bot/dispatcher/Message";
import { PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/bot/helpers";

/**
 * Creates an unparsed server message.
 * @param words String arguments for the message.
 * @returns An unparsed message.
 */
export function buildMessage(words: string[][]): string
{
    return words.map(line => line.length > 0 ? `|${line.join("|")}` : "")
        .join("\n");
}

/**
 * Stringifies the object from a |request| message back to normal JSON.
 * @param data Data to stringify.
 * @returns A re-parseable |request| JSON string.
 */
export function stringifyRequest(data: RequestMessage): string
{
    // deep copy
    const obj: any = JSON.parse(JSON.stringify(data));

    // need to put some data back into string form
    for (const mon of obj.side.pokemon)
    {
        // ident, details, and condition fields are the same
        //  as the data from a |switch| message
        mon.ident = stringifyID(mon.ident);
        mon.details = stringifyDetails(mon.details);
        mon.condition = stringifyStatus(mon.condition);
    }
    return JSON.stringify(obj);
}

/**
 * Composes all the word segments of a `battleinit` message type.
 * @param args Arguments to be stringified.
 * @returns An unparsed BattleInitMessage.
 */
export function composeBattleInit(args: BattleInitMessage): string[][]
{
    const result: string[][] =
    [
        ["player", args.id, args.username],
        ["teamsize", "p1", args.teamSizes.p1.toString()],
        ["teamsize", "p2", args.teamSizes.p2.toString()],
        ["gametype", args.gameType],
        ["gen", args.gen.toString()],
        ...args.events
            .map(composeBattleEvent)
    ];
    return result;
}

/**
 * Composes all the word segments of a `battleprogress` message type.
 * @param args Arguments to be stringified.
 * @returns An unparsed BattleProgressMessage.
 */
export function composeBattleProgress(args: BattleProgressMessage): string[][]
{
    return args.events.map(composeBattleEvent);
}

/**
 * Composes all the word segments of a BattleEvent.
 * @param event Event to stringify.
 * @returns An unparsed BattleEvent.
 */
export function composeBattleEvent(event: AnyBattleEvent): string[]
{
    let result: string[];
    switch (event.type)
    {
        case "ability":
            result = ["-ability", stringifyID(event.id), event.ability];
            break;
        case "activate":
        case "end":
            result = ["-" + event.type, stringifyID(event.id), event.volatile];
            break;
        case "boost":
            result =
            [
                `-${event.amount < 0 ? "un" : ""}boost`, stringifyID(event.id),
                event.stat, Math.abs(event.amount).toString()
            ];
            break;
        case "cant":
            result = ["cant", stringifyID(event.id), event.reason];
            if (event.moveName) result.push(event.moveName);
            break;
        case "curestatus":
        case "status":
            result =
            [
                "-" + event.type, stringifyID(event.id), event.majorStatus
            ];
            break;
        case "cureteam":
            result = ["-cureteam", stringifyID(event.id)];
            break;
        case "damage":
        case "heal":
            result =
            [
                "-" + event.type, stringifyID(event.id),
                stringifyStatus(event.status)
            ];
            break;
        case "faint":
            result = ["faint", stringifyID(event.id)];
            break;
        case "move":
        case "prepare":
            result =
            [
                event.type === "prepare" ? "-prepare" : event.type,
                stringifyID(event.id), event.moveName,
                stringifyID(event.targetId)
            ];
            break;
        case "mustrecharge":
            result = ["-mustrecharge", stringifyID(event.id)];
            break;
        case "sethp":
            result =
            [
                "-sethp",
                ...event.newHPs.map(pair =>
                        [stringifyID(pair.id), stringifyStatus(pair.status)])
                    .reduce((a1, a2) => a1.concat(a2), [])
            ];
            break;
        case "singleturn":
            result = ["-singleturn", stringifyID(event.id), event.status];
            break;
        case "start":
            result =
            [
                "-start", stringifyID(event.id), event.volatile,
                ...event.otherArgs
            ];
            break;
        case "switch":
            result =
            [
                "switch", stringifyID(event.id),
                stringifyDetails(event.details), stringifyStatus(event.status)
            ];
            break;
        case "tie":
            result = ["tie"];
            break;
        case "turn":
            result = ["turn", event.num.toString()];
            break;
        case "upkeep":
            result = ["upkeep"];
            break;
        case "win":
            result = ["win", event.winner];
            break;
        default:
            result = [];
    }
    if (event.cause) result.push(stringifyCause(event.cause));
    return result;
}

/**
 * Stringifies a PokemonID.
 * @param id ID object.
 * @returns The PokemonID in string form.
 */
export function stringifyID(id: PokemonID): string
{
    return `${id.owner}${id.position ? id.position : ""}: ${id.nickname}`;
}

/**
 * Stringifies a PokemonDetails.
 * @param details Details object.
 * @returns The PokemonDetails in string form.
 */
export function stringifyDetails(details: PokemonDetails): string
{
    const arr = [details.species];
    if (details.shiny) arr.push("shiny");
    if (details.gender) arr.push(details.gender);
    if (details.level !== 100) arr.push(`L${details.level}`);
    return arr.join(", ");
}

/**
 * Stringifies a PokemonStatus.
 * @param details Status object.
 * @returns The PokemonStatus in string form.
 */
export function stringifyStatus(status: PokemonStatus): string
{
    if (status.hp === 0)
    {
        return "0 fnt";
    }
    return `${status.hp}/${status.hpMax}\
${status.condition ? ` ${status.condition}` : ""}`;
}

/**
 * Stringifies a Cause.
 * @param cause Cause object.
 * @returns The Cause in string form.
 */
export function stringifyCause(cause: Cause): string
{
    switch (cause.type)
    {
        case "fatigue": return "[fatigue]";
        case "item": return `[from] item: ${cause.item}`;
        case "lockedmove": return "[from]lockedmove";
        default: return "";
    }
}
