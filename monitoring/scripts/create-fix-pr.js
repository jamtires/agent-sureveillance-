'use strict';
const { execSync } = require('child_process');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ── Config ─────────────────────────────────────────────────────────────────
const GH_PAT        = process.env.GH_PAT;
const REPO          = process.env.GITHUB_REPOSITORY || 'jamtires/agent-sureveillance-';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ROOT          = path.resolve(__dirname, '../..');

const contextPath  = path.join(__dirname, '../output/failure-context.md');
const analysisPath = path.join(__dirname, '../output/claude-analysis.md');
const fixPromptPath = path.join(__dirname, '../prompts/propose-fix.md');

// ── Garde ──────────────────────────────────────────────────────────────────
if (!GH_PAT) {
  console.warn('[create-fix-pr] GH_PAT absent — PR ignorée');
  process.exit(0);
}

// ── Sécurité : seuls les fichiers monitoring/ sont autorisés ───────────────
function isSafePath(p) {
  const n = path.normalize(p).replace(/\\/g, '/');
  return (
    n.startsWith('monitoring/') &&
    !n.includes('..') &&
    !n.startsWith('monitoring/output/') &&
    !n.includes('jamtires-claude-test1.html')  // défense en profondeur
  );
}

// ── Helpers HTTP ───────────────────────────────────────────────────────────
function httpPost(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path: urlPath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } },
      res => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ _raw: buf }); } });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function ghAPI(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}${endpoint}`,
      method,
      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'JAMTIRES-Monitoring',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ _raw: buf }); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Git helper ─────────────────────────────────────────────────────────────
function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', cwd: ROOT }).trim();
}

// ── Appel Claude pour proposition de correction ────────────────────────────
async function getFixProposal(ctx, anal) {
  if (!ANTHROPIC_KEY) return null;

  const prompt = fs.existsSync(fixPromptPath)
    ? fs.readFileSync(fixPromptPath, 'utf8').trim()
    : 'Propose une correction au format JSON strict.';

  const res = await httpPost(
    'api.anthropic.com', '/v1/messages',
    { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${prompt}\n\n---\n\n${ctx}\n\n---\n\n${anal}` }]
    }
  );

  const text = res.content?.[0]?.text || '';
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return { auto_fixable: false, files: [], description: text.slice(0, 400) };
  try { return JSON.parse(m[1]); }
  catch { return { auto_fixable: false, files: [], description: 'Réponse JSON invalide' }; }
}

// ── Corps de la Pull Request ───────────────────────────────────────────────
function buildPRBody(ctx, anal, fix, applied) {
  const lines = [
    '## 🚨 Rapport automatique — JAMTIRES Monitoring',
    '',
    '> Cette PR a été créée automatiquement après un échec des tests Playwright.',
    '> **Merge uniquement si les tests sont** ✅ **verts** (onglet Checks ci-dessus).',
    '',
    '---',
    '## 📋 Ce qui a échoué',
    '',
    '```',
    ctx.split('\n').slice(0, 30).join('\n'),
    '```',
    '',
    '---',
    '## 🤖 Analyse Claude',
    '',
    anal,
    '',
    '---',
  ];

  if (applied.length > 0) {
    lines.push('## ✅ Correction automatique appliquée');
    lines.push('');
    lines.push('Fichiers modifiés (uniquement dans `monitoring/`) :');
    lines.push('');
    for (const f of applied) lines.push(`- \`${f.path}\` — ${f.description || 'corrigé'}`);
    lines.push('');
    lines.push('> ✅ `jamtires-claude-test1.html` (ton site) n\'a **pas** été touché.');
    lines.push('');
  } else if (fix?.app_fix_needed) {
    lines.push('## ⚠️ Problème dans le site — action manuelle nécessaire');
    lines.push('');
    lines.push('Le problème est dans le site lui-même. Je n\'ai **pas** touché `jamtires-claude-test1.html`.');
    lines.push('Voici ce qu\'il faudrait corriger :');
    lines.push('');
    lines.push(fix.app_fix_description || fix.description || '(voir analyse ci-dessus)');
    lines.push('');
  } else {
    lines.push('## ℹ️ Pas de correction de code automatique');
    lines.push('');
    lines.push(fix?.description || 'Voir l\'analyse Claude ci-dessus.');
    lines.push('');
  }

  lines.push('---');
  lines.push('## ✅ Que faire maintenant ?');
  lines.push('');
  lines.push('1. Regarde l\'onglet **Checks** en haut de cette PR');
  lines.push('2. Si tout est **🟢 vert** → clique **Merge pull request**');
  lines.push('3. Si c\'est encore **🔴 rouge** → ne merge pas, le problème n\'est pas résolu');
  lines.push('');
  lines.push('---');
  lines.push('*Généré automatiquement par JAMTIRES Monitoring*');

  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const ctx  = fs.existsSync(contextPath)  ? fs.readFileSync(contextPath,  'utf8') : '(contexte indisponible)';
  const anal = fs.existsSync(analysisPath) ? fs.readFileSync(analysisPath, 'utf8') : '(analyse indisponible)';

  console.log('[create-fix-pr] Demande de proposition de correction à Claude...');
  const fix = await getFixProposal(ctx, anal);

  // Filtrer : uniquement les fichiers dans monitoring/ (jamais jamtires-claude-test1.html)
  const safeFiles = (fix?.files || []).filter(f => {
    if (!isSafePath(f.path)) {
      console.warn(`[create-fix-pr] REFUSÉ — hors monitoring/ : ${f.path}`);
      return false;
    }
    return true;
  });

  // Nom de branche unique
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const branch = `fix/${ts}`;

  // Configuration git
  git('config user.email "monitoring@jamtires.bot"');
  git('config user.name "JAMTIRES Monitoring"');
  git(`checkout -b ${branch}`);

  // Appliquer les corrections sûres
  const applied = [];
  if (fix?.auto_fixable && safeFiles.length > 0) {
    for (const f of safeFiles) {
      const full = path.join(ROOT, f.path);
      if (!fs.existsSync(full)) {
        console.warn(`[create-fix-pr] Fichier absent: ${f.path}`);
        continue;
      }
      const src = fs.readFileSync(full, 'utf8');
      if (!f.old_text || !src.includes(f.old_text)) {
        console.warn(`[create-fix-pr] Texte non trouvé dans ${f.path} — ignoré`);
        continue;
      }
      fs.writeFileSync(full, src.replace(f.old_text, f.new_text || ''));
      git(`add ${f.path}`);
      applied.push(f);
      console.log(`[create-fix-pr] Corrigé : ${f.path}`);
    }
    if (applied.length > 0) {
      git(`commit -m "fix: correction automatique Playwright [${ts}]"`);
    }
  }

  // Push via PAT (nécessaire pour déclencher fix-validation.yml)
  git(`remote set-url origin https://x-access-token:${GH_PAT}@github.com/${REPO}.git`);
  git(`push origin ${branch}`);
  console.log(`[create-fix-pr] Branche ${branch} poussée`);

  // Créer la Pull Request
  const pr = await ghAPI('POST', '/pulls', {
    title: `🔧 Fix monitoring — ${ts}`,
    head: branch,
    base: 'main',
    body: buildPRBody(ctx, anal, fix, applied),
  });

  if (pr.html_url) {
    console.log(`[create-fix-pr] ✅ PR créée : ${pr.html_url}`);
  } else {
    console.error('[create-fix-pr] Erreur création PR :', JSON.stringify(pr).slice(0, 300));
  }
}

main().catch(e => {
  console.error('[create-fix-pr] Erreur fatale :', e.message);
  process.exit(0); // exit 0 pour ne pas bloquer le workflow parent
});
