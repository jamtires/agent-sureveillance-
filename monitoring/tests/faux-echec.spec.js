// FAUX TEST — À SUPPRIMER après validation de la chaîne monitoring
// But : provoquer un échec Playwright pour tester build-failure-context + analyze-with-claude
const { test, expect } = require('@playwright/test');

test.describe('[TEST TEMPORAIRE] Validation chaîne monitoring → Claude', () => {

  test('Élément inexistant — échec garanti pour valider le pipeline', async ({ page }) => {
    await page.goto(process.env.PLATFORM_URL || 'https://tyre-solution.be');

    // Cet élément n'existe pas sur la page — timeout court intentionnel
    await expect(
      page.locator('#validation-monitoring-pipeline-element-inexistant'),
      'Faux échec intentionnel : valide que la chaîne failure-context → Claude fonctionne'
    ).toBeVisible({ timeout: 3000 });
  });

});
