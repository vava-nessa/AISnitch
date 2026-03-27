# 01 — Executive Summary & Goals

## Research Protocol (Mandatory)

- L’IA peut utiliser **Brave Search**, **Context7/Context8**, et **Exa.ai** pour compléter les informations.
- **`@CLAUDE_DATA.md` est la source de référence inestimable** pour AutoSnitch et doit être consultée systématiquement.
- Les arbitrages produit doivent rester alignés sur les données et recommandations de `@CLAUDE_DATA.md`.

## Executive Summary

**AutoSnitch** est un daemon passif **cross-platform** (conçu pour macOS, Windows et Linux) qui capte l’activité des AI coding tools CLI (Claude Code, Codex, Gemini CLI, Aider, Goose, Copilot CLI, etc.) et la normalise en un flux unifié **temps réel**. 

Il comble un vide majeur: la plupart des outils actuels (ccboard, aSpy, PeonPing) soit se limitent à un seul outil, soit fonctionnent comme de simples déclencheurs d'effets sonores sans notion d'état continu, soit imposent un orchestrateur global (Agent Deck). AutoSnitch agit comme un véritable observateur universel, passif, s'intégrant directement à la manière dont l'utilisateur lance déjà ses assistants.

Le MVP est orienté confidentialité stricte : **aucune persistence des données** brut sur disque. Les événements sont traités en mémoire vive via un pipeline IPC hybride, puis diffusés vers les clients connectés via WebSocket.

## Problem Statement

L’écosystème est fragmenté : nous recensons plus de 15 outils d'IA en ligne de commande distincts. Les développeurs utilisent de plus en plus plusieurs de ces outils en parallèle. Les outils de monitoring actuels sont mono-outil (souvent Claude-centric) ou nécessitent de changer les habitudes de l'utilisateur. Les créateurs d'applications (mascottes, dashboards) doivent recoder des intégrations spécifiques pour chaque IA.

AutoSnitch vise à devenir la couche d’observabilité unifiée, passive et "live", exposant une API CloudEvents-compatible.

## Goals (MVP)

1. **Capturer l’activité multi-outils** sans changer le workflow utilisateur via une architecture d'interception multicouche (Hooks natifs HTTP, File System watching avec fsevents/notify, Process monitoring via kqueue/libproc, et PTY wrapping).
2. **Normaliser les événements** vers un schéma CloudEvents commun (ex: `session.start`, `agent.coding`, `task.complete`) tout en conservant une compatibilité avec les catégories CESP de PeonPing.
3. **Streamer en temps réel** vers les consommateurs via un serveur WebSocket sur le port `4820`, avec un event bus interne performant en `eventemitter3`.
4. **Livrer un TUI de monitoring live** comme client de référence, illustrant la consommation du flux unifié.
5. **Déploiement simple** sous forme de paquet npm, soutenu par un daemon léger propulsé par une architecture hybride (TypeScript et Rust natif via napi-rs).

## Non-Goals (MVP)

- Pas de base SQLite pour un stockage permanent (le transit se fait en WAL temporaire ou mémoire uniquement).
- Pas de replay/historique longue durée persistant entre les redémarrages.
- Pas de statistiques complexes persistées.
- Pas de dashboard web complet (TUI exclusif pour le MVP).
