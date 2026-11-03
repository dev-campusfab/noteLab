// Vues des tâches (Dataview JS) : await dv.view("Templates/Vues/taches", { mode })
// mode : "maintenant" | "charge" | "liste" | "kanban" | "calendrier" | "revue" | "projets" | "projet"
//   "projets" = tableau de bord de tous les projets · "projet" = la page d'un projet (note de Projets/)
// Une tâche = une case « - [ ] » n'importe où dans le vault (hors Templates/), au format Tasks :
//   📅 échéance · ⏳ prévue · ➕ créée · ✅ faite · 🔺⏫🔼🔽⏬ priorité · #perso #fablab #iut #alternance
// Détails : lignes « - » indentées sous la tâche (description, ![[photo]], [[fichier]]) ;
// édités avec « 📝 Détails » (fichiers et photos rangés dans Media/Tâches).
// Historique : lignes « - 🕓 AAAA-MM-JJ HH:MM · action » sous la tâche, écrites par chaque action
// faite depuis ces vues (terminer, commencer, date, projet, renommer, détails…).
// Temps : « ⏱️ 2h » = estimation, « ⌛ 1h20 » = temps réellement passé, dans la ligne (avant les champs Tasks).
// Chrono : « ▶️ Je commence » le lance, Pause / Terminée / Remettre à faire l'arrête et ajoute le temps à ⌛
// (calculé depuis l'historique). Un seul chrono à la fois. Projets : « estimation: » (heures) dans le frontmatter.
// Le domaine vient du tag, sinon du dossier de la note. Le projet : note du projet, lien [[Projet]]
// dans la tâche, ou frontmatter « projet: » de la note qui la contient (voir Scripts/projets.js). Clic sur une tâche → menu d'actions
// (marche au doigt sur iPad) ; glisser-déposer sur ordinateur dans le kanban et le calendrier.

const app = dv.app;
const mode = input?.mode || "liste";

// ---------- Domaines (mêmes tags que config.js) ----------
const DOMAINES = {
    perso:      { nom: "Perso",      couleur: "#a78bfa", dossier: null },
    fablab:     { nom: "Fab Lab",    couleur: "#f59e0b", dossier: "Fab Lab" },
    iut:        { nom: "IUT",        couleur: "#60a5fa", dossier: "IUT" },
    alternance: { nom: "Alternance", couleur: "#34d399", dossier: "Alternance" },
    trier:      { nom: "À trier",    couleur: "#9ca3af", dossier: null },
};
const COMMANDE_AJOUT = "notes-campus:nouvelle-tache";
const DOSSIER_PROJETS = "Projets";
const DOSSIER_PJ = "Media/Tâches";
const LIEN_SEUL = /^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/;
const IMAGE = /\.(png|jpe?g|gif|webp|heic|svg|bmp)$/i;
const HIST = /^🕓\uFE0F?\s*/u;

// Détails d'une tâche à partir de ses sous-éléments Dataview (hors sous-tâches).
function detailsDe(t) {
    const desc = [], pj = [], hist = [];
    for (const c of (t.children || [])) {
        if (c.task || c.status !== undefined) continue;
        const x = (c.text || "").trim();
        const m = x.match(LIEN_SEUL);
        if (HIST.test(x)) hist.push(x.replace(HIST, "").trim());
        else if (m) pj.push(m[1].trim()); else if (x) desc.push(x);
    }
    return { desc, pj, hist };
}

// ---------- Projets (notes de Projets/) ----------
const PROJETS = new Map();   // nom en minuscules → { nom, domaine, statut, echeance, objectif, path }
for (const p of dv.pages(`"${DOSSIER_PROJETS}"`)) {
    PROJETS.set(p.file.name.toLowerCase(), {
        nom: p.file.name, path: p.file.path, domaine: p.domaine || "perso", statut: p.statut || "actif",
        echeance: p["échéance"] ? String(p["échéance"]).slice(0, 10) : null, objectif: p.objectif || "",
        estimation: Number(String(p.estimation ?? "").replace(",", ".")) || 0, cree: p["créé"] ? String(p["créé"]).slice(0, 10) : null,
    });
}
const projetFm = new Map();  // chemin d'une note → projet de son frontmatter
for (const p of dv.pages('-"Templates"').where(p => p.projet)) {
    const pr = PROJETS.get(String(p.projet).trim().toLowerCase());
    if (pr) projetFm.set(p.file.path, pr);
}
function projetDe(t) {
    if (t.path.startsWith(DOSSIER_PROJETS + "/")) {
        const pr = PROJETS.get(t.note.toLowerCase());
        if (pr) return pr;
    }
    for (const m of t.brut.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) {
        const f = app.metadataCache.getFirstLinkpathDest(m[1].trim(), t.path);
        if (f && f.path.startsWith(DOSSIER_PROJETS + "/")) return PROJETS.get(f.basename.toLowerCase()) || null;
    }
    return projetFm.get(t.path) || null;
}

// ---------- Dates (chaînes AAAA-MM-JJ, heure locale) ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lire = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const plus = (s, n) => { const d = lire(s); d.setDate(d.getDate() + n); return iso(d); };
const AUJ = iso(new Date());
const ecart = (s) => Math.round((lire(s) - lire(AUJ)) / 864e5);
const lundiDe = (s) => { const d = lire(s); return plus(s, -((d.getDay() + 6) % 7)); };
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const jourCourt = (s) => `${JOURS[lire(s).getDay()]} ${s.slice(8)}/${s.slice(5, 7)}`;
const libelleDate = (s) => {
    const j = ecart(s);
    if (j === 0) return "aujourd'hui";
    if (j === 1) return "demain";
    if (j === -1) return "hier";
    if (j < 0) return `retard ${-j} j`;
    if (j < 7) return JOURS[lire(s).getDay()];
    return jourCourt(s);
};

// ---------- Durées (minutes) : « ⏱️ 1h30 » estimation, « ⌛ 45min » temps passé ----------
const JETON = (e) => new RegExp(`\\s?${e}\\uFE0F?\\s*(\\d+h(?:\\d{1,2})?|\\d+min)`, "u");
const dureeDe = (txt, e) => { const m = txt.match(JETON(e)); return m ? lireDuree(m[1]) : 0; };
function lireDuree(s) {
    const x = String(s ?? "").trim().toLowerCase().replace(",", ".");
    let m;
    if ((m = x.match(/^(\d+(?:\.\d+)?)\s*(?:h|heures?)?$/))) return Math.round(parseFloat(m[1]) * 60) || 0;
    if ((m = x.match(/^(\d+)\s*h\s*(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
    if ((m = x.match(/^(\d+)\s*(?:min|mn|m|minutes?)$/))) return Number(m[1]);
    return null;   // pas compris
}
const jetonDuree = (min) => { min = Math.round(min); if (!min || min < 1) return ""; const h = Math.floor(min / 60), r = min % 60; return h ? `${h}h${r ? String(r).padStart(2, "0") : ""}` : `${r}min`; };
const fmtDuree = (min) => { min = Math.round(min); if (!min) return "0"; const h = Math.floor(min / 60), r = min % 60; return h ? `${h}h${r ? String(r).padStart(2, "0") : ""}` : `${r} min`; };
// Chrono : dernière entrée de début / fin dans l'historique. Renvoie la Date de départ s'il tourne.
const DEBUT = /^(▶️ Commencée|▶️ Reprise)/u, FIN = /^(⏸️|✅ Terminée|🚫 Abandonnée|↩️ Rouverte)/u;
function chronoDe(t) {
    for (let k = t.hist.length - 1; k >= 0; k--) {
        const m = t.hist[k].match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*·?\s*(.*)$/);
        if (!m) continue;
        if (FIN.test(m[4])) return null;
        if (DEBUT.test(m[4])) { const [y, mo, d] = m[1].split("-").map(Number); return new Date(y, mo - 1, d, Number(m[2]), Number(m[3])); }
    }
    return null;
}

// ---------- Lecture des tâches ----------
const champ = (txt, emoji) => (txt.match(new RegExp(emoji + "\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})")) || [])[1] || null;
const PRIOS = [["🔺", 40, "priorité max"], ["⏫", 25, "importante"], ["🔼", 10, ""], ["🔽", -10, ""], ["⏬", -20, ""]];

function domaineDe(t) {
    const tags = (t.tags || []).map(x => x.toLowerCase().replace(/^#/, ""));
    for (const k of Object.keys(DOMAINES)) if (tags.includes(k)) return k;
    for (const [k, d] of Object.entries(DOMAINES)) if (d.dossier && t.path.startsWith(d.dossier + "/")) return k;
    return "trier";
}

function nettoie(txt, path) {
    return txt
        .replace(/\s?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, (m, cible) => {
            const f = app.metadataCache.getFirstLinkpathDest(cible.trim(), path);
            return f && f.path.startsWith(DOSSIER_PROJETS + "/") ? "" : m;
        })
        .replace(/[📅⏳🛫➕✅❌]️?\s*\d{4}-\d{2}-\d{2}/gu, "")
        .replace(/[⏱⌛]\uFE0F?\s*(?:\d+h(?:\d{1,2})?|\d+min)/gu, "")
        .replace(/🔁[^📅⏳🛫➕✅❌🔺⏫🔼🔽⏬#]*/gu, "🔁 ")
        .replace(/[🔺⏫🔼🔽⏬]/gu, "")
        .replace(/#(perso|fablab|iut|alternance)\b/gi, "")
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/\s\^[\w-]+\s*$/, "")
        .replace(/\s{2,}/g, " ").trim();
}

function score(t) {
    let s = 0; const pourquoi = [];
    if (t.statut === "/") { s += 15; pourquoi.push("déjà commencée"); }
    if (t.due) {
        const j = ecart(t.due);
        if (j < 0) { s += 100 + Math.min(-j, 30) * 2; pourquoi.push(`en retard de ${-j} j`); }
        else if (j === 0) { s += 80; pourquoi.push("échéance aujourd'hui"); }
        else if (j === 1) { s += 60; pourquoi.push("échéance demain"); }
        else if (j <= 7) { s += 45 - j * 4; pourquoi.push(`échéance dans ${j} j`); }
        else s += Math.max(0, 20 - j);
    }
    if (t.prevue && ecart(t.prevue) <= 0) { s += 50; pourquoi.push("prévue pour aujourd'hui"); }
    for (const [e, p, mot] of PRIOS) if (t.brut.includes(e)) { s += p; if (mot) pourquoi.push(mot); }
    if (!t.due && t.creee) {
        const age = -ecart(t.creee);
        s += Math.min(age, 21);
        if (age >= 7) pourquoi.push(`attend depuis ${age} j`);
    }
    return { s, pourquoi };
}

const toutes = dv.pages('-"Templates"').file.tasks
    .where(t => t.text && t.text.trim().length > 0)
    .map(t => {
        const brut = t.text;
        const o = {
            brut, path: t.path, line: t.line, tags: t.tags, statut: t.status,
            fait: t.status === "x" || t.status === "X", annulee: t.status === "-",
            due: champ(brut, "📅"), prevue: champ(brut, "⏳"), creee: champ(brut, "➕"), finie: champ(brut, "✅"),
            texte: nettoie(brut, t.path), note: t.path.split("/").pop().replace(/\.md$/, ""),
        };
        Object.assign(o, detailsDe(t));
        o.est = dureeDe(brut, "⏱"); o.reel = dureeDe(brut, "⌛");
        o.chrono = o.statut === "/" ? chronoDe(o) : null;
        o.domaine = domaineDe(o);
        o.projet = projetDe(o);
        if (o.domaine === "trier" && o.projet) o.domaine = o.projet.domaine;
        o.quand = o.due || o.prevue;
        Object.assign(o, (({ s, pourquoi }) => ({ score: s, pourquoi }))(score(o)));
        return o;
    }).array();

// ---------- Filtre par domaine (mémorisé sur cet appareil) ----------
let filtre;
try { filtre = new Set(JSON.parse(localStorage.getItem("tch-filtre") || "[]")); } catch (e) { filtre = new Set(); }
let filtreProjet = "";
try { filtreProjet = localStorage.getItem("tch-projet") || ""; } catch (e) {}
if (filtreProjet && filtreProjet !== "-" && !PROJETS.has(filtreProjet)) filtreProjet = "";
const garder = (t) => (filtre.size === 0 || filtre.has(t.domaine))
    && (!filtreProjet || (filtreProjet === "-" ? !t.projet : t.projet?.nom.toLowerCase() === filtreProjet));
const sauverFiltre = () => { try { localStorage.setItem("tch-filtre", JSON.stringify([...filtre])); } catch (e) {} };

// ---------- Modification d'une tâche dans son fichier ----------
const racine = dv.container.createDiv({ cls: "tch" });
function toast(msg) {
    const el = document.body.createDiv({ cls: "tch-toast", text: msg });
    setTimeout(() => el.remove(), 2500);
}

// hist : texte de l'historique, ou (avant, après) => texte ; ajouté dans la même écriture.
async function modifier(t, fn, hist) {
    const f = app.vault.getAbstractFileByPath(t.path);
    if (!f) return toast("Note introuvable");
    const sig = t.brut.trim().slice(0, 40);
    let ok = false;
    await app.vault.process(f, (txt) => {
        const L = txt.split("\n");
        let i = t.line;
        if (!(L[i] || "").includes(sig)) i = L.findIndex(l => /^\s*[-*+] \[.\]/.test(l) && l.includes(sig));
        if (i < 0) return txt;
        const r = fn(L[i]);
        if (r == null) return txt;
        const msg = typeof hist === "function" ? hist(L[i], r) : hist;
        if (r === L[i] && !msg) return txt;
        if (msg) insererHist(L, i, [msg]);        // sous la ligne i : ne décale pas i
        const nouv = r.split("\n");
        L.splice(i, 1, ...nouv);
        t.line = i + nouv.length - 1;             // la tâche (et ses détails) = la dernière ligne
        t.brut = nouv[nouv.length - 1].replace(/^\s*[-*+] \[.\]\s+/, "");
        ok = true;
        return L.join("\n");
    });
    if (!ok) toast("Tâche modifiée ailleurs : recharge la vue");
}
// ---------- Historique ----------
const indentDe = (l) => l.match(/^\s*/)[0].replace(/\t/g, "    ").length;
const STATUTS_HIST = { "/": "▶️ Commencée", "-": "🚫 Abandonnée", "x": "✅ Terminée" };
const dateHist = (s) => s ? `${s.slice(8)}/${s.slice(5, 7)}` : "?";
const horodatage = () => { const d = new Date(); return `${iso(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const uniteIndent = () => app.vault.getConfig?.("useTab") === false ? "    " : "\t";

// Fin du bloc d'une tâche (ligne i) et position d'insertion : après ses détails, avant ses sous-tâches.
function blocTache(L, i) {
    const base = indentDe(L[i]);
    let j = i + 1, sous = null, pos = i + 1, vuSous = false;
    while (j < L.length) {
        const l = L[j];
        if (!l.trim()) { if (j + 1 < L.length && L[j + 1].trim() && indentDe(L[j + 1]) > base) { j++; continue; } break; }
        if (indentDe(l) <= base) break;
        if (sous !== null && indentDe(l) > sous) {}                            // contenu d'une sous-tâche
        else if (/^\s*[-*+] \[.\]/.test(l)) { sous = indentDe(l); vuSous = true; }
        else { sous = null; if (!vuSous) pos = j + 1; }                        // détail ou historique
        j++;
    }
    return { fin: j, pos };
}
function insererHist(L, i, msgs) {
    const ind = L[i].match(/^\s*/)[0] + uniteIndent();
    const h = horodatage();
    L.splice(blocTache(L, i).pos, 0, ...msgs.map(m => `${ind}- 🕓 ${h} · ${m.replace(/\n/g, " ")}`));
}

function poserJeton(l, e, min) {
    const sans = l.replace(JETON(e), "");
    if (!min) return sans;
    const fin = e === "⏱" ? "[📅⏳🛫➕✅❌🔺⏫🔼🔽⏬🔁⌛]" : "[📅⏳🛫➕✅❌🔺⏫🔼🔽⏬🔁]";
    const m = sans.match(new RegExp(`^(.*?)(\\s*(?:${fin}|\\^[\\w-]+\\s*$).*)?$`, "u"));
    return `${m[1].trimEnd()} ${e}\uFE0F ${jetonDuree(min)}${m[2] || ""}`;
}

// Arrêt du chrono : minutes à ajouter (demandées si le chrono a tourné plus de 8 h : oubli probable).
function minutesChrono(t) {
    if (!t.chrono) return 0;
    const ecoule = Math.round((Date.now() - t.chrono.getTime()) / 60000);
    if (ecoule <= 8 * 60) return ecoule;
    const v = window.prompt(`⏱️ Le chrono de « ${t.texte} » tourne depuis ${fmtDuree(ecoule)}.\nTemps réellement passé ? (ex : 2h, 1h30, 45min)`, "");
    return v ? lireDuree(v) || 0 : 0;
}
const ajoutTemps = (t, min) => min ? ` (+${fmtDuree(min)}, total ${fmtDuree(t.reel + min)})` : "";
// Un seul chrono : en lancer un met les autres en pause.
async function pauseAutres(t) {
    for (const x of toutes.filter(x => x !== t && x.chrono)) await OPS.pause(x, "⏸️ Pause auto (autre tâche commencée)");
}

const avantId = (ligne, ajout) => {
    const m = ligne.match(/^(.*?)(\s\^[\w-]+)?\s*$/);
    return `${m[1].trimEnd()} ${ajout}${m[2] || ""}`;
};
const OPS = {
    basculer: async (t) => {
        const min = t.fait ? 0 : minutesChrono(t);
        return modifier(t, (l) => {
            if (min) l = poserJeton(l, "⌛", t.reel + min);
            const api = app.plugins.plugins["obsidian-tasks-plugin"]?.apiV1;
            if (api?.executeToggleTaskDoneCommand) {
                const r = api.executeToggleTaskDoneCommand(l, t.path).split("\n");   // gère 🔁
                // Tâche récurrente : la nouvelle occurrence repart sans temps passé.
                return r.map((x, k) => k < r.length - 1 ? poserJeton(x, "⌛", 0) : x).join("\n");
            }
            return /\[[xX]\]/.test(l) ? l.replace(/\[[xX]\]/, "[ ]").replace(/\s✅\s*\d{4}-\d{2}-\d{2}/, "")
                                      : avantId(l.replace(/\[.\]/, "[x]"), `✅ ${AUJ}`);
        }, (l) => /\[[xX]\]/.test(l) ? "↩️ Rouverte" : "✅ Terminée" + ajoutTemps(t, min));
    },
    statut: async (t, c) => {
        if (c === "/") await pauseAutres(t);
        const min = c !== "/" ? minutesChrono(t) : 0;
        return modifier(t, (l) => {
            if (min) l = poserJeton(l, "⌛", t.reel + min);
            const r = l.replace(/\[.\]/, `[${c}]`);
            return c === "x" ? r : r.replace(/\s✅\uFE0F?\s*\d{4}-\d{2}-\d{2}/u, "");
        }, (l) => (STATUTS_HIST[c] || (/\[[xX-]\]/.test(l) ? "↩️ Rouverte" : "⏸️ Remise à faire")) + ajoutTemps(t, min));
    },
    // Chrono seul (la tâche reste « en cours »).
    pause: (t, msg = "⏸️ Pause") => {
        const min = minutesChrono(t);
        return modifier(t, (l) => min ? poserJeton(l, "⌛", t.reel + min) : l, msg + ajoutTemps(t, min))
            .then(() => { t.chrono = null; t.reel += min; });
    },
    reprendre: async (t) => { await pauseAutres(t); return modifier(t, (l) => l, "▶️ Reprise"); },
    // Estimation et / ou temps passé (minutes ; 0 = retirer ; undefined = inchangé).
    temps: (t, est, reel) => modifier(t, (l) => {
        if (est !== undefined) l = poserJeton(l, "⏱", est);
        if (reel !== undefined) l = poserJeton(l, "⌛", reel);
        return l;
    }, () => [
        est !== undefined && est !== t.est ? (est ? `⏱️ Estimation : ${t.est ? fmtDuree(t.est) + " → " : ""}${fmtDuree(est)}` : "⏱️ Estimation retirée") : "",
        reel !== undefined && reel !== t.reel ? `⌛ Temps passé corrigé : ${fmtDuree(t.reel)} → ${fmtDuree(reel)}` : "",
    ].filter(Boolean).join(" · ")),
    echeance: (t, d) => modifier(t, (l) => {
        const sans = l.replace(/\s📅️?\s*\d{4}-\d{2}-\d{2}/u, "");
        return d ? avantId(sans, `📅 ${d}`) : sans;
    }, (l) => {
        const avant = champ(l, "📅");
        return d ? `📅 Échéance ${avant ? dateHist(avant) + " → " : ""}${dateHist(d)}` : `📥 Échéance retirée (était ${dateHist(avant)})`;
    }),
    importante: (t) => modifier(t, (l) => /[🔺⏫]/u.test(l) ? l.replace(/\s?[🔺⏫]/u, "") : avantId(l, "⏫"),
        (l) => /[🔺⏫]/u.test(l) ? "⬇️ Plus prioritaire" : "⏫ Marquée importante"),
    domaine: (t, k) => modifier(t, (l) => avantId(l.replace(/\s#(perso|fablab|iut|alternance)\b/gi, ""), `#${k}`),
        `🏷️ Domaine : ${DOMAINES[k]?.nom || k}`),
    projet: (t, nom) => modifier(t, (l) => {
        const sans = l.replace(/\s?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, (m, cible) => {
            const f = app.metadataCache.getFirstLinkpathDest(cible.trim(), t.path);
            return f && f.path.startsWith(DOSSIER_PROJETS + "/") ? "" : m;
        });
        if (!nom) return sans;
        // Après le texte et les tags, avant les dates / priorités.
        const m = sans.match(/^(.*?)(\s*(?:\(\[\[|[📅⏳🛫➕✅❌🔺⏫🔼🔽⏬🔁⏱⌛]|\^[\w-]+\s*$).*)?$/u);
        return `${m[1].trimEnd()} [[${nom}]]${m[2] || ""}`;
    }, nom ? `📁 Projet : ${nom}${t.projet ? ` (avant : ${t.projet.nom})` : ""}` : `📁 Retirée du projet ${t.projet?.nom || ""}`.trim()),
    // Titre : seulement le texte libre (tags, liens, dates, priorités et ^id gardés tels quels).
    titre: (t, nouveau) => modifier(t, (l) => {
        const m = l.match(/^(\s*[-*+] \[.\]\s+)(.*?)(?=\s+(?:#[^\s#]|\(?\[\[|[📅⏳🛫➕✅❌🔺⏫🔼🔽⏬🔁⏱⌛]|\^[\w-]+\s*$)|\s*$)(.*)$/u);
        const propre = nouveau.replace(/\s+/g, " ").trim();
        return m && propre ? m[1] + propre + m[3] : null;
    }, (l) => `✏️ Renommée (avant : « ${libre(l.replace(/^\s*[-*+] \[.\]\s+/, "")).replace(/\s+/g, " ")} »)`),
    ouvrir: async (t) => {
        const f = app.vault.getAbstractFileByPath(t.path);
        if (f) await app.workspace.getLeaf(false).openFile(f, { eState: { line: t.line } });
    },
};

// ---------- Détails : description + pièces jointes sous la tâche ----------

// Remplace les lignes de détail (sous-éléments qui ne sont pas des sous-tâches) ; garde les sous-tâches.
// L'historique existant est gardé ; « hist » = nouvelles entrées.
async function ecrireDetails(t, desc, liens, hist = []) {
    const f = app.vault.getAbstractFileByPath(t.path);
    if (!f) return toast("Note introuvable");
    const sig = t.brut.trim().slice(0, 40);
    const unite = uniteIndent();
    let ok = false;
    await app.vault.process(f, (txt) => {
        const L = txt.split("\n");
        let i = t.line;
        if (!(L[i] || "").includes(sig)) i = L.findIndex(l => /^\s*[-*+] \[.\]/.test(l) && l.includes(sig));
        if (i < 0) return txt;
        const base = indentDe(L[i]);
        const ind = L[i].match(/^\s*/)[0] + unite;
        let j = i + 1, sous = null;
        const garde = [], anciens = [];
        while (j < L.length) {
            const l = L[j];
            if (!l.trim()) { if (j + 1 < L.length && L[j + 1].trim() && indentDe(L[j + 1]) > base) { j++; continue; } break; }
            if (indentDe(l) <= base) break;
            if (sous !== null && indentDe(l) > sous) garde.push(l);              // contenu d'une sous-tâche
            else if (/^\s*[-*+] \[.\]/.test(l)) { sous = indentDe(l); garde.push(l); }
            else { sous = null; if (/^\s*[-*+]\s+🕓/u.test(l)) anciens.push(l); }   // ancien détail : remplacé (historique gardé)
            j++;
        }
        const nouv = [
            ...desc.split("\n").map(x => x.trim().replace(/^[-*+]\s+/, "")).filter(Boolean).map(x => `${ind}- ${x}`),
            ...liens.map(x => `${ind}- ${x}`),
            ...anciens,
            ...hist.map(m => `${ind}- 🕓 ${horodatage()} · ${m}`),
        ];
        L.splice(i + 1, j - (i + 1), ...nouv, ...garde);
        ok = true;
        return L.join("\n");
    });
    if (!ok) toast("Tâche modifiée ailleurs : recharge la vue");
}

async function enregistrerFichier(file) {
    if (!app.vault.getAbstractFileByPath(DOSSIER_PJ)) { try { await app.vault.createFolder(DOSSIER_PJ); } catch (e) {} }
    const m = (file.name || "fichier").match(/^(.*?)(\.[^.]+)?$/);
    const nom = (m[1] || "fichier").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "fichier";
    const ext = (m[2] || (file.type?.startsWith("image/") ? "." + file.type.slice(6) : "")).toLowerCase();
    let p = `${DOSSIER_PJ}/${AUJ} ${nom}${ext}`, n = 1;
    while (app.vault.getAbstractFileByPath(p)) p = `${DOSSIER_PJ}/${AUJ} ${nom} ${++n}${ext}`;
    return app.vault.createBinary(p, await file.arrayBuffer());
}

// Texte libre d'une ligne de tâche (ce que l'on peut renommer), mêmes coupures que OPS.titre.
function libre(brut) {
    const m = brut.match(/^(.*?)(?=\s+(?:#[^\s#]|\(?\[\[|[📅⏳🛫➕✅❌🔺⏫🔼🔽⏬🔁⏱⌛]|\^[\w-]+\s*$)|\s*$)/u);
    return (m ? m[1] : brut).trim();
}

function fenetreDetails(t, opts = {}) {
    document.querySelectorAll(".tch-fenetre-fond").forEach(x => x.remove());
    const fond = document.body.createDiv({ cls: "tch-fenetre-fond" });
    const w = fond.createDiv({ cls: "tch-fenetre" });
    const fermer = () => { fond.remove(); for (const p of nouveaux) URL.revokeObjectURL(p.url); };
    fond.addEventListener("click", (e) => { if (e.target === fond) fermer(); });
    w.createDiv({ cls: "tch-note", text: "Tâche" });
    const titreAvant = libre(t.brut);
    const ti = w.createEl("input", { type: "text", cls: "tch-titre-saisie", value: titreAvant });

    w.createDiv({ cls: "tch-note", text: "Description détaillée (contexte, étapes, liens, contacts…)" });
    const ta = w.createEl("textarea", { cls: "tch-desc-saisie" });
    ta.value = t.desc.join("\n");
    ta.placeholder = "Ex : Marc veut la v2 avec les cellules 21700. Voir le mail du 24/10. Contact fournisseur : …";

    const tl = w.createDiv({ cls: "tch-temps-saisie" });
    const champTemps = (lib, val, aide) => {
        const d = tl.createDiv();
        d.createDiv({ cls: "tch-note", text: lib });
        const i = d.createEl("input", { type: "text", value: val ? jetonDuree(val) : "" });
        i.placeholder = aide;
        return i;
    };
    const estI = champTemps("⏱️ Temps prévu", t.est, "ex : 2h, 1h30, 45min");
    const reelI = champTemps("⌛ Temps passé" + (t.chrono ? " (+ chrono en cours)" : ""), t.reel, "compté par le chrono, corrigeable");

    w.createDiv({ cls: "tch-note", text: "Fichiers et photos" });
    const liste = w.createDiv({ cls: "tch-pj" });
    // Existants (liens) + nouveaux (fichiers choisis, enregistrés seulement à la validation).
    const existants = t.pj.map(cible => ({ cible, f: app.metadataCache.getFirstLinkpathDest(cible, t.path) }));
    const nouveaux = [];
    function dessiner() {
        liste.empty();
        const vignette = (nom, url, retirer, ouvrir) => {
            const c = liste.createDiv({ cls: "tch-pj-item" });
            if (url && IMAGE.test(nom)) c.createEl("img", { attr: { src: url } });
            else c.createDiv({ cls: "tch-pj-icone", text: /\.pdf$/i.test(nom) ? "📕" : "📄" });
            c.createDiv({ cls: "tch-pj-nom", text: nom.split("/").pop() });
            if (ouvrir) c.addEventListener("click", ouvrir);
            const x = c.createDiv({ cls: "tch-pj-x", text: "✕", attr: { title: "Retirer de la tâche (le fichier reste dans le vault)" } });
            x.addEventListener("click", (e) => { e.stopPropagation(); retirer(); dessiner(); });
        };
        for (const p of existants) vignette(p.f?.path || p.cible, p.f ? app.vault.getResourcePath(p.f) : null,
            () => existants.splice(existants.indexOf(p), 1),
            p.f ? () => { fermer(); app.workspace.getLeaf(true).openFile(p.f); } : null);
        for (const p of nouveaux) vignette(p.file.name || "image", p.url, () => { URL.revokeObjectURL(p.url); nouveaux.splice(nouveaux.indexOf(p), 1); });
        if (!existants.length && !nouveaux.length) liste.createDiv({ cls: "tch-note", text: "Aucun. Ajoute des fichiers, des photos, ou colle / glisse une image ici." });
    }
    const ajouter = (files) => { for (const file of files || []) nouveaux.push({ file, url: URL.createObjectURL(file) }); dessiner(); };
    dessiner();

    const input = w.createEl("input", { type: "file", attr: { multiple: true } });
    input.style.display = "none";
    input.addEventListener("change", () => { ajouter(input.files); input.value = ""; });
    ta.addEventListener("paste", (e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); ajouter(e.clipboardData.files); } });
    w.addEventListener("dragover", (e) => { e.preventDefault(); w.addClass("survol"); });
    w.addEventListener("dragleave", () => w.removeClass("survol"));
    w.addEventListener("drop", (e) => { e.preventDefault(); w.removeClass("survol"); ajouter(e.dataTransfer?.files); });

    // Historique : le plus récent en haut ; la création vient de la date ➕.
    const entrees = t.hist.map(h => { const m = h.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*·?\s*(.*)$/); return m ? { d: m[1], h: m[2] || "", txt: m[3] } : { d: "", h: "", txt: h }; }).reverse();
    if (t.creee) entrees.push({ d: t.creee, h: "", txt: `➕ Créée (dans « ${t.note} »)` });
    const hz = w.createEl("details", { cls: "tch-hist" });
    if (opts.historique) hz.open = true;
    hz.createEl("summary", { cls: "tch-note", text: `🕓 Historique (${entrees.length})` });
    if (!entrees.length) hz.createDiv({ cls: "tch-note", text: "Rien encore : les actions faites depuis les vues des tâches s'inscrivent ici." });
    for (const e of entrees) {
        const l = hz.createDiv({ cls: "tch-hist-ligne" });
        l.createSpan({ cls: "tch-hist-date", text: e.d ? `${e.d === AUJ ? "aujourd'hui" : jourCourt(e.d)}${e.h ? " " + e.h : ""}` : "" });
        l.createSpan({ text: e.txt });
    }

    const b = w.createDiv({ cls: "tch-nav tch-fenetre-boutons" });
    b.createEl("button", { text: "📎 Fichiers / photos" }).addEventListener("click", () => input.click());
    b.createDiv({ cls: "tch-espace" });
    b.createEl("button", { text: "Annuler" }).addEventListener("click", fermer);
    const ok = b.createEl("button", { cls: "mod-cta", text: "💾 Enregistrer" });
    ok.addEventListener("click", async () => {
        ok.disabled = true; ok.setText("Enregistrement…");
        try {
            const liens = existants.map(p => p.f
                ? (IMAGE.test(p.f.path) || /\.pdf$/i.test(p.f.path) ? "!" : "") + app.fileManager.generateMarkdownLink(p.f, t.path)
                : `[[${p.cible}]]`);
            for (const p of nouveaux) {
                const f = await enregistrerFichier(p.file);
                liens.push((IMAGE.test(f.path) || /\.pdf$/i.test(f.path) ? "!" : "") + app.fileManager.generateMarkdownLink(f, t.path));
            }
            const hist = [];
            const descAvant = t.desc.join("\n").trim(), descApres = ta.value.split("\n").map(x => x.trim().replace(/^[-*+]\s+/, "")).filter(Boolean).join("\n");
            if (descAvant !== descApres) hist.push(descAvant ? "📝 Description modifiée" : "📝 Description ajoutée");
            if (nouveaux.length) hist.push("📎 Ajouté : " + nouveaux.map(p => p.file.name || "image").join(", "));
            const retires = t.pj.filter(c => !existants.some(p => p.cible === c));
            if (retires.length) hist.push("📎 Retiré : " + retires.map(c => c.split("/").pop()).join(", "));
            const est = estI.value.trim() ? lireDuree(estI.value) : 0, reel = reelI.value.trim() ? lireDuree(reelI.value) : 0;
            if (est === null || reel === null) throw new Error("durée non comprise (ex : 2h, 1h30, 45min)");
            if (hist.length || liens.length !== t.pj.length) await ecrireDetails(t, ta.value, liens, hist);
            if (est !== t.est || reel !== t.reel) await OPS.temps(t, est, reel);
            if (ti.value.trim() && ti.value.trim() !== titreAvant) await OPS.titre(t, ti.value);
            fermer();
        } catch (e) {
            console.error("Détails tâche", e);
            toast("Échec : " + (e.message || e));
            ok.disabled = false; ok.setText("💾 Enregistrer");
        }
    });
    if (opts.historique) setTimeout(() => hz.scrollIntoView({ block: "start" }), 50);
    else setTimeout(() => (opts.titre ? ti : ta).focus(), 50);
}

// ---------- Menu d'actions (au doigt comme à la souris) ----------
function menu(t, ev) {
    ev.preventDefault(); ev.stopPropagation();
    document.querySelectorAll(".tch-menu").forEach(m => m.remove());
    const m = document.body.createDiv({ cls: "tch-menu" });
    m.createDiv({ cls: "tch-menu-titre", text: t.texte });
    const item = (txt, fn) => m.createDiv({ cls: "tch-menu-item", text: txt }).addEventListener("click", async (e) => {
        e.stopPropagation(); m.remove(); await fn();
    });
    item(t.fait ? "↩️ Pas finie" : "✅ Terminée", () => OPS.basculer(t));
    item("✏️ Renommer…", () => fenetreDetails(t, { titre: true }));
    item(t.desc.length || t.pj.length ? `📝 Détails (${[t.desc.length ? "description" : "", t.pj.length ? t.pj.length + " fichier(s)" : ""].filter(Boolean).join(", ")})…`
                                      : "📝 Ajouter détails, fichiers, photos…", () => fenetreDetails(t));
    item(`🕓 Historique (${t.hist.length + (t.creee ? 1 : 0)})…`, () => fenetreDetails(t, { historique: true }));
    if (!t.fait && t.statut !== "/") item("▶️ Je commence (lance le chrono)", () => OPS.statut(t, "/"));
    if (t.statut === "/" && t.chrono) item(`⏸️ Pause (chrono : ${fmtDuree((Date.now() - t.chrono) / 60000)})`, () => OPS.pause(t));
    if (t.statut === "/" && !t.chrono) item("▶️ Reprendre le chrono", () => OPS.reprendre(t));
    if (t.statut === "/") item("⏹️ Remettre à faire", () => OPS.statut(t, " "));
    item(t.est ? `⏱️ Estimation : ${fmtDuree(t.est)} → changer…` : "⏱️ Estimer le temps…", () => {
        const v = window.prompt("⏱️ Temps prévu (ex : 2h, 1h30, 45min ; vide = retirer)", t.est ? jetonDuree(t.est) : "");
        if (v === null) return;
        const min = v.trim() ? lireDuree(v) : 0;
        return min === null ? toast("Durée non comprise") : OPS.temps(t, min, undefined);
    });
    m.createDiv({ cls: "tch-menu-sep" });
    item("📍 Aujourd'hui", () => OPS.echeance(t, AUJ));
    item("➡️ Demain", () => OPS.echeance(t, plus(AUJ, 1)));
    item("🗓️ Lundi prochain", () => OPS.echeance(t, plus(lundiDe(AUJ), 7)));
    item("📆 Choisir une date…", () => {
        const d = window.prompt("Échéance (JJ/MM ou AAAA-MM-JJ)", t.due ? `${t.due.slice(8)}/${t.due.slice(5, 7)}` : "");
        if (!d) return;
        const m2 = d.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        let r = /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) ? d.trim() : null;
        if (m2) {
            const an = m2[3] ? (m2[3].length === 2 ? "20" + m2[3] : m2[3]) : AUJ.slice(0, 4);
            r = `${an}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
            if (!m2[3] && r < AUJ) r = `${Number(an) + 1}${r.slice(4)}`;
        }
        return r ? OPS.echeance(t, r) : toast("Date non comprise");
    });
    if (t.due) item("📥 Retirer la date", () => OPS.echeance(t, null));
    m.createDiv({ cls: "tch-menu-sep" });
    item(/[🔺⏫]/u.test(t.brut) ? "⬇️ Plus prioritaire" : "⏫ Importante", () => OPS.importante(t));
    if (t.domaine === "trier" || ev.altKey) for (const k of ["perso", "fablab", "iut", "alternance"])
        item(`🏷️ ${DOMAINES[k].nom}`, () => OPS.domaine(t, k));
    item(t.projet ? `📁 Projet : ${t.projet.nom} → changer…` : "📁 Ranger dans un projet…", () => menuProjet(t, ev));
    item("🚫 Abandonner", () => OPS.statut(t, "-"));
    item(`📄 Ouvrir « ${t.note} »`, () => OPS.ouvrir(t));
    if (t.projet && t.projet.path !== t.path) item(`📁 Ouvrir le projet « ${t.projet.nom} »`, () => app.workspace.openLinkText(t.projet.path, "", false));

    const r = m.getBoundingClientRect();
    const x = ev.clientX ?? ev.touches?.[0]?.clientX ?? 100, y = ev.clientY ?? ev.touches?.[0]?.clientY ?? 100;
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
    setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
}

// Choix du projet d'une tâche : projets actifs du domaine d'abord.
function menuProjet(t, ev) {
    document.querySelectorAll(".tch-menu").forEach(m => m.remove());
    const m = document.body.createDiv({ cls: "tch-menu" });
    m.createDiv({ cls: "tch-menu-titre", text: `📁 Projet de : ${t.texte}` });
    const item = (txt, fn) => m.createDiv({ cls: "tch-menu-item", text: txt }).addEventListener("click", async (e) => {
        e.stopPropagation(); m.remove(); await fn();
    });
    const actifs = [...PROJETS.values()].filter(p => p.statut === "actif")
        .sort((a, b) => (b.domaine === t.domaine) - (a.domaine === t.domaine) || a.nom.localeCompare(b.nom));
    for (const p of actifs) item(`${p.domaine === t.domaine ? "📁" : "📂"} ${p.nom}${p.domaine !== t.domaine ? ` (${DOMAINES[p.domaine]?.nom || p.domaine})` : ""}`, () => OPS.projet(t, p.nom));
    if (t.projet) item("— Retirer du projet", () => OPS.projet(t, ""));
    item("✨ Nouveau projet…", () => app.commands.executeCommandById("notes-campus:nouveau-projet"));
    if (projetFm.get(t.path) && t.projet === projetFm.get(t.path))
        m.createDiv({ cls: "tch-menu-titre", text: "ℹ️ Cette tâche suit le projet de sa note : la changer ici ajoute un lien qui prime." });
    const x = ev.clientX ?? 100, y = ev.clientY ?? 100, r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
    setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
}

// ---------- Éléments communs ----------
function puce(parent, k) {
    const d = DOMAINES[k];
    const p = parent.createSpan({ cls: "tch-puce", text: d.nom });
    p.style.setProperty("--c", d.couleur);
    return p;
}

function ligneTache(parent, t, opts = {}) {
    const row = parent.createDiv({ cls: "tch-ligne" + (t.fait ? " fait" : "") + (t.statut === "/" ? " encours" : "") });
    row.style.setProperty("--c", DOMAINES[t.domaine].couleur);
    const cb = row.createEl("input", { type: "checkbox" });
    cb.checked = t.fait;
    cb.addEventListener("click", (e) => { e.stopPropagation(); OPS.basculer(t); });
    const corps = row.createDiv({ cls: "tch-corps" });
    if (t.statut === "/" && !t.fait) {
        const b = corps.createSpan({ cls: "tch-badge-encours" + (t.chrono ? " chrono" : ""),
            text: t.chrono ? `⏺️ En cours · ${Date.now() - t.chrono < 60000 ? "à l'instant" : fmtDuree((Date.now() - t.chrono) / 60000)}` : "▶️ En cours (chrono en pause)" });
        b.title = t.chrono ? `Chrono lancé à ${String(t.chrono.getHours()).padStart(2, "0")}:${String(t.chrono.getMinutes()).padStart(2, "0")}` : "Touche la tâche → ▶️ Reprendre le chrono";
    }
    corps.createSpan({ cls: "tch-texte", text: t.texte });
    if (t.desc.length && !opts.compact) corps.createDiv({ cls: "tch-desc", text: t.desc.join(" · "), attr: { title: t.desc.join("\n") } });
    const meta = corps.createDiv({ cls: "tch-meta" });
    if (!opts.sansDomaine) puce(meta, t.domaine);
    if (t.projet && !opts.sansProjet) meta.createSpan({ cls: "tch-projet", text: "📁 " + t.projet.nom });
    if (t.quand && !opts.sansDate) meta.createSpan({ cls: "tch-date" + (t.due && ecart(t.due) < 0 && !t.fait ? " retard" : ""), text: "📅 " + libelleDate(t.quand) });
    if (/[🔺⏫]/u.test(t.brut)) meta.createSpan({ text: "⏫" });
    if (t.est || t.reel) {
        const depasse = t.est && t.reel > t.est;
        meta.createSpan({ cls: "tch-temps" + (depasse ? " depasse" : ""),
            text: t.reel ? `⌛ ${fmtDuree(t.reel)}${t.est ? " / " + fmtDuree(t.est) : ""}` : `⏱️ ${fmtDuree(t.est)}`,
            attr: { title: [t.est ? `Prévu : ${fmtDuree(t.est)}` : "", t.reel ? `Passé : ${fmtDuree(t.reel)}` : ""].filter(Boolean).join("\n") } });
    }
    if (t.pj.length) {
        const pj = meta.createSpan({ cls: "tch-trombone", text: "📎 " + t.pj.length, attr: { title: t.pj.join("\n") } });
        pj.addEventListener("click", (e) => { e.stopPropagation(); fenetreDetails(t); });
    }
    if (opts.pourquoi && t.pourquoi.length) meta.createSpan({ cls: "tch-pourquoi", text: t.pourquoi.join(" · ") });
    row.addEventListener("click", (e) => menu(t, e));
    if (opts.glisser) {
        row.draggable = true;
        row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(toutes.indexOf(t))); row.addClass("glisse"); });
        row.addEventListener("dragend", () => row.removeClass("glisse"));
    }
    return row;
}
function zoneDepot(el, fn) {
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.addClass("survol"); });
    el.addEventListener("dragleave", () => el.removeClass("survol"));
    el.addEventListener("drop", (e) => {
        e.preventDefault(); el.removeClass("survol");
        const t = toutes[Number(e.dataTransfer.getData("text/plain"))];
        if (t) fn(t);
    });
}

function entete(parent) {
    const nav = parent.createDiv({ cls: "tch-nav" });
    const ajout = nav.createEl("button", { cls: "mod-cta", text: "➕ Ajouter" });
    ajout.addEventListener("click", () => app.commands.executeCommandById(COMMANDE_AJOUT));
    nav.createEl("button", { text: "🤖 Vrac" }).addEventListener("click", () => app.commands.executeCommandById("notes-campus:agent-vrac"));
    for (const [nom, note] of [["📋 Liste", "Tâches/Tâches"], ["🗂️ Kanban", "Tâches/Kanban"], ["📆 Calendrier", "Tâches/Calendrier"], ["📁 Projets", "Tâches/Projets"]]) {
        const b = nav.createEl("button", { text: nom });
        b.addEventListener("click", () => app.workspace.openLinkText(note, "", false));
    }
    const f = parent.createDiv({ cls: "tch-filtres" });
    for (const k of ["perso", "fablab", "iut", "alternance", "trier"]) {
        const n = toutes.filter(t => t.domaine === k && !t.fait && !t.annulee).length;
        if (k === "trier" && !n) continue;
        const p = puce(f, k);
        p.setText(`${DOMAINES[k].nom} ${n}`);
        p.addClass("filtre");
        if (filtre.size && !filtre.has(k)) p.addClass("off");
        p.addEventListener("click", () => {
            filtre.has(k) ? filtre.delete(k) : filtre.add(k);
            if (filtre.size === 5) filtre.clear();
            sauverFiltre(); rendre();
        });
    }
    const actifs = [...PROJETS.values()].filter(p => p.statut === "actif" || p.nom.toLowerCase() === filtreProjet);
    if (actifs.length) {
        const sel = f.createEl("select", { cls: "tch-select" });
        sel.createEl("option", { value: "", text: "📁 Tous les projets" });
        for (const p of actifs.sort((a, b) => a.nom.localeCompare(b.nom))) {
            const n = toutes.filter(t => t.projet === p && !t.fait && !t.annulee).length;
            sel.createEl("option", { value: p.nom.toLowerCase(), text: `📁 ${p.nom} (${n})` });
        }
        sel.createEl("option", { value: "-", text: "— Sans projet" });
        sel.value = filtreProjet;
        sel.addEventListener("change", () => {
            filtreProjet = sel.value;
            try { localStorage.setItem("tch-projet", filtreProjet); } catch (e) {}
            rendre();
        });
    }
    if (filtre.size || filtreProjet) f.createSpan({ cls: "tch-lien", text: "tout afficher" }).addEventListener("click", () => {
        filtre.clear(); sauverFiltre(); filtreProjet = "";
        try { localStorage.setItem("tch-projet", ""); } catch (e) {}
        rendre();
    });
}

const ouvertes = () => toutes.filter(t => !t.fait && !t.annulee && garder(t));

// ---------- Vues ----------
const VUES = {
    maintenant(el) {
        const top = ouvertes().sort((a, b) => b.score - a.score);
        const box = el.createDiv({ cls: "tch-maintenant" });
        if (!top.length) {
            box.createDiv({ cls: "tch-vide", text: "🎉 Rien à faire. Ajoute ce qui te passe par la tête avec ➕." });
            return;
        }
        top.slice(0, 3).forEach((t, i) => {
            const c = box.createDiv({ cls: "tch-carte-top" });
            c.createDiv({ cls: "tch-rang", text: ["1", "2", "3"][i] });
            ligneTache(c, t, { pourquoi: true });
        });
        if (top.length > 3) {
            const d = el.createEl("details", { cls: "tch-ensuite" });
            d.createEl("summary", { text: `Et ensuite (${Math.min(top.length - 3, 7)})` });
            top.slice(3, 10).forEach(t => ligneTache(d, t, { pourquoi: true }));
        }
    },

    charge(el) {
        const o = ouvertes();
        const wrap = el.createDiv({ cls: "tch-charge" });
        const jours = [["retard", "⚠️"], ...Array.from({ length: 14 }, (_, i) => [plus(AUJ, i), null])];
        const parJour = (j) => o.filter(t => t.quand && (j === "retard" ? ecart(t.quand) < 0 : t.quand === j));
        const max = Math.max(4, ...jours.map(([j]) => parJour(j).length));
        for (const [j, lib] of jours) {
            const ts = parJour(j);
            if (j === "retard" && !ts.length) continue;
            const col = wrap.createDiv({ cls: "tch-col" + (j !== "retard" && lire(j).getDay() % 6 === 0 ? " we" : "") });
            col.title = ts.map(t => "• " + t.texte).join("\n");
            col.createDiv({ cls: "tch-nb", text: ts.length ? String(ts.length) : "" });
            const barre = col.createDiv({ cls: "tch-barre" });
            for (const k of Object.keys(DOMAINES)) {
                const n = ts.filter(t => t.domaine === k).length;
                if (!n) continue;
                const s = barre.createDiv({ cls: "tch-seg" });
                s.style.height = (n / max * 100) + "%";
                s.style.background = DOMAINES[k].couleur;
            }
            col.createDiv({ cls: "tch-jour", text: lib || (ecart(j) === 0 ? "auj." : JOURS[lire(j).getDay()].slice(0, 2) + " " + j.slice(8)) });
        }
        const sansDate = o.filter(t => !t.quand).length;
        el.createDiv({ cls: "tch-note", text: `${o.length} tâche(s) ouverte(s) · ${sansDate} sans date` });
    },

    liste(el) {
        const o = ouvertes().sort((a, b) => b.score - a.score);
        const fin = plus(lundiDe(AUJ), 6);
        const afaire = o.filter(t => t.statut !== "/");
        const groupes = [
            ["▶️ En cours", o.filter(t => t.statut === "/").sort((a, b) => !!b.chrono - !!a.chrono || b.score - a.score)],
            ["⚠️ En retard", afaire.filter(t => t.quand && ecart(t.quand) < 0)],
            ["📍 Aujourd'hui", afaire.filter(t => t.quand === AUJ)],
            ["🗓️ Cette semaine", afaire.filter(t => t.quand && t.quand > AUJ && t.quand <= fin).sort((a, b) => a.quand.localeCompare(b.quand))],
            ["🔭 Plus tard", afaire.filter(t => t.quand && t.quand > fin).sort((a, b) => a.quand.localeCompare(b.quand))],
            ["📥 Sans date : à planifier", afaire.filter(t => !t.quand)],
        ];
        for (const [titre, ts] of groupes) {
            if (!ts.length) continue;
            const h = el.createEl("h4", { cls: "tch-titre", text: `${titre} (${ts.length})` });
            const min = ts.reduce((n, t) => n + Math.max(0, t.est - t.reel), 0);
            if (min) h.createSpan({ cls: "tch-note", text: `  ≈ ${fmtDuree(min)} restant` });
            const zone = titre.startsWith("▶️") ? el.createDiv({ cls: "tch-zone-encours" }) : el;
            ts.forEach(t => ligneTache(zone, t));
        }
        const faites = toutes.filter(t => t.fait && t.finie && ecart(t.finie) >= -7 && garder(t))
            .sort((a, b) => b.finie.localeCompare(a.finie));
        if (faites.length) {
            const d = el.createEl("details");
            d.createEl("summary", { text: `✅ Faites ces 7 derniers jours (${faites.length})` });
            faites.forEach(t => ligneTache(d, t));
        }
    },

    kanban(el) {
        const cols = [
            ["📥 À faire", " ", ouvertes().filter(t => t.statut !== "/").sort((a, b) => b.score - a.score)],
            ["▶️ En cours", "/", ouvertes().filter(t => t.statut === "/").sort((a, b) => b.score - a.score)],
            ["✅ Fait (7 j)", "x", toutes.filter(t => t.fait && garder(t) && (!t.finie || ecart(t.finie) >= -7))],
        ];
        const board = el.createDiv({ cls: "tch-kanban" });
        for (const [titre, statut, ts] of cols) {
            const c = board.createDiv({ cls: "tch-kcol" });
            c.createDiv({ cls: "tch-ktitre", text: `${titre} · ${ts.length}` });
            ts.forEach(t => ligneTache(c, t, { glisser: true }).addClass("carte"));
            zoneDepot(c, (t) => {
                if (statut === "x") return t.fait ? null : OPS.basculer(t);
                return OPS.statut(t, statut);
            });
        }
        el.createDiv({ cls: "tch-note", text: "Glisse les cartes entre colonnes (ordinateur) ou touche une carte (iPad)." });
    },

    calendrier(el) {
        let decalage = 0;
        try { decalage = Number(sessionStorage.getItem("tch-semaine") || 0); } catch (e) {}
        const lundi = plus(lundiDe(AUJ), 7 * decalage);
        const bar = el.createDiv({ cls: "tch-nav" });
        const aller = (n) => { try { sessionStorage.setItem("tch-semaine", String(n)); } catch (e) {} rendre(); };
        bar.createEl("button", { text: "◀" }).addEventListener("click", () => aller(decalage - 1));
        bar.createEl("button", { text: "Cette semaine" }).addEventListener("click", () => aller(0));
        bar.createEl("button", { text: "▶" }).addEventListener("click", () => aller(decalage + 1));
        const o = ouvertes();
        const minSemaine = o.filter(t => t.quand && t.quand >= lundi && t.quand <= plus(lundi, 6)).reduce((s, t) => s + Math.max(0, t.est - t.reel), 0);
        bar.createSpan({ cls: "tch-semaine", text: `Semaine du ${jourCourt(lundi)}${minSemaine ? ` · ≈ ${fmtDuree(minSemaine)} prévues` : ""}` });

        const retard = o.filter(t => t.quand && ecart(t.quand) < 0);
        if (retard.length && decalage === 0) {
            const r = el.createDiv({ cls: "tch-retard" });
            r.createDiv({ cls: "tch-ktitre", text: `⚠️ En retard · ${retard.length} (glisse-les sur un jour)` });
            retard.forEach(t => ligneTache(r, t, { glisser: true }).addClass("carte"));
        }
        const grille = el.createDiv({ cls: "tch-cal" });
        for (let i = 0; i < 7; i++) {
            const j = plus(lundi, i);
            const ts = [...o.filter(t => t.quand === j).sort((a, b) => b.score - a.score),
                        ...toutes.filter(t => t.fait && t.finie === j && garder(t))];
            const c = grille.createDiv({ cls: "tch-jourcal" + (j === AUJ ? " auj" : "") + (i >= 5 ? " we" : "") });
            const h = c.createDiv({ cls: "tch-ktitre" });
            h.createSpan({ text: jourCourt(j) });
            const n = ts.filter(t => !t.fait).length;
            const min = ts.filter(t => !t.fait).reduce((s, t) => s + Math.max(0, t.est - t.reel), 0);
            if (n) h.createSpan({ cls: "tch-charge-nb" + (n >= 5 || min > 7 * 60 ? " lourd" : ""), text: min ? `${n} · ${fmtDuree(min)}` : String(n),
                attr: { title: min ? `${n} tâche(s), ≈ ${fmtDuree(min)} de travail prévu` : `${n} tâche(s) (sans estimation)` } });
            for (const p of [...PROJETS.values()].filter(p => p.echeance === j && p.statut === "actif" && (filtre.size === 0 || filtre.has(p.domaine)))) {
                const tp_ = tempsProjet(p);
                const pc = c.createDiv({ cls: "tch-cal-projet", text: `🏁 ${p.nom}${tp_.reste ? ` · reste ≈ ${fmtDuree(tp_.reste)}` : ""}` });
                pc.style.setProperty("--c", DOMAINES[p.domaine]?.couleur || "#999");
                pc.addEventListener("click", () => app.workspace.openLinkText(p.path, "", false));
            }
            ts.forEach(t => ligneTache(c, t, { glisser: true, sansDate: true }).addClass("carte"));
            zoneDepot(c, (t) => OPS.echeance(t, j));
        }
        const libres = o.filter(t => !t.quand);
        if (libres.length) {
            const d = el.createEl("details", { cls: "tch-libres" });
            d.createEl("summary", { text: `📥 Sans date (${libres.length}) : glisse-les sur un jour` });
            libres.sort((a, b) => b.score - a.score).forEach(t => ligneTache(d, t, { glisser: true }).addClass("carte"));
        }
    },

    revue(el) {
        const o = toutes.filter(t => !t.fait && !t.annulee);
        const lundi = lundiDe(AUJ);
        const points = [
            [o.filter(t => !t.quand).length, "tâche(s) sans date", "donne une date aux importantes, abandonne celles qui ne le sont plus"],
            [o.filter(t => t.quand && ecart(t.quand) < -7).length, "tâche(s) en retard de plus d'une semaine", "replanifie-les honnêtement ou abandonne-les"],
            [o.filter(t => t.domaine === "trier").length, "tâche(s) sans domaine", "touche-les, puis 🏷️ dans le menu"],
        ];
        const ul = el.createEl("ul", { cls: "tch-revue" });
        for (const [n, quoi, conseil] of points) {
            const li = ul.createEl("li");
            li.createSpan({ text: n ? `🔸 ${n} ${quoi} : ` : `✔️ 0 ${quoi}` });
            if (n) li.createSpan({ cls: "tch-note", text: conseil });
        }
        const faites = toutes.filter(t => t.fait && t.finie && t.finie >= lundi).length;
        ul.createEl("li", { text: `🏁 ${faites} tâche(s) terminée(s) depuis lundi` });
        ul.createEl("li", { text: "📧 Vide ta boîte mail : chaque mail qui demande une action devient une tâche ➕, puis archive le mail." });
    },
};

// ---------- Projets ----------
function avancement(parent, ts) {
    const faites = ts.filter(t => t.fait).length, total = ts.filter(t => !t.annulee).length;
    const w = parent.createDiv({ cls: "tch-avance" });
    const b = w.createDiv({ cls: "tch-avance-barre" });
    b.createDiv().style.width = (total ? faites / total * 100 : 0) + "%";
    w.createSpan({ text: `${faites}/${total}` });
}

// Temps d'un projet : estimation = frontmatter « estimation » (heures), sinon somme des tâches.
function tempsProjet(p) {
    const ts = toutes.filter(t => t.projet === p && !t.annulee);
    const estTaches = ts.reduce((s, t) => s + t.est, 0);
    const reel = ts.reduce((s, t) => s + t.reel, 0);
    const est = p.estimation ? Math.round(p.estimation * 60) : estTaches;
    const resteTaches = ts.filter(t => !t.fait).reduce((s, t) => s + Math.max(0, t.est - t.reel), 0);
    return { est, estTaches, reel, reste: p.estimation ? Math.max(0, est - reel) : resteTaches };
}
function puceTemps(parent, p) {
    const x = tempsProjet(p);
    if (!x.est && !x.reel) return;
    parent.createSpan({ cls: "tch-temps" + (x.est && x.reel > x.est ? " depasse" : ""),
        text: `⌛ ${fmtDuree(x.reel)}${x.est ? " / " + fmtDuree(x.est) : ""}`,
        attr: { title: `Passé : ${fmtDuree(x.reel)}\nPrévu : ${x.est ? fmtDuree(x.est) : "?"}${p.estimation ? " (estimation du projet)" : " (somme des tâches)"}\nReste : ≈ ${fmtDuree(x.reste)}` } });
}

function carteProjet(parent, p) {
    const ts = toutes.filter(t => t.projet === p);
    const o = ts.filter(t => !t.fait && !t.annulee).sort((a, b) => b.score - a.score);
    const c = parent.createDiv({ cls: "tch-pcarte" + (p.statut !== "actif" ? " inactif" : "") });
    c.style.setProperty("--c", DOMAINES[p.domaine]?.couleur || "#999");
    const h = c.createDiv({ cls: "tch-ptitre" });
    h.createSpan({ cls: "tch-lien-fort", text: "📁 " + p.nom }).addEventListener("click", () => app.workspace.openLinkText(p.path, "", false));
    if (p.statut !== "actif") h.createSpan({ cls: "tch-note", text: p.statut });
    if (p.objectif) c.createDiv({ cls: "tch-note", text: "🎯 " + p.objectif });
    const meta = c.createDiv({ cls: "tch-meta" });
    puce(meta, p.domaine);
    if (p.echeance) meta.createSpan({ cls: "tch-date" + (ecart(p.echeance) < 0 ? " retard" : ""), text: "🏁 " + libelleDate(p.echeance) });
    const retard = o.filter(t => t.quand && ecart(t.quand) < 0).length;
    if (retard) meta.createSpan({ cls: "tch-date retard", text: `⚠️ ${retard} en retard` });
    meta.createSpan({ text: `${o.length} à faire` });
    puceTemps(meta, p);
    avancement(c, ts);
    if (p.statut !== "actif") return c;
    if (o.length) {
        c.createDiv({ cls: "tch-note", text: "▶️ Prochaine action" });
        ligneTache(c, o[0], { sansProjet: true, sansDomaine: true }).addClass("carte");
    } else {
        c.createDiv({ cls: "tch-alerte", text: "⚠️ Aucune prochaine action : ajoute la suivante, ou passe le projet en « terminé »." });
    }
    return c;
}

VUES.projets = (el) => {
    const nav = el.querySelector(".tch-nav") || el.createDiv({ cls: "tch-nav" });
    nav.createEl("button", { cls: "mod-cta", text: "📁 Nouveau projet" })
        .addEventListener("click", () => app.commands.executeCommandById("notes-campus:nouveau-projet"));
    const tous = [...PROJETS.values()].filter(p => filtre.size === 0 || filtre.has(p.domaine));
    if (!tous.length) {
        el.createDiv({ cls: "tch-vide", text: "Aucun projet. Crée-en un avec 📁, ou laisse l'agent 🤖 en proposer à partir de ton vrac." });
        return;
    }
    const tri = (a, b) => (a.echeance || "9999").localeCompare(b.echeance || "9999") || a.nom.localeCompare(b.nom);
    for (const k of ["alternance", "iut", "fablab", "perso"]) {
        const ps = tous.filter(p => p.domaine === k && p.statut === "actif").sort(tri);
        const sans = toutes.filter(t => t.domaine === k && !t.projet && !t.fait && !t.annulee).length;
        if (!ps.length && !sans) continue;
        el.createEl("h4", { cls: "tch-titre", text: `${DOMAINES[k].nom} · ${ps.length} projet(s)` });
        const g = el.createDiv({ cls: "tch-pgrille" });
        ps.forEach(p => carteProjet(g, p));
        if (sans) el.createDiv({ cls: "tch-note", text: `+ ${sans} tâche(s) ${DOMAINES[k].nom} sans projet (filtre « — Sans projet » dans la liste)` });
    }
    const autres = tous.filter(p => p.statut !== "actif").sort(tri);
    if (autres.length) {
        const d = el.createEl("details");
        d.createEl("summary", { text: `⏸️ En pause et terminés (${autres.length})` });
        const g = d.createDiv({ cls: "tch-pgrille" });
        autres.forEach(p => carteProjet(g, p));
    }
};

VUES.projet = (el) => {
    const cur = dv.current();
    const p = PROJETS.get(cur.file.name.toLowerCase());
    if (!p) return el.createDiv({ cls: "tch-vide", text: "Cette vue s'utilise dans une note du dossier Projets/." });
    const f = app.vault.getAbstractFileByPath(p.path);
    const fm = (cle, v) => app.fileManager.processFrontMatter(f, (x) => { x[cle] = v; });
    const ts = toutes.filter(t => t.projet === p);

    const bar = el.createDiv({ cls: "tch-nav" });
    bar.createEl("button", { cls: "mod-cta", text: "➕ Tâche" }).addEventListener("click", () => app.commands.executeCommandById(COMMANDE_AJOUT));
    bar.createEl("button", { text: "🤖 Vrac" }).addEventListener("click", () => app.commands.executeCommandById("notes-campus:agent-vrac"));
    const st = bar.createEl("select", { cls: "tch-select" });
    for (const [v, n] of [["actif", "🟢 actif"], ["en pause", "⏸️ en pause"], ["terminé", "✅ terminé"]]) st.createEl("option", { value: v, text: n });
    st.value = p.statut;
    st.addEventListener("change", () => fm("statut", st.value));
    const dom = bar.createEl("select", { cls: "tch-select" });
    for (const k of ["perso", "fablab", "iut", "alternance"]) dom.createEl("option", { value: k, text: DOMAINES[k].nom });
    dom.value = p.domaine;
    dom.addEventListener("change", () => fm("domaine", dom.value));
    const ech = bar.createEl("input", { type: "date", cls: "tch-select" });
    ech.value = p.echeance || ""; ech.title = "🏁 Échéance du projet";
    ech.addEventListener("change", () => fm("échéance", ech.value || ""));
    const est = bar.createEl("button", { text: p.estimation ? `⏱️ ${String(p.estimation).replace(".", ",")} h prévues` : "⏱️ Estimer (h)" });
    est.title = "Temps total prévu pour le projet (heures). Vide = somme des estimations des tâches.";
    est.addEventListener("click", () => {
        const v = window.prompt("⏱️ Temps total prévu pour le projet, en heures (ex : 20, 7,5 ; vide = somme des tâches)", p.estimation ? String(p.estimation).replace(".", ",") : "");
        if (v === null) return;
        const h = Number(v.trim().replace(",", ".").replace(/h$/i, ""));
        if (v.trim() && !(h > 0)) return toast("Nombre d'heures non compris");
        fm("estimation", v.trim() ? h : "");
    });
    bar.createEl("button", { text: "📁 Tous les projets" }).addEventListener("click", () => app.workspace.openLinkText("Tâches/Projets", "", false));

    const obj = el.createDiv({ cls: "tch-objectif" });
    obj.createSpan({ text: "🎯 " });
    const ot = obj.createSpan({ text: p.objectif || "Objectif : à quoi ressemble « fini » ? (touche pour l'écrire)" });
    if (!p.objectif) ot.addClass("tch-note");
    obj.addEventListener("click", () => {
        const v = window.prompt("🎯 Objectif du projet (une phrase)", p.objectif || "");
        if (v !== null) fm("objectif", v.trim());
    });
    avancement(el, ts);
    {
        const x = tempsProjet(p);
        if (x.est || x.reel) {
            const tz = el.createDiv({ cls: "tch-avance" });
            const b = tz.createDiv({ cls: "tch-avance-barre temps" + (x.est && x.reel > x.est ? " depasse" : "") });
            b.createDiv().style.width = (x.est ? Math.min(100, x.reel / x.est * 100) : 0) + "%";
            tz.createSpan({ text: `⌛ ${fmtDuree(x.reel)} passées${x.est ? ` / ${fmtDuree(x.est)} prévues · reste ≈ ${fmtDuree(x.reste)}` : ""}` });
            if (p.estimation && x.estTaches) tz.createSpan({ cls: "tch-note", text: `(tâches : ${fmtDuree(x.estTaches)})` });
        }
    }

    const o = ts.filter(t => !t.fait && !t.annulee).sort((a, b) => b.score - a.score);
    el.createEl("h4", { cls: "tch-titre", text: `📋 À faire (${o.length})` });
    if (!o.length) el.createDiv({ cls: "tch-alerte", text: "⚠️ Aucune prochaine action : ajoute la suivante avec ➕, ou passe le projet en « terminé »." });
    o.forEach(t => ligneTache(el, t, { sansProjet: true }));
    const faites = ts.filter(t => t.fait).sort((a, b) => (b.finie || "").localeCompare(a.finie || ""));
    if (faites.length) {
        const d = el.createEl("details");
        d.createEl("summary", { text: `✅ Faites (${faites.length})` });
        faites.forEach(t => ligneTache(d, t, { sansProjet: true }));
    }
    const notes = dv.pages('-"Templates" and -"Tâches"')
        .where(n => n.file.path !== p.path && (String(n.projet || "").trim().toLowerCase() === p.nom.toLowerCase()
            || (n.file.outlinks || []).some(l => l.path === p.path)))
        .sort(n => n.file.mtime, "desc");
    if (notes.length) {
        el.createEl("h4", { cls: "tch-titre", text: `🗂️ Notes du projet (${notes.length})` });
        const ul = el.createEl("ul", { cls: "tch-notes" });
        for (const n of notes) {
            const li = ul.createEl("li");
            li.createEl("a", { cls: "internal-link", text: n.file.name, href: n.file.path })
                .addEventListener("click", (e) => { e.preventDefault(); app.workspace.openLinkText(n.file.path, "", false); });
            const info = [n.type, n.date ? String(n.date).slice(0, 10) : null].filter(Boolean).join(" · ");
            if (info) li.createSpan({ cls: "tch-note", text: "  " + info });
        }
    }
    el.createDiv({ cls: "tch-note", text: "Astuce : une case « - [ ] » écrite dans cette note, ou dans une note avec « projet: " + p.nom + " », compte aussi dans ce projet." });
};

// ---------- Rendu ----------
function rendre() {
    racine.empty();
    if (["liste", "kanban", "calendrier", "projets"].includes(mode)) entete(racine);
    VUES[mode](racine);
}

{
    const s = document.getElementById("tch-style") || document.head.createEl("style", { attr: { id: "tch-style" } });
    s.textContent = `
.tch { --rayon: 8px; font-size: var(--font-ui-small); }
.tch-nav { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0 8px; }
.tch-nav button { font-size: var(--font-ui-small); }
.tch-semaine { margin-left: 8px; color: var(--text-muted); }
.tch-filtres { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; align-items: center; }
.tch-puce { --c: #999; display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 0.85em;
  background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--text-normal); border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); }
.tch-puce.filtre { cursor: pointer; padding: 3px 10px; }
.tch-puce.off { opacity: 0.35; }
.tch-lien { cursor: pointer; color: var(--text-accent); font-size: 0.85em; }
.tch-ligne { --c: #999; display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; margin: 3px 0; border-radius: var(--rayon);
  border-left: 3px solid var(--c); background: var(--background-secondary); cursor: pointer; }
.tch-ligne:hover { background: var(--background-modifier-hover); }
.tch-ligne input { margin-top: 3px; flex: none; cursor: pointer; }
.tch-ligne.fait .tch-texte { text-decoration: line-through; color: var(--text-faint); }
.tch-ligne.encours { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 60%, transparent); }
.tch-ligne.glisse { opacity: 0.4; }
.tch-corps { flex: 1; min-width: 0; }
.tch-texte { word-break: break-word; }
.tch-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; color: var(--text-muted); font-size: 0.85em; align-items: center; }
.tch-date.retard { color: var(--text-error); font-weight: 600; }
.tch-pourquoi { font-style: italic; }
.tch-titre { margin: 14px 0 4px; }
.tch-maintenant { display: grid; gap: 8px; }
.tch-carte-top { display: flex; gap: 10px; align-items: center; }
.tch-carte-top .tch-ligne { flex: 1; padding: 10px 12px; font-size: 1.1em; }
.tch-rang { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 700;
  background: var(--interactive-accent); color: var(--text-on-accent); }
.tch-ensuite { margin-top: 8px; }
.tch-vide { padding: 16px; text-align: center; color: var(--text-muted); background: var(--background-secondary); border-radius: var(--rayon); }
.tch-charge { display: flex; gap: 4px; align-items: flex-end; height: 130px; padding: 4px 0; overflow-x: auto; }
.tch-col { flex: 1; min-width: 26px; height: 100%; display: flex; flex-direction: column; align-items: center; }
.tch-col.we .tch-jour { color: var(--text-faint); }
.tch-nb { font-size: 0.8em; color: var(--text-muted); height: 16px; }
.tch-barre { flex: 1; width: 70%; display: flex; flex-direction: column-reverse; background: var(--background-secondary); border-radius: 4px; overflow: hidden; }
.tch-jour { font-size: 0.75em; color: var(--text-muted); white-space: nowrap; margin-top: 3px; }
.tch-note { color: var(--text-muted); font-size: 0.85em; margin-top: 6px; }
.tch-kanban { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; align-items: start; }
.tch-kcol, .tch-jourcal, .tch-retard { background: var(--background-primary-alt); border: 1px solid var(--background-modifier-border);
  border-radius: var(--rayon); padding: 8px; min-height: 80px; }
.tch-kcol.survol, .tch-jourcal.survol { outline: 2px dashed var(--interactive-accent); }
.tch-ktitre { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 6px; }
.tch-ligne.carte { background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-left: 3px solid var(--c); }
.tch-cal { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 6px; }
.tch-jourcal.auj { border-color: var(--interactive-accent); box-shadow: 0 0 0 1px var(--interactive-accent); }
.tch-jourcal.we { opacity: 0.85; }
.tch-charge-nb { font-size: 0.8em; padding: 0 7px; border-radius: 99px; background: var(--background-modifier-hover); }
.tch-charge-nb.lourd { background: color-mix(in srgb, var(--text-error) 30%, transparent); }
.tch-retard { margin-bottom: 8px; border-color: color-mix(in srgb, var(--text-error) 50%, transparent); }
.tch-libres { margin-top: 10px; }
.tch-revue li { margin: 4px 0; }
.tch-projet { padding: 0 6px; border-radius: 4px; background: var(--background-modifier-hover); }
.tch-select { font-size: var(--font-ui-small); max-width: 220px; }
.tch-pgrille { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.tch-pcarte { --c: #999; display: flex; flex-direction: column; gap: 5px; padding: 10px; border-radius: var(--rayon);
  background: var(--background-primary-alt); border: 1px solid var(--background-modifier-border); border-top: 3px solid var(--c); }
.tch-pcarte.inactif { opacity: 0.7; }
.tch-ptitre { display: flex; justify-content: space-between; gap: 6px; font-weight: 600; font-size: 1.05em; }
.tch-lien-fort { cursor: pointer; }
.tch-lien-fort:hover { color: var(--text-accent); text-decoration: underline; }
.tch-avance { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.85em; margin: 4px 0; }
.tch-avance-barre { flex: 1; height: 6px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden; }
.tch-avance-barre > div { height: 100%; background: var(--interactive-accent); }
.tch-alerte { padding: 6px 8px; border-radius: 6px; font-size: 0.9em; background: color-mix(in srgb, var(--color-orange) 15%, transparent); }
.tch-objectif { padding: 8px 10px; margin: 6px 0; border-radius: var(--rayon); background: var(--background-secondary); cursor: pointer; }
.tch-notes { margin-top: 4px; }
.tch-desc { color: var(--text-muted); font-size: 0.85em; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tch-trombone { cursor: pointer; }
.tch-fenetre-fond { position: fixed; inset: 0; z-index: 1002; background: rgba(0,0,0,0.45); display: grid; place-items: center; padding: 16px; }
.tch-fenetre { width: min(620px, 100%); max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 16px;
  border-radius: 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); box-shadow: var(--shadow-l); font-size: var(--font-ui-small); }
.tch-fenetre.survol { outline: 2px dashed var(--interactive-accent); }
.tch-fenetre-titre { font-weight: 600; font-size: 1.1em; }
.tch-titre-saisie { width: 100%; font-size: var(--font-ui-medium); font-weight: 600; }
.tch-badge-encours { display: inline-block; margin-right: 6px; padding: 0 7px; border-radius: 99px; font-size: 0.8em; font-weight: 600;
  background: color-mix(in srgb, var(--color-blue) 22%, transparent); color: var(--text-normal); border: 1px solid color-mix(in srgb, var(--color-blue) 55%, transparent); }
.tch-badge-encours.chrono { background: color-mix(in srgb, var(--color-red) 20%, transparent); border-color: color-mix(in srgb, var(--color-red) 60%, transparent); }
.tch-zone-encours { padding: 4px 6px; border-radius: var(--rayon); background: color-mix(in srgb, var(--color-blue) 8%, transparent); }
.tch-temps { padding: 0 6px; border-radius: 4px; background: var(--background-modifier-hover); }
.tch-temps.depasse { color: var(--text-error); font-weight: 600; }
.tch-temps-saisie { display: flex; gap: 12px; flex-wrap: wrap; }
.tch-temps-saisie input { width: 150px; }
.tch-cal-projet { --c: #999; font-size: 0.85em; font-weight: 600; padding: 3px 6px; margin: 3px 0; border-radius: 6px; cursor: pointer;
  background: color-mix(in srgb, var(--c) 18%, transparent); border: 1px dashed color-mix(in srgb, var(--c) 70%, transparent); }
.tch-avance-barre.temps > div { background: var(--color-green); }
.tch-avance-barre.temps.depasse > div { background: var(--color-red); }
.tch-hist { margin-top: 4px; }
.tch-hist summary { cursor: pointer; }
.tch-hist-ligne { display: flex; gap: 10px; font-size: 0.85em; padding: 3px 0; border-bottom: 1px solid var(--background-modifier-border); }
.tch-hist-date { color: var(--text-muted); min-width: 120px; flex-shrink: 0; }
.tch-desc-saisie { width: 100%; min-height: 130px; resize: vertical; font-size: var(--font-ui-medium); }
.tch-pj { display: flex; flex-wrap: wrap; gap: 8px; }
.tch-pj-item { position: relative; width: 104px; cursor: pointer; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 4px; background: var(--background-secondary); }
.tch-pj-item img { width: 100%; height: 72px; object-fit: cover; border-radius: 5px; display: block; }
.tch-pj-icone { height: 72px; display: grid; place-items: center; font-size: 30px; }
.tch-pj-nom { font-size: 0.75em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; }
.tch-pj-x { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  background: var(--background-primary); border: 1px solid var(--background-modifier-border); font-size: 11px; }
.tch-fenetre-boutons { margin-top: 6px; }
.tch-espace { flex: 1; }
.tch-menu { position: fixed; z-index: 1000; min-width: 220px; max-width: 320px; padding: 4px; border-radius: var(--rayon);
  background: var(--background-primary); border: 1px solid var(--background-modifier-border); box-shadow: var(--shadow-l); font-size: var(--font-ui-small); }
.tch-menu-titre { padding: 6px 10px; color: var(--text-muted); font-size: 0.85em; border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 2px; }
.tch-menu-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.tch-menu-item:hover { background: var(--background-modifier-hover); }
.tch-menu-sep { height: 1px; margin: 3px 6px; background: var(--background-modifier-border); }
.tch-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 1001; padding: 8px 14px; border-radius: 8px;
  background: var(--background-modifier-error); color: var(--text-on-accent); }
`;
}
rendre();
