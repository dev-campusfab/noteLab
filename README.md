# noteLab

Système Obsidian pour étudiants et makers : **tâches et projets** (liste, kanban, calendrier,
chrono, historique), **notes et manuscrits** (modèles de cours / réunions, pages manuscrites
iPad avec Excalidraw) et **IA** (agent « vide ta tête », lecture des manuscrits via Ollama).

## Installer
Télécharge `noteLab.zip` dans la [dernière release](../../releases/latest), dézippe-le,
ouvre le dossier comme coffre dans Obsidian et suis `Lis-moi.md`.

Les mises à jour sont ensuite **automatiques** au démarrage d'Obsidian (fichiers noteLab
seulement ; notes, tâches et réglages jamais touchés).

## Organisation du dépôt
| Chemin | Rôle |
|---|---|
| `vault/` | Fichiers noteLab, aux mêmes chemins que dans un vault. **Généré** par la commande « 📤 Publier » depuis le vault de l'auteur : ne pas modifier ici. |
| `vault/Templates/Config/noteLab.json` | Catalogue : modules (cœur, tâches, notes, IA), leurs fichiers et leurs plugins, version. |
| `outils/construire.mjs` | Construit la release : `manifest.json` (empreintes des fichiers), `noteLab.zip` (vault de départ avec Templater), contrôle anti-fuite. |
| `.github/workflows/` | `verifier.yml` à chaque push, `release.yml` à chaque tag `v*`. |
| `CHANGELOG.md` | Nouveautés, affichées chez les utilisateurs après une mise à jour. |

## Publier une version
Dans le vault de l'auteur : commande **📤 Publier une mise à jour de noteLab**. Elle copie
les fichiers du catalogue dans `vault/`, vérifie l'absence de données perso, demande le type
de version et les nouveautés, puis commit + tag + push. GitHub Actions publie la release.
