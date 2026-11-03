// Échéance (AAAA-MM-JJ) trouvée dans un texte en français, ou null.
// « aujourd'hui », « demain », « après-demain », « lundi »… (le prochain), « semaine prochaine »,
// « fin de semaine », « 12/11 », « 3/1/27 », « urgent » (= aujourd'hui).
// Utilisé par la capture rapide (nouvelleTache) et l'agent (agentTaches).

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dans = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

function dateDans(texte) {
    const t = texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const auj = new Date().getDay();
    if (/\b(aujourd'?\s?hui|auj|ce soir|ce matin|urgent|urgente|asap)\b/.test(t)) return dans(0);
    if (/\bapres[- ]demain\b/.test(t)) return dans(2);
    if (/\bdemain\b/.test(t)) return dans(1);
    if (/\bsemaine prochaine\b/.test(t)) return dans(((8 - auj) % 7) || 7);
    if (/\bfin de (la )?semaine\b/.test(t)) return dans((5 - auj + 7) % 7);
    const m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
        const an = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
        let d = iso(new Date(an, Number(m[2]) - 1, Number(m[1])));
        if (!m[3] && d < dans(0)) d = iso(new Date(an + 1, Number(m[2]) - 1, Number(m[1])));
        return d;
    }
    // « mardi prochain » = le mardi de la semaine prochaine (pas demain si on est lundi).
    const lundiProchain = ((8 - auj) % 7) || 7;
    for (let i = 0; i < 7; i++) {
        if (new RegExp(`\\b${JOURS[i]} prochain\\b`).test(t)) return dans(lundiProchain + (i + 6) % 7);
    }
    for (let i = 0; i < 7; i++) {
        if (new RegExp(`\\b${JOURS[i]}\\b`).test(t)) return dans(((i - auj + 7) % 7) || 7);
    }
    return null;
}

module.exports = (texte) => dateDans(String(texte || ""));
