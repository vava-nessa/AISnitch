# 📋 Plan d'Amélioration — Qualité, Erreurs & Edge Cases

> Ce fichier documente les axes d'amélioration identifiés pour renforcer la robustesse,
> la gestion d'erreurs et la qualité globale du code d'AISnitch.
>
> **Dernière mise à jour:** 2026-05-07

---

## 📊 État Actuel du Projet

| Métrique | Valeur | Status |
|---|---|---|
| Lint | ✅ Pass | OK |
| Tests | ✅ 157 passed | OK |
| Couverture globale | ~50% | ⚠️ À améliorer |
| Couverture core | ~93% | ✅ OK |
| Couverture adapters | ~47% | ⚠️ À améliorer |
| Couverture TUI | ~39% | ⚠️ À améliorer |
| Schemas Zod | ✅ Utilisés | OK |
| Logging pino | ✅ Partout | OK |
| Error handling | ✅ Phase 1 done | OK |

---

## ✅ Phase 1 — Error Handling Centralisé

> **Statut:** Terminée ✅
>
> **Modules créés:**

| # | Tâche | Fichier | Status |
|---|---|---|---|
| 1.1 | Module erreurs custom | `src/core/errors.ts` | ✅ Done |
| 1.2 | Pattern Result | `src/core/result.ts` | ✅ Done |
| 1.3 | Handlers globaux | `src/cli/runtime.ts` | ✅ Done |
| 1.4 | Retry avec backoff | `src/core/retry.ts` | ✅ Done |
| 1.5 | Timeouts async | `src/core/timeout.ts` | ✅ Done |
| 1.6 | Graceful shutdown | `src/core/graceful-shutdown.ts` | ✅ Done |

### Résumé des modules Phase 1

#### `src/core/errors.ts` (8273 bytes)
- `AISnitchError` — base class avec `code` et `context`
- `AdapterError` — erreurs d'adapters
- `PipelineError` — erreurs de pipeline
- `ValidationError` — erreurs Zod
- `NetworkError` — erreurs réseau
- `TimeoutError` — timeouts
- `isAISnitchError()` — type guard
- `isRetryableError()` — détermine si une erreur est réessayable

#### `src/core/result.ts` (6109 bytes)
- `Result<T, E>` — discriminated union
- `ok()`, `err()` — factory functions
- `isOk()`, `isErr()` — type guards
- `mapOk()`, `mapErr()`, `flatMap()` — chainable operations
- `fromPromise()`, `fromSync()` — converters

#### `src/core/retry.ts` (7956 bytes)
- `withRetry()` — exponential backoff retry
- `fireAndForgetRetry()` — retry without throwing
- `withRetryOn()` — wraps any function with retry
- `DefaultRetryOptions` — sensible defaults
- Jitter support (±25%)

#### `src/core/timeout.ts` (6430 bytes)
- `withTimeout()` — race a promise against deadline
- `timeoutWarning()` — best-effort without throwing
- `DEFAULT_TIMEOUTS` — named timeouts per operation
- `isTimeoutError()` — type guard

#### `src/core/graceful-shutdown.ts` (10775 bytes)
- `GracefulShutdownManager` — coordinates SIGTERM/SIGINT/SIGHUP
- `shutdownInOrder()` — stops components in reverse dependency order
- `withShutdownTimeout()` — per-component shutdown with deadline
- `withOverallShutdownTimeout()` — global shutdown deadline

---

## 🎯 Phases suivantes

### Phase 2 — Edge Cases & Validation (P1)

> **Effort:** 🟡 Moyen | **Impact:** 🔴 Haute | **Statut:** 📋 Todo

#### 2.1 Bounds checking explicite

**Arrays:**
- Vérifier `.length > 0` avant itération
- Utiliser `Array.isArray()` comme guard

**Strings:**
- Valider longueur max (`JSON.stringify()` ne doit pas dépassser ~10MB)
- Limiter les paths à 4096 caractères (limite POSIX)

**Nombres:**
- `Number.isFinite()` avant division ou calcul
- Valider les ranges (e.g., `port` entre 1 et 65535)

**Fichiers impactés:**
- [ ] `src/core/engine/http-receiver.ts` (JSON body > 1MB — existe, améliorer le message)
- [ ] `src/adapters/claude-code.ts` (transcript reading)

---

#### 2.2 Null safety helpers

**Remplacer:**
```typescript
// Avant (fragile)
const value = obj.property.nested;

// Après (sécurisé)
const value = obj?.property?.nested;
```

**Pattern helper:**
```typescript
// Objectif: src/core/safety.ts
export function getStringOrUndefined(
  obj: Record<string, unknown>,
  key: string,
  maxLength?: number,
): string | undefined { ... }

export function getNumberOrUndefined(
  obj: Record<string, unknown>,
  key: string,
  min?: number,
  max?: number,
): number | undefined { ... }
```

---

#### 2.3 Validation schema stricte

**Améliorer les schemas Zod avec limites de taille:**

```typescript
// src/core/events/schema.ts — ajouter des max()

const EventDataSchema = z.object({
  activeFile: z.string().max(4096).optional(),
  model: z.string().max(200).optional(),
  projectPath: z.string().max(4096).optional(),
  errorMessage: z.string().max(10000).optional(),
  // ...
});
```

**Fichiers impactés:**
- [ ] `src/core/events/schema.ts`

---

### Phase 3 — Circuit Breaker & Resilience (P2)

> **Effort:** 🟡 Moyen | **Impact:** 🟡 Moyenne | **Statut:** 📋 Todo

#### 3.1 Circuit Breaker pour adapters

```typescript
// Objectif: src/core/circuit-breaker.ts
export class CircuitBreaker {
  // failures threshold → open → half-open → closed
}
```

**Fichiers impactés:**
- [ ] `src/core/circuit-breaker.ts` (nouveau)
- [ ] `src/adapters/base.ts` (intégrer dans `emit()`)

---

#### 3.2 Panic recovery par adapter

```typescript
// Dans BaseAdapter.emit() —wrap avec circuit breaker
protected async emit(...): Promise<boolean> {
  return this.circuitBreaker.execute(async () => {
    // ... existing emit logic
  });
}
```

**Fichiers impactés:**
- [ ] `src/adapters/base.ts`

---

### Phase 4 — Tests d'Erreurs (P2)

> **Effort:** 🟡 Moyen | **Impact:** 🔴 Haute | **Statut:** 📋 Todo

#### 4.1 Tests de rejection d'events

```typescript
// src/core/engine/__tests__/event-bus.test.ts — ajouter
test('publish() rejects events without id', () => { ... });
test('publish() rejects events with invalid type', () => { ... });
```

#### 4.2 Tests de recovery

```typescript
// Tests de scénarios de recovery
test('adapter recovers after file deletion during watch', () => { ... });
```

#### 4.3 Tests de timeout

```typescript
// src/core/__tests__/timeout.test.ts (nouveau)
test('withTimeout() resolves when promise resolves', async () => { ... });
test('withTimeout() rejects when timeout exceeded', async () => { ... });
```

---

### Phase 5 — Documentation (P2)

> **Effort:** 🟢 Petit | **Impact:** 🟢 Basse | **Statut:** 📋 Todo

#### 5.1 Doc errors.md

Créer `docs/errors.md` documentant:
- [ ] Liste des erreurs custom avec codes
- [ ] Comment les catcher
- [ ] Patterns de recovery recommandés

#### 5.2 Doc resilience.md

Créer `docs/resilience.md` documentant:
- [ ] Circuit breaker pattern
- [ ] Graceful shutdown
- [ ] Retry strategies
- [ ] Timeout handling

---

## 📋 Tâches Résumées (Status Global)

### ✅ Phase 1 — Error Handling Centralisé (Done)

| # | Tâche | Fichier | Status |
|---|---|---|---|
| 1.1 | Module erreurs custom | `src/core/errors.ts` | ✅ Done |
| 1.2 | Pattern Result | `src/core/result.ts` | ✅ Done |
| 1.3 | Handlers globaux | `src/cli/runtime.ts` | ✅ Done |
| 1.4 | Retry avec backoff | `src/core/retry.ts` | ✅ Done |
| 1.5 | Timeouts async | `src/core/timeout.ts` | ✅ Done |
| 1.6 | Graceful shutdown timeout | `src/core/graceful-shutdown.ts` | ✅ Done |

### 📋 Phase 2 — Edge Cases & Validation

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 2.1 | Bounds checking | `src/core/events/schema.ts` | ✅ Done |
| 2.2 | Null safety helpers | `src/core/safety.ts` | ✅ Done |
| 2.3 | Schemas Zod stricts | `src/core/events/schema.ts` | ✅ Done |

### 📋 Phase 3 — Circuit Breaker & Resilience

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 3.1 | Circuit breaker | `src/core/circuit-breaker.ts` | 📋 Todo |
| 3.2 | Panic recovery | `src/adapters/base.ts` | 📋 Todo |

### 📋 Phase 4 — Tests d'Erreurs

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 4.1 | Tests rejection events | `event-bus.test.ts` | 📋 Todo |
| 4.2 | Tests recovery | à déterminer | 📋 Todo |
| 4.3 | Tests timeout | `timeout.test.ts` | 📋 Todo |

### 📋 Phase 5 — Documentation

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 5.1 | `docs/errors.md` | `docs/errors.md` | 📋 Todo |
| 5.2 | `docs/resilience.md` | `docs/resilience.md` | 📋 Todo |

---

## 🚀 Comment Contribuer

1. Choisir une tâche dans les phases ci-dessus
2. Créer une sous-tâche dans `tasks/tasks.md` avec tag `quality`
3. Implémenter avec tests unitaires
4. Mettre à jour ce fichier avec `[x]` quand fait
5. Commit avec la référence de la tâche

---

## 📝 Changelog

### 2026-05-07
- Document initial créé
- 5 phases identifiées avec tâches détaillées
- État actuel du projet documenté

### 2026-05-07 (Phase 2)
- **Phase 2 terminée** — 2 modules créés:
  - `safety.ts` — 20+ fonctions de sécurité (getString, getNumber, isValidPort, isRecord, etc.)
  - `__tests__/safety.test.ts` — 74 tests
  - `schema.ts` — limites max() sur tous les champs Zod

### 2026-05-07 (Phase 1)
- **Phase 1 terminée** — 5 modules créés:
  - `errors.ts` — 6 classes d'erreurs + 2 helpers
  - `result.ts` — Result type avec 8 fonctions
  - `retry.ts` — retry avec backoff exponentiel
  - `timeout.ts` — timeouts + DEFAULT_TIMEOUTS
  - `graceful-shutdown.ts` — GracefulShutdownManager + shutdownInOrder
