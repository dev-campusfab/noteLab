// Valeurs par défaut de noteLab (mises à jour avec noteLab).
// Les réglages PERSONNELS (profil, semestre, contextes, serveur IA, modules actifs) sont dans
// Templates/Config/Réglages.md : ses propriétés remplacent les valeurs ci-dessous, et les mises
// à jour ne le touchent jamais. Ne pas mettre de réglage perso ici.

const REGLAGES = "Templates/Config/Réglages.md";

const CONFIG = {
    // Écrit automatiquement dans les nouvelles notes de cours.
    semestre: "S1",

    typesSeance: ["CM", "TD", "TP", "Révision", "Examen", "Autre"],

    // Notes de travail (Alternance, Fab Lab) : le type choisit les sections du modèle.
    // valeur = ce qui va dans le frontmatter (et le nom des schémas : pas de « / »).
    typesTravail: [
        { valeur: "Réunion",      libelle: "🤝 Réunion / échange (client, partenaire, équipe)", interlocuteurs: true },
        { valeur: "Point tuteur", libelle: "🧭 Point tuteur / manager",                         interlocuteurs: true },
        { valeur: "Étude",        libelle: "🔬 Étude / R&D (problème, calculs, solution)" },
        { valeur: "Visite",       libelle: "🏭 Visite / salon / rencontre fournisseur",         interlocuteurs: true },
        { valeur: "Veille",       libelle: "📚 Veille / conférence / lecture" },
        { valeur: "Suivi",        libelle: "📌 Suivi de tâche / journal de bord" },
        { valeur: "Autre",        libelle: "📝 Autre" },
    ],

    // champ = la propriété qui "range" la note : matière pour l'IUT, projet ailleurs.
    contextes: {
        "IUT":        { dossier: "IUT",        manuscrits: "IUT/Manuscrits",        tag: "iut",        champ: "matière", prof: true },
        "Fab Lab":    { dossier: "Fab Lab",    manuscrits: "Fab Lab/Manuscrits",    tag: "fablab",     champ: "projet",  prof: false },
        "Alternance": { dossier: "Alternance", manuscrits: "Alternance/Manuscrits", tag: "alternance", champ: "projet",  prof: false },
        "Perso":      { dossier: "Perso",      manuscrits: "Perso/Manuscrits",      tag: "perso",      champ: "projet",  prof: false },
    },

    // Largeur d'intégration (px) d'une page manuscrite pleine ; les schémas gardent
    // la largeur par défaut d'Excalidraw.
    largeurPage: 800,

    // Lecture des manuscrits (PNG exportés) par AI Image Analyzer + Omnisearch, ordinateur seulement.
    // Appliqué à chaque démarrage par demarrage.js. La clé API n'est PAS ici (le vault est
    // synchronisé partout) : elle se colle une fois par PC dans les réglages du plugin.
    ocr: {
        url: "http://127.0.0.1:11434",              // Ollama sur ce PC (https://ollama.com) ; réglage ia_url
        secoursLocal: "http://127.0.0.1:11434",     // Ollama du PC, utilisé seulement s'il tourne
        modele: "qwen2.5vl:7b",                     // réglage ia_modele
        prompt:
            "Analyse cette image d'un cahier d'étudiant (texte imprimé et/ou écrit à la main, souvent en français). " +
            "Réponds dans cet ordre exact :\n" +
            "1) Une ligne « Mots-clés : » avec 5 à 8 mots-clés en français tirés de ce que tu lis.\n" +
            "2) Une phrase qui décrit ce que montre l'image (schéma, graphique, formules, photo...).\n" +
            "3) « Transcription : » puis tout le texte lisible recopié mot pour mot, formules comprises. " +
            "N'invente rien : si un mot est illisible, écris [?].",
    },
};

// Propriétés de Réglages.md (lecture synchrone dans le cache d'Obsidian).
function reglages() {
    try { return window.app?.metadataCache?.getCache?.(REGLAGES)?.frontmatter || {}; } catch (e) { return {}; }
}
const liste = (v) => Array.isArray(v) ? v.map(String) : typeof v === "string" && v.trim() ? v.split(",").map(x => x.trim()) : null;

module.exports = () => {
    const R = reglages();
    const choisis = liste(R.contextes);
    const contextes = choisis
        ? Object.fromEntries(Object.entries(CONFIG.contextes).filter(([nom]) => choisis.includes(nom)))
        : CONFIG.contextes;
    const modules = liste(R.modules) || ["taches", "notes"];
    return {
        ...CONFIG,
        REGLAGES,
        reglages: R,
        // Modules actifs (le cœur toujours) ; « ia » demande « taches ».
        modules: modules.filter(m => m !== "ia" || modules.includes("taches")),
        source: R.source === true,
        ruban: R.ruban === true,
        semestre: R.semestre || CONFIG.semestre,
        contextes,
        ocr: { ...CONFIG.ocr, url: R.ia_url || CONFIG.ocr.url, modele: R.ia_modele || CONFIG.ocr.modele },
        agent: {
            profil: R.profil || "",
            fablab: R.fablab || "",
            alternance: R.alternance || "",
            motsAlternance: R.mots_alternance || "",
            motsFablab: R.mots_fablab || "",
        },
        contexteDe,
    };

    // Contexte d'un fichier : d'abord son frontmatter, sinon son dossier.
    function contexteDe(chemin, fm) {
        if (fm && contextes[fm.contexte]) return fm.contexte;
        const p = String(chemin || "");
        for (const [nom, c] of Object.entries(contextes)) {
            if (p === c.dossier || p.startsWith(c.dossier + "/")) return nom;
        }
        return null;
    }
};
