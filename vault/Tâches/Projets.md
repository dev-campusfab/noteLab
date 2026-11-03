---
tags: [index, tâches]
cssclasses: [tch-page]
---

# 📁 Mes projets

> [!tip]- Comment ça marche (déplie-moi)
> - **Un projet = une note** dans le dossier `Projets/`, avec son domaine, son objectif, son échéance et son statut (actif, en pause, terminé).
> - **Créer** : bouton 📁 ci-dessous ou commande « 📁 Nouveau projet ». Un projet tapé dans une nouvelle note de travail est aussi créé tout seul. L'agent 🤖 en propose quand ton vrac en contient un (champ ✨ jaune à la relecture).
> - **Ranger une tâche** : ➕ demande le projet (ou le devine depuis la note ouverte), sinon touche la tâche → 📁.
> - **Chaque projet affiche sa prochaine action.** S'il n'en a plus, il le signale : ajoute la suivante ou termine-le.

```dataviewjs
await dv.view("Templates/Vues/taches", { mode: "projets" })
```
