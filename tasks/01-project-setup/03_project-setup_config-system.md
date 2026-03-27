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

- [ ] Créer `src/core/config/schema.ts` — Zod schema de la config :
  - [ ] `wsPort` (number, défaut 4820)
  - [ ] `httpPort` (number, défaut 4821)
  - [ ] `adapters` (Record<ToolName, { enabled: boolean }>)
  - [ ] `idleTimeoutMs` (number, défaut 120_000 = 2 min)
  - [ ] `logLevel` ('debug' | 'info' | 'warn' | 'error', défaut 'info')
- [ ] Créer `src/core/config/loader.ts` :
  - [ ] `loadConfig()` — lit `~/.aisnitch/config.json`, merge avec defaults, valide Zod
  - [ ] `saveConfig(config)` — écrit la config sur disque
  - [ ] `getConfigPath()` — retourne le chemin config (respecte `$AISNITCH_HOME` si défini)
  - [ ] `ensureConfigDir()` — crée `~/.aisnitch/` si absent
- [ ] Créer `src/core/config/defaults.ts` — valeurs par défaut de toute la config
- [ ] Créer `src/core/config/index.ts` — barrel export
- [ ] Gérer la résolution de port intelligent :
  - [ ] Si le port par défaut est occupé, tenter port+1, port+2... (max 10 tentatives)
  - [ ] Logger quel port est effectivement utilisé
- [ ] Écrire tests unitaires :
  - [ ] Config par défaut valide
  - [ ] Merge config partielle avec defaults
  - [ ] Rejet config invalide (port négatif, etc.)
- [ ] Vérifier `pnpm build` + `pnpm test`

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

- [ ] Config chargée correctement depuis `~/.aisnitch/config.json`
- [ ] Defaults appliqués pour les champs manquants
- [ ] Validation Zod rejette les configs invalides
- [ ] Dossier `~/.aisnitch/` créé automatiquement si absent
- [ ] Port fallback fonctionne si port occupé
- [ ] Tests unitaires passent
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
