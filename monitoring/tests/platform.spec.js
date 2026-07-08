const { test, expect } = require('@playwright/test');

// Collecteur d'erreurs JavaScript non gérées (exceptions "uncaught").
// Ce type d'erreur révèle un bug de code, pas un simple avertissement réseau.
function collecteurErreursJS(page) {
  const erreurs = [];
  page.on('pageerror', (err) => {
    erreurs.push(err && err.message ? err.message : String(err));
  });
  return erreurs;
}

test.describe('Surveillance — tyre-solution.be', () => {

  test('La page répond avec un statut HTTP valide', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBeLessThan(400);
  });

  test('Le titre de la page est correct', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/JAMTIRES/i);
  });

  test('Les dépendances CDN critiques chargent sans erreur', async ({ page }) => {
    const cdnErrors = [];
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.includes('cdn.jsdelivr.net') || url.includes('supabase.co')) {
        cdnErrors.push(url);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(cdnErrors, `CDN en échec : ${cdnErrors.join(', ')}`).toHaveLength(0);
  });

  test("Aucun message d'erreur bloquant n'est visible au chargement", async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const erreurChargement = page.getByText('Erreur de chargement', { exact: false });
    await expect(erreurChargement).not.toBeVisible();
  });

  test("L'application affiche une interface après initialisation JS", async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Après init JS, soit le login form, soit le dashboard doit être visible.
    // #tm-email peut rester caché dans son conteneur si une session existe déjà.
    const hasLogin    = await page.locator('#tm-email').isVisible();
    const hasDashboard = await page.locator('.topbar').isVisible();

    expect(
      hasLogin || hasDashboard,
      "Ni le formulaire de connexion ni le dashboard ne sont visibles — l'app ne répond pas"
    ).toBe(true);
  });

  test("Aucune erreur JavaScript non gérée au chargement", async ({ page }) => {
    const erreurs = collecteurErreursJS(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Petit délai pour laisser les scripts d'initialisation asynchrones s'exécuter.
    await page.waitForTimeout(1500);

    expect(
      erreurs,
      `Erreur(s) JavaScript détectée(s) au chargement :\n- ${erreurs.join('\n- ')}`
    ).toHaveLength(0);
  });

});
