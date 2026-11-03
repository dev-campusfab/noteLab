// Construit une release noteLab (lancé par GitHub Actions, ou à la main : node outils/construire.mjs).
//   dist/manifest.json : version, tag, nouveautés, catalogue, fichiers + empreintes (lu par les vaults au démarrage)
//   dist/noteLab.zip   : vault de départ (fichiers noteLab + Templater préinstallé)
//   dist/notes.md      : texte de la release
// Vérifie aussi qu'aucune donnée perso n'est publiée et que le tag correspond à la version.
// Sans dépendance (Node 20+).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const VAULT = path.join(RACINE, "vault");
const DIST = path.join(RACINE, "dist");
const CATALOGUE = "Templates/Config/noteLab.json";
const INTERDITS = [/campusfab\.net/i, /Bearer\s+[A-Za-z0-9]{12,}/, /BatConnect/i, /\b[0-9a-f]{40,}\b/];
const sansZip = process.argv.includes("--sans-zip");

// Même empreinte que Templates/Scripts/demarrage.js.
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

const echec = (msg) => { console.error("❌ " + msg); process.exit(1); };
const tous = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? tous(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = (p) => path.relative(VAULT, p).split(path.sep).join("/").normalize("NFC");

// 1. Catalogue et fichiers.
const catalogue = JSON.parse(fs.readFileSync(path.join(VAULT, CATALOGUE), "utf8"));
const version = catalogue.version;
const tag = process.env.TAG || `v${version}`;
if (tag !== `v${version}`) echec(`le tag ${tag} ne correspond pas à la version du catalogue (v${version})`);

const fichiers = [];
for (const [module, m] of Object.entries(catalogue.modules)) {
    for (const chemin of m.fichiers) {
        const p = path.join(VAULT, chemin);
        if (!fs.existsSync(p)) echec(`${chemin} (module ${module}) est dans le catalogue mais absent de vault/`);
        fichiers.push({ chemin, module, hash: empreinte(fs.readFileSync(p, "utf8")) });
    }
}
const listes = new Set(fichiers.map(f => f.chemin));
const orphelins = tous(VAULT).map(rel).filter(c => !listes.has(c));
if (orphelins.length) echec("fichiers de vault/ absents du catalogue : " + orphelins.join(", "));

// 2. Aucune donnée perso.
const fuites = [];
for (const p of [...tous(VAULT), ...tous(path.join(RACINE, "outils"))]) {
    if (!/\.(md|js|mjs|json|css)$/.test(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    for (const r of INTERDITS) if (r.test(txt) && !p.endsWith("construire.mjs")) fuites.push(`${path.relative(RACINE, p)} (${r.source})`);
}
if (fuites.length) echec("données perso trouvées : " + fuites.join(", "));

// 3. Nouveautés de cette version (CHANGELOG.md).
let notes = "";
const journal = path.join(RACINE, "CHANGELOG.md");
if (fs.existsSync(journal)) {
    const m = fs.readFileSync(journal, "utf8").match(new RegExp(`## v${version.replace(/\./g, "\\.")}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
    notes = m ? m[1].trim() : "";
}

// 4. Manifeste.
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const manifest = { nom: catalogue.nom, depot: catalogue.depot, version, tag, date: new Date().toISOString(), notes, catalogue, fichiers };
fs.writeFileSync(path.join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(DIST, "notes.md"), (notes || `noteLab v${version}`) +
    "\n\n**Déjà installé ?** Rien à faire : la mise à jour arrive au prochain démarrage d'Obsidian.\n" +
    "**Nouveau ?** Télécharge `noteLab.zip`, dézippe-le, ouvre le dossier comme coffre dans Obsidian et lis `Lis-moi.md`.\n");
console.log(`✅ manifest v${version} : ${fichiers.length} fichiers`);

// 5. Vault de départ : fichiers + Templater préinstallé (il lance le reste au 1er démarrage).
if (!sansZip) {
    const kit = path.join(DIST, "noteLab");
    fs.cpSync(VAULT, kit, { recursive: true });
    fs.copyFileSync(path.join(RACINE, "outils", "Lis-moi.md"), path.join(kit, "Lis-moi.md"));
    fs.mkdirSync(path.join(kit, "Tâches"), { recursive: true });
    fs.writeFileSync(path.join(kit, "Tâches", "Boîte de réception.md"),
        "# 📥 Boîte de réception\n\nTâches ajoutées avec ➕. Elles apparaissent dans [[Tâches]], le kanban et le calendrier.\n\n");
    fs.writeFileSync(path.join(kit, "Templates/Config/noteLab-installe.json"),
        JSON.stringify({ version, date: manifest.date, fichiers: Object.fromEntries(fichiers.map(f => [f.chemin, f.hash])) }, null, 2) + "\n");
    const tpl = path.join(kit, ".obsidian", "plugins", "templater-obsidian");
    fs.mkdirSync(tpl, { recursive: true });
    for (const f of ["main.js", "manifest.json", "styles.css"]) {
        const r = await fetch(`https://github.com/silentvoid13/Templater/releases/latest/download/${f}`);
        if (!r.ok) { if (f === "styles.css") continue; echec(`Templater ${f} : HTTP ${r.status}`); }
        fs.writeFileSync(path.join(tpl, f), Buffer.from(await r.arrayBuffer()));
    }
    fs.copyFileSync(path.join(RACINE, "outils", "templater-data.json"), path.join(tpl, "data.json"));
    fs.writeFileSync(path.join(kit, ".obsidian", "community-plugins.json"), JSON.stringify(["templater-obsidian"], null, 2));
    execFileSync("zip", ["-r", "-q", "-X", "noteLab.zip", "noteLab"], { cwd: DIST });
    fs.rmSync(kit, { recursive: true, force: true });
    console.log("✅ dist/noteLab.zip");
}
