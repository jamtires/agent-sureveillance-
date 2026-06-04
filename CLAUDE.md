# JAMTIRES — Tyre-Solution Platform

## Fichier principal
`jamtires-claude-test1.html` — application complète en un seul fichier HTML (~800KB)

## Infrastructure
- **Base de données** : Supabase (`duodvmjgezilpjzxlbnj.supabase.co`)
- **Hébergement** : Netlify
- **Auth** : Supabase Auth (email/password)
- **Edge Functions** : `create-user`, `delete-user`, `bright-responder`, `billit-proxy`, `claude-proxy`, `ta-proxy`

## Tables Supabase critiques
| Table | Usage | RLS |
|---|---|---|
| `clients` | Profils utilisateurs + rôles | Oui |
| `stock` | Pneus (Matching / Export) | Oui |
| `commandes` | Commandes clients | Oui |
| `settings` | Config globale | Admin seulement en écriture |
| `login_events` | Historique connexions | Tous authentifiés peuvent INSERT |
| `groupes` / `sites` | Structure clients | Oui |
| `tournees` / `tournee_stops` | Tournées chauffeurs | Oui |
| `factures` | Facturation | Oui |
| `demandes` | Demandes dimensions | Oui |
| `ramassages` / `livraisons` | Logistique | Oui |

## Rôles utilisateurs
- `admin_jamtires` — accès total (jamtires@gmail.com)
- `admin_groupe` — gestion d'un groupe de clients
- `magasinier` — encodage pneus
- `chauffeur` — tournées livraison
- `site` — client standard (commandes, stock)

## Variables globales critiques (JS)
```
currentUser      — utilisateur connecté
stockData        — tableau des pneus en stock
clientsData      — tableau des clients
commandesData    — commandes
groupeSites      — mapping groupes → sites
demandesData     — demandes dimensions
```

## Règles OBLIGATOIRES pour tout nouveau code

### 1. Toujours try/catch sur les appels Supabase
```javascript
// ✅ CORRECT
try {
  const {data, error} = await sb.from('table').select('*');
  if(error) throw error;
} catch(e) {
  console.warn('[table]:', e.message);
  _showToast('Erreur — ' + e.message, '#b45309');
}

// ❌ INTERDIT
const {data} = await sb.from('table').select('*');
```

### 2. Toujours finally sur les boutons désactivés
```javascript
btn.disabled = true;
try {
  await operation();
} catch(e) {
  _showToast('Erreur: ' + e.message, '#b45309');
} finally {
  btn.disabled = false; // TOUJOURS réactivé
}
```

### 3. Ne jamais bloquer loadAllData
Chaque table dans son propre try/catch indépendant.
Une table qui échoue ne doit pas empêcher les autres de charger.

### 4. Connexions simultanées
Ne jamais faire read-modify-write sur une ligne partagée.
Utiliser des lignes individuelles (comme `login_events`).

### 5. Modifications clients/stock
Après insert/update/delete → recharger depuis Supabase (pas juste mettre à jour le tableau local).

## Fonctions utilitaires disponibles
```javascript
_showToast(html, couleur, dureeMs)  // Toast notification
escH(str)                            // Échapper HTML
fixEnc(str)                          // Corriger encodage
parseDim(ref)                        // Parser dimension pneu
t('clé.i18n')                        // Traduction FR/NL/EN
loadAllData()                        // Recharger toutes les données
sbQuery(fn, retries, delay)          // Wrapper Supabase avec retry
```

## Bugs connus corrigés (ne pas réintroduire)
- `editClientModal` / `saveEditClient` : login passé comme string avec guillemets simples, recherche par `String(x.login)===String(i)`
- `loadAllData` : requêtes indépendantes par table (chacune dans son try/catch)
- `checkSession` : retry 3x avant de déconnecter, jamais de signOut sur erreur réseau
- `trackLogin` : écrit dans `login_events` (pas `settings` — RLS bloque les non-admins)
- Nouveau client : gère `duplicate key` en redirigeant au lieu d'afficher erreur
- Race condition historique connexions : une ligne par événement dans `login_events`

## Session & Auth
- `autoRefreshToken: true` activé
- Keepalive Supabase toutes les 4 minutes
- `onAuthStateChange` écoute les expirations de token
- `checkSession` : retry 3x avec délai 1.5s si Supabase lent au démarrage

## À faire (futures améliorations)
- Migrer vers Next.js + composants séparés pour la maintenabilité
- Ajouter tests automatiques des fonctions critiques
- Monitoring Supabase (alertes si downtime)
