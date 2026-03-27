# 03 — Project Setup : Config System

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-project-setup.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_project-setup_config-system_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

AISnitch a besoin d'un fichier de configuration persistant pour stocker les préférences utilisateur : ports, adapters activés, timeouts, etc. Le fichier est `~/.aisnitch/config.json`. La config est chargée au démarrage et rechargeable à chaud.

## Ressources

- Pas de lib externe nécessaire — `fs` natif Node + Zod pour validation
- Convention : `~/.aisnitch/` est le home directory du daemon (config, PID file, socket UDS)

## Sous-étapes

- [x] Créer `src/core/config/schema.ts` — Zod schema de la config :
  - [x] `wsPort` (number, défaut 4820)
  - [x] `httpPort` (number, défaut 4821)
  - [x] `adapters` (Record<ToolName, { enabled: boolean }>)
  - [x] `idleTimeoutMs` (number, défaut 120_000 = 2 min)
  - [x] `logLevel` ('debug' | 'info' | 'warn' | 'error', défaut 'info')
- [x] Créer `src/core/config/loader.ts` :
  - [x] `loadConfig()` — lit `~/.aisnitch/config.json`, merge avec defaults, valide Zod
  - [x] `saveConfig(config)` — écrit la config sur disque
  - [x] `getConfigPath()` — retourne le chemin config (respecte `$AISNITCH_HOME` si défini)
  - [x] `ensureConfigDir()` — crée `~/.aisnitch/` si absent
- [x] Créer `src/core/config/defaults.ts` — valeurs par défaut de toute la config
- [x] Créer `src/core/config/index.ts` — barrel export
- [x] Gérer la résolution de port intelligent :
  - [x] Si le port par défaut est occupé, tenter port+1, port+2... (max 10 tentatives)
  - [x] Logger quel port est effectivement utilisé
- [x] Écrire tests unitaires :
  - [x] Config par défaut valide
  - [x] Merge config partielle avec defaults
  - [x] Rejet config invalide (port négatif, etc.)
- [x] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### Config schema (esquisse)
```typescript
const ConfigSchema = z.object({
  wsPort: z.number().int().min(1024).max(65535).default(4820),
  httpPort: z.number().int().min(1024).max(65535).default(4821),
  adapters: z.record(ToolNameSchema, z.object({
    enabled: z.boolean().default(true),
  })).default({}),
  idleTimeoutMs: z.number().int().min(10_000).default(120_000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type AISnitchConfig = z.infer<typeof ConfigSchema>;
```

### Fichier config (~/.aisnitch/config.json)
```json
{
  "wsPort": 4820,
  "httpPort": 4821,
  "adapters": {
    "claude-code": { "enabled": true },
    "opencode": { "enabled": true }
  },
  "idleTimeoutMs": 120000,
  "logLevel": "info"
}
```

### Structure ~/.aisnitch/
```
~/.aisnitch/
├── config.json          # Config persistante
├── aisnitch.pid         # PID du daemon (si mode daemon)
└── aisnitch.sock        # Unix Domain Socket
```

## Critères de complétion

- [x] Config chargée correctement depuis `~/.aisnitch/config.json`
- [x] Defaults appliqués pour les champs manquants
- [x] Validation Zod rejette les configs invalides
- [x] Dossier `~/.aisnitch/` créé automatiquement si absent
- [x] Port fallback fonctionne si port occupé
- [x] Tests unitaires passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> Réalisé :
> - Implémentation du schéma de config dans `src/core/config/schema.ts`
> - Ajout des defaults centralisés et du loader FS dans `src/core/config/`
> - Support de `AISNITCH_HOME` pour les tests et environnements isolés
> - Ajout de `resolveAvailablePort()` avec fallback borné et logging injectable
> - Ajout de tests pour defaults, merge, validation, persistence et fallback port
>
> Vérifications :
> - `pnpm test`
> - `pnpm build`
