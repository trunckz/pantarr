// Aisle of an item typed or dictated elsewhere (Keep, Siri…), from the beginnings of its words: the first aisle that
// matches wins (frozen before meat: « steak haché surgelé »; baby milk and compotes before the dairy). Per language;
// the pantry families of the household are tried first (their keywords and aisle are the household's own).
import { key } from "../common/text";

export interface AisleWords { aisle: string; words: string[] }

export const AISLE_WORDS: Record<string, AisleWords[]> = {
  fr: [
    { aisle: "Surgelés", words: ["surgel", "glace", "frites", "steak hach", "poisson pan", "nugget"] },
    { aisle: "Hygiène et entretien", words: ["couche", "lingette", "papier toilette", "sopalin", "essuie", "lessive", "liquide vaisselle",
      "pastille", "eponge", "savon", "shampo", "dentifrice", "gel douche", "sac poubelle", "coton", "mouchoir", "javel"] },
    { aisle: "Boissons", words: ["eau", "perrier", "jus", "vin", "biere", "sirop", "coca", "soda", "limonade", "cristaline", "citronnad",
      "orangina", "oasis"] },
    { aisle: "Conserves", words: ["conserve", "thon", "mais", "sardine", "haricots rouges", "pois chiche", "concentre", "tomates pel", "coulis"] },
    { aisle: "Épicerie et féculents", words: ["lait bebe", "lait de croissance", "lait infantil", "guigoz", "compote", "puree de pomme",
      "petit pot", "petits pots", "pain de mie", "gourde", "cereale", "biscuit", "gateau", "confiture", "pate", "riz", "farine", "sucre",
      "huile", "vinaigre", "sel", "poivre", "epice", "semoule", "lentille", "chocolat", "cafe", "the "] },
    { aisle: "Boulangerie", words: ["pain", "baguette", "brioche", "croissant", "viennoiser"] },
    { aisle: "Crèmerie et œufs", words: ["lait", "beurre", "fromage", "yaourt", "yogourt", "creme", "oeuf", "emmental", "mozza", "comte",
      "gruyere", "chevre", "feta", "petit suisse", "petits suisses", "raclette", "reblochon", "parmesan", "skyr"] },
    { aisle: "Boucherie et poissonnerie", words: ["poulet", "boeuf", "steak", "viande", "porc", "veau", "agneau", "dinde", "canard", "magret",
      "saucisse", "chipo", "lardon", "jambon", "saumon", "cabillaud", "colin", "poisson", "crevette", "merlu", "escalope", "filet", "roti",
      "cordon bleu", "knack"] },
    { aisle: "Fruits et légumes", words: ["salade", "tomate", "pomme", "banane", "carotte", "courgette", "poireau", "oignon", "ail ", "citron",
      "orange", "clementine", "avocat", "concombre", "poivron", "champignon", "fruit", "legume", "kiwi", "poire", "raisin", "fraise", "melon",
      "patate", "echalote", "persil", "basilic", "coriandre", "aubergine", "brocoli", "chou", "epinard", "potiron", "potimarron",
      "butternut", "radis", "mangue", "ananas", "framboise", "myrtille"] },
  ],
  en: [
    { aisle: "Frozen", words: ["frozen", "ice cream", "fries", "nugget"] },
    { aisle: "Household", words: ["diaper", "wipe", "toilet paper", "paper towel", "detergent", "dish soap", "sponge", "soap", "shampoo",
      "toothpaste", "shower gel", "trash bag", "bin bag", "cotton", "tissue", "bleach"] },
    { aisle: "Drinks", words: ["water", "juice", "wine", "beer", "soda", "coke", "lemonade", "syrup"] },
    { aisle: "Canned food", words: ["canned", "tuna", "corn", "sardine", "kidney bean", "chickpea", "tomato paste", "passata"] },
    { aisle: "Pantry", words: ["baby milk", "formula", "puree", "baby food", "pasta", "rice", "flour", "sugar", "oil", "vinegar", "salt",
      "pepper", "spice", "cereal", "cookie", "biscuit", "jam", "chocolate", "coffee", "tea "] },
    { aisle: "Bakery", words: ["bread", "baguette", "brioche", "croissant", "bun", "bagel"] },
    { aisle: "Dairy & eggs", words: ["milk", "butter", "cheese", "yogurt", "yoghurt", "cream", "egg"] },
    { aisle: "Meat & fish", words: ["chicken", "beef", "steak", "meat", "pork", "veal", "lamb", "turkey", "duck", "sausage", "bacon", "ham",
      "salmon", "cod", "fish", "shrimp", "prawn", "mince"] },
    { aisle: "Fruit & vegetables", words: ["salad", "lettuce", "tomato", "apple", "banana", "carrot", "zucchini", "courgette", "leek", "onion",
      "garlic", "lemon", "orange", "avocado", "cucumber", "pepper", "mushroom", "fruit", "vegetable", "kiwi", "pear", "grape", "strawberr",
      "melon", "potato", "shallot", "parsley", "basil", "coriander", "cilantro", "eggplant", "aubergine", "broccoli", "cabbage", "spinach",
      "pumpkin", "squash", "radish", "mango", "pineapple", "raspberr", "blueberr"] },
  ],
};

/** Aisle from the word lists of the language, or null. */
export function aisleFromWords(text: string, locale: string): string | null {
  const t = ` ${key(text)} `;
  for (const a of AISLE_WORDS[locale] ?? AISLE_WORDS.en) if (a.words.some((w) => t.includes(` ${key(w)}${w.endsWith(" ") ? " " : ""}`))) return a.aisle;
  return null;
}
