/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh` after the `Pokemon-Showdown` repo has been cloned.
 */
import { toIdName } from "../src/bot/helpers";
// @ts-ignore
import Dex = require("./Pokemon-Showdown/sim/dex");

// TODO: support other gens?

/**
 * Checks whether a pokemon id name is not from gen4.
 * @param name Pokemon name.
 * @returns True if the id is not from gen4 or below.
 */
function isNonGen4(name: string): boolean
{
    // banlist: megas, primal, alola/totem, arceus fairy, pikachu alt forms,
    //  letsgo pikachu/eevee starters
    // except yanmega, which isn't actually a mega evolution
    if (name === "yanmega") return false;
    return /(mega[xy]?|primal|alola|totem|arceusfairy|^(pikachu|eevee).+)$/
        .test(name);
}

/**
 * Checks whether a pokemon id name is from gen4.
 * @param name Pokemon name.
 * @returns True if the id is from gen4 or below.
 */
function isGen4(name: string): boolean
{
    return !isNonGen4(name);
}

/**
 * Wraps a string in quotes.
 * @param str String to quote.
 * @returns The given string in quotes.
 */
function quote(str: string): string
{
    return `"${str}"`;
}

/**
 * Wraps a string in quotes if it is a valid identifier. An invalid identifier
 * has dashes, spaces, or quotes in it.
 * @param str String to quote.
 * @returns The string given back if valid, else the string wrapped in quotes.
 */
function maybeQuote(str: string): string
{
    return /[- ']/.test(str) ? quote(str) : str;
}

const data = Dex.mod("gen4").data;

// import statement at the top of the file
console.log(`\
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import { Dex, MoveData, PokemonData } from \"./dex-types\";
`);

// implicitly uses typings from:
//  https://github.com/Zarel/Pokemon-Showdown/blob/master/sim/dex-data.js

// counter for the unique identifier of a pokemon, move, etc.
let uid = 0;

/** Contains ability ids. */
const abilities: {[name: string]: number} = {};
let numAbilities = 0;

// pokemon
const pokedex = data.Pokedex;
console.log("const pokemon: {readonly [species: string]: PokemonData} =\n{");
for (const name in pokedex)
{
    if (!pokedex.hasOwnProperty(name)) continue;
    const mon = pokedex[name];
    // only gen4 and under pokemon allowed
    if (mon.num < 1 || mon.num > 493 || isNonGen4(name) || mon.isNonstandard)
    {
        continue;
    }

    const stats = mon.baseStats;

    // get quoted base abilities
    const baseAbilities: string[] = [];
    for (const index in mon.abilities)
    {
        if (!mon.abilities.hasOwnProperty(index)) continue;

        const idName = toIdName(mon.abilities[index]);
        baseAbilities.push(quote(idName));
        if (!abilities.hasOwnProperty(idName))
        {
            // post-increment so that id number is 0-based, since numAbilities
            //  starts at 0
            abilities[idName] = numAbilities++;
        }
    }

    const types: string[] = mon.types;

    // optionally fill in other forms if there are any from gen4
    let otherForms: string[] | undefined;
    if (mon.otherFormes)
    {
        const tmp = mon.otherFormes.filter(isGen4);
        if (tmp.length > 0) otherForms = tmp;
    }

    console.log(`\
    ${maybeQuote(mon.species)}:
    {
        id: ${mon.num},
        uid: ${uid},
        species: ${quote(mon.species)},`);
    // tslint:disable:curly
    if (mon.baseSpecies) console.log(`\
        baseSpecies: ${quote(mon.baseSpecies)},`);
    if (mon.baseForme) console.log(`\
        baseForm: ${quote(mon.baseForme)},`);
    if (mon.forme) console.log(`\
        form: ${quote(mon.forme)},`);
    if (mon.formeLetter) console.log(`\
        formLetter: ${quote(mon.formeLetter)},`);
    if (otherForms) console.log(`\
        otherForms: [${otherForms.map(quote).join(", ")}],`);
    // tslint:enable:curly
    console.log(`\
        abilities: [${baseAbilities.join(", ")}],
        types: [${types.map(t => quote(t.toLowerCase())).join(", ")}],
        baseStats: {hp: ${stats.hp}, atk: ${stats.atk}, def: ${stats.def}, \
spa: ${stats.spa}, spd: ${stats.spd}, spe: ${stats.spe}},
        weightkg: ${mon.weightkg}
    },`);
    ++uid;
}

const numPokemon = uid;

console.log(`};

const abilities: {readonly [name: string]: number} =
{
${Object.keys(abilities).map(id => `    ${id}: ${abilities[id]},\n`).join("")}};
`);

// moves
const moves = data.Movedex;
const twoTurnMoves: {[name: string]: number} = {};
let twoTurnUid = 0;

console.log("const moves: {readonly [name: string]: MoveData} =\n{");

uid = 0;
for (const moveName in moves)
{
    if (!moves.hasOwnProperty(moveName)) continue;
    const move = moves[moveName];
    // only gen4 and under moves allowed
    if (move.num <= 0 || move.num >= 468 || move.isNonstandard) continue;

    // hidden power moves can have any type, but only one move really exists,
    //  not sure why PS dex includes every possible type
    if (move.id === "hiddenpower" && move.type !== "Normal") continue;

    const target = quote(move.target);

    // factor pp boosts if the move supports it in game
    let pp = move.pp;
    if (!move.noPPBoosts)
    {
        pp = Math.floor(pp * 8 / 5);
    }

    const selfSwitch = typeof move.selfSwitch === "string" ?
        quote(move.selfSwitch) : !!move.selfSwitch;

    let volatileEffect: string | undefined;
    if (move.self && move.self.volatileStatus)
    {
        volatileEffect = quote(move.self.volatileStatus);
    }

    let sideCondition: string | undefined;
    if (move.sideCondition)
    {
        sideCondition = quote(move.sideCondition.toLowerCase());
    }

    // two turn moves are also recorded in a different object
    if (move.flags.charge === 1) twoTurnMoves[move.name] = twoTurnUid++;

    console.log(`\
    ${move.id}:
    {
        uid: ${uid}, pp: ${pp}, target: ${target}\
${selfSwitch ? `, selfSwitch: ${selfSwitch}` : ""}\
${volatileEffect ? `, volatileEffect: ${volatileEffect}` : ""}\
${sideCondition ? `, sideCondition: ${sideCondition}` : ""}
    },`);
    ++uid;
}
console.log("};\n");
const numMoves = uid;

// build set of all two turn moves
console.log("const twoTurnMovesInternal =\n{");
for (const moveName in twoTurnMoves)
{
    if (!twoTurnMoves.hasOwnProperty(moveName)) continue;

    console.log(`    ${maybeQuote(moveName)}: ${twoTurnMoves[moveName]},`);
}
console.log(`};

/** Set of all two-turn moves. Maps move name to its id within this object. */
export const twoTurnMoves: Readonly<typeof twoTurnMovesInternal> =
    twoTurnMovesInternal;

/** Number of two-turn moves that exist. */
export const numTwoTurnMoves = Object.keys(twoTurnMoves).length;\n`);

// items
const items = data.Items;
console.log(`const items: {readonly [name: string]: number} =\n{`);
uid = 0;
for (const itemName in items)
{
    if (!items.hasOwnProperty(itemName)) continue;
    const item = items[itemName];
    // only gen4 and under items allowed
    if (item.gen > 4 || item.isNonstandard) continue;

    console.log(`    ${item.id}: ${uid},`);
    ++uid;
}
console.log("};\n");
const numItems = uid;

console.log(`/** Contains all relevant Pokemon-related data. */
export const dex: Dex =
{
    pokemon, numPokemon: ${numPokemon}, abilities, \
numAbilities: ${numAbilities}, moves,
    numMoves: ${numMoves}, items, numItems: ${numItems}
};`);
