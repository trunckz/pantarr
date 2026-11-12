// Defaults seeded when a household is created, per language: which aisles are bought in store (the rest online).
export const IN_STORE_AISLES: Record<string, string[]> = {
  fr: ["Fruits et légumes", "Boucherie", "Poissonnerie", "Boucherie et poissonnerie"],
  en: ["Fruit and vegetables", "Meat", "Fish", "Produce", "Meat & Seafood"],
};
/** Pantry staples never added to the shopping list (first words of the ingredient name). */
export const PANTRY_STAPLES: Record<string, string[]> = {
  fr: ["sel", "poivre", "huile", "vinaigre", "épices", "curry", "paprika", "cumin", "piment", "herbes de provence", "thym séché", "sucre", "farine", "moutarde", "eau", "bouillon cube", "ail en poudre", "muscade", "cannelle"],
  en: ["salt", "pepper", "oil", "vinegar", "spices", "curry", "paprika", "cumin", "chili", "dried herbs", "sugar", "flour", "mustard", "water", "stock cube", "garlic powder", "nutmeg", "cinnamon"],
};
export interface HouseholdSettings {
  /** aisle (Mealie label) → where it is bought */
  storeAreas: Record<string, "in-store" | "online">;
  /** aisles not listed: online by default */
  defaultArea: "in-store" | "online";
  timezone: string;
  /** planning: null = default template of the language */
  promptTemplate: string | null;
  habitualDishes: string[];
  presenceRules: string;
  preferences: string;
  /** LLM calls per calendar month (null = unlimited, or the global default) */
  llmMonthlyCalls: number | null;
  /** allergens and diets added by the household to the built-in lists */
  customAllergens: string[];
  customDiets: string[];
  pantryStaples: string[];
  /** validating a week puts its ingredients in the shopping list */
  autoShopping: boolean;
  /** How receipts are read: OCR only (no LLM call), OCR then the LLM when it finds no item, or the LLM directly. */
  receiptReader: "ocr" | "ocr-llm" | "llm";
  /** Brands put first by the online-store panel, and brands it never proposes. */
  preferredBrands: string[];
  bannedBrands: string[];
  /** Grocery budget per week (in the household's currency), given to the planner ; null: none. */
  weeklyBudget?: number | null;
  /** The public health guidelines (fish, pulses, red meat, vegetables) given to the planner ; on unless turned off. */
  nutritionGuide?: boolean;
  /** Consent to use the allergies and diets (health or religious data, GDPR art. 9): when and by whom ; required on a
   * hosted instance before any is entered, withdrawn = they are erased. */
  healthConsent?: { at: string; by: string } | null;
  /** « next steps » card on the planning page (online store, receipts, calendar, recipes) after the three questions. */
  nextSteps?: boolean;
  /** false for a new household: its owner sees the step-by-step presentation (absent: households made before it). */
  onboardingDone?: boolean;
}
/** Settings of a household being created: its owner is shown the presentation. */
export const newHouseholdSettings = (locale: string): HouseholdSettings => ({ ...defaultSettings(locale), onboardingDone: false });

export const defaultSettings = (locale: string): HouseholdSettings => ({
  storeAreas: Object.fromEntries((IN_STORE_AISLES[locale] ?? IN_STORE_AISLES.en).map((a) => [a, "in-store"])),
  defaultArea: "online",
  timezone: "Europe/Paris",
  promptTemplate: null,
  habitualDishes: [],
  presenceRules: "",
  preferences: "",
  llmMonthlyCalls: null,
  customAllergens: [],
  customDiets: [],
  pantryStaples: PANTRY_STAPLES[locale] ?? PANTRY_STAPLES.en,
  autoShopping: true,
  receiptReader: "ocr",
  preferredBrands: [],
  bannedBrands: [],
});
export const settingsOf = (h: { locale: string; settings: unknown }): HouseholdSettings => ({ ...defaultSettings(h.locale), ...(h.settings as object) });
