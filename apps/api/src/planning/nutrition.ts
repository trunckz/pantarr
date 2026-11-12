// Balance of a menu: each meal is sorted by what it is made of (its ingredients, the recipe's lines, the dish name),
// without the LLM, then the period is compared with the guidelines of Santé publique France (PNNS 4, 2019) brought to
// its length:
// - fish twice a week (one oily fish) ;
// - pulses (lentils, chickpeas, beans) at least twice a week ;
// - meat other than poultry: at most 500 g a week, about 3 or 4 meals ;
// - cold cuts: at most 150 g a week, about 1 or 2 meals ;
// - vegetables at every meal.
// The same guidelines are given to the planner (prompt), unless the household turned them off.
import type { Meal } from "./types";

export type Group = "fish" | "oilyFish" | "redMeat" | "coldCuts" | "poultry" | "egg" | "pulses" | "vegetables" | "wholeGrain" | "dairy";

/** Words of each group, accent-free, lower case ; a word matches the start of a word of the text (« lentille » → « lentilles »). */
const WORDS: Record<Group, string[]> = {
  oilyFish: ["saumon", "maquereau", "sardine", "hareng", "truite", "thon frais", "anchois", "salmon", "mackerel", "sardine", "herring", "trout", "anchov"],
  fish: ["poisson", "cabillaud", "colin", "lieu", "merlu", "dorade", "daurade", "filet de bar", "sole", "limande", "lotte", "merlan", "thon", "saumon", "maquereau", "sardine",
    "hareng", "truite", "anchois", "crevette", "moule", "saint-jacques", "noix de st", "calamar", "encornet", "poulpe", "fruits de mer", "surimi", "fish", "cod", "hake",
    "haddock", "pollock", "tuna", "salmon", "mackerel", "shrimp", "prawn", "mussel", "scallop", "squid", "seafood", "tilapia", "pangasius"],
  redMeat: ["boeuf", "bœuf", "veau", "agneau", "mouton", "porc", "steak", "hache", "bavette", "entrecote", "roti", "cote de", "cotelette", "filet mignon", "echine",
    "paleron", "bourguignon", "boulette", "kefta", "merguez", "beef", "veal", "lamb", "pork", "minced meat", "ground meat", "meatball", "mince"],
  coldCuts: ["jambon", "lardon", "bacon", "saucisse", "saucisson", "chorizo", "salami", "rillette", "pate de campagne", "knack", "strasbourg", "andouille", "boudin",
    "coppa", "pancetta", "speck", "ham", "sausage", "pepperoni", "hot dog"],
  poultry: ["poulet", "dinde", "canard", "pintade", "volaille", "cuisse de", "aiguillette", "escalope de dinde", "chicken", "turkey", "duck", "poultry"],
  egg: ["oeuf", "œuf", "omelette", "egg", "frittata", "quiche"],
  pulses: ["lentille", "pois chiche", "haricot rouge", "haricot blanc", "haricots secs", "flageolet", "feve", "pois casse", "houmous", "hoummous", "falafel",
    "dhal", "soja", "tofu", "tempeh", "lentil", "chickpea", "kidney bean", "black bean", "white bean", "split pea", "hummus"],
  vegetables: ["legume", "carotte", "courgette", "aubergine", "poivron", "tomate", "brocoli", "chou", "epinard", "haricot vert", "petits pois", "petit pois", "salade",
    "laitue", "concombre", "poireau", "navet", "radis", "betterave", "potiron", "potimarron", "courge", "butternut", "champignon", "fenouil", "celeri", "asperge",
    "artichaut", "endive", "blette", "mache", "roquette", "ratatouille", "crudite", "gaspacho", "soupe de legume", "veloute", "vegetable",
    "carrot", "zucchini", "courgette", "eggplant", "bell pepper", "tomato", "broccoli", "cabbage", "spinach", "green bean", "peas", "lettuce", "cucumber", "leek",
    "squash", "pumpkin", "mushroom", "celery", "asparagus", "cauliflower", "kale", "salad"],
  wholeGrain: ["complet", "complete", "integral", "quinoa", "boulgour", "sarrasin", "riz brun", "riz complet", "flocons d'avoine", "whole wheat", "wholemeal",
    "whole grain", "brown rice", "bulgur", "buckwheat", "oat"],
  dairy: ["lait", "yaourt", "fromage", "emmental", "comte", "mozzarella", "parmesan", "feta", "chevre", "ricotta", "creme fraiche", "beurre", "milk", "yogurt", "cheese"],
};
/** Words that look like a group but are not (« pomme de terre » is not a fruit, « haricot vert » not a pulse…). */
const NOT: Partial<Record<Group, string[]>> = {
  pulses: ["haricot vert", "green bean", "sauce soja", "soy sauce"],
  redMeat: ["roti de dinde", "roti de poulet", "steak de thon", "steak vegetal", "hache vegetal", "boulette vegetale"],
  vegetables: ["poivre", "pepperoni", "concentre de tomate", "tomato paste"],
  fish: ["sauce poisson", "fish sauce"],
  dairy: ["lait de coco", "coconut milk", "laitue"],
};

const plain = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ")} `;
/** « haricot rouge » also finds « haricots rouges »: each word of the pattern starts a word of the text, in a row. */
const pattern = (w: string) => new RegExp(" " + plain(w).trim().split(" ").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9']*\\s+"), "g");
const hit = (text: string, words: string[]) => words.some((w) => pattern(w).test(text));

/** Groups found in a text (ingredient lines, dish name). */
export function groupsOf(text: string): Set<Group> {
  const t = plain(text);
  const found = new Set<Group>();
  for (const g of Object.keys(WORDS) as Group[]) {
    let x = t;
    for (const n of NOT[g] ?? []) x = x.replace(pattern(n), " ");
    if (hit(x, WORDS[g])) found.add(g);
  }
  if (found.has("oilyFish")) found.add("fish");
  // a fish or poultry « steak », « rôti », « haché » is not red meat
  if (found.has("redMeat") && (found.has("fish") || found.has("poultry")) && !hit(t, ["boeuf", "veau", "agneau", "porc", "beef", "veal", "lamb", "pork", "merguez"])) found.delete("redMeat");
  return found;
}

/** What a meal is made of: the main dish (what everyone shares) ; leftovers count as a meal of their own. */
export function mealGroups(m: Meal): Set<Group> {
  const text = [m.dish, m.recipe ?? "", ...(m.recipeIngredients ?? []), ...(m.ingredients ?? []).map((i) => i.name ?? "")].join(" ; ");
  return groupsOf(text);
}

export type Status = "ok" | "low" | "high";
export interface Guideline { group: "fish" | "oilyFish" | "pulses" | "redMeat" | "coldCuts" | "vegetables"; count: number; min?: number; max?: number; status: Status }
export interface Balance {
  meals: number;
  /** meals with each group */
  counts: Record<Group, number>;
  /** meals without meat nor fish */
  vegetarian: number;
  guidelines: Guideline[];
  /** index of each meal → its groups (shown as small badges) */
  perMeal: Group[][];
}

/** Guidelines per week (PNNS 4) ; brought to the number of planned days. */
const WEEK = { fish: { min: 2 }, oilyFish: { min: 1 }, pulses: { min: 2 }, redMeat: { max: 4 }, coldCuts: { max: 2 } } as const;

export function balanceOf(meals: Meal[], days: number): Balance {
  const perMeal = meals.map((m) => [...mealGroups(m)]);
  const counts = Object.fromEntries((Object.keys(WORDS) as Group[]).map((g) => [g, perMeal.filter((x) => x.includes(g)).length])) as Record<Group, number>;
  const vegetarian = perMeal.filter((x) => !x.some((g) => g === "fish" || g === "redMeat" || g === "coldCuts" || g === "poultry")).length;
  const scale = Math.max(1, days) / 7;
  const min = (n: number) => Math.max(days >= 4 ? 1 : 0, Math.floor(n * scale));
  const max = (n: number) => Math.max(1, Math.ceil(n * scale));
  const status = (count: number, lo?: number, hi?: number): Status => (lo !== undefined && count < lo ? "low" : hi !== undefined && count > hi ? "high" : "ok");
  const guidelines: Guideline[] = [
    { group: "fish", count: counts.fish, min: min(WEEK.fish.min), status: status(counts.fish, min(WEEK.fish.min)) },
    { group: "oilyFish", count: counts.oilyFish, min: min(WEEK.oilyFish.min), status: status(counts.oilyFish, min(WEEK.oilyFish.min)) },
    { group: "pulses", count: counts.pulses, min: min(WEEK.pulses.min), status: status(counts.pulses, min(WEEK.pulses.min)) },
    { group: "redMeat", count: counts.redMeat, max: max(WEEK.redMeat.max), status: status(counts.redMeat, undefined, max(WEEK.redMeat.max)) },
    { group: "coldCuts", count: counts.coldCuts, max: max(WEEK.coldCuts.max), status: status(counts.coldCuts, undefined, max(WEEK.coldCuts.max)) },
    // vegetables at every meal: at most one meal in five without
    { group: "vegetables", count: counts.vegetables, min: Math.ceil(meals.length * 0.8), status: status(counts.vegetables, Math.ceil(meals.length * 0.8)) },
  ];
  return { meals: meals.length, counts, vegetarian, guidelines, perMeal };
}

/** The guidelines said to the planner. */
export function nutritionRule(fr: boolean): string {
  return fr
    ? "\n\nÉquilibre (repères de Santé publique France, à suivre sauf consigne contraire du foyer) : des légumes à chaque repas ; du poisson 2 fois par semaine dont 1 poisson gras (saumon, maquereau, sardine) ; des légumineuses (lentilles, pois chiches, haricots secs) au moins 2 fois par semaine ; la viande hors volaille limitée à 3 ou 4 repas par semaine ; la charcuterie au plus 1 ou 2 fois ; des féculents complets quand c'est possible."
    : "\n\nBalance (public health guidelines, to follow unless the household says otherwise): vegetables at every meal; fish twice a week, one of them oily (salmon, mackerel, sardines); pulses (lentils, chickpeas, dried beans) at least twice a week; meat other than poultry at most 3 or 4 meals a week; cold cuts at most once or twice; whole grains when possible.";
}
