// Sélection multiple basée sur comboSuggest : on ajoute des valeurs une par une,
// on peut en créer de nouvelles, et on voit la sélection courante dans le placeholder.
// opts = { label: "Tag", preselected: ["iut"], normalize: (v) => v }
// Retourne un tableau de strings (sans doublons).

const FIN = "✅ Terminer";

module.exports = async (tp, items, opts) => {
    const o = opts || {};
    const label = o.label || "Valeur";
    const normalize = o.normalize || function (v) { return v.trim(); };
    const choisis = [];

    (o.preselected || []).forEach(function (v) {
        const n = normalize(v);
        if (n && !choisis.includes(n)) choisis.push(n);
    });

    const dispoInitial = (items || []).map(normalize).filter(function (v, i, arr) {
        return v && arr.indexOf(v) === i;
    });

    for (;;) {
        const restants = dispoInitial.filter(function (v) {
            return !choisis.includes(v);
        });
        const placeholder =
            label + " — sélection : " +
            (choisis.length ? choisis.join(", ") : "aucune") +
            " · Échap ou « Terminer » pour finir";

        const choix = await tp.user.comboSuggest(tp, [FIN].concat(restants), placeholder);
        if (choix === null || choix === "" || choix === FIN) break;

        const n = normalize(choix);
        if (n && !choisis.includes(n)) choisis.push(n);
    }

    return choisis;
};
