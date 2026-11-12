// Popular recipe sites where the browser extension shows its « Add to Pantarr » button: their address, and what the
// address of one of their recipes looks like (to find the recipes listed on a page: favourites, a notebook, a search).
// The recipe itself is read by Mealie's importer (schema.org data of the page).
export interface RecipeSite { name: string; origins: string[]; recipe: string }

export const RECIPE_SITES: RecipeSite[] = [
  { name: "Marmiton", origins: ["https://www.marmiton.org"], recipe: "/recettes/recette_[^/?#]+\\.aspx" },
  { name: "750g", origins: ["https://www.750g.com"], recipe: "/[^/?#]+-r\\d+\\.htm" },
  { name: "Cuisine AZ", origins: ["https://www.cuisineaz.com"], recipe: "/recettes/[^/?#]+-\\d+\\.aspx" },
  { name: "Jow", origins: ["https://jow.fr", "https://app.jow.com"], recipe: "/recipes/[^/?#]+" },
  { name: "Ptitchef", origins: ["https://www.ptitchef.com"], recipe: "/recettes/[^/?#]+/[^/?#]+" },
  { name: "Cuisine Actuelle", origins: ["https://www.cuisineactuelle.fr"], recipe: "/recettes/[^/?#]+" },
  { name: "Journal des Femmes Cuisine", origins: ["https://cuisine.journaldesfemmes.fr"], recipe: "/recette/\\d+-[^/?#]+" },
  { name: "Cookomix", origins: ["https://www.cookomix.com"], recipe: "/recettes/[^/?#]+/?$" },
  { name: "HelloFresh", origins: ["https://www.hellofresh.fr", "https://www.hellofresh.be", "https://www.hellofresh.com", "https://www.hellofresh.co.uk"], recipe: "/recipes/[^/?#]+-[0-9a-f]{24}" },
  { name: "Ricardo", origins: ["https://www.ricardocuisine.com"], recipe: "/(recettes|en/recipes)/\\d+-[^/?#]+" },
  { name: "Allrecipes", origins: ["https://www.allrecipes.com"], recipe: "/recipe/\\d+/[^/?#]*" },
  { name: "BBC Good Food", origins: ["https://www.bbcgoodfood.com"], recipe: "/recipes/[^/?#]+" },
  { name: "Chefkoch", origins: ["https://www.chefkoch.de"], recipe: "/rezepte/\\d+/[^/?#]+" },
];

export const recipeOrigins = () => RECIPE_SITES.flatMap((s) => s.origins);
