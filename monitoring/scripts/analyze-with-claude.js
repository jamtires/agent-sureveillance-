const fs = require('fs');
const path = require('path');
const https = require('https');

const promptPath = path.join(__dirname, '../prompts/analyze-failure.md');
const contextPath = path.join(__dirname, '../output/failure-context.md');
const outputPath = path.join(__dirname, '../output/claude-analysis.md');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('[analyze-with-claude] ANTHROPIC_API_KEY manquant — analyse ignorée');
  process.exit(0);
}

const prompt = fs.existsSync(promptPath)
  ? fs.readFileSync(promptPath, 'utf8').trim()
  : 'Analyse ces échecs de tests E2E Playwright et propose des causes et solutions concrètes.';

const context = fs.existsSync(contextPath)
  ? fs.readFileSync(contextPath, 'utf8').trim()
  : '(aucun contexte d\'échec disponible)';

const userMessage = `${prompt}\n\n---\n\n${context}`;

const body = JSON.stringify({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: userMessage }]
});

const options = {
  hostname: 'api.anthropic.com',
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    let json;
    try {
      json = JSON.parse(data);
    } catch (e) {
      console.error('[analyze-with-claude] Réponse invalide:', data.slice(0, 200));
      process.exit(1);
    }

    if (json.error) {
      console.error('[analyze-with-claude] Erreur API:', json.error.message);
      process.exit(1);
    }

    const analysis = json.content?.[0]?.text || '(pas de réponse)';
    const outputMd = [
      '# Analyse Claude — JAMTIRES Monitoring',
      '',
      `**Date**: ${new Date().toISOString()}`,
      `**Modèle**: ${json.model || 'claude-sonnet-4-6'}`,
      '',
      analysis,
      ''
    ].join('\n');

    fs.writeFileSync(outputPath, outputMd);
    console.log('[analyze-with-claude] Analyse écrite dans', outputPath);

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      fs.appendFileSync(summaryPath, `\n## Analyse Claude des échecs\n\n${analysis}\n`);
      console.log('[analyze-with-claude] Résumé publié dans GitHub Actions summary');
    }
  });
});

req.on('error', (e) => {
  console.error('[analyze-with-claude] Erreur réseau:', e.message);
  process.exit(1);
});

req.write(body);
req.end();
