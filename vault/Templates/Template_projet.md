<%*
// Modèle de dossier Alternance et Fab Lab (notes de travail) : le contexte vient du dossier.
// Questions : format (tapée / manuscrite iPad) → projet → type de note → interlocuteurs
// (réunion, point tuteur, visite) → tags → nom. Le type choisit les sections ci-dessous.
const C = tp.user.config();
const contexte = C.contexteDe(tp.file.folder(true)) || "Alternance";
const ctx = C.contextes[contexte];

const format = (await tp.system.suggester(
    ["⌨️ Note tapée", "✍️ Note manuscrite (iPad)"], ["tapée", "manuscrite"], false, "Format de la note")) || "tapée";

const meta = (await tp.user.saisieNote(tp, contexte, { complet: true })) || { contexte, type: "Autre" };
const projet = meta.projet && meta.projet !== "null" ? meta.projet : "";
const type = meta.type || "Autre";
const interlocuteurs = meta.interlocuteurs || [];

const nettoieTag = (t) => String(t).trim().replace(/^#/, "").replace(/\s+/g, "-");
let tags = [ctx.tag];
if (format === "tapée") {
    const existants = Object.keys(app.metadataCache.getTags() || {}).map(nettoieTag).filter(Boolean);
    tags = await tp.user.multiSuggest(tp, existants, { label: "Tags", preselected: tags, normalize: nettoieTag });
} else {
    tags.push("manuscrit");
}
if (projet) tags.push(nettoieTag(projet));
tags = [...new Set(tags)];

const date = tp.date.now("YYYY-MM-DD");
const prefixe = [projet, type !== "Autre" ? type : ""].filter(Boolean).join(" - ");
let titre = await tp.system.prompt("Nom de la note (sujet)", prefixe ? prefixe + " - " : "");
// Nom validé sans sujet (« Projet - Réunion - ») : on retire le tiret final et on date la note.
titre = (titre || "").trim().replace(/\s*-$/, "");
if (titre && titre === prefixe) titre = `${prefixe} ${date}`;
titre = titre || tp.file.title;
if (titre !== tp.file.title) {
    try { await tp.file.rename(titre); }
    catch (e) { titre = `${titre} ${date}`; await tp.file.rename(titre); }
}

let page = "";
if (format === "manuscrite") {
    page = await tp.user.nouveauManuscrit(tp, {
        note: tp.config.target_file, titre, meta: { ...meta, tags },
    });
}

// ---------- Sections selon le type ----------
// Actions au format Tasks : « - [ ] tâche 📅 2026-10-30 » apparaît dans les requêtes Tasks.
const qui = interlocuteurs.length ? interlocuteurs.map(p => `- ${p}`).join("\n") : "- ";
const actions = "## ✅ Actions\n- [ ] ";
const SECTIONS = {
    "Réunion":
`## 👥 Participants
${qui}

## 🎯 Objet / ordre du jour
- 

## 📝 Échanges


## 🧩 Décisions
- 

${actions}
<!-- Fin de réunion : commande « 🤖 Agent : extraire les tâches de cette note » (ou ⌘P → agent). -->

## ➡️ Prochaine étape
- `,
    "Point tuteur":
`## 📊 Où j'en suis
- 

## ❓ Questions / blocages
- 

## 💬 Retours du tuteur
- 

${actions}

## 🎓 Pour le rapport / l'IUT
- `,
    "Étude":
`## 🎯 Problème / objectif
- 

## 📐 Données d'entrée & contraintes (cahier des charges)
| Paramètre | Valeur | Source |
| --- | --- | --- |
|  |  |  |

## 🔍 Pistes / solutions envisagées
- 

## 🧮 Calculs / essais


## ✅ Résultat & recommandation
- 

## 📚 Sources
- 

${actions}`,
    "Visite":
`## 📍 Contexte
- Lieu : 
- Rencontré : ${interlocuteurs.join(", ")}

## 🏢 Acteurs / produits vus
| Entreprise | Produit / solution | Infos clés | Contact |
| --- | --- | --- | --- |
|  |  |  |  |

## 💡 Idées pour ${projet || "le projet"}
- 

${actions}`,
    "Veille":
`## 📌 Source
- Titre / intervenant : 
- Lien : 

## 🔑 Points clés
- 

## 📊 Chiffres à retenir
- 

## 💡 Ce que ça change pour ${projet || "le projet"}
- `,
    "Suivi":
`## 🎯 Objectif
- 

## 📈 Avancement
- ${tp.date.now("DD/MM")} : 

## 🚧 Blocages
- 

${actions}`,
    "Autre":
`## 📝 Notes


${actions}`,
};

// Note manuscrite : les pages, puis un résumé TAPÉ (la recherche le lit directement,
// sans attendre l'OCR) et les actions.
const corps = format === "manuscrite"
    ? `## ✍️ Pages manuscrites
<!-- Page suivante : depuis la dernière page, commande « ✍️ Nouveau manuscrit ». -->
${page}

## 🧾 Résumé (tapé, 2-3 lignes)
- 

${type === "Réunion" || type === "Visite" ? `## 👥 Participants\n${qui}\n\n` : ""}${actions}`
    : `${SECTIONS[type] || SECTIONS["Autre"]}

## ✍️ Schémas
<!-- Curseur ici + commande « ✍️ Nouveau manuscrit » pour un schéma. -->
- 

## 🔗 Liens
- `;

const yamlListe = (l) => l.length ? "\n" + l.map(t => "  - " + JSON.stringify(t)).join("\n") : " []";
const enTete = [contexte, projet, type, tp.date.now("DD/MM/YYYY")].filter(Boolean).join(" · ");
-%>
---
date: <% date %>
contexte: <% contexte %>
format: <% format %>
projet: <% projet %>
type: <% type %>
interlocuteurs:<% yamlListe(interlocuteurs) %>
tags:<% yamlListe(tags) %>
statut: en-cours
---

# <% titre %>

> [!info] <% enTete %>

<% corps %>
