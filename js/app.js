// =====================================================================
// Application principale (Vue 3)
// =====================================================================

const CATEGORY_ICONS = {
  Fromages: '🧀',
  Yaourts: '🥛',
  Céréales: '🥣',
  Boissons: '🥤',
  'Snacks salés': '🥨',
  'Snacks sucrés': '🍫',
  Fruits: '🍎',
  Légumes: '🥦',
  Viandes: '🥩',
  Poissons: '🐟',
  Épicerie: '🛒',
  Autres: '📦',
};

const { createApp, markRaw } = Vue;

// Longueur du code PIN. Doit rester cohérente avec le "Minimum password
// length" configuré dans Supabase > Authentication > Sign In / Providers
// > Email (6 chiffres = valeur par défaut de Supabase, aucun réglage à
// changer côté Supabase).
const PIN_LENGTH = 6;

// Applique l'état du mode confort visuel dès le chargement du script
// (avant même le montage de Vue), rôle inconnu à ce stade : la valeur
// par défaut par rôle sera ré-appliquée dans mounted() une fois la
// session vérifiée.
a11y.init(null);

createApp({
  data() {
    return {
      view: 'loading', // loading | role-select | pin | categories | category-detail | shopping-list
      role: null,
      pendingRole: null,
      pinInput: '',
      pinError: '',
      pinLength: PIN_LENGTH,

      categories: [],
      loadingCategories: false,

      currentCategory: null,
      allPhotos: [], // photos de la catégorie actuellement ouverte
      loadingPhotos: false,

      openCommentsFor: null,
      newCommentDrafts: {},

      errorMessage: '',
      successMessage: '',

      showAddPhotoModal: false,
      addPhotoCategoryId: null,
      addPhotoFile: null,
      addPhotoPreviewUrl: '',
      addPhotoProductName: '',
      uploading: false,

      showManageCategories: false,
      categoryEdits: {},
      newCategoryName: '',

      lightboxPhoto: null,

      rankedSortable: null,
      unrankedSortable: null,

      // Liste de courses
      shoppingList: null,
      shoppingListItems: [],
      loadingShoppingList: false,
      selectionMode: false, // true : un tap sur une photo l'ajoute à la liste au lieu d'ouvrir la visionneuse
      showAddTextItemModal: false,
      addTextItemCategoryId: null,
      addTextItemLabel: '',

      // Mode confort visuel : miroir réactif de l'attribut data-a11y
      // (posé par js/a11y.js sur <html>), pour piloter les v-if des
      // variantes d'écran. a11yActiveTab pilote l'onglet visible du
      // détail de catégorie en mode confort (les deux listes ne sont
      // jamais affichées en même temps, contrairement au mode standard).
      a11yOn: a11y.isOn(),
      a11yActiveTab: 'ranked', // 'ranked' | 'unranked'
      a11yTheme: a11y.getTheme(),
      a11yTextSize: a11y.getTextSize(),
      a11yVibrate: a11y.vibrateEnabled(),
      a11ySound: a11y.soundEnabled(),

      // Remplace window.confirm() : dialogue role="alertdialog" avec
      // focus trap, utilisé par toutes les actions destructives/
      // irréversibles de l'app (voir openConfirmSheet).
      confirmSheet: {
        open: false,
        title: '',
        message: '',
        confirmLabel: '',
        onConfirm: null,
      },
      confirmSheetTriggerEl: null,
    };
  },

  computed: {
    rankedPhotos() {
      return this.allPhotos
        .filter((p) => p.priority_rank !== null)
        .slice()
        .sort((a, b) => a.priority_rank - b.priority_rank);
    },
    unrankedPhotos() {
      return this.allPhotos
        .filter((p) => p.priority_rank === null)
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    },
    canSubmitPhoto() {
      return !!this.addPhotoFile && !!this.addPhotoCategoryId && this.addPhotoProductName.trim().length > 0;
    },
    shoppingListPendingCount() {
      return this.shoppingListItems.filter((item) => !item.taken).length;
    },
  },

  watch: {
    // Focus trap minimal du ConfirmSheet : à l'ouverture, on mémorise
    // l'élément qui avait le focus (pour l'y ramener à la fermeture) et
    // on déplace le focus sur "Annuler" (choix par défaut le plus sûr
    // pour une action destructive, au cas où une touche Entrée
    // parasite arriverait juste après l'ouverture).
    'confirmSheet.open'(isOpen) {
      if (isOpen) {
        this.confirmSheetTriggerEl = document.activeElement;
        this.$nextTick(() => {
          const cancelBtn = document.getElementById('confirm-sheet-cancel');
          if (cancelBtn) cancelBtn.focus();
        });
      } else if (this.confirmSheetTriggerEl) {
        this.confirmSheetTriggerEl.focus();
        this.confirmSheetTriggerEl = null;
      }
    },
  },

  async mounted() {
    // Synchronise le drapeau réactif a11yOn si le mode confort change
    // dans un autre onglet (js/a11y.js met déjà à jour l'attribut DOM ;
    // ici on met à jour l'état Vue qui pilote les v-if des templates).
    window.addEventListener('storage', (event) => {
      if (event.key === 'a11yMode') {
        this.a11yOn = a11y.isOn();
      } else if (event.key === 'a11yTheme') {
        this.a11yTheme = a11y.getTheme();
      } else if (event.key === 'a11yTextSize') {
        this.a11yTextSize = a11y.getTextSize();
      } else if (event.key === 'a11yVibrate') {
        this.a11yVibrate = a11y.vibrateEnabled();
      } else if (event.key === 'a11ySound') {
        this.a11ySound = a11y.soundEnabled();
      }
    });

    try {
      const currentRole = await getCurrentRole();
      if (currentRole) {
        this.role = currentRole;
        a11y.init(this.role);
        this.a11yOn = a11y.isOn();
        await this.enterApp();
      } else {
        this.view = 'role-select';
      }
    } catch (err) {
      this.view = 'role-select';
    }
  },

  methods: {
    // ---------------------------------------------------------------
    // Utilitaires d'affichage
    // ---------------------------------------------------------------
    categoryIcon(name) {
      return CATEGORY_ICONS[name] || '🛒';
    },
    photoUrl(photo) {
      return api.getPublicUrl(photo.image_path);
    },
    // Le clic sur une vignette a un effet différent selon le contexte
    // (agrandir vs ajouter à la liste en mode sélection) : le libellé
    // accessible doit refléter l'action réellement déclenchée par
    // onPhotoThumbClick, pas toujours "voir la photo".
    photoThumbLabel(photo) {
      return this.selectionMode && this.role === 'consommateur'
        ? `Ajouter ${photo.product_name} à la liste`
        : `Voir la photo de ${photo.product_name} en grand`;
    },
    showError(err) {
      console.error(err);
      this.errorMessage =
        err && err.message
          ? this.translateError(err.message)
          : "Une erreur inattendue est survenue.";
      this.successMessage = '';
      announce(this.errorMessage);
      setTimeout(() => {
        this.errorMessage = '';
      }, 5000);
    },
    showSuccess(text) {
      this.successMessage = text;
      this.errorMessage = '';
      announce(text);
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    },
    translateError(message) {
      if (message.includes('Invalid login credentials')) {
        return 'Code incorrect. Réessaie.';
      }
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return 'Connexion impossible. Vérifie ta connexion internet et réessaie.';
      }
      return message;
    },

    // ---------------------------------------------------------------
    // ConfirmSheet (remplace window.confirm())
    // ---------------------------------------------------------------
    openConfirmSheet({ title, message, confirmLabel, onConfirm }) {
      this.confirmSheet = { open: true, title, message, confirmLabel, onConfirm };
    },
    closeConfirmSheet() {
      this.confirmSheet.open = false;
    },
    async confirmSheetConfirm() {
      const action = this.confirmSheet.onConfirm;
      this.closeConfirmSheet();
      if (action) await action();
    },
    // Piège le focus entre les deux seuls éléments focusables du
    // dialogue (Annuler / CTA destructif) et ferme sur Échap — un
    // alertdialog modal ne doit jamais laisser Tab s'échapper vers le
    // reste de la page pendant qu'il est ouvert.
    onConfirmSheetKeydown(event) {
      if (event.key === 'Escape') {
        this.closeConfirmSheet();
        return;
      }
      if (event.key !== 'Tab') return;
      // Ordre DOM : confirm-sheet-confirm (premier) puis confirm-sheet-cancel
      // (dernier). On ne piège que les deux cas de "sortie" du dialogue :
      // Maj+Tab depuis le premier boucle vers le dernier, Tab depuis le
      // dernier boucle vers le premier. Les autres cas (Tab entre les deux
      // dans l'ordre naturel) sont déjà gérés par le comportement natif.
      const confirmBtn = document.getElementById('confirm-sheet-confirm');
      const cancelBtn = document.getElementById('confirm-sheet-cancel');
      if (!confirmBtn || !cancelBtn) return;
      if (event.shiftKey && document.activeElement === confirmBtn) {
        event.preventDefault();
        cancelBtn.focus();
      } else if (!event.shiftKey && document.activeElement === cancelBtn) {
        event.preventDefault();
        confirmBtn.focus();
      }
    },

    // ---------------------------------------------------------------
    // Connexion / rôle / PIN
    // ---------------------------------------------------------------
    chooseRole(role) {
      this.pendingRole = role;
      this.pinInput = '';
      this.pinError = '';
      this.view = 'pin';
    },
    // Entrée rapide "mode confort" depuis l'écran de choix de rôle :
    // force le mode ON (même si l'utilisateur l'avait désactivé lors
    // d'une session précédente), puis enchaîne sur le PIN consommateur.
    chooseRoleWithComfort() {
      a11y.setMode('on');
      this.a11yOn = true;
      this.chooseRole('consommateur');
    },
    backToRoleSelect() {
      this.pendingRole = null;
      this.pinInput = '';
      this.pinError = '';
      this.view = 'role-select';
    },
    pressPinKey(digit) {
      if (this.pinInput.length >= PIN_LENGTH) return;
      this.pinInput += digit;
      this.pinError = '';
      if (this.pinInput.length === PIN_LENGTH) {
        this.submitPin();
      }
    },
    pressPinBackspace() {
      this.pinInput = this.pinInput.slice(0, -1);
    },
    async submitPin() {
      const pin = this.pinInput;
      const role = this.pendingRole;
      try {
        await loginWithPin(role, pin);
        this.role = role;
        a11y.init(this.role);
        this.a11yOn = a11y.isOn();
        announce('Code correct, connexion réussie.');
        await this.enterApp();
      } catch (err) {
        this.pinError = this.translateError(err.message || '');
        this.pinInput = '';
        // Pas de vibration ici : évite de faire vibrer l'appareil à
        // chaque chiffre du prochain essai si l'utilisateur retape vite.
        announce(this.pinError, { vibrate: false });
      }
    },
    async doLogout() {
      await logout();
      this.role = null;
      this.pendingRole = null;
      this.pinInput = '';
      this.categories = [];
      this.currentCategory = null;
      this.allPhotos = [];
      this.destroySortables();
      this.shoppingList = null;
      this.shoppingListItems = [];
      this.selectionMode = false;
      this.view = 'role-select';
      a11y.init(null);
      this.a11yOn = a11y.isOn();
    },

    // ---------------------------------------------------------------
    // Navigation principale
    // ---------------------------------------------------------------
    async enterApp() {
      this.view = 'categories';
      await this.loadCategories();
    },
    async loadCategories() {
      this.loadingCategories = true;
      try {
        this.categories = await api.fetchCategories();
        this.categoryEdits = {};
        this.categories.forEach((c) => {
          this.categoryEdits[c.id] = c.name;
        });
      } catch (err) {
        this.showError(err);
      } finally {
        this.loadingCategories = false;
      }
    },
    async openCategory(category) {
      this.currentCategory = category;
      this.view = 'category-detail';
      this.openCommentsFor = null;
      this.a11yActiveTab = 'ranked';
      await this.loadPhotos();
    },
    // Changement d'onglet en mode confort (Classement / À évaluer) : les
    // deux listes ne sont jamais dans le DOM en même temps (v-if), donc
    // SortableJS doit être détruit puis ré-initialisé sur le nouvel
    // onglet visible.
    setA11yTab(tab) {
      if (this.a11yActiveTab === tab) return;
      this.a11yActiveTab = tab;
      this.destroySortables();
      this.$nextTick(() => this.initSortables());
    },
    goToCategories() {
      this.destroySortables();
      this.currentCategory = null;
      this.allPhotos = [];
      this.view = 'categories';
    },
    async loadPhotos() {
      this.loadingPhotos = true;
      this.destroySortables();
      try {
        const rows = await api.fetchPhotosByCategory(this.currentCategory.id);
        // Les commentaires les plus anciens en premier.
        rows.forEach((p) => {
          p.comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
        this.allPhotos = rows;
      } catch (err) {
        this.showError(err);
      } finally {
        this.loadingPhotos = false;
        await this.$nextTick();
        this.initSortables();
      }
    },

    // ---------------------------------------------------------------
    // Glisser-déposer du classement (consommateur uniquement)
    // ---------------------------------------------------------------
    initSortables() {
      if (this.role !== 'consommateur') return;
      if (this.view !== 'category-detail') return;

      if (this.a11yOn) {
        // Mode confort : Classement et À évaluer sont des onglets, jamais
        // affichés simultanément (v-if) — impossible de glisser une photo
        // de l'un vers l'autre. Seul le classement reste réordonnable par
        // glisser-déposer (liste unique) ; passer une photo de "À évaluer"
        // au classement se fait via le bouton "Classer cette photo"
        // (rankPhotoFromUnranked), pas par glisser-déposer.
        if (this.a11yActiveTab !== 'ranked') return;
        const rankedEl = this.$refs.rankedList;
        if (!rankedEl) return;
        this.rankedSortable = markRaw(
          Sortable.create(rankedEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            filter: '.delete-photo-btn',
            preventOnFilter: false,
            // Sans ce délai, le premier contact tactile sur une carte
            // démarre systématiquement un glisser-déposer et empêche de
            // faire défiler la page en posant le doigt dessus. Un léger
            // temps de presser-maintenir (tactile uniquement, la souris
            // n'est pas concernée) laisse un simple geste de défilement
            // s'exécuter normalement.
            delay: 150,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            onEnd: () => this.syncPhotoOrderFromDom(),
          })
        );
        return;
      }

      const rankedEl = this.$refs.rankedList;
      const unrankedEl = this.$refs.unrankedList;
      if (!rankedEl || !unrankedEl) return;

      // Les deux listes partagent le même "group" pour autoriser le
      // passage d'une photo de "À évaluer" vers "Classement". La liste
      // "À évaluer" a `put: false` : on ne peut rien y déposer, on peut
      // seulement en faire sortir des éléments.
      // markRaw() évite que Vue transforme l'instance SortableJS (et les
      // éléments DOM qu'elle référence en interne) en objet réactif,
      // ce qui serait inutile et risquerait de provoquer des effets de
      // bord avec la bibliothèque.
      this.rankedSortable = markRaw(
        Sortable.create(rankedEl, {
          group: { name: 'photos', pull: true, put: true },
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          // Empêche le bouton de suppression de déclencher un
          // glisser-déposer. `preventOnFilter: false` est indispensable :
          // à `true` (valeur par défaut), SortableJS appelle
          // preventDefault() sur le touchstart/mousedown de l'élément
          // filtré, ce qui annule aussi l'événement "click" généré
          // ensuite par le navigateur (surtout sur tactile) — le bouton
          // semblait alors ne "rien faire" au clic.
          filter: '.delete-photo-btn',
          preventOnFilter: false,
          // Voir le commentaire équivalent dans la branche mode confort
          // ci-dessus : sans délai tactile, poser le doigt sur une carte
          // pour faire défiler la page démarrait un glisser-déposer.
          delay: 150,
          delayOnTouchOnly: true,
          touchStartThreshold: 5,
          onEnd: () => this.syncPhotoOrderFromDom(),
        })
      );

      this.unrankedSortable = markRaw(
        Sortable.create(unrankedEl, {
          group: { name: 'photos', pull: true, put: false },
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          filter: '.delete-photo-btn',
          preventOnFilter: false,
          delay: 150,
          delayOnTouchOnly: true,
          touchStartThreshold: 5,
          onEnd: () => this.syncPhotoOrderFromDom(),
        })
      );
    },
    destroySortables() {
      if (this.rankedSortable) {
        this.rankedSortable.destroy();
        this.rankedSortable = null;
      }
      if (this.unrankedSortable) {
        this.unrankedSortable.destroy();
        this.unrankedSortable = null;
      }
    },
    // Recalcule l'état (classé / à évaluer + rangs) à partir de l'ordre
    // réel des éléments dans le DOM après un glisser-déposer. Cette
    // approche évite tout conflit entre les manipulations directes du
    // DOM par SortableJS et le rendu réactif de Vue : on relit ce que
    // SortableJS a produit, on met à jour les données en conséquence,
    // et le prochain rendu de Vue devient un no-op (l'ordre correspond
    // déjà à ce qui est affiché).
    async syncPhotoOrderFromDom() {
      const rankedEl = this.$refs.rankedList;
      if (!rankedEl) return;
      // Absent en mode confort (onglets) : les deux listes ne sont
      // jamais dans le DOM en même temps, voir initSortables().
      const unrankedEl = this.$refs.unrankedList;

      const rankedIds = Array.from(rankedEl.children).map((el) => el.dataset.id);
      const byId = new Map(this.allPhotos.map((p) => [p.id, p]));

      const updates = [];
      rankedIds.forEach((id, index) => {
        const photo = byId.get(id);
        if (!photo) return;
        const newRank = index + 1;
        if (photo.priority_rank !== newRank) {
          photo.priority_rank = newRank;
          updates.push({ id: photo.id, priority_rank: newRank });
        }
      });
      if (unrankedEl) {
        const unrankedIds = Array.from(unrankedEl.children).map((el) => el.dataset.id);
        unrankedIds.forEach((id) => {
          const photo = byId.get(id);
          if (photo && photo.priority_rank !== null) {
            photo.priority_rank = null;
          }
        });
      }

      // Force Vue à recalculer rankedPhotos/unrankedPhotos.
      this.allPhotos = this.allPhotos.slice();

      if (updates.length === 0) return;
      try {
        await api.updatePhotoRanks(updates);
      } catch (err) {
        this.showError(err);
        await this.loadPhotos(); // Recharge l'état réel en cas d'échec de sauvegarde.
      }
    },
    // Mode confort uniquement : équivalent bouton du glisser-déposer
    // "À évaluer" → "Classement" (impossible entre deux onglets), classe
    // la photo en dernière position du classement.
    async rankPhotoFromUnranked(photo) {
      try {
        const maxRank = await api.fetchMaxRank(this.currentCategory.id);
        const newRank = maxRank + 1;
        await api.updatePhotoRanks([{ id: photo.id, priority_rank: newRank }]);
        photo.priority_rank = newRank;
        this.allPhotos = this.allPhotos.slice();
        announce(`${photo.product_name} ajouté au classement.`);
      } catch (err) {
        this.showError(err);
      }
    },

    // ---------------------------------------------------------------
    // Ajout d'une photo
    // ---------------------------------------------------------------
    openAddPhotoModal(category) {
      this.addPhotoCategoryId = category ? category.id : this.categories[0] && this.categories[0].id;
      this.addPhotoFile = null;
      this.addPhotoPreviewUrl = '';
      this.addPhotoProductName = '';
      this.showAddPhotoModal = true;
    },
    closeAddPhotoModal() {
      this.showAddPhotoModal = false;
      if (this.addPhotoPreviewUrl) URL.revokeObjectURL(this.addPhotoPreviewUrl);
      this.addPhotoFile = null;
      this.addPhotoPreviewUrl = '';
      this.addPhotoProductName = '';
    },
    onPhotoFileSelected(event) {
      const file = event.target.files[0];
      event.target.value = ''; // permet de resélectionner le même fichier ensuite
      if (!file) return;
      this.addPhotoFile = file;
      if (this.addPhotoPreviewUrl) URL.revokeObjectURL(this.addPhotoPreviewUrl);
      this.addPhotoPreviewUrl = URL.createObjectURL(file);
    },
    async submitAddPhoto() {
      if (!this.canSubmitPhoto || this.uploading) return;
      this.uploading = true;
      try {
        const compressed = await compressImage(this.addPhotoFile);
        const path = `${this.addPhotoCategoryId}/${crypto.randomUUID()}.jpg`;
        await api.uploadPhotoFile(path, compressed);

        let priorityRank = null;
        if (this.role === 'consommateur') {
          const maxRank = await api.fetchMaxRank(this.addPhotoCategoryId);
          priorityRank = maxRank + 1;
        }

        await api.insertPhoto({
          categoryId: this.addPhotoCategoryId,
          uploadedBy: this.role,
          productName: this.addPhotoProductName.trim(),
          imagePath: path,
          priorityRank,
        });

        this.showSuccess('Photo ajoutée !');

        const category = this.categories.find((c) => c.id === this.addPhotoCategoryId);
        if (category) category.photo_count = (category.photo_count || 0) + 1;

        // Si on est déjà dans la catégorie concernée, on rafraîchit la liste.
        if (this.currentCategory && this.currentCategory.id === this.addPhotoCategoryId) {
          await this.loadPhotos();
        }

        // On garde la modale ouverte (catégorie + éventuellement) pour
        // permettre d'enchaîner plusieurs ajouts sans revenir en arrière.
        this.addPhotoFile = null;
        if (this.addPhotoPreviewUrl) URL.revokeObjectURL(this.addPhotoPreviewUrl);
        this.addPhotoPreviewUrl = '';
        this.addPhotoProductName = '';
      } catch (err) {
        this.showError(err);
      } finally {
        this.uploading = false;
      }
    },

    // ---------------------------------------------------------------
    // Suppression d'une photo
    // ---------------------------------------------------------------
    confirmDeletePhoto(photo) {
      const categoryName = this.currentCategory ? this.currentCategory.name : '';
      this.openConfirmSheet({
        title: 'Supprimer cette photo ?',
        message: `"${photo.product_name}" sera définitivement retirée de la catégorie ${categoryName}. Cette action est irréversible.`,
        confirmLabel: 'Oui, supprimer',
        onConfirm: async () => {
          try {
            await api.deletePhoto(photo);
            this.allPhotos = this.allPhotos.filter((p) => p.id !== photo.id);
            const category = this.categories.find((c) => c.id === photo.category_id);
            if (category) category.photo_count = Math.max(0, (category.photo_count || 0) - 1);
            this.showSuccess('Photo supprimée.');
          } catch (err) {
            this.showError(err);
          }
        },
      });
    },

    // ---------------------------------------------------------------
    // Commentaires
    // ---------------------------------------------------------------
    toggleComments(photo) {
      this.openCommentsFor = this.openCommentsFor === photo.id ? null : photo.id;
    },
    async submitComment(photo) {
      const text = (this.newCommentDrafts[photo.id] || '').trim();
      if (!text) return;
      try {
        const comment = await api.addComment(photo.id, this.role, text);
        photo.comments.push(comment);
        this.newCommentDrafts[photo.id] = '';
      } catch (err) {
        this.showError(err);
      }
    },

    // ---------------------------------------------------------------
    // Gestion des catégories
    // ---------------------------------------------------------------
    openManageCategories() {
      this.categoryEdits = {};
      this.categories.forEach((c) => {
        this.categoryEdits[c.id] = c.name;
      });
      this.newCategoryName = '';
      this.showManageCategories = true;
    },
    async saveRenameCategory(category) {
      const newName = (this.categoryEdits[category.id] || '').trim();
      if (!newName || newName === category.name) return;
      try {
        await api.renameCategory(category.id, newName);
        category.name = newName;
        this.showSuccess('Catégorie renommée.');
      } catch (err) {
        this.showError(err);
      }
    },
    confirmDeleteCategory(category) {
      this.openConfirmSheet({
        title: 'Supprimer cette catégorie ?',
        message: `"${category.name}" et toutes ses photos seront définitivement supprimées. Cette action est irréversible.`,
        confirmLabel: 'Oui, supprimer',
        onConfirm: async () => {
          try {
            await api.deleteCategory(category.id);
            this.categories = this.categories.filter((c) => c.id !== category.id);
            this.showSuccess('Catégorie supprimée.');
          } catch (err) {
            this.showError(err);
          }
        },
      });
    },
    async submitAddCategory() {
      const name = this.newCategoryName.trim();
      if (!name) return;
      try {
        const category = await api.addCategory(name);
        category.photo_count = 0; // categories.insert() ne renvoie pas l'agrégat photos(count)
        this.categories.push(category);
        this.categoryEdits[category.id] = category.name;
        this.newCategoryName = '';
        this.showSuccess('Catégorie ajoutée.');
      } catch (err) {
        this.showError(err);
      }
    },

    // ---------------------------------------------------------------
    // Réglages (mode confort visuel)
    // ---------------------------------------------------------------
    openSettings() {
      this.view = 'settings';
    },
    toggleA11yMode() {
      const next = this.a11yOn ? 'off' : 'on';
      a11y.setMode(next);
      this.a11yOn = a11y.isOn();
      announce(this.a11yOn ? 'Mode confort visuel activé.' : 'Mode confort visuel désactivé.');
    },
    setA11yTextSize(size) {
      a11y.setTextSize(size);
      this.a11yTextSize = size;
    },
    setA11yTheme(theme) {
      a11y.setTheme(theme);
      this.a11yTheme = theme;
    },
    toggleA11yVibrate() {
      this.a11yVibrate = !this.a11yVibrate;
      a11y.setVibrate(this.a11yVibrate);
    },
    toggleA11ySound() {
      this.a11ySound = !this.a11ySound;
      a11y.setSound(this.a11ySound);
    },

    // ---------------------------------------------------------------
    // Lightbox
    // ---------------------------------------------------------------
    openLightbox(photo) {
      this.lightboxPhoto = photo;
    },
    closeLightbox() {
      this.lightboxPhoto = null;
    },
    // En mode sélection (consommateur en train de constituer sa liste
    // de courses), un tap sur une photo l'ajoute à la liste au lieu
    // d'ouvrir la visionneuse plein écran.
    onPhotoThumbClick(photo) {
      if (this.selectionMode && this.role === 'consommateur') {
        this.addPhotoToList(photo);
      } else {
        this.openLightbox(photo);
      }
    },

    // ---------------------------------------------------------------
    // Liste de courses
    // ---------------------------------------------------------------
    async openShoppingList() {
      this.selectionMode = false;
      this.view = 'shopping-list';
      await this.loadShoppingList();
    },
    async loadShoppingList() {
      this.loadingShoppingList = true;
      try {
        let list = await api.fetchActiveList();
        if (!list && this.role === 'consommateur') {
          list = await api.createActiveList();
        }
        this.shoppingList = list;
        this.shoppingListItems = list ? await api.fetchListItems(list.id) : [];
      } catch (err) {
        this.showError(err);
      } finally {
        this.loadingShoppingList = false;
      }
    },
    enterSelectionMode() {
      this.selectionMode = true;
      this.view = 'categories';
    },
    exitSelectionMode() {
      this.selectionMode = false;
      this.openShoppingList();
    },
    // Cherche dans la liste chargée un article déjà présent et pas
    // encore pris, pour incrémenter sa quantité plutôt que de créer un
    // doublon. Un article déjà marqué "pris" ne compte pas : un
    // nouveau clic redémarre une ligne fraîche (on veut probablement
    // en racheter).
    findActiveListItem({ photoId, label, categoryId }) {
      return this.shoppingListItems.find((item) => {
        if (item.taken) return false;
        if (photoId) return item.photo_id === photoId;
        return (
          item.photo_id === null &&
          item.category_id === categoryId &&
          item.label.trim().toLowerCase() === label.trim().toLowerCase()
        );
      });
    },
    async addPhotoToList(photo) {
      if (!this.shoppingList) return;
      const existingItem = this.findActiveListItem({ photoId: photo.id });
      try {
        const saved = await api.addPhotoToList({
          listId: this.shoppingList.id,
          photo,
          existingItem,
        });
        this.upsertLocalListItem(saved);
        this.showSuccess(`"${photo.product_name}" ajouté à la liste.`);
      } catch (err) {
        this.showError(err);
      }
    },
    openAddTextItemModal() {
      this.addTextItemCategoryId = this.categories[0] && this.categories[0].id;
      this.addTextItemLabel = '';
      this.showAddTextItemModal = true;
    },
    async submitAddTextItem() {
      const label = this.addTextItemLabel.trim();
      if (!label || !this.addTextItemCategoryId || !this.shoppingList) return;
      const existingItem = this.findActiveListItem({
        label,
        categoryId: this.addTextItemCategoryId,
      });
      try {
        const saved = await api.addTextItemToList({
          listId: this.shoppingList.id,
          categoryId: this.addTextItemCategoryId,
          label,
          existingItem,
        });
        this.upsertLocalListItem(saved);
        this.showSuccess(`"${label}" ajouté à la liste.`);
        this.showAddTextItemModal = false;
      } catch (err) {
        this.showError(err);
      }
    },
    upsertLocalListItem(saved) {
      const index = this.shoppingListItems.findIndex((item) => item.id === saved.id);
      if (index === -1) {
        this.shoppingListItems.push(saved);
      } else {
        this.shoppingListItems.splice(index, 1, saved);
      }
    },
    async incrementItem(item) {
      try {
        const saved = await api.incrementListItem(item);
        this.upsertLocalListItem(saved);
        announce(`Quantité : ${saved.quantity} unité${saved.quantity > 1 ? 's' : ''}.`);
      } catch (err) {
        this.showError(err);
      }
    },
    async decrementItem(item) {
      if (item.quantity <= 1) return;
      try {
        const saved = await api.decrementListItem(item);
        this.upsertLocalListItem(saved);
        announce(`Quantité : ${saved.quantity} unité${saved.quantity > 1 ? 's' : ''}.`);
      } catch (err) {
        this.showError(err);
      }
    },
    deleteListItem(item) {
      this.openConfirmSheet({
        title: 'Retirer cet article ?',
        message: `"${item.label}" sera retiré de la liste de courses. Cette action est irréversible.`,
        confirmLabel: 'Oui, retirer',
        onConfirm: async () => {
          try {
            await api.deleteListItem(item.id);
            this.shoppingListItems = this.shoppingListItems.filter((i) => i.id !== item.id);
            announce(`"${item.label}" retiré de la liste.`);
          } catch (err) {
            this.showError(err);
          }
        },
      });
    },
    async toggleItemTaken(item) {
      if (this.role !== 'acheteur') return;
      try {
        const saved = await api.toggleListItemTaken(item);
        this.upsertLocalListItem(saved);
      } catch (err) {
        this.showError(err);
      }
    },
    confirmTerminerListe() {
      this.openConfirmSheet({
        title: 'Terminer les courses ?',
        message: 'La liste actuelle sera archivée et une nouvelle liste vide démarrera. Cette action est irréversible.',
        confirmLabel: 'Oui, terminer',
        onConfirm: async () => {
          try {
            const nouvelle = await api.terminerListeCourses();
            this.shoppingList = nouvelle;
            this.shoppingListItems = [];
            this.showSuccess('Courses terminées, nouvelle liste prête.');
          } catch (err) {
            this.showError(err);
          }
        },
      });
    },
  },
}).mount('#app');
