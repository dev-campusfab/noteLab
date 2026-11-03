// Lancé au démarrage d'Obsidian par Templates/Démarrage.md (modèle de démarrage Templater).
// 1. Enregistre les commandes ✍️ : utilisables partout, y compris DANS un dessin
//    Excalidraw (là où l'insertion de modèle Templater est impossible).
// 2. Ajoute nos boutons au ruban et l'aligne sur tous les appareils (même ordre, même choix).
// 3. Installe les modules qui manquent sur cet appareil (Templates/Config/modules.json).
// 4. Vérifie les réglages dont le système dépend. LiveSync ne synchronise pas
//    .obsidian/ : chaque appareil a ses propres réglages, ce script les aligne.
// 5. noteLab : modules actifs (Templates/Config/Réglages.md), mise à jour depuis GitHub
//    (sauf sur les appareils « source » de l'auteur), assistant au premier lancement.

const PREFIXE = "notes-campus";
const MODULES = "Templates/Config/modules.json";   // plugins de CET utilisateur (perso, jamais publié)
const CATALOGUE = "Templates/Config/noteLab.json"; // modules noteLab : fichiers et plugins (publié)
const ETAT = "Templates/Config/noteLab-installe.json"; // version installée + empreinte de chaque fichier
const REGLAGES = "Templates/Config/reglages";   // data.json de référence, posé à la 1re installation
const ECHELLE_PNG = 0.6;

// Modules : la liste partagée (synchronisée) dit quoi installer ; chaque appareil installe
// ce qui lui manque depuis GitHub (dernière version), et ajoute à la liste ce qu'il a de plus.
// Les versions sont alignées sur la plus récente installée sur un des appareils.
// Il ne désinstalle jamais rien.
async function installerModules(app, Notice, requestUrl, mobile, pluginsCatalogue = []) {
    let f = app.vault.getAbstractFileByPath(MODULES);
    if (!f) f = await app.vault.create(MODULES, JSON.stringify({ _lisezmoi: "Plugins installés automatiquement sur chacun de tes appareils (ceux des modules noteLab actifs s'ajoutent tout seuls).", modules: [] }, null, 2) + "\n");
    let cfg;
    try { cfg = JSON.parse(await app.vault.read(f)); }
    catch (e) { new Notice("⚙️ " + MODULES + " illisible : " + e.message, 10000); return []; }
    const liste = cfg.modules || [];
    // Plugins des modules noteLab actifs.
    const ajoutes = pluginsCatalogue.filter(p => !liste.some(m => m.id === p.id));
    if (ajoutes.length) {
        liste.push(...ajoutes.map(p => ({ id: p.id, repo: p.repo, appareils: p.appareils || "tous" })));
        await app.vault.process(f, () => JSON.stringify({ ...cfg, modules: liste }, null, 2) + "\n");
    }

    // 1. Modules activés ici mais absents de la liste → ajoutés (les autres appareils les installeront).
    const connus = new Set(liste.map(m => m.id));
    const nouveaux = [...app.plugins.enabledPlugins].filter(id => !connus.has(id));
    if (nouveaux.length) {
        let repos = {};
        try {
            const r = await requestUrl("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json");
            repos = Object.fromEntries(r.json.map(p => [p.id, p.repo]));
        } catch (e) { console.warn("Modules : liste officielle injoignable", e); }
        for (const id of nouveaux) if (repos[id])
            liste.push({ id, repo: repos[id], appareils: app.plugins.manifests[id]?.isDesktopOnly ? "ordinateur" : "tous" });
        if (liste.length > connus.size)
            await app.vault.process(f, () => JSON.stringify({ ...cfg, modules: liste }, null, 2) + "\n");
    }

    // 2. Installation de ceux qui manquent sur cet appareil.
    const a = app.vault.adapter;
    const majs = await alignerVersions(app, f, cfg, liste, requestUrl, Notice);
    const manquants = liste.filter(m => !app.plugins.manifests[m.id] && !(mobile && m.appareils === "ordinateur"));
    if (!manquants.length) return majs;
    const avancement = new Notice(`⚙️ Installation de ${manquants.length} module(s)…`, 0);
    const installes = [], erreurs = [];
    for (const m of manquants) {
        try {
            const base = `https://github.com/${m.repo}/releases/latest/download/`;
            const manifest = (await requestUrl(base + "manifest.json")).text;
            if (mobile && JSON.parse(manifest).isDesktopOnly) continue;
            const main = (await requestUrl(base + "main.js")).text;
            const css = await requestUrl({ url: base + "styles.css", throw: false }).catch(() => null);
            const d = `${app.vault.configDir}/plugins/${m.id}`;
            if (!(await a.exists(d))) await a.mkdir(d);
            await a.write(d + "/manifest.json", manifest);
            await a.write(d + "/main.js", main);
            if (css?.status === 200) await a.write(d + "/styles.css", css.text);
            const ref = `${REGLAGES}/${m.id}.json`;
            if (await a.exists(ref) && !(await a.exists(d + "/data.json"))) await a.write(d + "/data.json", await a.read(ref));
            installes.push(m.id);
        } catch (e) { console.error("Module", m.id, e); erreurs.push(m.id); }
    }
    if (installes.length) {
        await app.plugins.loadManifests();
        for (const id of installes) {
            try { await app.plugins.enablePluginAndSave(id); }
            catch (e) { console.error("Activation", id, e); erreurs.push(id); }
        }
    }
    avancement.hide();
    if (erreurs.length) new Notice("⚙️ Modules non installés (réseau ?) : " + erreurs.join(", ") + ". Nouvel essai au prochain démarrage.", 12000);
    return [...majs, ...installes.map(id => app.plugins.manifests[id]?.name || id)];
}

// Même version d'un module sur tous les appareils (LiveSync affiche un avertissement sinon).
// La liste garde la version la plus récente vue sur un appareil ; un appareil en retard télécharge
// exactement cette version. Rien n'est jamais rétrogradé.
const compareVersions = (a, b) => {
    const x = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), y = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
    return 0;
};

async function alignerVersions(app, f, cfg, liste, requestUrl, Notice) {
    let noter = false;
    const enRetard = [];
    for (const m of liste) {
        const ici = app.plugins.manifests[m.id]?.version;
        if (!ici) continue;
        if (!m.version || compareVersions(ici, m.version) > 0) { m.version = ici; noter = true; }
        else if (compareVersions(ici, m.version) < 0) enRetard.push(m);
    }
    if (noter) await app.vault.process(f, () => JSON.stringify({ ...cfg, modules: liste }, null, 2) + "\n");
    if (!enRetard.length) return [];

    const a = app.vault.adapter, faits = [], recharger = [];
    const avancement = new Notice(`⚙️ Mise à jour de ${enRetard.length} module(s)…`, 0);
    for (const m of enRetard) {
        try {
            let base = null;
            for (const tag of [m.version, "v" + m.version]) {
                const u = `https://github.com/${m.repo}/releases/download/${tag}/`;
                const r = await requestUrl({ url: u + "manifest.json", throw: false }).catch(() => null);
                if (r?.status === 200) { base = u; break; }
            }
            if (!base) throw new Error("version introuvable sur GitHub");
            const d = `${app.vault.configDir}/plugins/${m.id}`;
            const main = (await requestUrl(base + "main.js")).text;
            const manifest = (await requestUrl(base + "manifest.json")).text;
            const css = await requestUrl({ url: base + "styles.css", throw: false }).catch(() => null);
            await a.write(d + "/main.js", main);
            await a.write(d + "/manifest.json", manifest);
            if (css?.status === 200) await a.write(d + "/styles.css", css.text);
            faits.push(`${app.plugins.manifests[m.id]?.name || m.id} ${m.version}`);
            // Templater exécute ce script : sa nouvelle version sera chargée au prochain démarrage.
            if (m.id !== "templater-obsidian" && app.plugins.enabledPlugins.has(m.id)) recharger.push(m.id);
        } catch (e) { console.error("Mise à jour", m.id, e); }
    }
    await app.plugins.loadManifests();
    for (const id of recharger) {
        try { await app.plugins.disablePlugin(id); await app.plugins.enablePlugin(id); }
        catch (e) { console.error("Rechargement", id, e); }
    }
    avancement.hide();
    return faits.map(x => "mis à jour : " + x);
}

// L'export PNG automatique ne se déclenche qu'à la sauvegarde d'un dessin :
// cette commande rattrape les dessins existants (ou créés avant l'activation).
// Thème clair + fond blanc : c'est ce que l'OCR lit le mieux.
async function exporterPNGManquants(app, Notice) {
    const ea = window.ExcalidrawAutomate?.getAPI?.() ?? window.ExcalidrawAutomate;
    if (!ea) { new Notice("Excalidraw n'est pas chargé."); return; }
    const manquants = app.vault.getMarkdownFiles()
        .filter(f => f.basename.endsWith(".excalidraw") && !f.path.startsWith("Templates/"))
        .filter(f => !app.vault.getAbstractFileByPath(f.path.replace(/\.md$/, ".png")));
    if (!manquants.length) { new Notice("✅ Tous les dessins ont leur PNG."); return; }

    const avancement = new Notice(`✍️ Export PNG : 0 / ${manquants.length}`, 0);
    let ok = 0;
    const erreurs = [];
    for (const f of manquants) {
        try {
            ea.reset();
            const blob = await ea.createPNG(f.path, ECHELLE_PNG,
                { withBackground: true, withTheme: true, isMask: false }, undefined, "light");
            await app.vault.createBinary(f.path.replace(/\.md$/, ".png"), await blob.arrayBuffer());
            ok++;
        } catch (e) {
            console.error("Export PNG", f.path, e);
            erreurs.push(f.basename);
        }
        avancement.setMessage(`✍️ Export PNG : ${ok + erreurs.length} / ${manquants.length}`);
    }
    avancement.hide();
    new Notice(`✅ ${ok} PNG exporté(s)` + (erreurs.length ? ` · ⚠️ échec : ${erreurs.join(", ")}` : ""), 10000);
}

// ---------- noteLab ----------
// Empreinte d'un texte (identique dans outils/construire.mjs du dépôt).
function empreinte(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

async function lireJSON(app, chemin, defaut) {
    try { return JSON.parse(await app.vault.adapter.read(chemin)); } catch (e) { return defaut; }
}

// Modules actifs + cœur + modules requis, dans le catalogue.
function modulesActifs(catalogue, C) {
    const actifs = new Set(["coeur", ...C.modules]);
    for (const m of [...actifs]) for (const r of catalogue?.modules?.[m]?.requiert || []) actifs.add(r);
    return [...actifs].filter(m => catalogue?.modules?.[m]);
}

async function ecrireFichier(a, chemin, texte) {
    const dossiers = chemin.split("/").slice(0, -1);
    for (let i = 1; i <= dossiers.length; i++) {
        const d = dossiers.slice(0, i).join("/");
        if (!(await a.exists(d))) await a.mkdir(d);
    }
    await a.write(chemin, texte);
}

// Mise à jour depuis la dernière release GitHub (manifest.json : version, tag, fichiers + empreintes).
// Un fichier modifié par l'utilisateur n'est jamais écrasé : la nouvelle version est posée à côté
// (« .nouveau »). Un fichier retiré de noteLab n'est supprimé que s'il n'a pas été modifié.
// racine : préfixe des chemins (tests) ; renvoie un résumé ou null.
async function mettreAJour(app, Notice, requestUrl, C, racine = "") {
    const a = app.vault.adapter;
    const catalogue = await lireJSON(app, CATALOGUE, null);
    const depot = catalogue?.depot;
    if (!depot) return null;
    let man;
    try {
        const r = await requestUrl({ url: `https://github.com/${depot}/releases/latest/download/manifest.json`, throw: false });
        if (r.status !== 200) return null;
        man = JSON.parse(r.text);
    } catch (e) { return null; }                      // hors ligne : on réessaiera au prochain démarrage
    const etat = await lireJSON(app, racine + ETAT, { version: null, fichiers: {} });
    if (!man?.fichiers || man.version === etat.version) return null;

    const actifs = new Set(modulesActifs(man.catalogue || catalogue, C));
    const voulus = man.fichiers.filter(f => actifs.has(f.module));
    const avancement = new Notice(`🔄 noteLab ${man.version} : mise à jour…`, 0);
    const res = { ecrits: [], gardes: [], supprimes: [], erreurs: [] };
    const brut = (chemin) => `https://raw.githubusercontent.com/${depot}/${man.tag}/vault/${chemin.split("/").map(encodeURIComponent).join("/")}`;
    for (const f of voulus) {
        const chemin = racine + f.chemin;
        const avant = etat.fichiers[f.chemin];
        let local = null;
        if (await a.exists(chemin)) local = empreinte(await a.read(chemin));
        if (local === f.hash) { etat.fichiers[f.chemin] = f.hash; continue; }
        try {
            const r = await requestUrl({ url: brut(f.chemin), throw: false });
            if (r.status !== 200 || empreinte(r.text) !== f.hash) throw new Error("téléchargement incomplet");
            if (local !== null && avant && local !== avant) {
                await ecrireFichier(a, chemin + ".nouveau", r.text);       // modifié par l'utilisateur : on garde le sien
                res.gardes.push(f.chemin);
                continue;
            }
            if (local !== null && !avant) await ecrireFichier(a, chemin + ".ancien", await a.read(chemin));  // 1re installation sur un ancien kit
            await ecrireFichier(a, chemin, r.text);
            etat.fichiers[f.chemin] = f.hash;
            res.ecrits.push(f.chemin);
        } catch (e) { console.error("noteLab", f.chemin, e); res.erreurs.push(f.chemin); }
    }
    // Fichiers retirés de noteLab (ou d'un module désactivé : gardés, simplement plus mis à jour).
    const publies = new Set(man.fichiers.map(f => f.chemin));
    for (const [rel, h] of Object.entries(etat.fichiers)) {
        if (publies.has(rel)) continue;
        const chemin = racine + rel;
        if (await a.exists(chemin) && empreinte(await a.read(chemin)) === h) { await a.remove(chemin); res.supprimes.push(rel); }
        delete etat.fichiers[rel];
    }
    if (!res.erreurs.length) etat.version = man.version;      // sinon : nouvel essai au prochain démarrage
    etat.date = new Date().toISOString();
    await ecrireFichier(a, racine + ETAT, JSON.stringify(etat, null, 2) + "\n");
    avancement.hide();
    const lignes = [`🔄 noteLab ${man.version}` + (res.ecrits.length ? ` : ${res.ecrits.length} fichier(s) mis à jour` : "")];
    if (man.notes) lignes.push(man.notes);
    if (res.gardes.length) lignes.push(`✋ Tu avais modifié : ${res.gardes.join(", ")}. Ta version est gardée ; la nouvelle est à côté (.nouveau).`);
    if (res.erreurs.length) lignes.push(`⚠️ Non téléchargés (réseau ?) : ${res.erreurs.length}. Nouvel essai au prochain démarrage.`);
    if (res.ecrits.length || res.gardes.length || res.erreurs.length) new Notice(lignes.join("\n"), 15000);
    return res;
}

// Premier lancement (pas de Réglages.md) : choix des modules, contextes, profil, serveur IA.
const DOC_REGLAGES = `
# ⚙️ Mes réglages noteLab

Ces réglages sont **à toi** : les mises à jour de noteLab ne touchent jamais ce fichier.
Modifie-les dans les propriétés ci-dessus, puis redémarre Obsidian.

| Réglage | Rôle |
|---|---|
| \`modules\` | Parties actives : \`taches\` (tâches, projets, chrono), \`notes\` (modèles de notes, manuscrits iPad), \`ia\` (agent vide-tête, lecture des manuscrits ; demande \`taches\`). |
| \`ruban\` | \`true\` : la barre latérale ne garde que les boutons noteLab (même ordre sur tous tes appareils). |
| \`profil\` | Qui l'IA aide (« Léa, étudiante en licence de bio »). |
| \`semestre\` | Écrit dans les nouvelles notes de cours. |
| \`contextes\` | Dossiers de notes : \`IUT\`, \`Fab Lab\`, \`Alternance\`, \`Perso\`. |
| \`fablab\`, \`alternance\` | Comment l'IA reconnaît ces domaines dans ton vrac (vide = description générique). |
| \`mots_alternance\`, \`mots_fablab\` | Mots-clés en plus pour l'IA (séparés par des virgules). |
| \`ia_url\`, \`ia_modele\` | Serveur IA : Ollama sur ton PC (\`http://127.0.0.1:11434\`) ou un serveur partagé. La clé API n'est pas ici : elle est demandée une fois par appareil. |
| \`source\` | \`true\` seulement sur les appareils de l'auteur de noteLab (pas de mise à jour depuis GitHub). |
`;

function assistantPremierLancement(app, tp, catalogue, C) {
    return new Promise((resolve) => {
        const m = new tp.obsidian.Modal(app);
        m.titleEl.setText("👋 Bienvenue dans noteLab");
        const c = m.contentEl;
        c.createEl("p", { text: "Choisis ce que tu veux utiliser. Tout se change plus tard dans Templates/Config/Réglages.md." });
        const coches = {};
        for (const [id, mod] of Object.entries(catalogue?.modules || {})) {
            if (mod.obligatoire) continue;
            const l = c.createEl("label", { cls: "setting-item" });
            l.style.cssText = "display:flex;gap:8px;align-items:flex-start;padding:6px 0";
            const cb = l.createEl("input", { type: "checkbox" }); cb.checked = id !== "ia";
            const t = l.createDiv(); t.createDiv({ text: mod.nom }); t.createDiv({ cls: "setting-item-description", text: mod.description || "" });
            coches[id] = cb;
        }
        c.createEl("h4", { text: "Tes dossiers de notes" });
        const ctx = {};
        const ligne = c.createDiv(); ligne.style.cssText = "display:flex;flex-wrap:wrap;gap:12px";
        for (const nom of ["IUT", "Fab Lab", "Alternance", "Perso"]) {
            const l = ligne.createEl("label"); const cb = l.createEl("input", { type: "checkbox" }); cb.checked = nom === "IUT" || nom === "Perso";
            l.appendText(" " + nom); ctx[nom] = cb;
        }
        c.createEl("h4", { text: "Pour l'IA (facultatif)" });
        const profil = c.createEl("input", { type: "text", attr: { placeholder: "Qui es-tu ? ex : Léa, étudiante en BUT GEII" } });
        profil.style.width = "100%";
        const url = c.createEl("input", { type: "text", value: "http://127.0.0.1:11434", attr: { placeholder: "Serveur IA (Ollama)" } });
        url.style.cssText = "width:100%;margin-top:6px";
        const b = c.createDiv({ cls: "modal-button-container" });
        let fini = false;
        b.createEl("button", { cls: "mod-cta", text: "✅ C'est parti" }).addEventListener("click", async () => {
            const mods = Object.keys(coches).filter(k => coches[k].checked);
            const ctxs = Object.keys(ctx).filter(k => ctx[k].checked);
            const y = (v) => JSON.stringify(v);
            const fm = ["---", "noteLab: réglages", "modules:", ...mods.map(x => `  - ${x}`), "ruban: false",
                `profil: ${y(profil.value.trim())}`, `semestre: ${C.semestre}`, "contextes:", ...ctxs.map(x => `  - ${x}`),
                'fablab: ""', 'alternance: ""', 'mots_alternance: ""', 'mots_fablab: ""',
                `ia_url: ${y(url.value.trim() || "http://127.0.0.1:11434")}`, `ia_modele: ${y(C.ocr.modele)}`, "---"].join("\n");
            await ecrireFichier(app.vault.adapter, C.REGLAGES, fm + "\n" + DOC_REGLAGES);
            fini = true; m.close();
            new tp.obsidian.Notice("✅ Réglages enregistrés. Redémarre Obsidian une fois : les modules choisis vont s'installer.", 15000);
            resolve(true);
        });
        m.onClose = () => { if (!fini) resolve(false); };
        m.open();
    });
}

// 📄 Nouvelle note : on choisit le contexte, la note est créée dans son dossier et le modèle
// de dossier Templater (cours / travail) pose ses questions (tapée ou manuscrite, matière…).
async function nouvelleNote(tp, C) {
    const app = tp.app;
    const ICONES = { "IUT": "🎓", "Fab Lab": "🛠️", "Alternance": "💼", "Perso": "🏠" };
    const actif = app.workspace.getActiveFile();
    const devine = actif ? C.contexteDe(actif.path, app.metadataCache.getFileCache(actif)?.frontmatter) : null;
    const ctxs = Object.keys(C.contextes).sort((a, b) => (b === devine) - (a === devine));
    const choix = await tp.system.suggester(
        [...ctxs.map(c => `${ICONES[c] || "📄"} ${c}`), "📄 Note libre (sans modèle)"], [...ctxs, ""], false, "Nouvelle note : pour quoi ?");
    if (choix === null || choix === undefined) return;
    const dossier = choix ? C.contextes[choix].dossier : "";
    if (dossier && !app.vault.getAbstractFileByPath(dossier)) await app.vault.createFolder(dossier);
    let chemin = `${dossier ? dossier + "/" : ""}Sans titre.md`, n = 1;
    while (app.vault.getAbstractFileByPath(chemin)) chemin = `${dossier ? dossier + "/" : ""}Sans titre ${++n}.md`;
    const f = await app.vault.create(chemin, "");
    await app.workspace.getLeaf(false).openFile(f);
}

module.exports = async (tp) => {
    const app = tp.app;
    const Notice = tp.obsidian.Notice;
    const C = tp.user.config();

    // tp.user est figé au démarrage. Sur mobile, LiveSync apporte souvent les scripts nouveaux ou modifiés
    // APRÈS ce démarrage : sans rechargement, une commande appellerait une ancienne version (ou un script absent).
    const rechargerScripts = async () => {
        try {
            const usf = app.plugins.plugins["templater-obsidian"]?.templater?.functions_generator?.user_functions?.user_script_functions;
            if (usf?.generate_user_script_functions) Object.assign(tp.user, Object.fromEntries(await usf.generate_user_script_functions()));
        } catch (e) { console.warn("Rechargement des scripts", e); }
    };
    const lancer = (fn) => async () => {
        await rechargerScripts();
        try { await fn(); }
        catch (e) { console.error(e); new Notice("✍️ Erreur : " + (e?.message || e)); }
    };

    const commandes = [
        { id: "nouvelle-note", module: "notes", name: "📄 Nouvelle note (cours, travail, perso)", icon: "file-plus",
          callback: lancer(() => nouvelleNote(tp, C)) },
        { id: "nouveau-manuscrit", module: "notes", name: "✍️ Nouveau manuscrit (schéma / page suivante)", icon: "pen-tool",
          callback: lancer(() => tp.user.nouveauManuscrit(tp)) },
        { id: "classer-manuscrit", module: "notes", name: "✍️ Classer un manuscrit orphelin", icon: "folder-input",
          callback: lancer(() => tp.user.classerManuscrit(tp)) },
        { id: "index-manuscrits", module: "notes", name: "✍️ Ouvrir l'index des manuscrits", icon: "list",
          callback: () => app.workspace.openLinkText("Index manuscrits", "", false) },
        { id: "exporter-png", module: "notes", name: "✍️ Exporter les PNG manquants (recherche OCR)", icon: "image",
          callback: lancer(() => exporterPNGManquants(app, Notice)) },
        { id: "nouvelle-tache", module: "taches", name: "➕ Nouvelle tâche", icon: "list-plus",
          hotkeys: [{ modifiers: ["Mod", "Shift"], key: "Enter" }],
          callback: lancer(() => tp.user.nouvelleTache(tp)) },
        { id: "agent-vrac", module: "ia", name: "🤖 Agent : vider ma tête (vrac → tâches)", icon: "bot",
          hotkeys: [{ modifiers: ["Mod", "Shift"], key: "J" }],
          callback: lancer(() => tp.user.agentTaches(tp)) },
        { id: "agent-note", module: "ia", name: "🤖 Agent : extraire les tâches de cette note", icon: "bot-message-square",
          callback: lancer(() => tp.user.agentTaches(tp, { note: true })) },
        { id: "ouvrir-taches", module: "taches", name: "✅ Ouvrir mes tâches", icon: "list-checks",
          callback: () => app.workspace.openLinkText("Tâches/Tâches", "", false) },
        { id: "publier-notelab", module: "source", name: "📤 Publier une mise à jour de noteLab (GitHub)", icon: "upload-cloud",
          callback: lancer(() => tp.user.publierNoteLab(tp)) },
        { id: "nouveau-projet", module: "taches", name: "📁 Nouveau projet", icon: "folder-plus",
          callback: lancer(() => tp.user.projets(tp).nouveau()) },
        { id: "ouvrir-projets", module: "taches", name: "📁 Ouvrir mes projets", icon: "folder-kanban",
          callback: () => app.workspace.openLinkText("Tâches/Projets", "", false) },
    ];
    const actif = (c) => c.module === "source" ? C.source && !tp.obsidian.Platform.isMobile
        : !c.module || C.modules.includes(c.module);
    for (const c of commandes) {
        const id = `${PREFIXE}:${c.id}`;
        app.commands.removeCommand?.(id);
        if (actif(c)) app.commands.addCommand({ ...c, id });
    }

    // Ruban : nos boutons une seule fois, même si le script est relancé.
    const templater = app.plugins.plugins["templater-obsidian"];
    [].concat(window.__notesCampusRuban || []).forEach(b => b?.remove?.());
    if (templater) {
        const bouton = (icone, nom, id) => { const c = commandes.find(c => c.id === id); return actif(c) ? templater.addRibbonIcon(icone, nom, c.callback) : null; };
        window.__notesCampusRuban = [
            bouton("file-plus", "📄 Nouvelle note", "nouvelle-note"),
            bouton("pen-tool", "✍️ Nouveau manuscrit", "nouveau-manuscrit"),
            bouton("list-plus", "➕ Nouvelle tâche", "nouvelle-tache"),
            bouton("bot", "🤖 Agent : vide ta tête", "agent-vrac"),
            bouton("list-checks", "✅ Mes tâches", "ouvrir-taches"),
        ].filter(Boolean);
    }

    if (C.ruban) {
        rangerRuban(app, tp.obsidian.Platform.isMobile);
        // Les modules chargés après ce script (ou installés à l'instant) ajoutent leurs boutons plus tard.
        setTimeout(() => rangerRuban(app, tp.obsidian.Platform.isMobile), 10000);
    }

    // ---------- noteLab : premier lancement, puis mise à jour (sauf appareils « source ») ----------
    const catalogue = await lireJSON(app, CATALOGUE, null);
    if (!app.vault.getAbstractFileByPath(C.REGLAGES) && !(await app.vault.adapter.exists(C.REGLAGES))) {
        await assistantPremierLancement(app, tp, catalogue, C);
        return;   // les modules choisis s'installent au prochain démarrage
    }
    if (!C.source) await mettreAJour(app, Notice, tp.obsidian.requestUrl, C);
    window.__noteLab = { mettreAJour: (racine) => mettreAJour(app, Notice, tp.obsidian.requestUrl, C, racine), assistant: () => assistantPremierLancement(app, tp, catalogue, C), empreinte };

    // ---------- Réglages ----------
    const changes = [];

    const pluginsCatalogue = modulesActifs(catalogue, C).flatMap(m => catalogue.modules[m].plugins || []);
    const installes = await installerModules(app, Notice, tp.obsidian.requestUrl, tp.obsidian.Platform.isMobile, pluginsCatalogue);
    if (installes.length) changes.push("modules installés : " + installes.join(", "));

    // Vues des tâches (Tâches/*.md) : écrites en Dataview JS, désactivé par défaut.
    const dv = app.plugins.plugins["dataview"];
    if (dv?.settings && !dv.settings.enableDataviewJs) {
        try {
            if (dv.updateSettings) await dv.updateSettings({ enableDataviewJs: true });
            else { dv.settings.enableDataviewJs = true; await dv.saveData(dv.settings); }
            changes.push("Dataview : JavaScript activé (vues des tâches)");
        } catch (e) { console.error("Dataview JS", e); }
    }
    const manquants = C.modules.includes("taches") ? ["dataview", "obsidian-tasks-plugin"].filter(id => !app.plugins.plugins[id]) : [];
    if (manquants.length) new Notice("✅ Tâches : installe et active " +
        manquants.map(id => id === "dataview" ? "Dataview" : "Tasks").join(" et ") + " sur cet appareil.", 15000);

    const ex = app.plugins.plugins["obsidian-excalidraw-plugin"];
    if (ex?.settings && C.modules.includes("notes")) {
        // PNG à côté de chaque dessin : indexé par Omnisearch (OCR) et léger à afficher sur mobile.
        // keepInSync : le PNG suit les renommages / suppressions du dessin.
        // Échelle 0.6 : le PNG ne sert qu'à la recherche (l'affichage utilise le dessin).
        // Testé avec qwen2.5vl : image ~1000 px → 5× plus rapide et lecture plus juste qu'en pleine taille.
        if (!ex.settings.autoexportPNG || !ex.settings.keepInSync || ex.settings.pngExportScale !== ECHELLE_PNG) {
            ex.settings.autoexportPNG = true;
            ex.settings.keepInSync = true;
            ex.settings.pngExportScale = ECHELLE_PNG;
            await ex.saveSettings();
            changes.push("Excalidraw : export PNG auto (échelle 0.6)");
        }
    }

    if (templater?.settings && C.modules.includes("notes")) {
        const s = templater.settings;
        // Modèle de dossier de chaque contexte : cours pour l'IUT, notes de travail ailleurs.
        const voulus = Object.fromEntries(Object.entries(C.contextes)
            .map(([nom, c]) => [c.dossier, nom === "IUT" ? "Templates/Template_cours.md" : "Templates/Template_projet.md"]));
        let modif = false;
        for (const [dossier, modele] of Object.entries(voulus)) {
            const ft = s.folder_templates.find(x => x.folder === dossier);
            if (!ft) { s.folder_templates.push({ folder: dossier, template: modele }); modif = true; }
            else if (ft.template !== modele) { ft.template = modele; modif = true; }
        }
        // Les dessins créés dans Manuscrits/ ne doivent jamais recevoir un modèle de note.
        s.ignore_folders_on_creation = s.ignore_folders_on_creation || [];
        for (const c of Object.values(C.contextes)) {
            if (!s.ignore_folders_on_creation.some(x => x.folder === c.manuscrits)) {
                s.ignore_folders_on_creation.push({ folder: c.manuscrits });
                modif = true;
            }
        }
        // L'ancien modèle à insérer est remplacé par la commande ✍️.
        const avant = s.enabled_templates_hotkeys.length;
        s.enabled_templates_hotkeys = s.enabled_templates_hotkeys.filter(h => h !== "Templates/Nouveau_manuscrit.md");
        if (s.enabled_templates_hotkeys.length !== avant) modif = true;
        if (modif) { await templater.save_settings(); changes.push("Templater : modèles de dossiers"); }
    }

    // ---------- Lecture des manuscrits (ordinateur seulement : ces plugins sont absents sur iPad) ----------
    if (!C.modules.includes("ia")) { if (changes.length) new Notice("⚙️ Réglages mis à jour : " + changes.join(", "), 8000); return; }
    const o = C.ocr;
    const secours = (await ollamaRepond(tp.obsidian.requestUrl, o.secoursLocal)) ? o.secoursLocal : "";
    let cleManquante = false;

    if (await ajusterPlugin(app, "ai-image-analyzer", (d) => {
        const modele = { name: `${o.modele} (OCR)`, model: o.modele, imageReady: true, provider: "ollama" };
        // Le plugin fusionne ses défauts de façon superficielle : aiAdapterSettings doit être complet.
        const a = d.aiAdapterSettings = d.aiAdapterSettings || {};
        a.provider = "ollama";
        a.selectedModel = a.selectedModel || { name: "llama3.2 (3B)", model: "llama3.2", imageReady: false, provider: "ollama" };
        a.selectedImageModel = modele;
        a.ollamaSettings = { lastModel: a.selectedModel, token: "", ...(a.ollamaSettings || {}),
            lastImageModel: modele, url: o.url, fallbackUrl: secours };
        a.geminiSettings = a.geminiSettings || { lastModel: modele, lastImageModel: modele, apiKey: "" };
        d.prompt = o.prompt;
        d.autoClearCache = false;
        cleManquante = !a.ollamaSettings.token;
    })) changes.push("AI Image Analyzer : Framework + prompt");
    else {
        const d = await app.plugins.plugins["ai-image-analyzer"]?.loadData();
        cleManquante = !!app.plugins.plugins["ai-image-analyzer"] && !d?.aiAdapterSettings?.ollamaSettings?.token;
    }

    if (await ajusterPlugin(app, "omnisearch", (d) => {
        d.imagesIndexing = true;
        d.aiImageIndexing = true;
    })) changes.push("Omnisearch : indexation des images");

    if (await ajusterPlugin(app, "text-extractor", (d) => {
        const l = Array.isArray(d.ocrLanguages) ? d.ocrLanguages : ["eng"];
        if (!l.includes("fra")) l.unshift("fra");
        d.ocrLanguages = l;
    })) changes.push("Text Extractor : OCR français");

    if (app.plugins.plugins["ai-image-analyzer"]) await surveillerCacheOCR(app, templater);

    if (changes.length) new Notice("⚙️ Réglages mis à jour : " + changes.join(", "), 8000);
    if (/\/\/(127\.0\.0\.1|localhost)[:/]/.test(o.url)) cleManquante = false;   // Ollama local : pas de clé
    if (cleManquante) {
        new Notice("🔑 Lecture des manuscrits : colle la clé API de ce PC dans " +
            "Réglages → AI image analyzer → Ollama token.", 20000);
    }
};

// Plugins dont les réglages vivent dans leur module (pas d'objet `settings` accessible) :
// on réécrit leur data.json via leur propre API, puis on les recharge pour qu'ils le relisent.
// Ne fait rien si rien ne change (pas de rechargement à chaque démarrage).
async function ajusterPlugin(app, id, ajuster) {
    const p = app.plugins.plugins[id];
    if (!p) return false;                       // absent ou désactivé sur cet appareil
    const data = (await p.loadData()) || {};
    const avant = JSON.stringify(data);
    ajuster(data);
    if (JSON.stringify(data) === avant) return false;
    await p.saveData(data);
    await app.plugins.disablePlugin(id);
    await app.plugins.enablePlugin(id);
    return true;
}

// Ruban de gauche : boutons jamais utilisés. Liste noire (et non liste blanche) pour qu'un
// nouveau plugin reste visible. Pour en réafficher un : le retirer d'ici (un clic droit sur le
// ruban ne suffit pas, ce script le remasquerait au démarrage suivant).
// Ruban : le même sur tous les appareils (celui du Mac), dans cet ordre ; tout le reste est masqué.
// Liste blanche plutôt que noire : les boutons des modules de base ont un id traduit
// (« graph:Ouvrir la vue graphique » en français, « graph:Open graph view » en anglais…)
// et chaque nouveau module ajoute les siens. « xxx: » = tous les boutons du module xxx.
const RUBAN = [
    "obsidian-excalidraw-plugin:New drawing",
    "omnisearch:",
    "realclaudian:",
    "obsidian-livesync:Replicate",
    "templater-obsidian:📄 Nouvelle note",       // remplace le bouton Templater (il listait aussi les scripts)
    "templater-obsidian:✍️ Nouveau manuscrit",
    "templater-obsidian:➕ Nouvelle tâche",
    "templater-obsidian:🤖 Agent : vide ta tête",
    "templater-obsidian:✅ Mes tâches",
];
// Palette de commandes : Cmd+P sur ordinateur, mais pas de raccourci sur iPad.
const RUBAN_MOBILE = [...RUBAN, "command-palette:"];

function rangerRuban(app, mobile) {
    const r = app.workspace.leftRibbon;
    if (!r?.items || !r.load) return;
    const liste = mobile ? RUBAN_MOBILE : RUBAN;
    const rang = (id) => liste.findIndex(x => x.endsWith(":") ? id.startsWith(x) : id === x);
    const ids = r.items.map(i => i.id);
    // L'ordre des clés de hiddenItems = l'ordre d'affichage.
    const voulu = {};
    for (const id of ids.filter(id => rang(id) >= 0).sort((a, b) => rang(a) - rang(b))) voulu[id] = false;
    for (const id of ids) if (!(id in voulu)) voulu[id] = true;
    const actuel = r.serialize?.()?.hiddenItems || {};
    const pareil = JSON.stringify(Object.entries(actuel).filter(([k]) => k in voulu)) === JSON.stringify(Object.entries(voulu));
    if (pareil) return;
    r.load({ hiddenItems: voulu });
    r.onChange(true);
}

// AI Image Analyzer met ses lectures en cache par CHEMIN d'image (md5), sans regarder si
// l'image a changé : une page manuscrite complétée garderait son ancienne lecture.
// On supprime donc l'entrée dès que l'image change (au démarrage pour les changements faits
// pendant qu'Obsidian était fermé, puis en direct), et on redemande l'indexation à Omnisearch.
async function surveillerCacheOCR(app, templater) {
    const crypto = require("crypto");
    const a = app.vault.adapter;
    const dossier = `${app.vault.configDir}/plugins/ai-image-analyzer/cache`;
    const entree = (chemin) => `${dossier}/${crypto.createHash("md5").update(chemin).digest("hex")}.json`;
    const estImage = (f) => /^(png|jpe?g|webp)$/i.test(f?.extension || "");

    if (await a.exists(dossier)) {
        for (const c of (await a.list(dossier)).files) {
            try {
                const { path } = JSON.parse(await a.read(c));
                const img = app.vault.getAbstractFileByPath(path);
                const st = await a.stat(c);
                if (!img) await a.remove(c);                         // image supprimée
                else if (img.stat.mtime > st.mtime + 60000) {        // image modifiée depuis la lecture
                    await a.remove(c);
                    app.vault.trigger("modify", img);                // Omnisearch la relit
                }
            } catch (e) { console.error("Cache OCR", c, e); }
        }
    }

    window.__notesCampusOCR?.forEach(r => app.vault.offref(r));      // script relancé : pas de doublon
    const oublier = async (chemin) => { try { if (await a.exists(entree(chemin))) await a.remove(entree(chemin)); } catch (e) {} };
    window.__notesCampusOCR = [
        app.vault.on("modify", (f) => estImage(f) && oublier(f.path)),
        app.vault.on("delete", (f) => estImage(f) && oublier(f.path)),
        app.vault.on("rename", (f, ancien) => estImage(f) && oublier(ancien)),
    ];
    window.__notesCampusOCR.forEach(r => templater.registerEvent(r));
}

// Secours local seulement si ce PC fait tourner Ollama : sinon le plugin afficherait
// des erreurs de connexion en plus de celle du Framework.
async function ollamaRepond(requestUrl, url) {
    try { return (await requestUrl({ url: url + "/api/version", throw: false })).status === 200; }
    catch (e) { return false; }
}
