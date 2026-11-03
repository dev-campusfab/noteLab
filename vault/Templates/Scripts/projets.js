// Projets : une note par projet dans « Projets/ » (frontmatter domaine, statut, objectif, échéance).
// Une tâche appartient à un projet si (dans l'ordre) :
//   elle est dans la note du projet · elle contient un lien [[Projet]] · elle est dans une note
//   dont le frontmatter « projet: » vaut le nom du projet (réunions, études…).
//   tp.user.projets(tp).liste(domaine?)        → [{ nom, domaine, statut, echeance, objectif, fichier }], actifs d'abord
//   tp.user.projets(tp).creer(nom, domaine, o) → crée la note (ou renvoie l'existante)
//   tp.user.projets(tp).choisir(domaine, o)    → suggester : un projet, « aucun » ("") ou null si annulé
//   tp.user.projets(tp).deNote(fichier)        → projet d'une note (la note du projet elle-même ou son frontmatter)

const DOSSIER = "Projets";
const STATUTS = ["actif", "en pause", "terminé"];
const DOMAINES = { perso: "🏠 Perso", fablab: "🛠️ Fab Lab", iut: "🎓 IUT", alternance: "💼 Alternance" };
const CONTEXTE_DOMAINE = { "Fab Lab": "fablab", "IUT": "iut", "Alternance": "alternance" };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Un nom de projet devient un nom de fichier : pas de / \ : * ? " < > | # ^ [ ]
const nomPropre = (s) => String(s || "").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();

function contenu(nom, domaine, o = {}) {
    return `---
domaine: ${domaine}
statut: actif
objectif: ${JSON.stringify(o.objectif || "")}
échéance: ${o.echeance || ""}
créé: ${iso(new Date())}
tags:
  - projet
  - ${domaine}
---

# 📁 ${nom}

\`\`\`dataviewjs
await dv.view("Templates/Vues/taches", { mode: "projet" })
\`\`\`

## 🗒️ Notes et idées

`;
}

module.exports = (tp) => {
    const app = tp.app;

    const liste = (domaine) => {
        const res = [];
        for (const f of app.vault.getMarkdownFiles()) {
            if (!f.path.startsWith(DOSSIER + "/")) continue;
            const fm = app.metadataCache.getFileCache(f)?.frontmatter || {};
            const p = { nom: f.basename, domaine: fm.domaine || "perso", statut: fm.statut || "actif",
                        echeance: fm["échéance"] || null, objectif: fm.objectif || "", fichier: f, mtime: f.stat.mtime };
            if (!domaine || p.domaine === domaine) res.push(p);
        }
        return res.sort((a, b) => STATUTS.indexOf(a.statut) - STATUTS.indexOf(b.statut) || b.mtime - a.mtime);
    };

    const trouver = (nom) => {
        const n = nomPropre(nom).toLowerCase();
        return liste().find(p => p.nom.toLowerCase() === n) || null;
    };

    async function creer(nom, domaine, o = {}) {
        nom = nomPropre(nom);
        if (!nom) return null;
        const deja = trouver(nom);
        if (deja) return deja;
        if (!app.vault.getAbstractFileByPath(DOSSIER)) await app.vault.createFolder(DOSSIER);
        const f = await app.vault.create(`${DOSSIER}/${nom}.md`, contenu(nom, DOMAINES[domaine] ? domaine : "perso", o));
        return { nom, domaine, statut: "actif", fichier: f };
    }

    const deNote = (f) => {
        if (!f) return null;
        if (f.path.startsWith(DOSSIER + "/")) return trouver(f.basename);
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.projet ? trouver(String(fm.projet)) : null;
    };

    // Sélection : projets actifs du domaine, puis « aucun », puis « nouveau ».
    async function choisir(domaine, o = {}) {
        const actifs = liste(domaine).filter(p => p.statut === "actif");
        const choix = [
            ...actifs.map(p => [`📁 ${p.nom}`, p.nom]),
            ["— Aucun projet", ""],
            ["✨ Nouveau projet…", "?"],
        ];
        let r = await tp.system.suggester(choix.map(c => c[0]), choix.map(c => c[1]), false, o.titre || "Projet");
        if (r === null || r === undefined) return o.annulable ? null : "";
        if (r === "?") {
            const nom = await tp.system.prompt("Nom du nouveau projet (court)");
            if (!nom || !nomPropre(nom)) return "";
            const objectif = (await tp.system.prompt("🎯 Objectif en une phrase (facultatif)")) || "";
            r = (await creer(nom, domaine, { objectif }))?.nom || "";
        }
        return r;
    }

    // Création manuelle complète (commande « 📁 Nouveau projet »).
    async function nouveau() {
        const nom = await tp.system.prompt("📁 Nom du projet (court, ex : « Layout batterie v2 »)");
        if (!nom || !nomPropre(nom)) return null;
        if (trouver(nom)) { await app.workspace.getLeaf(false).openFile(trouver(nom).fichier); return trouver(nom); }
        const actif = app.workspace.getActiveFile();
        const devine = CONTEXTE_DOMAINE[tp.user.config().contexteDe(actif?.path, actif ? app.metadataCache.getFileCache(actif)?.frontmatter : null)];
        const ordre = Object.keys(DOMAINES).sort((a, b) => (b === devine) - (a === devine));
        const domaine = await tp.system.suggester(ordre.map(k => DOMAINES[k]), ordre, false, "Domaine du projet");
        if (!domaine) return null;
        const objectif = (await tp.system.prompt("🎯 Objectif en une phrase (facultatif)")) || "";
        const quand = await tp.system.prompt("📅 Échéance du projet (facultatif : « 15/12 », « fin de semaine »…)");
        const p = await creer(nom, domaine, { objectif, echeance: quand ? tp.user.dateFr(quand) || "" : "" });
        await app.workspace.getLeaf(false).openFile(p.fichier);
        return p;
    }

    return { DOSSIER, STATUTS, DOMAINES, CONTEXTE_DOMAINE, nomPropre, liste, trouver, creer, deNote, choisir, nouveau };
};
