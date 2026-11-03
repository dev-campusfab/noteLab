// Barre de recherche combinée : choisir une valeur existante OU en créer une nouvelle.
// Retourne la valeur choisie (string) ou null si l'utilisateur annule (Échap).
// Version 3 — si tu modifies ce fichier, recharge Templater (les scripts sont mis en cache).

const CREATE_PREFIX = "➕ Créer : ";

module.exports = async (tp, items, placeholder) => {
    const SuggestModal = tp.obsidian.SuggestModal;
    const liste = (items || []).filter(function (i) {
        return typeof i === "string" && i.length > 0;
    });

    return new Promise(function (resolve) {
        class ComboSuggestModal extends SuggestModal {
            constructor() {
                super(tp.app);
                this.items = liste;
                this.query = "";
                this.settled = false;
                this.limit = 200;
                this.setPlaceholder(placeholder || "Chercher ou créer…");
                this.setInstructions([
                    { command: "↑↓", purpose: "naviguer" },
                    { command: "↵", purpose: "valider" },
                    { command: "maj ↵", purpose: "créer la saisie" },
                    { command: "échap", purpose: "annuler" },
                ]);
                // Maj+Entrée : créer directement ce qui est tapé, sans chercher la ligne « Créer ».
                this.scope.register(["Shift"], "Enter", () => {
                    const q = (this.query || "").trim();
                    if (q.length > 0) {
                        this.settle(q);
                        this.close();
                    }
                    return false;
                });
            }

            // Résout une seule fois, quel que soit le chemin de sortie.
            settle(value) {
                if (this.settled) return;
                this.settled = true;
                resolve(value);
            }

            getSuggestions(query) {
                this.query = query || "";
                const q = this.query.trim();
                const ql = q.toLowerCase();
                const filtered = this.items.filter(function (i) {
                    return i.toLowerCase().includes(ql);
                });
                const exists = this.items.some(function (i) {
                    return i.toLowerCase() === ql;
                });
                // La ligne « Créer » va APRÈS les correspondances : taper "mat" doit
                // proposer "Maths" en premier, pas créer une valeur "mat" par erreur.
                if (q.length > 0 && !exists) filtered.push(CREATE_PREFIX + q);
                return filtered;
            }

            renderSuggestion(value, el) {
                el.createEl("div", { text: value });
            }

            // Obsidian appelle close() AVANT onChooseSuggestion() dans selectSuggestion() :
            // résoudre depuis onClose renvoyait donc toujours null. On résout ici.
            selectSuggestion(value, evt) {
                // value peut ne pas être une chaîne selon le chemin d'appel d'Obsidian :
                // on retombe alors sur la saisie brute.
                let choix = typeof value === "string" ? value : (this.query || "");
                if (choix.startsWith(CREATE_PREFIX)) choix = choix.slice(CREATE_PREFIX.length);
                choix = choix.trim();
                this.settle(choix.length > 0 ? choix : null);
                this.close();
            }

            onChooseSuggestion() {
                // requis par l'API, tout est géré dans selectSuggestion()
            }

            onClose() {
                super.onClose();
                this.settle(null); // annulation (Échap / clic hors modale)
            }
        }

        new ComboSuggestModal().open();
    });
};
