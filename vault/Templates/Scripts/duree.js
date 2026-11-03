// Durées des tâches : estimation « ⏱️ 2h » et temps réellement passé « ⌛ 1h20 » (dans la ligne de la tâche,
// avant les champs Tasks). Même format que Templates/Vues/taches.js.
//   tp.user.duree().lire("1h30" | "2" | "1,5h" | "45 min") → minutes (ou null)
//   tp.user.duree().jeton(minutes)                          → « 1h30 », « 2h », « 45min »
//   tp.user.duree().extraire(texte) → { texte sans la durée, minutes } : « 2h », « 1h30 », « 30 min »
//     dans une phrase ; « à 14h », « vers 9h30 »… sont des heures, pas des durées.

function lire(s) {
    if (s === null || s === undefined) return null;
    const x = String(s).trim().toLowerCase().replace(",", ".");
    let m;
    if ((m = x.match(/^(\d+(?:\.\d+)?)\s*(?:h|heures?)?$/))) return Math.round(parseFloat(m[1]) * 60) || null;
    if ((m = x.match(/^(\d+)\s*h\s*(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]) || null;
    if ((m = x.match(/^(\d+)\s*(?:min|mn|m|minutes?)$/))) return Number(m[1]) || null;
    return null;
}

function jeton(min) {
    min = Math.round(min);
    if (!min || min < 1) return "";
    const h = Math.floor(min / 60), r = min % 60;
    return h ? `${h}h${r ? String(r).padStart(2, "0") : ""}` : `${r}min`;
}

const HEURE_DU_JOUR = /(?:^|\s)(?:à|a|vers|avant|après|apres|dès|des|jusqu'à|jusqua|pour)\s*$/i;

function extraire(texte) {
    const re = /(^|\s)(\d{1,2}(?:[.,]\d)?\s?h(?:\d{2})?|\d{1,3}\s?(?:min|mn)|\d{1,2}\s?heures?)(?=\s|[.,;!?]|$)/gi;
    let m;
    while ((m = re.exec(texte))) {
        if (HEURE_DU_JOUR.test(texte.slice(0, m.index + m[1].length))) continue;
        const min = lire(m[2].replace(/\s/g, "").replace(/heures?$/i, "h"));
        if (!min) continue;
        const reste = (texte.slice(0, m.index) + m[1] + texte.slice(m.index + m[0].length)).replace(/\s{2,}/g, " ").trim();
        return { texte: reste, minutes: min };
    }
    return { texte, minutes: null };
}

module.exports = () => ({ lire, jeton, extraire });
