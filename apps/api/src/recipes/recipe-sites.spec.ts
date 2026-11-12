import { extensionFiles } from "../extension/extension";
import { RECIPE_SITES, recipeOrigins } from "./recipe-sites";
import { allowedOrigin, bridgeCors } from "../app.setup";

const recipeOf = (origin: string, path: string) => {
  const s = RECIPE_SITES.find((x) => x.origins.includes(origin))!;
  return new RegExp(`^${s.recipe}`).test(path);
};

describe("recipe sites of the extension", () => {
  it("tells the address of a recipe from the other pages of the site", () => {
    expect(recipeOf("https://www.marmiton.org", "/recettes/recette_gratin-dauphinois_12345.aspx")).toBe(true);
    expect(recipeOf("https://www.marmiton.org", "/recettes/index/categorie/plat-principal")).toBe(false);
    expect(recipeOf("https://www.750g.com", "/gratin-dauphinois-r12345.htm")).toBe(true);
    expect(recipeOf("https://www.750g.com", "/recettes_plats.htm")).toBe(false);
    expect(recipeOf("https://www.cuisineaz.com", "/recettes/gratin-dauphinois-1234.aspx")).toBe(true);
    expect(recipeOf("https://jow.fr", "/recipes/gratin-dauphinois-5cc1de98ebc1087808f405fa")).toBe(true);
    expect(recipeOf("https://www.allrecipes.com", "/recipe/12345/chicken-curry/")).toBe(true);
    expect(recipeOf("https://www.chefkoch.de", "/rezepte/123456789/Kartoffelgratin.html")).toBe(true);
  });

  it("runs its script on these sites only, in the extension's own world", () => {
    const files = extensionFiles("https://pantarr.example.com");
    const manifest = JSON.parse(files["manifest.json"].toString());
    const cs = manifest.content_scripts.find((c: { js: string[] }) => c.js[0] === "recipes.js");
    expect(cs.world).toBeUndefined();   // isolated: the page's content security policy does not stop its calls
    expect(cs.matches).toContain("https://www.marmiton.org/*");
    expect(manifest.host_permissions).toContain("https://www.marmiton.org/*");
    const js = files["recipes.js"].toString();
    expect(js).not.toContain("const SITES = __RECIPE_SITES__");
    expect(js).toContain('"recipe":"/recettes/[^/?#]+/?$"');   // « $ » kept as it is
    expect(() => new Function(js)).not.toThrow();
  });

  it("lets the recipe sites call the recipe routes of the bridge only", () => {
    const origin = recipeOrigins()[0];
    expect(allowedOrigin(origin)).toBe(false);   // not a store
    const headers = (path: string) => {
      const set: Record<string, string> = {};
      bridgeCors({ path, method: "GET", headers: { origin } } as never, { setHeader: (k: string, v: string) => { set[k] = v; } } as never, () => undefined);
      return set;
    };
    expect(headers("/api/v1/bridge/recipes/import")["Access-Control-Allow-Origin"]).toBe(origin);
    expect(headers("/api/v1/bridge/intermarche-cart/cart")["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
