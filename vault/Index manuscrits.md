---
tags: [index]
---

# ✍️ Index des manuscrits

> [!tip] Les tracés ne sont **pas** du texte : seuls le frontmatter et le PNG exporté (OCR via Omnisearch) les rendent trouvables.
> - **Nouveau** : commande « ✍️ Nouveau manuscrit » (ou bouton ✍️ du ruban) — depuis une note → schéma ; depuis une page → page suivante.
> - **Ranger un orphelin** : commande « ✍️ Classer un manuscrit orphelin ».

## ⚠️ À classer

```dataview
TABLE WITHOUT ID
  file.link AS "Dessin",
  choice(!contexte, "sans contexte", "sans note liée") AS "Problème",
  file.folder AS "Dossier"
WHERE endswith(file.name, ".excalidraw") AND !startswith(file.path, "Templates/")
  AND (!contexte OR !note)
SORT file.ctime DESC
```

## 🕒 Récents (14 jours)

```dataview
TABLE WITHOUT ID
  file.link AS "Manuscrit",
  contexte AS "Contexte",
  choice(forme = "page", "📄 page", "🖼️ schéma") AS "Forme",
  note AS "Note",
  date AS "Date"
FROM #manuscrit
WHERE date >= date(today) - dur(14 days)
SORT date DESC, file.name ASC
```

## 🎓 IUT — par matière

```dataview
TABLE WITHOUT ID
  matière AS "Matière",
  length(rows) AS "Nb",
  rows.file.link AS "Manuscrits"
FROM #manuscrit
WHERE contexte = "IUT"
GROUP BY matière
SORT matière ASC
```

## 🛠️ Fab Lab & Alternance — par projet

```dataview
TABLE WITHOUT ID
  key AS "Projet",
  rows.file.link AS "Manuscrits"
FROM #manuscrit
WHERE contexte = "Fab Lab" OR contexte = "Alternance"
GROUP BY contexte + " · " + projet
SORT key ASC
```

## 📓 Notes entièrement manuscrites

```dataview
TABLE WITHOUT ID
  file.link AS "Note",
  choice(matière, matière, projet) AS "Matière / projet",
  type AS "Type",
  date AS "Date",
  statut AS "Statut"
WHERE format = "manuscrite"
SORT date DESC
```
