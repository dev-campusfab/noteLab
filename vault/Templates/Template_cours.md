<%*
// Modèle de dossier IUT. Première question : note tapée ou note manuscrite (iPad).
// - tapée      : note classique ; les schémas s'ajoutent avec « ✍️ Nouveau manuscrit »
// - manuscrite : la note sert de fiche (métadonnées + résumé) et embarque les pages
//                Excalidraw ; « ✍️ Nouveau manuscrit » depuis une page = page suivante.
const C = tp.user.config();
const format = (await tp.system.suggester(
    ["⌨️ Note tapée", "✍️ Note manuscrite (iPad)"], ["tapée", "manuscrite"], false, "Format de la note")) || "tapée";

const meta = (await tp.user.saisieNote(tp, "IUT")) || { contexte: "IUT" };
const val = (v) => (v && v !== "null" ? v : "");
const matiere = val(meta["matière"]), prof = val(meta.prof), type = val(meta.type);

// Tags : choisis pour une note tapée ; automatiques pour une note manuscrite (moins de taps sur iPad).
const nettoieTag = (t) => String(t).trim().replace(/^#/, "").replace(/\s+/g, "-");
let tags = ["iut", "cours"];
if (format === "tapée") {
    const existants = Object.keys(app.metadataCache.getTags() || {}).map(nettoieTag).filter(Boolean);
    tags = await tp.user.multiSuggest(tp, existants, { label: "Tags", preselected: tags, normalize: nettoieTag });
} else {
    tags.push("manuscrit");
}
if (matiere) tags.push(nettoieTag(matiere));
tags = [...new Set(tags)];

const defaut = [matiere, type].filter(Boolean).join(" - ");
let titre = await tp.system.prompt("Nom de la note", defaut ? defaut + " " : "");
titre = titre && titre.trim() ? titre.trim() : tp.file.title;
if (titre !== tp.file.title) {
    try { await tp.file.rename(titre); }
    catch (e) { titre = `${titre} ${tp.date.now("YYYY-MM-DD")}`; await tp.file.rename(titre); }
}

let page = "";
if (format === "manuscrite") {
    page = await tp.user.nouveauManuscrit(tp, {
        note: tp.config.target_file, titre, meta: { ...meta, tags },
    });
}
const tagsYaml = tags.map(t => "  - " + t).join("\n");
const contexteLigne = [matiere, type, prof, tp.date.now("DD/MM/YYYY")].filter(Boolean).join(" · ");
-%>
---
date: <% tp.date.now("YYYY-MM-DD") %>
contexte: IUT
format: <% format %>
matière: <% matiere %>
prof: <% prof %>
type: <% type %>
semestre: <% meta.semestre || C.semestre %>
tags:
<% tagsYaml %>
statut: à-relire
---

# <% titre %>

> [!info] <% contexteLigne %>

<%* if (format === "manuscrite") { -%>
## ✍️ Pages manuscrites
<!-- Page suivante : depuis la dernière page, commande « ✍️ Nouveau manuscrit »
     (ou le bouton ✍️ du ruban). Elle s'ajoute ici toute seule. -->
<% page %>

## ✅ À retenir
<!-- Quelques mots-clés tapés ici rendent la note trouvable par la recherche,
     même si l'OCR ne lit pas bien ton écriture. -->
- 

## ❓ Questions / points à éclaircir
- [ ] 
<%* } else { -%>
## 🎯 Objectifs de la séance
- 

## 📝 Notes / Contenu

### Concept 1
- 

### Concept 2
- 

## 🛠️ Manipulation / Exercices
- **Énoncé / consigne** : 
- **Démarche** : 
- **Résultats obtenus** : 
- **Difficultés rencontrées** : 

## ✍️ Notes manuscrites
<!-- Curseur ici + commande « ✍️ Nouveau manuscrit » : le schéma hérite de la
     matière, du prof, du type et des tags de cette note. -->
- 

## 🔗 Liens avec d'autres notes
- 

## ❓ Questions / points à éclaircir
- [ ] 

## ✅ À retenir (résumé rapide)
- 

## 📚 Ressources associées
- 
<%* } -%>
