// Range un dessin Excalidraw orphelin (sans contexte ou sans note liée) :
// on choisit la note de rattachement, le dessin hérite de ses métadonnées,
// est déplacé dans le dossier Manuscrits du contexte et lié dans la note.
// Le dessin actif (s'il est orphelin) est proposé en premier.

const AUCUNE = "∅ Aucune note — dessin libre";

const fmDe = (app, f) => app.metadataCache.getFileCache(f)?.frontmatter || {};
const assainir = (s) =>
    String(s).replace(/[\\/:*?"<>|#^\[\]]/g, "").replace(/\s+/g, " ").trim();

module.exports = async (tp) => {
    const app = tp.app;
    const C = tp.user.config();
    const Notice = tp.obsidian.Notice;

    const orphelins = app.vault.getMarkdownFiles()
        .filter(f => f.basename.endsWith(".excalidraw") && !f.path.startsWith("Templates/"))
        .filter(f => { const fm = fmDe(app, f); return !fm.contexte || !fm.note; })
        .sort((a, b) => b.stat.ctime - a.stat.ctime);
    const actif = app.workspace.getActiveFile();
    if (actif && orphelins.includes(actif)) orphelins.unshift(...orphelins.splice(orphelins.indexOf(actif), 1));
    if (!orphelins.length) { new Notice("✅ Aucun manuscrit à classer."); return; }

    const dessin = await tp.system.suggester(
        orphelins.map(f => `${f.basename.replace(/\.excalidraw$/, "")}  ·  ${f.parent.path}`),
        orphelins, false, `${orphelins.length} manuscrit(s) à classer`);
    if (!dessin) return;

    // Un dessin ouvert serait réécrit par Excalidraw à la fermeture, écrasant nos changements.
    if (app.workspace.getLeavesOfType("excalidraw").some(l => l.view?.file === dessin)) {
        new Notice("Ferme d'abord ce dessin, puis relance « Classer un manuscrit ».");
        return;
    }

    const noms = Object.keys(C.contextes);
    const contexte = await tp.system.suggester(noms, noms, false, "Contexte");
    if (!contexte) return;
    const ctx = C.contextes[contexte];

    const notes = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(ctx.dossier + "/") && !f.path.startsWith(ctx.manuscrits + "/")
            && !f.basename.endsWith(".excalidraw"))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);
    const choix = await tp.system.suggester(
        [AUCUNE, ...notes.map(f => f.path.slice(ctx.dossier.length + 1).replace(/\.md$/, ""))],
        [AUCUNE, ...notes], false, "Rattacher à quelle note ?");
    if (!choix) return;
    const note = choix === AUCUNE ? null : choix;

    let meta;
    if (note) {
        const fmN = fmDe(app, note);
        meta = { contexte };
        for (const k of [ctx.champ, "prof", "type", "semestre"]) if (fmN[k]) meta[k] = String(fmN[k]);
    } else {
        meta = await tp.user.saisieNote(tp, contexte);
        if (!meta) return;
    }
    if (!meta[ctx.champ]) {
        meta[ctx.champ] = await tp.user.comboSuggest(tp, tp.user.valeursVault(tp, ctx.champ), ctx.champ);
        if (!meta[ctx.champ]) return;
    }

    const ancien = fmDe(app, dessin);
    const sujet = await tp.system.prompt("Sujet du manuscrit", ancien.sujet || "");
    if (sujet === null) return;

    const date = ancien.date || window.moment(dessin.stat.ctime).format("YYYY-MM-DD");
    const forme = note && fmDe(app, note).format === "manuscrite" ? "page" : "schéma";

    await app.fileManager.processFrontMatter(dessin, (fm) => {
        delete fm.cours;
        fm.contexte = contexte;
        fm[ctx.champ] = meta[ctx.champ];
        if (ctx.prof) {
            fm.prof = meta.prof || "";
            fm.type = meta.type || "";
            fm.semestre = meta.semestre || C.semestre;
        }
        fm.forme = forme;
        fm.sujet = sujet.trim();
        fm.note = note ? `[[${note.basename}]]` : "aucune";
        fm.date = date;
        const tags = new Set(Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []);
        ["excalidraw", "manuscrit", ctx.tag, assainir(meta[ctx.champ]).replace(/\s+/g, "-")].forEach(t => tags.add(t));
        fm.tags = [...tags];
    });

    // Déplacement + renommage : fileManager met à jour tous les liens du vault.
    if (!app.vault.getAbstractFileByPath(ctx.manuscrits)) await app.vault.createFolder(ctx.manuscrits);
    const base = [assainir(meta[ctx.champ]), meta.type, assainir(sujet) || "manuscrit", date]
        .filter(x => x && x.length > 0).join(" - ");
    let nom = base, k = 2;
    while (app.vault.getAbstractFileByPath(`${ctx.manuscrits}/${nom}.excalidraw.md`)) nom = `${base} (${k++})`;
    await app.fileManager.renameFile(dessin, `${ctx.manuscrits}/${nom}.excalidraw.md`);

    if (note && !(await app.vault.read(note)).includes(`${nom}.excalidraw`)) {
        const lien = forme === "page" ? `![[${nom}.excalidraw|${C.largeurPage}]]` : `![[${nom}.excalidraw]]`;
        await app.vault.process(note, (t) => {
            const re = /^#{1,6}\s.*(Pages manuscrites|Notes manuscrites).*$/mi;
            return re.test(t) ? t.replace(re, (h) => h + "\n" + lien)
                : t.replace(/\s*$/, "") + "\n\n## ✍️ Notes manuscrites\n" + lien + "\n";
        });
    }
    new Notice(`✅ Classé : ${nom}` + (note ? ` → ${note.basename}` : ""));
};
