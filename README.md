# Hibi

PWA de saisie quotidienne pour le Habit Tracker : coucher, sommeil, dev, lecture, Off et note, en moins de 15 s, réseau ou pas.
Mono-utilisateur, auto-hébergée sur le VPS derrière le Caddy existant.

## Structure

| Dossier | Rôle |
| --- | --- |
| `packages/domain` | Règles de calcul en fonctions pures TypeScript (score, séries, score 7 j, dates Europe/Paris, CSV, validation). Partagé par le front et le back. |
| `apps/api` | Fastify + better-sqlite3 : auth, synchro, réglages, export CSV, sauvegardes ; sert aussi la PWA buildée. |
| `apps/web` | Vite + React + vite-plugin-pwa + Dexie (IndexedDB) : saisie, historique 30 j, réglages. |
| `e2e` | Tests Playwright, dont le scénario mode avion. |
| `assets/3d` | Modèles Blender de l'avatar « Pousse », des pets et des cosmétiques ; le script génère aussi les calques `apps/web/public/avatar/*.webp`. |

Le score n'est jamais stocké : il est recalculé depuis les saisies et les réglages. Changer un poids met donc tout l'historique à jour.

## Avatar, pets et cosmétiques

L'écran `#/avatar` personnalise l'avatar : couleur du corps, un objet par emplacement (tête, visage, cou, main, dos), un pet et son accessoire. Le catalogue et les règles de compatibilité sont dans `packages/domain/src/avatar.ts` : un seul objet par emplacement, un ordre d'empilement fixe, une variante de couleur automatique quand un objet se confondrait avec le corps, et tout accessoire de pet sans pet est retiré. Le choix est enregistré en local tout de suite (hors ligne compris), puis synchronisé ; le plus récent gagne.

**L'avatar est utile** : sur l'écran de saisie, son visage suit le score du jour (il dort sous 40 % ou un jour Off, il est content à partir de 80 %, il saute à 100 %) ; sa personnalisation s'ouvre depuis l'icône pousse en haut de l'écran. Les couleurs, objets, pets et accessoires se gagnent avec l'historique (`packages/domain/src/unlocks.ts`) : journées saisies, bonnes journées d'affilée (≥ 75 %) et journées parfaites. Comme le score, la progression est recalculée depuis les saisies, rien n'est acheté ni stocké côté serveur ; un objet gagné reste acquis même si un changement de poids fait baisser un score après coup. Un point rouge sur l'icône pousse signale les nouveautés.

Les images viennent de Blender : un calque transparent par pièce, même caméra, le corps en masque pour que chaque objet passe devant ou derrière comme en 3D. Un calque par pièce, et trois visages (endormi, neutre, content) par couleur de corps. Pour les régénérer après avoir touché aux modèles :

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P assets/3d/build_hibi_3d.py
```

Le test `apps/api` vérifie que chaque calque du catalogue existe ; le test du domaine passe en revue les ~19 000 combinaisons.

## Rappel du soir

Réglages → « Rappel du soir » abonne l'appareil aux notifications Web Push. L'heure (12:00–23:59, heure de Paris) est commune à tous les appareils. Chaque minute, l'API vérifie si l'heure est passée : une fois par jour au plus, elle envoie « Il manque dev et lecture. » (ou « Ta journée n'est pas encore saisie ») s'il manque quelque chose dans la journée en cours, et rien si elle est complète ou Off. Un rappel manqué pendant un redémarrage part dès le retour du conteneur, le jour même.

- Les clés VAPID sont créées au premier démarrage et stockées dans la base (table `vapid`) : elles suivent les sauvegardes. Les régénérer désabonne tous les appareils.
- Sur iPhone, le push n'existe que dans l'app ajoutée à l'écran d'accueil (iOS 16.4+).
- `PUSH_SUBJECT` (optionnel) : le contact `mailto:` ou `https:` transmis aux services de push. Apple refuse `localhost`.
- Les abonnements expirés (404/410) sont retirés automatiquement ; « Envoyer un test » vérifie la chaîne complète.

## Développement

Prérequis : Node 22 (`.nvmrc` ; les versions plus récentes n'ont pas de binaire précompilé pour better-sqlite3), pnpm via `corepack enable`, et `node-gyp` en global (`npm install -g node-gyp`), car better-sqlite3 se compile à l'installation.

```bash
pnpm install
```

```bash
mkdir -p .data && pnpm -s hash-password > .data/hash
```

```bash
ADMIN_USER=gabin ADMIN_PASSWORD_HASH_FILE=../../.data/hash DATA_DIR=../../.data pnpm dev:api
```

```bash
pnpm dev:web
```

Le serveur Vite (port 5173) redirige `/api` vers l'API (port 3000). Hors production, le cookie de session n'est pas `Secure`, pour fonctionner en HTTP local.

## Tests

```bash
pnpm typecheck && pnpm test
```

```bash
pnpm build && pnpm e2e
```

- `packages/domain` : les 6 cas de référence du cahier des charges (§4), plus les cas limites (minuit, poids, jour non saisi, heure d'été).
- `apps/api` : blocage par IP au 6e essai, 401 sans session, cookie, upsert rejouable, sauvegarde et restauration.
- `e2e` : saisie en mode avion, app rechargée hors ligne par le Service Worker, synchro unique au retour du réseau.

## Déploiement sur le VPS

1. Cloner le repo dans `~/habit-tracker`.
2. Générer le hash du mot de passe (argon2id, paramètres OWASP), lu sur stdin sans écho :

   ```bash
   mkdir -p secrets && pnpm -s hash-password > secrets/admin_password_hash && chmod 600 secrets/admin_password_hash
   ```

   Sans Node sur le VPS, on peut le générer ailleurs et copier le fichier.
3. Créer `.env` avec `ADMIN_USER=gabin`, plus `ALERT_WEBHOOK_URL=` si le webhook n8n d'alerte existe, et `PUSH_SUBJECT=mailto:…` si besoin (rappel du soir).
4. Lancer :

   ```bash
   docker compose up -d --build
   ```

5. Ajouter `caddy-sites/tracker.caddy` :

   ```
   tracker.gabin-hallosserie.com {
     reverse_proxy habit-tracker:3000
   }
   ```

   puis valider avant de redémarrer, pour ne pas couper apple-mcp (adapter le nom du conteneur Caddy) :

   ```bash
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile
   ```

   ```bash
   mcp restart caddy
   ```

Aucun port n'est publié : seul Caddy atteint le conteneur, via le réseau `proxy`. Le conteneur tourne en utilisateur 1000, `read_only`, `cap_drop: ALL`, `no-new-privileges`.

## Sauvegardes et restauration

L'app copie la base au démarrage puis toutes les 24 h dans `/data/backups/hibi-AAAA-MM-JJ.db`, et garde les 14 dernières. Elle utilise l'API de backup en ligne de SQLite, la même que `sqlite3 .backup`, sans avoir besoin du binaire dans l'image. Aucune copie ne part hors du VPS (choix assumé) : le filet, c'est l'export CSV mensuel depuis Réglages.

Restaurer une copie :

```bash
docker compose stop app
```

```bash
docker run --rm -v habit-tracker_habit-data:/data busybox sh -c 'cp /data/backups/hibi-2026-12-01.db /data/hibi.db && rm -f /data/hibi.db-wal /data/hibi.db-shm'
```

```bash
docker compose start app
```

(Le nom du volume dépend du nom du projet compose : `docker volume ls` pour le vérifier.)

## Choix techniques à connaître

- **Synchro** : `POST /api/sync` pousse les journées modifiées hors ligne et renvoie tout l'état (≈ 365 lignes par an, pas besoin de delta). Côté serveur, un upsert par jour où le `updatedAt` le plus récent gagne : la file est rejouable sans doublon. `updatedAt` est toujours en UTC au format exact de `toISOString()`, pour que la comparaison de chaînes reste chronologique.
- **Un seul appareil** : le last-write-wins porte sur la ligne entière. Si deux appareils saisissent la même journée, des champs peuvent être écrasés.
- **Blocage du login** : compteur en mémoire, 5 échecs par IP, puis blocage de 15 min de cette IP. Un redémarrage remet les compteurs à zéro, ce qui est acceptable pour un seul process. `trustProxy` est activé pour lire la vraie IP derrière Caddy.
- **Sessions** : jeton aléatoire de 32 octets dans un cookie `HttpOnly; Secure; SameSite=Strict`. La base ne stocke que son SHA-256. L'échéance glisse à 30 jours, avec au plus une écriture par jour.
- **Saisie rapide** : un champ vide affiche en pointillés la valeur de la veille (ou l'objectif). Un tap la valide, `−`/`+` l'ajustent. L'écran ouvre la ligne du jour ; avant 4 h du matin, il reste sur la veille.
