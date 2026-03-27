# PRD Index — AutoSnitch MVP (Live-Only)

Ce PRD est structuré en plusieurs fichiers pour faciliter la lecture, l’itération, et le suivi d’exécution.

## Research Protocol (Mandatory)

- L’IA peut utiliser la recherche web via **Brave Search**, **Context7/Context8**, et **Exa.ai** pour valider docs, libs et patterns récents.
- **Source prioritaire et inestimable : `@CLAUDE_DATA.md`**. Ce fichier doit être consulté avant toute décision produit/technique sur AutoSnitch.
- En cas de conflit entre sources externes et contexte projet, privilégier d’abord `@CLAUDE_DATA.md`, puis expliciter les écarts.

## Sections

1. [Executive Summary & Goals](./01-executive-summary-goals.md)
2. [Product Shape & Final Output](./02-product-shape-and-output.md)
3. [Functional + Non-Functional Requirements](./03-requirements-functional-nfr.md)
4. [Roadmap & Milestones](./04-roadmap-milestones.md)
5. [Risks, Assumptions, Open Questions](./05-risks-open-questions.md)

## Décisions structurantes

AutoSnitch est défini en **live streaming only** avec une architecture orientée events :
- ❌ aucun stockage persistant sur le long terme des events
- ❌ aucun replay historique (API REST historique exclue)
- ✅ transit mémoire vive ou fichier WAL temporisé et rotatif `better-sqlite3` uniquement
- ✅ monitoring temps réel via TUI (consumer principal du MVP) abonné au websocket local (`ws://localhost:4820`).
- ✅ Stack hybride : noyau TypeScript complété par un module natif Rust via `napi-rs` (`@autosnitch/native`) pour les syscalls système et PTY sans compilation chez l'utilisateur.
