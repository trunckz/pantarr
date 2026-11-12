import { recipeAddress, scaleNote } from "./recipes.service";

describe("recipe import", () => {
  it("fixes the Jow share link and cleans Jow addresses", () => {
    expect(recipeAddress("https://app.jow.com/EC0U?action=recipe&recipeId=5cc1de98ebc1087808f405fa&source=jow")).toBe("https://jow.fr/recipes/5cc1de98ebc1087808f405fa");
    expect(recipeAddress("https://jow.fr/recipes/poulet-gingembre-855pki?coversCount=4")).toBe("https://jow.fr/recipes/poulet-gingembre-855pki");
    expect(recipeAddress("https://www.750g.com/poulet-chasseur-r5398.htm")).toBe("https://www.750g.com/poulet-chasseur-r5398.htm");
  });
  it("scales the leading quantity of Jow ingredients", () => {
    expect(["60 g Riz", "1/2 gou. Ail", "1,5 càs Huile", "Sel", "½ Citron"].map((n) => scaleNote(n, 4))).toEqual(["240 g Riz", "2 gou. Ail", "6 càs Huile", "Sel", "2 Citron"]);
    expect(scaleNote("0.5 cup rice", 3, "en")).toBe("1.5 cup rice");
  });
});
