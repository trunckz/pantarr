// Allergens (the 14 that EU law requires to be declared) and diets, with labels per language. Members store the codes;
// a household can add its own entries (settings customAllergens / customDiets), stored as plain names.
type Labels = Record<string, { en: string; fr: string; keywords?: string[] }>;

export const ALLERGENS: Labels = {
  gluten: { en: "gluten", fr: "gluten", keywords: ["gluten", "ble", "blé", "wheat", "farine", "flour", "pate", "pâte", "pasta", "pates", "pâtes", "pain", "bread", "semoule", "couscous", "orge", "barley", "seigle", "rye", "chapelure", "breadcrumb", "biscotte", "gnocchi", "ravioli", "crozet", "tortilla"] },
  crustaceans: { en: "crustaceans", fr: "crustacés", keywords: ["crevette", "shrimp", "prawn", "crabe", "crab", "homard", "lobster", "langoustine", "écrevisse"] },
  eggs: { en: "eggs", fr: "œufs", keywords: ["oeuf", "œuf", "egg", "mayonnaise"] },
  fish: { en: "fish", fr: "poisson", keywords: ["poisson", "fish", "saumon", "salmon", "thon", "tuna", "cabillaud", "cod", "colin", "limande", "sardine", "truite", "trout", "merlu", "anchois"] },
  peanuts: { en: "peanuts", fr: "arachides", keywords: ["arachide", "cacahuete", "cacahuète", "peanut"] },
  soy: { en: "soy", fr: "soja", keywords: ["soja", "soy", "tofu", "edamame"] },
  milk: { en: "milk", fr: "lait", keywords: ["lait", "milk", "beurre", "butter", "creme", "crème", "cream", "fromage", "cheese", "yaourt", "yogurt", "emmental", "mozzarella", "parmesan", "comte", "comté", "chevre", "chèvre", "feta", "raclette", "reblochon", "gruyere", "gruyère"] },
  nuts: { en: "tree nuts", fr: "fruits à coque", keywords: ["noix", "nut", "noisette", "hazelnut", "amande", "almond", "cajou", "cashew", "pistache", "pistachio", "pecan", "pécan", "pignon"] },
  celery: { en: "celery", fr: "céleri", keywords: ["celeri", "céleri", "celery"] },
  mustard: { en: "mustard", fr: "moutarde", keywords: ["moutarde", "mustard"] },
  sesame: { en: "sesame", fr: "sésame", keywords: ["sesame", "sésame", "tahini", "tahin"] },
  sulphites: { en: "sulphites", fr: "sulfites", keywords: ["vin", "wine", "sulfite", "sulphite", "vinaigre", "vinegar"] },
  lupin: { en: "lupin", fr: "lupin", keywords: ["lupin"] },
  molluscs: { en: "molluscs", fr: "mollusques", keywords: ["moule", "mussel", "huitre", "huître", "oyster", "calamar", "squid", "seiche", "poulpe", "octopus", "saint-jacques", "scallop", "escargot"] },
};

export const DIETS: Labels = {
  vegan: { en: "vegan", fr: "végan" },
  vegetarian: { en: "vegetarian", fr: "végétarien" },
  pescatarian: { en: "pescatarian", fr: "pescétarien" },
  halal: { en: "halal", fr: "halal" },
  kosher: { en: "kosher", fr: "casher" },
  no_pork: { en: "no pork", fr: "sans porc" },
  gluten_free: { en: "gluten-free", fr: "sans gluten" },
  lactose_free: { en: "lactose-free", fr: "sans lactose" },
  low_salt: { en: "low salt", fr: "pauvre en sel" },
  diabetic: { en: "diabetic-friendly", fr: "adapté au diabète" },
};

export const label = (table: Labels, code: string, locale: string) => table[code]?.[locale === "fr" ? "fr" : "en"] ?? code;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Allergens of a list that an ingredient name may contain (built-in keywords, or the custom name itself). */
export function allergensIn(ingredient: string, allergies: string[]): string[] {
  const words = ` ${norm(ingredient).replace(/[^a-z0-9]+/g, " ")} `;
  return allergies.filter((a) => (ALLERGENS[a]?.keywords ?? [a]).some((k) => words.includes(` ${norm(k).replace(/[^a-z0-9]+/g, " ").trim()}`)));
}
