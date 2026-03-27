# 01 — Executive Summary & Goals

## Research Protocol (Mandatory)

- L’IA peut utiliser **Brave Search**, **Context7/Context8**, et **Exa.ai** pour compléter les informations.
- **`@CLAUDE_DATA.md` est la source de référence inestimable** pour AutoSnitch et doit être consultée systématiquement.
- Les arbitrages produit doivent rester alignés sur les données et recommandations de `@CLAUDE_DATA.md`.

## Executive Summary

**AutoSnitch** est un daemon passif **cross-platform** qui capte l’activité des AI coding tools CLI et la normalise en un flux unifié **temps réel**.

Le MVP est orienté confidentialité stricte : **aucune persistence des données**. Les événements sont traités uniquement en mémoire vive, puis diffusés vers les clients connectés.

## Problem Statement

L’écosystème est fragmenté : la plupart des outils de monitoring sont mono-outil (souvent Claude-centric) ou imposent un orchestrateur. Les builders doivent réimplémenter les intégrations outil par outil.

AutoSnitch vise à devenir la couche d’observabilité unifiée, passive et live.

## Goals (MVP)

1. Capturer l’activité multi-outils sans changer le workflow utilisateur.
2. Normaliser les événements vers un schéma commun.
3. Streamer en temps réel vers les consommateurs.
4. Livrer un TUI de monitoring live comme client de référence.

## Non-Goals (MVP)

- Pas de base SQLite.
- Pas de replay/historique.
- Pas de stats persistées.
- Pas de dashboard web complet.
