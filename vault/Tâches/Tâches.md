---
tags: [index, tâches]
cssclasses: [tch-page]
---

# ✅ Mes tâches

> [!tip]- Comment ça marche (déplie-moi)
> - **Ajouter** : bouton ➕ (ruban ou ci-dessous), ou `Cmd + Maj + Entrée` sur le Mac. Écris naturellement : « Rendre TP OML vendredi ! ». `demain`, `lundi`, `12/11` donnent la date, `!` = importante, `!!` = urgente.
> - **Agir** : touche une tâche → menu (terminée, je commence, aujourd'hui, demain, autre date…).
> - **Par quoi commencer ?** La section 🎯 te donne les 3 tâches à faire en premier, et pourquoi.
> - **Les « à faire » des notes** (réunions, cours…) apparaissent aussi ici automatiquement.
> - **Projets** : chaque tâche peut appartenir à un projet (📁 sur la tâche). Le menu « 📁 Tous les projets » filtre la liste, la page [[Projets]] donne la vue d'ensemble.
> - **Le dimanche** : 5 minutes de 🧹 Revue en bas de page.

## 🎯 Maintenant

```dataviewjs
await dv.view("Templates/Vues/taches", { mode: "maintenant" })
```

## 📊 Charge des 14 prochains jours

```dataviewjs
await dv.view("Templates/Vues/taches", { mode: "charge" })
```

## 📋 Toutes mes tâches



```dataviewjs
await dv.view("Templates/Vues/taches", { mode: "liste" })
```

## 🧹 Revue de la semaine

```dataviewjs
await dv.view("Templates/Vues/taches", { mode: "revue" })
```
