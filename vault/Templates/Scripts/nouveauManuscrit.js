// Crée un manuscrit Excalidraw rattaché à une note, qui HÉRITE de ses métadonnées.
// Un tracé n'est pas du texte : sans frontmatter, aucune recherche ne le retrouve.
//
// Deux formes :
//  - « schéma » : petit dessin dans une note tapée
//  - « page »   : page d'une note entièrement manuscrite (format: manuscrite)
//
// Appels :
//  - commande « ✍️ Nouveau manuscrit » (enregistrée par demarrage.js), sans options :
//      · depuis une note tapée → schéma inséré au curseur
//      · depuis un manuscrit   → page (ou schéma) suivant(e), rattaché(e) à la même note
//      · depuis ailleurs       → on choisit la note de rattachement (ou aucune)
//  - Template_cours / Template_projet, format « manuscrite » :
//      nouveauManuscrit(tp, { note, meta, titre }) → crée la page 1, renvoie le lien.

// ea.create() écrit le frontmatter en brut : on cite les valeurs pour qu'un sujet
// contenant ":" ou "#" ne casse pas le YAML du dessin.
const yaml = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '\\"') + '"';

const assainir = (s) =>
    String(s).replace(/[\\/:*?"<>|#^\[\]]/g, "").replace(/\s+/g, " ").trim();

const TAGS_NON_HERITES = new Set(["cours", "index", "excalidraw", "manuscrit"]);
const AUCUNE = "∅ Aucune note — dessin libre";

const fmDe = (app, f) => app.metadataCache.getFileCache(f)?.frontmatter || {};

const estDessin = (app, f) =>
    !!f && f.extension === "md" &&
    (f.basename.endsWith(".excalidraw") || !!fmDe(app, f)["excalidraw-plugin"]);

// Note pointée par le champ `note` d'un dessin (`cours` : ancien nom du champ).
function noteLiee(app, dessin) {
    const fm = fmDe(app, dessin);
    const m = String(fm.note ?? fm.cours ?? "").match(/\[\[([^\]|#]+)/);
    return m ? app.metadataCache.getFirstLinkpathDest(m[1], dessin.path) : null;
}

function metaDe(C, file, fm) {
    const meta = { contexte: C.contexteDe(file.path, fm) };
    for (const k of ["matière", "projet", "prof", "type", "semestre"]) {
        if (fm[k] && fm[k] !== "null") meta[k] = String(fm[k]);
    }
    const t = fm.tags;
    meta.tags = (Array.isArray(t) ? t : t ? [t] : []).map(x => String(x).replace(/^#/, ""));
    return meta;
}

async function choisirNote(tp, C) {
    const app = tp.app;
    const noms = Object.keys(C.contextes);
    const contexte = await tp.system.suggester(noms, noms, false, "Contexte du manuscrit");
    if (!contexte) return null;
    const ctx = C.contextes[contexte];
    const notes = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(ctx.dossier + "/")
            && !f.path.startsWith(ctx.manuscrits + "/")
            && !estDessin(app, f))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);
    const choix = await tp.system.suggester(
        [AUCUNE, ...notes.map(f => f.path.slice(ctx.dossier.length + 1).replace(/\.md$/, ""))],
        [AUCUNE, ...notes], false, "Rattacher à quelle note ?");
    if (!choix) return null;
    return { contexte, note: choix === AUCUNE ? null : choix };
}

// Ajoute le lien sous la section manuscrite de la note (créée au besoin),
// à la place de la puce vide du modèle s'il y en a une.
async function ajouterDansNote(app, note, lien) {
    await app.vault.process(note, (texte) => {
        const lignes = texte.split("\n");
        const i = lignes.findIndex(l => /^#{1,6}\s.*(Pages manuscrites|Notes manuscrites)/i.test(l));
        if (i === -1) return texte.replace(/\s*$/, "") + "\n\n## ✍️ Notes manuscrites\n" + lien + "\n";
        const niveau = lignes[i].match(/^#+/)[0].length;
        let fin = lignes.length;
        for (let j = i + 1; j < lignes.length; j++) {
            const m = lignes[j].match(/^(#+)\s/);
            if (m && m[1].length <= niveau) { fin = j; break; }
        }
        let pos = fin;
        while (pos - 1 > i && lignes[pos - 1].trim() === "") pos--;
        if (pos - 1 > i && lignes[pos - 1].trim() === "-") lignes.splice(--pos, 1);
        lignes.splice(pos, 0, lien);
        return lignes.join("\n");
    });
}

function nomLibre(app, dossier, base) {
    const existe = (n) => !!app.vault.getAbstractFileByPath(`${dossier}/${n}.excalidraw.md`);
    if (!existe(base)) return base;
    let k = 2;
    while (existe(`${base} (${k})`)) k++;
    return `${base} (${k})`;
}

module.exports = async (tp, opts = {}) => {
    const app = tp.app;
    const C = tp.user.config();
    const Notice = tp.obsidian.Notice;
    const ea = window.ExcalidrawAutomate?.getAPI?.() ?? window.ExcalidrawAutomate;
    if (!ea) { new Notice("Excalidraw n'est pas chargé."); return ""; }

    // ---------- 1. À quelle note rattacher, et que lui hériter ? ----------
    const actif = app.workspace.getActiveFile();
    const depuisDessin = !opts.meta && estDessin(app, actif);
    let note = opts.note || null;
    let meta = opts.meta ? { ...opts.meta } : null;

    if (!meta) {
        if (depuisDessin) note = noteLiee(app, actif);
        else if (actif && actif.extension === "md") note = actif;

        if (note) {
            meta = metaDe(C, note, fmDe(app, note));
        } else if (depuisDessin && C.contexteDe(actif.path, fmDe(app, actif))) {
            meta = metaDe(C, actif, fmDe(app, actif));   // suite d'un dessin libre
        } else {
            const r = await choisirNote(tp, C);
            if (!r) return "";
            note = r.note;
            meta = note ? metaDe(C, note, fmDe(app, note)) : await tp.user.saisieNote(tp, r.contexte);
            if (!meta) return "";
            meta.contexte = meta.contexte || r.contexte;
        }
    }

    // Note rangée hors des dossiers connus : on demande le contexte.
    if (!meta.contexte) {
        const noms = Object.keys(C.contextes);
        meta.contexte = await tp.system.suggester(noms, noms, false, "Contexte du manuscrit");
        if (!meta.contexte) return "";
    }
    const ctx = C.contextes[meta.contexte];
    if (!meta[ctx.champ]) {
        const v = await tp.user.comboSuggest(tp, tp.user.valeursVault(tp, ctx.champ),
            ctx.champ === "matière" ? "Matière du manuscrit" : "Projet du manuscrit");
        if (!v) return "";
        meta[ctx.champ] = v;
    }

    // ---------- 2. Forme, sujet, nom ----------
    const pageDeNote = !!opts.meta || (note && fmDe(app, note).format === "manuscrite");
    const forme = pageDeNote ? "page" : "schéma";
    const date = tp.date.now("YYYY-MM-DD");
    let nom, sujet;

    if (forme === "page") {
        const base = assainir(opts.titre || note?.basename || meta[ctx.champ]);
        let n = 1;
        while (app.vault.getAbstractFileByPath(`${ctx.manuscrits}/${base} - p${n}.excalidraw.md`)) n++;
        nom = `${base} - p${n}`;
        sujet = n === 1 ? base : `${base} (page ${n})`;
    } else {
        sujet = await tp.system.prompt("Sujet du schéma (ex : Exercice 3, Montage ampli)");
        if (sujet === null) return "";
        sujet = sujet.trim();
        const morceaux = [assainir(meta[ctx.champ]), meta.type, assainir(sujet) || "schéma", date]
            .filter(x => x && x.length > 0);
        nom = nomLibre(app, ctx.manuscrits, morceaux.join(" - "));
    }

    // ---------- 3. Création du dessin ----------
    const tags = new Set(["excalidraw", "manuscrit", ctx.tag, assainir(meta[ctx.champ]).replace(/\s+/g, "-")]);
    (meta.tags || []).forEach(t => { if (!TAGS_NON_HERITES.has(t)) tags.add(t); });

    const noteLien = note ? `[[${note.basename}]]` : (opts.titre ? `[[${opts.titre}]]` : "aucune");
    const frontmatterKeys = {
        "excalidraw-plugin": "parsed",
        "contexte": yaml(meta.contexte),
        [ctx.champ]: yaml(meta[ctx.champ]),
    };
    if (ctx.prof) {
        frontmatterKeys.prof = yaml(meta.prof || "");
        frontmatterKeys.type = yaml(meta.type || "");
        frontmatterKeys.semestre = yaml(meta.semestre || C.semestre);
    } else if (meta.type) {
        frontmatterKeys.type = yaml(meta.type);
    }
    Object.assign(frontmatterKeys, {
        "forme": yaml(forme),
        "sujet": yaml(sujet),
        "note": yaml(noteLien),
        "date": date,
        "tags": "[" + Array.from(tags).filter(Boolean).join(", ") + "]",
    });

    if (!app.vault.getAbstractFileByPath(ctx.manuscrits)) await app.vault.createFolder(ctx.manuscrits);
    ea.reset();
    const chemin = await ea.create({
        filename: nom,
        foldername: ctx.manuscrits,
        frontmatterKeys,
        onNewPane: false,
        silent: true,
    });

    // ---------- 4. Lien dans la note + ouverture ----------
    const lien = forme === "page" ? `![[${nom}.excalidraw|${C.largeurPage}]]` : `![[${nom}.excalidraw]]`;

    // Depuis un dessin : on reste dans le même onglet, comme on tourne une page.
    // différé : laisse Templater / l'éditeur finir d'écrire avant de changer de vue.
    setTimeout(() => app.workspace.openLinkText(chemin, "", !depuisDessin), 400);

    if (opts.meta) return lien;                      // le modèle de note l'écrit lui-même

    const vue = app.workspace.getActiveViewOfType(tp.obsidian.MarkdownView);
    if (note && vue && vue.file === note && !depuisDessin) {
        vue.editor.replaceSelection(lien + "\n");
    } else if (note) {
        await ajouterDansNote(app, note, lien);
        new Notice(`✍️ Ajouté à « ${note.basename} »`);
    }
    return "";
};
