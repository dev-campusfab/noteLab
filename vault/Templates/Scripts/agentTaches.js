// 🤖 Agent tâches : on lui donne du vrac (ou une note de réunion), l'IA du Framework le découpe
// en tâches concrètes avec domaine, projet, échéance et priorité ; on relit, on corrige, on valide.
// Il range dans les projets existants (Projets/) et en propose de nouveaux (créés à la validation).
//   agentTaches(tp)                    → fenêtre « vide ta tête » (texte libre, dictée iPad possible)
//   agentTaches(tp, { note: true })    → lit la note ouverte (ex : réunion d'équipe) et extrait ses actions
// Les tâches vont sous « ## ✅ Actions » de la note si elle en a une, sinon dans la boîte de réception.
// La clé API n'est pas dans le vault (synchronisé) : elle est gardée sur chaque appareil (localStorage).

const BOITE = "Tâches/Boîte de réception.md";
const CLE_LOCALE = "notes-campus-llm-cle";
const DOMAINES = { perso: "🏠 Perso", fablab: "🛠️ Fab Lab", iut: "🎓 IUT", alternance: "💼 Alternance" };
const PRIO = { normale: "", haute: " ⏫", urgente: " 🔺" };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dans = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// L'IA recopie l'expression de date (« jeudi », « 6/11 ») : le calcul est fait par dateFr,
// un modèle 7B se trompant souvent dans les calculs de jours.
const SCHEMA = {
    type: "object",
    properties: { taches: { type: "array", items: { type: "object", properties: {
        texte: { type: "string" },
        domaine: { type: "string", enum: Object.keys(DOMAINES) },
        projet: { type: "string" },
        details: { type: "string" },
        quand: { type: "string" },
        priorite: { type: "string", enum: Object.keys(PRIO) },
        duree: { type: "string" },
    }, required: ["texte", "domaine", "projet", "details", "quand", "priorite", "duree"] } } },
    required: ["taches"],
};

function consignes(tp, C, existantes, projets) {
    const v = (cle, filtre) => tp.user.valeursVault(tp, cle, filtre).slice(0, 12).join(", ");
    const a = C.agent || {};
    return `Tu es l'assistant d'organisation de ${a.profil || "l'utilisateur"}. On te donne du vrac ; tu le transformes en tâches.

Domaines (choisis avec ces indices) :
- alternance : ${a.alternance || "son ENTREPRISE. Tout ce qui vient d'un collègue, d'un manager, d'un client ou d'un partenaire de l'entreprise"}. Projets et mots-clés : ${[v("projet", { cle: "contexte", valeur: "Alternance" }), a.motsAlternance].filter(Boolean).join(", ")}.
- iut : ses COURS. TP, TD, devoirs, partiels, révisions, SAÉ, profs. Matières : ${v("matière")}.
- fablab : ${a.fablab || "le fab lab / l'association dont il s'occupe"} : ${[v("projet", { cle: "contexte", valeur: "Fab Lab" }), a.motsFablab].filter(Boolean).join(", ")}.
- perso : vie privée : administratif (CAF, impôts, banque), santé, courses, famille, logement.

Projets en cours (nom exact · domaine · objectif) :
${projets.map(p => `- ${p.nom} · ${p.domaine} · ${p.objectif || "(sans description : seulement si le vrac cite ce nom)"}`).join("\n") || "- (aucun pour l'instant)"}

Règles :
- Une tâche = UNE action concrète qui commence par un verbe à l'infinitif, faisable en moins de 2 h. Découpe les gros sujets en étapes.
- Garde les noms propres et chiffres. N'invente rien.
- Une décision (« on garde », « on part sur », « validé ») ou une simple information n'est PAS une tâche : ignore-la.
- quand : recopie EXACTEMENT l'expression de date du vrac qui concerne cette tâche (« jeudi », « mardi prochain », « 6/11 », « demain », « urgent ») ; une étape préparatoire reprend la date du livrable ; sinon "".
- projet : le nom EXACT d'un projet en cours si la tâche en fait partie. Si plusieurs tâches du vrac visent un même objectif qui n'est dans aucun projet (ex : « organiser le salon », « préparer le partiel d'OML »), invente un nom court (2 à 4 mots) et mets-le sur chacune de ces tâches : ce sera un nouveau projet. Une tâche isolée (« appeler la banque ») : "".
- details : le contexte du vrac utile pour faire cette tâche (qui la demande, pourquoi, contraintes, chiffres, références), recopié fidèlement en une ou deux phrases courtes ; "" s'il n'y a rien de plus que le texte de la tâche. N'invente rien.
- duree : recopie la durée que le vrac donne pour cette tâche (« 2h », « 30 min », « une heure et demie » → « 1h30 ») ; sinon "". N'estime rien toi-même.
- priorite : « urgente » seulement si le vrac dit « urgent », « au plus vite » ou « ASAP » ; « haute » si une personne la veut, l'attend ou la demande (« Marc veut », « Julie attend ») ; sinon « normale ».
- Ne propose pas ce qui est déjà dans sa liste : ${existantes || "—"}

- Chaque élément du vrac donne au moins une tâche : n'en oublie aucun et n'ajoute rien qui n'y est pas.

Exemple (style seulement, ne recopie pas ces tâches) : « pour le déménagement faut résilier la box et réserver un camion samedi (2h), Léa attend mon RIB » →
[{"texte":"Résilier l'abonnement box","domaine":"perso","projet":"Déménagement","details":"","quand":"samedi","priorite":"normale","duree":""},{"texte":"Réserver un camion","domaine":"perso","projet":"Déménagement","details":"Pour le déménagement de samedi.","quand":"samedi","priorite":"normale","duree":"2h"},{"texte":"Envoyer le RIB à Léa","domaine":"perso","projet":"","details":"Léa l'attend.","quand":"","priorite":"haute","duree":""}]`;
}

async function cleApi(tp, url) {
    const app = tp.app;
    if (/\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return "-";     // Ollama sur ce PC : pas de clé
    let cle = app.loadLocalStorage(CLE_LOCALE);
    if (!cle) cle = (await app.plugins.plugins["ai-image-analyzer"]?.loadData())?.aiAdapterSettings?.ollamaSettings?.token;
    if (!cle) {
        cle = await tp.system.prompt("🔑 Clé API du serveur IA (une seule fois sur cet appareil)");
        if (!cle) return null;
        cle = cle.trim();
    }
    app.saveLocalStorage(CLE_LOCALE, cle);
    return cle;
}

// Fenêtre de saisie du vrac (grande zone de texte : on peut dicter au clavier de l'iPad).
function saisirVrac(tp) {
    return new Promise((resolve) => {
        const m = new tp.obsidian.Modal(tp.app);
        let fini = false;
        m.titleEl.setText("🤖 Vide ta tête");
        m.contentEl.createEl("p", { cls: "setting-item-description",
            text: "Écris (ou dicte) tout ce que tu as à faire, en vrac : réunion, mails, idées, cours… L'IA en fait des tâches." });
        const ta = m.contentEl.createEl("textarea", { attr: { rows: 10, placeholder:
            "Ex : Marc veut le compte rendu pour mardi, finir le schéma du montage, rendre le TP3 jeudi, appeler la CAF urgent…" } });
        ta.style.width = "100%"; ta.style.minHeight = "200px"; ta.style.fontSize = "var(--font-ui-medium)";
        const b = m.contentEl.createDiv({ cls: "modal-button-container" });
        b.createEl("button", { text: "Annuler" }).addEventListener("click", () => m.close());
        b.createEl("button", { cls: "mod-cta", text: "🤖 Découper en tâches" }).addEventListener("click", () => {
            fini = true; m.close(); resolve(ta.value.trim() || null);
        });
        ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) b.lastChild.click(); });
        m.onClose = () => { if (!fini) resolve(null); };
        m.open();
        setTimeout(() => ta.focus(), 50);
    });
}

// Relecture : chaque tâche est modifiable avant l'ajout.
function relire(tp, taches, ou, projets) {
    return new Promise((resolve) => {
        const m = new tp.obsidian.Modal(tp.app);
        let fini = false;
        m.titleEl.setText(`🤖 ${taches.length} tâche(s) proposée(s)`);
        m.modalEl.style.width = "min(760px, 96vw)";
        m.contentEl.createEl("p", { cls: "setting-item-description", text: `Décoche ce qui ne va pas, corrige si besoin. Destination : ${ou}. ` +
            "📁 Projet : choisis dans la liste, tape un nouveau nom (✨ il sera créé) ou vide le champ." });
        const connus = new Map(projets.map(p => [p.nom.toLowerCase(), p.nom]));
        const dl = m.contentEl.createEl("datalist", { attr: { id: "agent-projets" } });
        for (const p of projets) dl.createEl("option", { value: p.nom });
        const lignes = taches.map((t) => {
            const row = m.contentEl.createDiv();
            row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--background-modifier-border)";
            const cb = row.createEl("input", { type: "checkbox" }); cb.checked = true;
            const tx = row.createEl("input", { type: "text", value: t.texte }); tx.style.cssText = "flex:1 1 260px;min-width:0";
            const dom = row.createEl("select");
            for (const [k, n] of Object.entries(DOMAINES)) dom.createEl("option", { value: k, text: n });
            dom.value = DOMAINES[t.domaine] ? t.domaine : "perso";
            const pj = row.createEl("input", { type: "text", value: connus.get((t.projet || "").toLowerCase()) || t.projet || "",
                attr: { list: "agent-projets", placeholder: "📁 projet" } });
            pj.style.cssText = "flex:0 1 170px;min-width:0";
            const neuf = () => pj.toggleClass("agent-neuf", !!pj.value.trim() && !connus.has(pj.value.trim().toLowerCase()));
            pj.title = "✨ = nouveau projet, créé à la validation";
            pj.addEventListener("input", neuf); neuf();
            const date = row.createEl("input", { type: "date" }); date.value = /^\d{4}-\d{2}-\d{2}$/.test(t.echeance || "") ? t.echeance : "";
            const du = row.createEl("input", { type: "text", value: t.minutes ? tp.user.duree().jeton(t.minutes) : "", attr: { placeholder: "⏱️ 2h" } });
            du.style.cssText = "flex:0 0 70px;min-width:0"; du.title = "Temps prévu (facultatif) : 2h, 1h30, 45min";
            const pr = row.createEl("select");
            for (const [k, n] of [["normale", "normale"], ["haute", "⏫ haute"], ["urgente", "🔺 urgente"]]) pr.createEl("option", { value: k, text: n });
            pr.value = PRIO[t.priorite] !== undefined ? t.priorite : "normale";
            const det = row.createEl("textarea", { attr: { rows: 1, placeholder: "📝 détails (facultatif)" } });
            det.value = (t.details || "").trim();
            det.style.cssText = "flex:1 1 100%;min-height:2.2em;font-size:0.9em;color:var(--text-muted)";
            cb.addEventListener("change", () => row.style.opacity = cb.checked ? "1" : "0.4");
            return () => cb.checked && tx.value.trim() ? { texte: tx.value.trim(), domaine: dom.value,
                projet: connus.get(pj.value.trim().toLowerCase()) || pj.value.trim(), details: det.value.trim(), echeance: date.value || null, priorite: pr.value,
                minutes: tp.user.duree().lire(du.value) || null } : null;
        });
        const b = m.contentEl.createDiv({ cls: "modal-button-container" });
        b.createEl("button", { text: "Annuler" }).addEventListener("click", () => m.close());
        b.createEl("button", { cls: "mod-cta", text: "✅ Ajouter" }).addEventListener("click", () => {
            fini = true; m.close(); resolve(lignes.map(f => f()).filter(Boolean));
        });
        m.onClose = () => { if (!fini) resolve(null); };
        const st = m.contentEl.createEl("style");
        st.textContent = ".agent-neuf{border-color:var(--color-yellow)!important;background:color-mix(in srgb,var(--color-yellow) 12%,transparent)!important}";
        m.open();
    });
}

module.exports = async (tp, opts = {}) => {
    const app = tp.app;
    const { Notice, requestUrl } = tp.obsidian;
    const C = tp.user.config();
    const P = tp.user.projets(tp);
    const projets = P.liste().filter(p => p.statut !== "terminé");
    const actif = app.workspace.getActiveFile();

    // 1. Le vrac
    let vrac, source = null;
    if (opts.note) {
        if (!actif || actif.extension !== "md") return new Notice("Ouvre d'abord la note (ex : la réunion).");
        source = actif;
        const fm = app.metadataCache.getFileCache(actif)?.frontmatter || {};
        const corps = (await app.vault.read(actif))
            .replace(/^---\n[\s\S]*?\n---\n/, "").replace(/!\[\[[^\]]*\]\]/g, "").replace(/<!--[\s\S]*?-->/g, "")
            .replace(/^\s*[-*] \[[ ]\]\s*$/gm, "");
        vrac = `Note « ${actif.basename} » (${[fm.contexte, fm.projet || fm["matière"], fm.type, fm.date].filter(Boolean).join(", ")}) :\n${corps.trim()}`;
        if (corps.replace(/[#>\-\s]/g, "").length < 20) return new Notice("La note est presque vide : rien à extraire.");
    } else {
        vrac = await saisirVrac(tp);
        if (!vrac) return;
    }

    // 2. L'IA
    const cle = await cleApi(tp, C.ocr.url);
    if (!cle) return;
    // Tâches déjà ouvertes (pour éviter les doublons), les 40 dernières.
    let liste = "";
    try {
        const ouvertes = [];
        for (const f of app.vault.getMarkdownFiles()) {
            if (f.path.startsWith("Templates/")) continue;
            const items = (app.metadataCache.getFileCache(f)?.listItems || []).filter(i => i.task === " " || i.task === "/");
            if (!items.length) continue;
            const lignes = (await app.vault.cachedRead(f)).split("\n");
            for (const i of items) ouvertes.push(lignes[i.position.start.line].replace(/^\s*[-*+] \[.\]\s*/, "").replace(/[📅➕⏳✅🔺⏫🔼🔽⏬].*$/u, "").trim());
        }
        liste = ouvertes.filter(Boolean).slice(-40).join(" | ");
    } catch (e) { console.error("Agent tâches : lecture des tâches", e); }

    const attente = new Notice("🤖 Je découpe en tâches…", 0);
    let taches;
    try {
        const r = await requestUrl({
            url: C.ocr.url + "/api/chat", method: "POST", throw: false,
            headers: { "Content-Type": "application/json", ...(cle !== "-" ? { Authorization: "Bearer " + cle } : {}) },
            body: JSON.stringify({
                model: C.agent?.modele || C.ocr.modele, stream: false, format: SCHEMA,
                options: { temperature: 0.1, num_predict: 2000, num_ctx: 8192 },
                messages: [
                    { role: "system", content: consignes(tp, C, liste, projets) },
                    { role: "user", content: vrac },
                ],
            }),
        });
        if (r.status === 401) { app.saveLocalStorage(CLE_LOCALE, null); throw new Error("clé API refusée : relance pour la saisir à nouveau"); }
        if (r.status !== 200) throw new Error(`serveur IA : erreur ${r.status}`);
        // Garde-fous : « urgente » sans mot d'urgence → haute ; un nouveau projet doit grouper au moins 2 tâches.
        // Rattrapage : un mot de la tâche qui commence un projet existant du même domaine (« clim » → Climatisation).
        const mots = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(m => m.length >= 4);
        const devineProjet = (t) => projets.find(p => p.domaine === t.domaine && p.statut === "actif"
            && mots(t.texte).some(m => mots(p.nom).some(n => n.startsWith(m) || m.startsWith(n))))?.nom || "";
        // Projet proposé : existant (et décrit, ou cité dans le vrac), ou nouveau partagé par 2 tâches ou plus.
        const projetValide = (nom) => {
            if (!nom) return false;
            const p = P.trouver(nom);
            if (p) return !!p.objectif || vrac.toLowerCase().includes(p.nom.toLowerCase());
            return compte[nom.toLowerCase()] >= 2;
        };
        const urgentDit = /urgen|asap|au plus vite|tout de suite/i.test(vrac);
        const brutes = JSON.parse(r.json.message.content).taches || [];
        const compte = {};
        for (const t of brutes) if (t.projet) compte[t.projet.toLowerCase()] = (compte[t.projet.toLowerCase()] || 0) + 1;
        taches = brutes.map(t => ({
            ...t,
            // « haute » = quelqu'un attend (vérifié dans le texte : le 7B se trompe souvent dans les deux sens).
            priorite: t.priorite === "urgente" && urgentDit ? "urgente"
                : /\b(veu[tl]|veulent|attend|demand|relanc|important|prioritaire)/i.test(`${t.texte} ${t.details || ""}`) ? "haute"
                : "normale",
            projet: projetValide(t.projet) ? t.projet : devineProjet(t),
            // Durée : gardée seulement si elle est comprise (le modèle n'estime pas lui-même).
            minutes: tp.user.duree().lire(t.duree) || tp.user.duree().extraire(`${t.texte} ${t.duree || ""}`).minutes || null,
            echeance: tp.user.dateFr(t.quand) || (t.priorite === "urgente" && urgentDit ? tp.user.dateFr("aujourd'hui") : null),
        }));
    } catch (e) {
        attente.hide();
        console.error("Agent tâches", e);
        return new Notice("🤖 Échec : " + (e.message || e) + "\nTon texte n'est pas perdu : relance, il faudra le recoller.", 12000);
    }
    attente.hide();
    if (!taches.length) return new Notice("🤖 Aucune action trouvée dans ce texte.");

    // 3. Relecture puis écriture
    const fmSource = source ? app.metadataCache.getFileCache(source) : null;
    const titreActions = fmSource?.headings?.find(h => /^✅?\s*(Actions|Décisions \/ à faire)/.test(h.heading));
    const ou = titreActions ? `section « ${titreActions.heading} » de la note` : "Tâches/Boîte de réception";
    // Une note de projet (réunion…) donne son projet aux tâches que l'IA n'a pas rangées.
    const projetSource = P.deNote(source);
    if (projetSource) for (const t of taches) if (!t.projet && t.domaine === projetSource.domaine) t.projet = projetSource.nom;
    const ok = await relire(tp, taches, ou, projets);
    if (!ok || !ok.length) return;

    // Nouveaux projets : créés avec le domaine de leur première tâche.
    const crees = [];
    for (const t of ok) {
        if (!t.projet) continue;
        const p = P.trouver(t.projet) || (crees.push(t.projet), await P.creer(t.projet, t.domaine));
        t.projet = p?.nom || "";
    }

    const lien = source && !titreActions ? ` ([[${source.basename}]])` : "";
    // Lien projet sauf si la tâche va dans une note qui est déjà de ce projet.
    const lienProjet = (t) => t.projet && !(titreActions && projetSource?.nom === t.projet) ? ` [[${t.projet}]]` : "";
    // Détails : sous-lignes « - » indentées sous la tâche (même format que « 📝 Détails » dans les vues).
    const sousLignes = (t) => (t.details || "").split("\n").map(x => x.trim().replace(/^[-*+]\s+/, "")).filter(Boolean).map(x => `\t- ${x}`);
    const lignes = ok.map(t => [`- [ ] ${t.texte} #${t.domaine}${lienProjet(t)}${lien}${t.minutes ? ` ⏱️ ${tp.user.duree().jeton(t.minutes)}` : ""}${PRIO[t.priorite]}${t.echeance ? ` 📅 ${t.echeance}` : ""} ➕ ${dans(0)}`,
        ...sousLignes(t)].join("\n"));

    if (titreActions) {
        await app.vault.process(source, (txt) => {
            const L = txt.split("\n");
            let i = titreActions.position.start.line + 1;
            // Retire la case vide du modèle, puis insère après les tâches déjà présentes.
            // (on saute aussi les détails indentés des tâches déjà là)
            while (i < L.length && (/^\s*[-*] \[.\]/.test(L[i]) || /^\s+\S/.test(L[i]))) { if (/^\s*[-*] \[ \]\s*$/.test(L[i])) L.splice(i, 1); else i++; }
            L.splice(i, 0, ...lignes);
            return L.join("\n");
        });
    } else {
        let f = app.vault.getAbstractFileByPath(BOITE);
        if (!f) f = await app.vault.create(BOITE, "# 📥 Boîte de réception\n\n");
        await app.vault.process(f, (txt) => txt.replace(/\n*$/, "\n") + lignes.join("\n") + "\n");
    }
    new Notice(`✅ ${lignes.length} tâche(s) ajoutée(s) · ${ou}` +
        (crees.length ? `\n✨ Nouveau(x) projet(s) : ${[...new Set(crees)].join(", ")}` : ""), 6000);
};
