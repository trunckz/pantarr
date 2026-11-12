// Data of the public demo: an invented household and its week, written by hand (no account, no AI call). French and
// English versions; the shopping list is worked out from the meals, so changing a meal changes it.
export interface DemoIngredient { name: string; qty: string; aisle: string; online: boolean; price: number }
export interface DemoMeal {
  day: number; slot: "lunch" | "dinner"; dish: string; minutes: number; for: string[];
  variant?: string; leftoversFor?: string; leftoversFrom?: string; groups: string[]; ingredients: DemoIngredient[];
}
export interface DemoData {
  household: string; people: { name: string; note: string }[]; days: string[]; away: string;
  meals: DemoMeal[]; alternatives: DemoMeal[][]; pantry: { name: string; when: string; level: number }[];
  receipts: string; budget: { week: number; target: number };
}

const I = (name: string, qty: string, aisle: string, online: boolean, price: number): DemoIngredient => ({ name, qty, aisle, online, price });

const FR: DemoData = {
  household: "Famille Martin",
  people: [
    { name: "Alice", note: "adulte, végétarienne le midi" }, { name: "Paul", note: "adulte" },
    { name: "Léo", note: "8 ans" }, { name: "Zoé", note: "4 ans, allergie : arachides" },
  ],
  days: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
  away: "Mercredi soir : Paul au sport (agenda) → repas pour 3",
  meals: [
    { day: 0, slot: "dinner", dish: "Saumon en papillote, riz et courgettes", minutes: 25, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["fish", "oilyFish", "vegetables"],
      ingredients: [I("Pavés de saumon", "4", "Boucherie et poissonnerie", false, 9.9), I("Courgettes", "3", "Fruits et légumes", false, 2.1), I("Riz basmati", "1 paquet", "Épicerie salée", true, 2.3), I("Citron", "1", "Fruits et légumes", false, 0.5)] },
    { day: 1, slot: "dinner", dish: "Chili sin carne", minutes: 35, for: ["Alice", "Paul", "Léo", "Zoé"], leftoversFor: "jeudi midi (Alice)", groups: ["pulses", "vegetables"],
      ingredients: [I("Haricots rouges", "2 boîtes", "Épicerie salée", true, 1.8), I("Tomates concassées", "2 boîtes", "Épicerie salée", true, 1.6), I("Poivrons", "2", "Fruits et légumes", false, 2.4), I("Maïs", "1 boîte", "Épicerie salée", true, 1.1)] },
    { day: 2, slot: "dinner", dish: "Omelette aux champignons et salade", minutes: 15, for: ["Alice", "Léo", "Zoé"], groups: ["egg", "vegetables"],
      ingredients: [I("Œufs", "6", "Crèmerie", true, 2.4), I("Champignons de Paris", "250 g", "Fruits et légumes", false, 1.7), I("Salade", "1", "Fruits et légumes", false, 1.3)] },
    { day: 3, slot: "lunch", dish: "Restes de chili", minutes: 5, for: ["Alice"], leftoversFrom: "mardi soir", groups: ["pulses", "vegetables"], ingredients: [] },
    { day: 3, slot: "dinner", dish: "Poulet basquaise", minutes: 40, for: ["Alice", "Paul", "Léo", "Zoé"], variant: "Zoé : poulet sans sauce, avec des pâtes", groups: ["poultry", "vegetables"],
      ingredients: [I("Cuisses de poulet", "4", "Boucherie et poissonnerie", false, 6.5), I("Poivrons", "2", "Fruits et légumes", false, 2.4), I("Tomates", "4", "Fruits et légumes", false, 2.6), I("Pâtes", "1 paquet", "Épicerie salée", true, 1.2)] },
    { day: 4, slot: "dinner", dish: "Pizza maison jambon-mozzarella", minutes: 30, for: ["Alice", "Paul", "Léo", "Zoé"], variant: "Alice : moitié aux légumes", groups: ["coldCuts", "dairy", "vegetables"],
      ingredients: [I("Pâte à pizza", "2", "Crèmerie", true, 2.6), I("Jambon blanc", "4 tranches", "Charcuterie", true, 2.9), I("Mozzarella", "2", "Crèmerie", true, 2.6), I("Coulis de tomate", "1", "Épicerie salée", true, 1.3)] },
    { day: 5, slot: "lunch", dish: "Dahl de lentilles corail", minutes: 30, for: ["Alice", "Paul", "Léo", "Zoé"], leftoversFor: "dimanche midi", groups: ["pulses", "vegetables"],
      ingredients: [I("Lentilles corail", "500 g", "Épicerie salée", true, 2.2), I("Lait de coco", "1 boîte", "Épicerie salée", true, 1.6), I("Carottes", "4", "Fruits et légumes", false, 1.4), I("Épinards", "1 sachet", "Fruits et légumes", false, 2.2)] },
    { day: 5, slot: "dinner", dish: "Gratin de pâtes au brocoli", minutes: 35, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["vegetables", "dairy"],
      ingredients: [I("Brocoli", "1", "Fruits et légumes", false, 1.9), I("Pâtes", "1 paquet", "Épicerie salée", true, 1.2), I("Emmental râpé", "1 sachet", "Crèmerie", true, 2.1), I("Crème fraîche", "1 pot", "Crèmerie", true, 1.8)] },
    { day: 6, slot: "lunch", dish: "Restes de dahl", minutes: 5, for: ["Alice", "Paul", "Léo", "Zoé"], leftoversFrom: "samedi midi", groups: ["pulses", "vegetables"], ingredients: [] },
    { day: 6, slot: "dinner", dish: "Cabillaud, purée maison et haricots verts", minutes: 30, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["fish", "vegetables"],
      ingredients: [I("Dos de cabillaud", "4", "Boucherie et poissonnerie", false, 11.5), I("Pommes de terre", "1,5 kg", "Fruits et légumes", false, 2.2), I("Haricots verts", "500 g", "Fruits et légumes", false, 3.2), I("Lait", "1 l", "Crèmerie", true, 1.0)] },
  ],
  alternatives: [
    [{ day: 0, slot: "dinner", dish: "Sardines grillées, boulgour et tomates", minutes: 20, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["fish", "oilyFish", "vegetables"],
      ingredients: [I("Sardines", "8", "Boucherie et poissonnerie", false, 6.4), I("Boulgour", "1 paquet", "Épicerie salée", true, 1.9), I("Tomates", "4", "Fruits et légumes", false, 2.6)] }],
    [{ day: 1, slot: "dinner", dish: "Curry de pois chiches", minutes: 30, for: ["Alice", "Paul", "Léo", "Zoé"], leftoversFor: "jeudi midi (Alice)", groups: ["pulses", "vegetables"],
      ingredients: [I("Pois chiches", "2 boîtes", "Épicerie salée", true, 1.9), I("Lait de coco", "1 boîte", "Épicerie salée", true, 1.6), I("Épinards", "1 sachet", "Fruits et légumes", false, 2.2), I("Riz basmati", "1 paquet", "Épicerie salée", true, 2.3)] }],
    [{ day: 2, slot: "dinner", dish: "Croque-monsieur et soupe de légumes", minutes: 20, for: ["Alice", "Léo", "Zoé"], groups: ["coldCuts", "dairy", "vegetables"],
      ingredients: [I("Pain de mie", "1", "Boulangerie", true, 1.5), I("Jambon blanc", "4 tranches", "Charcuterie", true, 2.9), I("Soupe de légumes", "1 l", "Épicerie salée", true, 2.4)] }],
    [], [{ day: 3, slot: "dinner", dish: "Bœuf bourguignon et carottes", minutes: 45, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["redMeat", "vegetables"],
      ingredients: [I("Bœuf à braiser", "800 g", "Boucherie et poissonnerie", false, 13.6), I("Carottes", "6", "Fruits et légumes", false, 1.8), I("Champignons de Paris", "250 g", "Fruits et légumes", false, 1.7)] }],
    [{ day: 4, slot: "dinner", dish: "Tacos végétariens", minutes: 25, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["pulses", "vegetables"],
      ingredients: [I("Tortillas", "8", "Épicerie salée", true, 2.2), I("Haricots rouges", "1 boîte", "Épicerie salée", true, 0.9), I("Avocats", "2", "Fruits et légumes", false, 2.4), I("Salade", "1", "Fruits et légumes", false, 1.3)] }],
    [], [{ day: 5, slot: "dinner", dish: "Quiche aux poireaux", minutes: 40, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["egg", "dairy", "vegetables"],
      ingredients: [I("Pâte brisée", "1", "Crèmerie", true, 1.4), I("Poireaux", "3", "Fruits et légumes", false, 2.4), I("Œufs", "6", "Crèmerie", true, 2.4), I("Crème fraîche", "1 pot", "Crèmerie", true, 1.8)] }],
    [], [{ day: 6, slot: "dinner", dish: "Poulet rôti et pommes de terre au four", minutes: 50, for: ["Alice", "Paul", "Léo", "Zoé"], groups: ["poultry", "vegetables"],
      ingredients: [I("Poulet fermier", "1", "Boucherie et poissonnerie", false, 10.9), I("Pommes de terre", "1,5 kg", "Fruits et légumes", false, 2.2), I("Haricots verts", "500 g", "Fruits et légumes", false, 3.2)] }],
  ],
  pantry: [
    { name: "Couches (Zoé)", when: "à racheter dans 3 jours", level: 15 }, { name: "Lait", when: "dans 5 jours", level: 35 },
    { name: "Café", when: "dans 9 jours", level: 60 }, { name: "Papier toilette", when: "dans 12 jours", level: 75 },
  ],
  receipts: "Appris de 14 tickets : Intermarché (drive), Lidl (magasin), transférés par mail.",
  budget: { week: 96, target: 110 },
};

const EN: DemoData = {
  household: "The Martins",
  people: [
    { name: "Alice", note: "adult, vegetarian at lunch" }, { name: "Paul", note: "adult" },
    { name: "Leo", note: "8 years old" }, { name: "Zoe", note: "4 years old, allergy: peanuts" },
  ],
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  away: "Wednesday evening: Paul at the gym (calendar) → dinner for 3",
  meals: FR.meals.map((m) => ({ ...m })), alternatives: FR.alternatives,
  pantry: [
    { name: "Diapers (Zoe)", when: "to buy in 3 days", level: 15 }, { name: "Milk", when: "in 5 days", level: 35 },
    { name: "Coffee", when: "in 9 days", level: 60 }, { name: "Toilet paper", when: "in 12 days", level: 75 },
  ],
  receipts: "Learned from 14 receipts: online store and supermarket, forwarded by e-mail.",
  budget: { week: 96, target: 110 },
};

/** English names of the dishes and ingredients of the French week (same structure). */
const EN_WORDS: Record<string, string> = {
  "Saumon en papillote, riz et courgettes": "Salmon parcels, rice and zucchini", "Chili sin carne": "Bean chili", "Omelette aux champignons et salade": "Mushroom omelette and salad",
  "Restes de chili": "Chili leftovers", "Poulet basquaise": "Basque-style chicken", "Pizza maison jambon-mozzarella": "Home-made ham and mozzarella pizza",
  "Dahl de lentilles corail": "Red lentil dahl", "Gratin de pâtes au brocoli": "Pasta and broccoli bake", "Restes de dahl": "Dahl leftovers",
  "Cabillaud, purée maison et haricots verts": "Cod, mashed potatoes and green beans", "Sardines grillées, boulgour et tomates": "Grilled sardines, bulgur and tomatoes",
  "Curry de pois chiches": "Chickpea curry", "Croque-monsieur et soupe de légumes": "Ham and cheese toastie, vegetable soup", "Bœuf bourguignon et carottes": "Beef stew with carrots",
  "Tacos végétariens": "Veggie tacos", "Quiche aux poireaux": "Leek quiche", "Poulet rôti et pommes de terre au four": "Roast chicken and potatoes",
  "jeudi midi (Alice)": "Thursday lunch (Alice)", "mardi soir": "Tuesday dinner", "dimanche midi": "Sunday lunch", "samedi midi": "Saturday lunch",
  "Zoé : poulet sans sauce, avec des pâtes": "Zoe: chicken without sauce, with pasta", "Alice : moitié aux légumes": "Alice: half with vegetables",
  "Pavés de saumon": "Salmon fillets", "Courgettes": "Zucchini", "Riz basmati": "Basmati rice", "Citron": "Lemon", "Haricots rouges": "Kidney beans",
  "Tomates concassées": "Chopped tomatoes", "Poivrons": "Bell peppers", "Maïs": "Sweetcorn", "Œufs": "Eggs", "Champignons de Paris": "Mushrooms", "Salade": "Lettuce",
  "Cuisses de poulet": "Chicken legs", "Tomates": "Tomatoes", "Pâtes": "Pasta", "Pâte à pizza": "Pizza dough", "Jambon blanc": "Ham", "Mozzarella": "Mozzarella",
  "Coulis de tomate": "Tomato sauce", "Lentilles corail": "Red lentils", "Lait de coco": "Coconut milk", "Carottes": "Carrots", "Épinards": "Spinach",
  "Brocoli": "Broccoli", "Emmental râpé": "Grated cheese", "Crème fraîche": "Cream", "Dos de cabillaud": "Cod fillets", "Pommes de terre": "Potatoes",
  "Haricots verts": "Green beans", "Lait": "Milk", "Sardines": "Sardines", "Boulgour": "Bulgur", "Pois chiches": "Chickpeas", "Pain de mie": "Sandwich bread",
  "Soupe de légumes": "Vegetable soup", "Bœuf à braiser": "Stewing beef", "Tortillas": "Tortillas", "Avocats": "Avocados", "Pâte brisée": "Pastry",
  "Poireaux": "Leeks", "Poulet fermier": "Free-range chicken",
  "Fruits et légumes": "Produce", "Boucherie et poissonnerie": "Meat & Seafood", "Épicerie salée": "Pantry", "Crèmerie": "Dairy", "Charcuterie": "Deli", "Boulangerie": "Bakery",
  "Léo": "Leo", "Zoé": "Zoe",
};
const en = (s?: string) => (s === undefined ? s : EN_WORDS[s] ?? s);
const enMeal = (m: DemoMeal): DemoMeal => ({ ...m, dish: en(m.dish)!, for: m.for.map((p) => en(p)!), variant: en(m.variant), leftoversFor: en(m.leftoversFor), leftoversFrom: en(m.leftoversFrom),
  ingredients: m.ingredients.map((i) => ({ ...i, name: en(i.name)!, aisle: en(i.aisle)! })) });
EN.meals = FR.meals.map(enMeal);
EN.alternatives = FR.alternatives.map((l) => l.map(enMeal));

export const demoData = (lang: string): DemoData => (lang.startsWith("fr") ? FR : EN);

/** The shopping list of a week: ingredients merged by name, split between the store and the online basket. */
export function demoList(meals: DemoMeal[]) {
  const by = new Map<string, DemoIngredient & { count: number }>();
  for (const i of meals.flatMap((m) => m.ingredients)) {
    const x = by.get(i.name);
    if (x) { x.count++; x.price += i.price; } else by.set(i.name, { ...i, count: 1 });
  }
  return [...by.values()].sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
}
