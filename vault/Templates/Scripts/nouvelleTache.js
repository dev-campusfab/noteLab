// Capture rapide d'une tâche (commande « ➕ Nouvelle tâche », bouton du ruban, bouton des vues).
// On tape la tâche en langage courant ; ce qui est compris évite les questions suivantes :
//   « demain », « lundi », « 12/11 », « aujourd'hui », « semaine prochaine » → échéance 📅
//   « ! » → importante ⏫ · « !! » → priorité max 🔺 · #perso #fablab #iut #alternance → domaine
//   « 2h », « 1h30 », « 45 min » → temps prévu ⏱️ (« à 14h » est une heure, pas une durée)
// Projet : celui de la note ouverte (note du projet, ou note avec « projet: »), sinon une question.
// Le texte reste tel quel (seuls les « ! » sont retirés). La tâche va dans Tâches/Boîte de réception,
// avec un lien vers la note ouverte s'il y en a une (pour retrouver le contexte).

const BOITE = "Tâches/Boîte de réception.md";
const DOMAINES = [
    { tag: "perso", nom: "🏠 Perso", dossier: null },
    { tag: "fablab", nom: "🛠️ Fab Lab", dossier: "Fab Lab" },
    { tag: "iut", nom: "🎓 IUT", dossier: "IUT" },
    { tag: "alternance", nom: "💼 Alternance", dossier: "Alternance" },
];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dans = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const court = (s) => { const d = new Date(s + "T12:00"); return `${JOURS[d.getDay()].slice(0, 3)}. ${s.slice(8)}/${s.slice(5, 7)}`; };

module.exports = async (tp) => {
    const app = tp.app;
    const Notice = tp.obsidian.Notice;
    const actif = app.workspace.getActiveFile();

    let texte = await tp.system.prompt("Tâche (ex : « Envoyer le rapport à Marc vendredi 1h ! »)");
    if (!texte || !texte.trim()) return;
    texte = texte.trim();

    // Priorité
    let prio = "";
    if (/(^|\s)!!(\s|$)/.test(texte) || /!!$/.test(texte)) prio = " 🔺";
    else if (/(^|\s)!(\s|$)/.test(texte) || /!$/.test(texte)) prio = " ⏫";
    texte = texte.replace(/\s*!+(?=\s|$)/g, "").trim();

    // Temps prévu
    const D = tp.user.duree();
    const { texte: sansDuree, minutes } = D.extraire(texte);
    texte = sansDuree;
    const estimation = minutes ? ` ⏱️ ${D.jeton(minutes)}` : "";

    // Domaine : tag tapé, sinon question (le domaine de la note ouverte en premier)
    let domaine = (texte.match(/#(perso|fablab|iut|alternance)\b/i) || [])[1]?.toLowerCase();
    if (!domaine) {
        const devine = DOMAINES.find(d => d.dossier && actif?.path.startsWith(d.dossier + "/"));
        const ordre = devine ? [devine, ...DOMAINES.filter(d => d !== devine)] : DOMAINES;
        domaine = await tp.system.suggester(ordre.map(d => d.nom), ordre.map(d => d.tag), false, "Domaine");
        if (!domaine) return;
        texte += ` #${domaine}`;
    }

    // Projet : déduit de la note ouverte, sinon demandé (Échap = aucun).
    const P = tp.user.projets(tp);
    let projet = P.deNote(actif);
    if (projet && projet.domaine !== domaine) projet = null;
    const nomProjet = projet ? projet.nom : await P.choisir(domaine);

    // Échéance : comprise dans le texte, sinon question
    let date = tp.user.dateFr(texte);
    if (!date) {
        const vendredi = dans((5 - new Date().getDay() + 7) % 7);
        const lundi = dans(((8 - new Date().getDay()) % 7) || 7);
        const choix = [
            ["📍 Aujourd'hui", dans(0)],
            ["➡️ Demain", dans(1)],
            [`🗓️ Cette semaine (${court(vendredi)})`, vendredi],
            [`⏭️ Semaine prochaine (${court(lundi)})`, lundi],
            ["📥 Sans date (je planifierai à la revue)", ""],
            ["📆 Choisir une date…", "?"],
        ];
        date = await tp.system.suggester(choix.map(c => c[0]), choix.map(c => c[1]), false, "Échéance");
        if (date === null || date === undefined) date = "";
        if (date === "?") {
            const saisie = await tp.system.prompt("Date (JJ/MM)");
            date = saisie ? tp.user.dateFr(saisie) || "" : "";
        }
    }

    const source = actif && actif.extension === "md" && actif.path !== BOITE && !actif.path.startsWith("Tâches/") ? actif : null;
    // Lien vers le projet (s'il n'est pas déjà la note ouverte), puis vers la note d'origine.
    const lien = (nomProjet && source?.basename !== nomProjet ? ` [[${nomProjet}]]` : "")
        + (source ? ` ([[${source.basename}]])` : "");
    const ligne = `- [ ] ${texte}${lien}${estimation}${prio}${date ? ` 📅 ${date}` : ""} ➕ ${dans(0)}`;

    let f = app.vault.getAbstractFileByPath(BOITE);
    if (!f) {
        if (!app.vault.getAbstractFileByPath("Tâches")) await app.vault.createFolder("Tâches");
        f = await app.vault.create(BOITE, "# 📥 Boîte de réception\n\nTâches ajoutées avec ➕. Elles apparaissent dans [[Tâches]], le kanban et le calendrier.\n\n");
    }
    await app.vault.process(f, (txt) => txt.replace(/\n*$/, "\n") + ligne + "\n");
    new Notice(`✅ Ajoutée${nomProjet ? " à 📁 " + nomProjet : ""}${date ? " pour " + court(date) : ""}${minutes ? " (⏱️ " + D.jeton(minutes) + ")" : ""} : ${texte.replace(/\s#\w+$/, "")}`, 4000);
};
