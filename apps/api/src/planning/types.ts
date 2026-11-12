export interface Ingredient { name: string; quantity?: number | null; unit?: string; aisle?: string }
/** A person's variant: « replaces » when the person does not eat the main dish ; its own ingredients ; or leftovers. */
export interface Adjustment { member: string; text: string; replaces?: boolean; ingredients?: Ingredient[]; leftovers_from?: string | null }
export interface Meal {
  date: string; meal: "lunch" | "dinner"; for?: string[]; dish: string; recipe?: string | null; minutes?: number;
  adjustments?: Adjustment[]; leftovers_for?: string | null; leftovers_from?: string | null; note?: string;
  ingredients?: Ingredient[];
  recipeId?: string | null; recipeUrl?: string | null; recipeSlug?: string | null;
  /** « recipe »: time of the Mealie recipe ; « estimate »: given by the model */
  minutesSource?: "recipe" | "estimate";
  /** lines of the Mealie recipe scaled to the people (and leftovers) ; « ingredients » then holds only the additions */
  recipeIngredients?: string[]; extrasOnly?: boolean;
  /** allergens of the people who eat it found in the ingredients (checked after the LLM) */
  warnings?: { member: string; allergen: string; ingredient: string }[];
}
export interface Answer { meals: Meal[]; batch?: unknown; remarks?: string; /** the special instructions given for the period */ notes?: string }
