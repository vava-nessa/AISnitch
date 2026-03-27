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

## Décision structurante

AutoSnitch est défini en **live streaming only** :
- ❌ aucun stockage persistant des events
- ❌ aucun replay historique
- ✅ transit mémoire vive uniquement
- ✅ monitoring temps réel via TUI (consumer principal du MVP)
