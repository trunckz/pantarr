// Product families seeded per language when a household opens its pantry (editable afterwards). Keywords: start of a
// word, accents and case ignored ; with a leading space: whole word. Built from 18 months of a French household's
// receipts (first prototype).
export interface FamilySeed { category: string; name: string; aisle: string; keywords: string[]; excludes?: string[] }

const fr: FamilySeed[] = [
  { category: "Petit-déjeuner", name: "Lait", aisle: "Crèmerie et œufs", keywords: ["lait demi", "lait entier", "lait ecreme", "lait uht", "lactel", "candia", "lait bio"], excludes: ["croissance", "infantil", "guigoz", "bebe", "age", "yaourt", "laitiere", "dessert", "fromage"] },
  { category: "Petit-déjeuner", name: "Café", aisle: "Épicerie et féculents", keywords: ["cafe", "capsule", "dosette", "nescafe", " l or "] },
  { category: "Petit-déjeuner", name: "Thé et infusions", aisle: "Épicerie et féculents", keywords: ["infusion", "tisane", " the "], excludes: ["ice tea", "boisson"] },
  { category: "Petit-déjeuner", name: "Pain de mie et biscottes", aisle: "Épicerie et féculents", keywords: ["pain de mie", "biscotte", "pains au lait", "pain grille"] },
  { category: "Petit-déjeuner", name: "Céréales", aisle: "Épicerie et féculents", keywords: ["muesli", "granola", "chocapic", "special k", "flocons d avoine", "corn flakes"], excludes: ["poulet", "pane", "burger"] },
  { category: "Petit-déjeuner", name: "Confiture et pâte à tartiner", aisle: "Épicerie et féculents", keywords: ["confiture", "nutella", "pate a tartiner", " miel "], excludes: ["moutarde"] },
  { category: "Petit-déjeuner", name: "Jus de fruits", aisle: "Boissons", keywords: ["jus d orange", "pur jus", "jus de pomme", "joker", "tropicana", "pago"], excludes: ["eau de source"] },
  { category: "Petit-déjeuner", name: "Beurre", aisle: "Crèmerie et œufs", keywords: [" beurre"], excludes: ["cacahuete", "petit beurre", "beurre de ", "pur beurre", "pate", "brioche", "biscuit", "sable", "galette"] },
  { category: "Goûter", name: "Compotes et purées de fruits", aisle: "Épicerie et féculents", keywords: ["compote", "puree de pomme", "pom comp", "gourde", "andros", "pommette"], excludes: ["nouveau ne", "carepad", "lingette", "maxi carre", "coton"] },
  { category: "Goûter", name: "Petits pots bébé", aisle: "Épicerie et féculents", keywords: ["nes 6m", "nes 8m", "nes 12m", "nestle", "petit pot", "bledina", "hipp", "mijote"] },
  { category: "Goûter", name: "Yaourts et desserts lactés", aisle: "Crèmerie et œufs", keywords: ["yaourt", "danette", "viennois", "creme dessert", "petit suisse", "petits suisses", "skyr", "fromage blanc", "yop", "liegeois"] },
  { category: "Goûter", name: "Gâteaux et biscuits", aisle: "Épicerie et féculents", keywords: ["biscuit", "gateau", "madeleine", "petit beurre", "prince", "belin croust", "hello kango", "st michel", "pitch", "brossard", "kinder", "palmito"], excludes: ["aperitif", "curly"] },
  { category: "Boissons", name: "Eau", aisle: "Boissons", keywords: ["eau minerale", "eau de source", "cristaline", "perrier", "source des pins", "evian", "vittel", "volvic", "native eau"] },
  { category: "Bébé", name: "Couches", aisle: "Hygiène et entretien", keywords: ["couche", "pampers"], excludes: ["coton", "lingette", "pants", "culotte"] },
  { category: "Bébé", name: "Couches-culottes", aisle: "Hygiène et entretien", keywords: ["pants", "culotte"], excludes: ["coton", "lingette"] },
  { category: "Bébé", name: "Lait de croissance", aisle: "Épicerie et féculents", keywords: ["guigoz", "lait de croissance", "lait infantil", "optipro", "gallia", "nidal", "lait bebe"] },
  { category: "Bébé", name: "Lingettes bébé", aisle: "Hygiène et entretien", keywords: ["lingette"], excludes: ["wc", "nettoy", "sol"] },
  { category: "Bébé", name: "Cotons", aisle: "Hygiène et entretien", keywords: ["carepad", "coton", "maxi carre"] },
  { category: "Maison et linge", name: "Lessive", aisle: "Hygiène et entretien", keywords: ["lessive", "ariel", " skip ", "le chat", "x tra", " omo "] },
  { category: "Maison et linge", name: "Adoucissant", aisle: "Hygiène et entretien", keywords: ["adoucissant", "soupline", "lenor"] },
  { category: "Maison et linge", name: "Liquide vaisselle", aisle: "Hygiène et entretien", keywords: ["liquide vaisselle", "paic"] },
  { category: "Maison et linge", name: "Tablettes lave-vaisselle", aisle: "Hygiène et entretien", keywords: ["lave vaisselle", "finish", "tablettes lave"], excludes: ["liquide"] },
  { category: "Maison et linge", name: "Papier toilette", aisle: "Hygiène et entretien", keywords: ["papier toilette", "papier hyg", "moltonel"], excludes: ["mouchoir", "essuie"] },
  { category: "Maison et linge", name: "Essuie-tout", aisle: "Hygiène et entretien", keywords: ["essuie tout", "sopalin", "okay "] },
  { category: "Maison et linge", name: "Sacs poubelle", aisle: "Hygiène et entretien", keywords: ["sac poubelle", "sacs poubelle", "poubelle"] },
  { category: "Maison et linge", name: "Éponges", aisle: "Hygiène et entretien", keywords: ["eponge"] },
  { category: "Maison et linge", name: "Nettoyants", aisle: "Hygiène et entretien", keywords: ["nettoyant", "javel", "st marc", "ajax", "mr propre", " cif ", "destop", "vinaigre blanc", " wc "] },
  { category: "Hygiène", name: "Mouchoirs", aisle: "Hygiène et entretien", keywords: ["mouchoir", "kleenex"] },
  { category: "Hygiène", name: "Dentifrice", aisle: "Hygiène et entretien", keywords: ["dentifrice"] },
  { category: "Hygiène", name: "Gel douche et shampoing", aisle: "Hygiène et entretien", keywords: ["gel douche", "shampo", "savon"], excludes: ["lessive", "vaisselle", "noir"] },
];

const en: FamilySeed[] = [
  { category: "Breakfast", name: "Milk", aisle: "Dairy & Eggs", keywords: ["milk"], excludes: ["formula", "baby", "chocolate", "yogurt"] },
  { category: "Breakfast", name: "Coffee", aisle: "Pantry", keywords: ["coffee", "capsule", "pod", "nescafe"] },
  { category: "Breakfast", name: "Tea", aisle: "Pantry", keywords: [" tea ", "herbal tea", "infusion"], excludes: ["iced tea"] },
  { category: "Breakfast", name: "Bread", aisle: "Bakery", keywords: ["bread", "sandwich loaf", "bagel", "english muffin"] },
  { category: "Breakfast", name: "Cereal", aisle: "Pantry", keywords: ["cereal", "granola", "muesli", "oats", "cornflakes", "cheerios"] },
  { category: "Breakfast", name: "Jam and spreads", aisle: "Pantry", keywords: ["jam", "jelly", "peanut butter", "nutella", "honey"] },
  { category: "Breakfast", name: "Juice", aisle: "Beverages", keywords: ["juice"] },
  { category: "Breakfast", name: "Butter", aisle: "Dairy & Eggs", keywords: [" butter"], excludes: ["peanut", "cookie", "pastry", "almond butter"] },
  { category: "Snacks", name: "Fruit purees", aisle: "Pantry", keywords: ["applesauce", "fruit puree", "pouch"] },
  { category: "Snacks", name: "Yogurt and desserts", aisle: "Dairy & Eggs", keywords: ["yogurt", "yoghurt", "pudding", "skyr"] },
  { category: "Snacks", name: "Cookies and crackers", aisle: "Pantry", keywords: ["cookie", "biscuit", "cracker", "goldfish"] },
  { category: "Beverages", name: "Water", aisle: "Beverages", keywords: ["water", "sparkling", "seltzer"] },
  { category: "Baby", name: "Diapers", aisle: "Household", keywords: ["diaper", "pampers", "huggies"], excludes: ["wipes", "pants"] },
  { category: "Baby", name: "Training pants", aisle: "Household", keywords: ["training pants", "pull ups", "pants"] },
  { category: "Baby", name: "Formula", aisle: "Pantry", keywords: ["formula", "similac", "enfamil"] },
  { category: "Baby", name: "Baby wipes", aisle: "Household", keywords: ["wipes"], excludes: ["disinfecting"] },
  { category: "Home & laundry", name: "Laundry detergent", aisle: "Household", keywords: ["detergent", "laundry", "tide", "persil"] },
  { category: "Home & laundry", name: "Fabric softener", aisle: "Household", keywords: ["softener", "downy"] },
  { category: "Home & laundry", name: "Dish soap", aisle: "Household", keywords: ["dish soap", "dawn"] },
  { category: "Home & laundry", name: "Dishwasher tabs", aisle: "Household", keywords: ["dishwasher", "cascade", "finish"] },
  { category: "Home & laundry", name: "Toilet paper", aisle: "Household", keywords: ["toilet paper", "bath tissue", "charmin"] },
  { category: "Home & laundry", name: "Paper towels", aisle: "Household", keywords: ["paper towel", "bounty"] },
  { category: "Home & laundry", name: "Trash bags", aisle: "Household", keywords: ["trash bag", "garbage bag", "bin bag"] },
  { category: "Home & laundry", name: "Sponges", aisle: "Household", keywords: ["sponge", "scrub"] },
  { category: "Home & laundry", name: "Cleaners", aisle: "Household", keywords: ["cleaner", "bleach", "lysol", "disinfect"] },
  { category: "Personal care", name: "Tissues", aisle: "Household", keywords: ["tissue", "kleenex"], excludes: ["bath tissue"] },
  { category: "Personal care", name: "Toothpaste", aisle: "Household", keywords: ["toothpaste", "colgate", "crest"] },
  { category: "Personal care", name: "Shower gel and shampoo", aisle: "Household", keywords: ["shower gel", "body wash", "shampoo", "soap"], excludes: ["dish", "laundry", "detergent"] },
];

export const FAMILY_SEEDS: Record<string, FamilySeed[]> = { fr, en };

/** Fresh food (in the prompt: products bought most): aisles of fresh produce, meat and fish, dairy, bakery. */
export const FRESH_WORDS: Record<string, { words: string[]; not: string[] }> = {
  fr: {
    words: ["salade", "tomate", "pomme", "banane", "carotte", "courgette", "poireau", "oignon", "citron", "orange", "clementine", "avocat", "concombre", "poivron", "champignon", "kiwi", "poire", "raisin", "fraise", "melon", "patate", "echalote", "aubergine", "brocoli", "chou", "epinard", "potiron", "potimarron", "butternut", "radis", "mangue", "myrtille", "framboise",
      "poulet", "boeuf", "steak", "viande", "porc", "veau", "agneau", "dinde", "canard", "magret", "saucisse", "chipo", "lardon", "jambon", "saumon", "cabillaud", "colin", "limande", "poisson", "crevette", "merlu", "escalope", "filet", "cordon bleu",
      "lait", "beurre", "fromage", "yaourt", "creme", "oeuf", "emmental", "mozza", "comte", "gruyere", "chevre", "feta", "raclette", "parmesan", "pain", "baguette"],
    not: ["compote", "puree de pomme", "pommette", "pom comp", "jus", "citronnad", "cristaline", "joker", "nes ", "petit pot", "pain de mie", "harrys", "gourde", "chips", "biscuit"],
  },
  en: {
    words: ["lettuce", "salad", "tomato", "apple", "banana", "carrot", "zucchini", "leek", "onion", "lemon", "orange", "avocado", "cucumber", "pepper", "mushroom", "berries", "strawberr", "melon", "potato", "spinach", "broccoli",
      "chicken", "beef", "steak", "pork", "lamb", "turkey", "sausage", "bacon", "ham", "salmon", "cod", "fish", "shrimp", "milk", "butter", "cheese", "yogurt", "cream", "egg", "bread", "baguette"],
    not: ["juice", "sauce", "chips", "cookie", "applesauce", "pouch"],
  },
};
