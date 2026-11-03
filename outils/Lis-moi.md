# 👋 Bienvenue dans noteLab

Un vault Obsidian prêt à l'emploi : tâches (liste, kanban, calendrier, projets, chrono),
notes de cours et de travail avec modèles, manuscrits sur iPad, et un agent IA qui
transforme ton vrac en tâches.

## Installation (5 minutes)
1. Dézippe ce dossier où tu veux.
2. Obsidian → « Ouvrir un dossier comme coffre » → ce dossier.
3. Quand Obsidian le demande : **Faire confiance à l'auteur et activer les modules**.
4. Une fenêtre **👋 Bienvenue** s'ouvre : choisis ce que tu veux utiliser (tâches, notes, IA).
5. **Redémarre Obsidian** : les modules choisis s'installent tout seuls.

Sur un autre appareil (iPad, téléphone) : mets le même dossier dessus (synchro de ton choix)
et ouvre-le, l'installation se fait toute seule aussi.

## Mises à jour
Automatiques : à chaque démarrage, noteLab regarde s'il existe une nouvelle version et
met à jour ses fichiers. **Tes notes, tes tâches et tes réglages ne sont jamais touchés.**
Si tu as modifié un fichier de noteLab, ta version est gardée et la nouvelle est posée à côté (`.nouveau`).

## Tes réglages
`Templates/Config/Réglages.md` : modules actifs, dossiers de notes, profil et serveur pour l'IA.

## 🤖 L'IA (facultatif)
L'agent de tâches et la lecture des manuscrits utilisent **Ollama** (gratuit, en local) :
installe https://ollama.com puis `ollama pull qwen2.5vl:7b`. Ou demande l'adresse et une clé
d'un serveur partagé, à mettre dans tes réglages (`ia_url`) ; la clé est demandée une seule fois.

## Raccourcis
- ➕ Nouvelle tâche : `Cmd/Ctrl + Maj + Entrée` · 🤖 Vrac → tâches : `Cmd/Ctrl + Maj + J`
- 📄 Nouvelle note, ✍️ Nouveau manuscrit, ✅ Mes tâches : boutons de la barre de gauche
