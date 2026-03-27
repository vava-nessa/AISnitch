# 02 — Product Shape & Final Output

## Research Protocol (Mandatory)

- L’IA peut s’informer via **Brave Search**, **Context7/Context8**, et **Exa.ai**.
- **`@CLAUDE_DATA.md` doit être consulté en priorité** : c’est la base de connaissance centrale du projet.
- Toute proposition de forme produit doit être vérifiée contre `@CLAUDE_DATA.md`.

## Décision produit

AutoSnitch MVP = **daemon headless + pipeline mémoire + TUI live monitor**.

## Final Output attendu

### 1) Output principal
- Flux d’événements normalisés en temps réel (WebSocket localhost).

### 2) Output visible utilisateur (MVP)
- **TUI live** affichant l’activité des tools en cours :
  - session start/end
  - task start/complete
  - thinking/coding/tool_call
  - asking_user/error/idle

### 3) Ce qui est explicitement exclu
- stockage local des payloads
- historique rejouable
- analytics historiques

## UX cible du TUI (MVP)

Le TUI est l’interface de monitor principale avant toute app produit plus poussée.

Fonctions minimales :
1. Timeline live des events
2. Filtres par tool et type d’event
3. Vue “sessions actives”
4. Badge d’état global (idle/active/error)
5. Redaction optionnelle des champs sensibles à l’affichage

## Positionnement

Le TUI n’est pas un simple debug panel dans ce MVP : c’est le **consumer principal** pour valider la valeur produit “watch activity live”.
