const fs = require('fs');
const path = require('path');

const resultsPath = path.join(__dirname, '../test-results/results.json');
const outputDir = path.join(__dirname, '../output');
const outputPath = path.join(outputDir, 'failure-context.md');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

let results;
try {
  results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
} catch (e) {
  fs.writeFileSync(outputPath, `# Failure Context\n\nImpossible de lire test-results/results.json: ${e.message}\n`);
  console.warn('[build-failure-context] Fichier résultats introuvable:', e.message);
  process.exit(0);
}

const stats = results.stats || {};
const lines = [
  '# Failure Context — JAMTIRES Monitoring',
  '',
  `**Date**: ${new Date().toISOString()}`,
  `**URL testée**: ${process.env.PLATFORM_URL || 'https://tyre-solution.be'}`,
  `**Durée totale**: ${Math.round((stats.duration || 0) / 1000)}s`,
  '',
  '## Résumé',
  '',
  `- Tests attendus : ${stats.expected || 0}`,
  `- Tests échoués : ${stats.unexpected || 0}`,
  `- Tests ignorés : ${stats.skipped || 0}`,
  '',
  '## Détail des échecs',
  '',
];

function processSuites(suites, parentTitle) {
  for (const suite of (suites || [])) {
    const suiteTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        if (test.status !== 'expected') {
          lines.push(`### ${suiteTitle} > ${spec.title}`);
          lines.push(`- **Statut**: \`${test.status}\``);
          for (const result of (test.results || [])) {
            if (result.error) {
              const msg = (result.error.message || '').replace(/\n/g, ' ').slice(0, 300);
              lines.push(`- **Erreur**: ${msg}`);
              if (result.error.stack) {
                lines.push('```');
                lines.push(result.error.stack.split('\n').slice(0, 12).join('\n'));
                lines.push('```');
              }
            }
            for (const step of (result.steps || [])) {
              if (step.error) {
                lines.push(`- **Étape échouée**: ${step.title}`);
              }
            }
          }
          lines.push('');
        }
      }
    }
    processSuites(suite.suites, suiteTitle);
  }
}

processSuites(results.suites, '');

fs.writeFileSync(outputPath, lines.join('\n'));
console.log('[build-failure-context] Contexte écrit dans', outputPath);
