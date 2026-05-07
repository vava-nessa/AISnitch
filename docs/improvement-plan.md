# 📋 Plan d'Amélioration — Qualité, Erreurs & Edge Cases

> Ce document trackait les 5 phases d'amélioration qualité du MVP.
> **Toutes les phases sont maintenant complétées (2026-05-08).**
>
> Voir [tasks.md](./tasks/tasks.md) pour le kanban complet.

---

## 📊 État Final du Projet

| Métrique | Valeur | Status |
|---|---|---|
| Lint | ✅ Pass | OK |
| Tests | ✅ 327 passed | OK |
| Couverture globale | ~55% | ✅ Amélioré |
| Couverture core | ~93% | ✅ OK |
| Schemas Zod | ✅ avec max() limits | OK |
| Error handling | ✅ 6 classes + helpers | OK |
| Circuit breaker | ✅ Wired in BaseAdapter | OK |
| Graceful shutdown | ✅ shutdownInOrder() | OK |
| Documentation | ✅ errors.md + resilience.md | OK |

---

## ✅ Phase 1 — Error Handling Centralisé

| # | Tâche | Fichier | Status |
|---|---|---|---|
| 1.1 | Module erreurs custom | `src/core/errors.ts` | ✅ Done |
| 1.2 | Pattern Result | `src/core/result.ts` | ✅ Done |
| 1.3 | Handlers globaux | `src/cli/runtime.ts` | ✅ Done |
| 1.4 | Retry avec backoff | `src/core/retry.ts` | ✅ Done |
| 1.5 | Timeouts async | `src/core/timeout.ts` | ✅ Done |
| 1.6 | Graceful shutdown | `src/core/graceful-shutdown.ts` | ✅ Done |

### Résumé des modules Phase 1

- **`src/core/errors.ts`** — `AISnitchError` + 5 subclasses (`AdapterError`, `PipelineError`, `ValidationError`, `NetworkError`, `TimeoutError`) + `isAISnitchError()` + `isRetryableError()`
- **`src/core/result.ts`** — `Result<T, E>` discriminated union avec `ok()`, `err()`, `mapOk()`, `flatMap()`, `fromPromise()`
- **`src/core/retry.ts`** — `withRetry()` exponential backoff + jitter ±25%
- **`src/core/timeout.ts`** — `withTimeout()` + `timeoutWarning()` + `DEFAULT_TIMEOUTS`
- **`src/core/graceful-shutdown.ts`** — `shutdownInOrder()` + `withShutdownTimeout()`

---

## ✅ Phase 2 — Edge Cases & Validation

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 2.1 | Bounds checking | `src/core/events/schema.ts` | ✅ Done |
| 2.2 | Null safety helpers | `src/core/safety.ts` | ✅ Done |
| 2.3 | Schemas Zod stricts | `src/core/events/schema.ts` | ✅ Done |

- **`src/core/safety.ts`** — 20+ fonctions (`getString`, `getNumber`, `isValidPort`, `isRecord`, etc.) avec 74 tests
- **`src/core/events/schema.ts`** — `max()` limits sur tous les champs

---

## ✅ Phase 3 — Circuit Breaker & Resilience

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 3.1 | Circuit breaker | `src/core/circuit-breaker.ts` | ✅ Done |
| 3.2 | Panic recovery (wire in BaseAdapter) | `src/adapters/base.ts` | ✅ Done |

### Résumé Phase 3

- **`src/core/circuit-breaker.ts`** — `CircuitBreaker` class avec états CLOSED/OPEN/HALF-OPEN + `SHARED_BREAKERS` singletons
- **`src/adapters/base.ts`** — `SHARED_BREAKERS.adapterEmit.execute()` wrappé dans `emit()` pour tous les adapters
- 29 tests circuit-breaker + 12 tests base-adapter-circuit

---

## ✅ Phase 4 — Tests d'Erreurs

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 4.1 | Tests rejection events | `event-bus-rejection.test.ts` | ✅ Done |
| 4.2 | Tests recovery | `event-bus-rejection.test.ts` | ✅ Done |
| 4.3 | Tests timeout | `timeout.test.ts` | ✅ Done |
| 4.4 | Tests graceful shutdown | `graceful-shutdown.test.ts` | ✅ Done |

- **`src/core/engine/__tests__/event-bus-rejection.test.ts`** — 20 tests
- **`src/core/__tests__/timeout.test.ts`** — tests withTimeout()
- **`src/core/__tests__/graceful-shutdown.test.ts`** — 11 tests (shutdownInOrder, withShutdownTimeout)

---

## ✅ Phase 5 — Documentation

| # | Tâche | Fichier(s) | Status |
|---|---|---|---|
| 5.1 | `docs/errors.md` | `docs/errors.md` | ✅ Done |
| 5.2 | `docs/resilience.md` | `docs/resilience.md` | ✅ Done |

- **`docs/errors.md`** — taxonomy erreurs, codes, handling patterns
- **`docs/resilience.md`** — circuit breaker, retry, timeouts, graceful shutdown

---

## 📝 Changelog

### 2026-05-08 — All Phases Complete

**Task t-quality-001 executed:**
- Circuit breaker wired in `BaseAdapter.emit()` via `SHARED_BREAKERS.adapterEmit`
- `shutdownInOrder()` integrated in runtime.ts with per-component timeouts
- Pipeline exposes `getAdapterRegistry()`, `getHttpReceiver()`, `getUdsServer()`, `getWsServer()`
- 21 new tests: `graceful-shutdown.test.ts` + `base-adapter-circuit.test.ts`
- Tests: 327 passed, lint ✅, typecheck ✅

### 2026-05-07 — Initial Implementation

- Phase 1-5 identified and implemented progressively
- 5 phases completed over multiple sessions
- Client SDK + Mascot Dashboard added as bonus features