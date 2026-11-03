// Valeurs déjà utilisées pour une propriété du frontmatter, la plus récente en premier
// (sur iPad, la bonne valeur est presque toujours en haut de la liste).
// filtre = { cle, valeur } pour ne garder que les notes où cle === valeur
// (ex : les profs déjà vus pour la matière "OML").

module.exports = (tp, cle, filtre) => {
    const vues = new Map(); // valeur -> date de modif la plus récente
    for (const f of tp.app.vault.getMarkdownFiles()) {
        const fm = tp.app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;
        if (filtre && String(fm[filtre.cle] ?? "").trim() !== filtre.valeur) continue;
        // Valeur simple ou liste (ex : interlocuteurs).
        for (const v of Array.isArray(fm[cle]) ? fm[cle] : [fm[cle]]) {
            if (typeof v !== "string") continue;
            const t = v.trim();
            if (!t || t === "null") continue;
            vues.set(t, Math.max(vues.get(t) || 0, f.stat.mtime));
        }
    }
    return [...vues.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
};
