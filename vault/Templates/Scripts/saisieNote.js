// Demande les métadonnées d'une note (ou d'un manuscrit sans note) pour un contexte.
// Retourne { contexte, matière|projet, type, prof?, semestre?, interlocuteurs? } ou null si annulé
// dès la première question. opts.complet : note de travail complète (demande les interlocuteurs).

module.exports = async (tp, nomContexte, opts) => {
    const C = tp.user.config();
    const ctx = C.contextes[nomContexte];
    if (!ctx) return null;

    const meta = { contexte: nomContexte };
    const libelle = ctx.champ === "matière" ? "Matière" : "Projet";
    const valeur = await tp.user.comboSuggest(
        tp, tp.user.valeursVault(tp, ctx.champ), `${libelle} (tape pour chercher ou créer)`);
    if (valeur === null) return null;
    meta[ctx.champ] = valeur;

    if (ctx.prof) {
        // Les profs déjà vus dans cette matière d'abord, puis tous les autres.
        const profs = [...new Set([
            ...tp.user.valeursVault(tp, "prof", { cle: "matière", valeur }),
            ...tp.user.valeursVault(tp, "prof"),
        ])];
        meta.prof = (await tp.user.comboSuggest(tp, profs, `Prof — ${valeur}`)) || "";
        meta.type = (await tp.system.suggester(C.typesSeance, C.typesSeance, false, "Type de séance")) || "";
        meta.semestre = C.semestre;
    } else {
        const types = C.typesTravail;
        meta.type = (await tp.system.suggester(types.map(t => t.libelle), types.map(t => t.valeur), false, "Type de note")) || "Autre";
        // Interlocuteurs : seulement pour une vraie note (pas un manuscrit orphelin) d'échange.
        if (opts?.complet && types.find(t => t.valeur === meta.type)?.interlocuteurs) {
            const connus = [...new Set([
                ...tp.user.valeursVault(tp, "interlocuteurs", { cle: "projet", valeur }),
                ...tp.user.valeursVault(tp, "interlocuteurs"),
            ])];
            meta.interlocuteurs = await tp.user.multiSuggest(tp, connus, { label: "Interlocuteurs (personne ou entreprise)" });
        }
    }
    return meta;
};
