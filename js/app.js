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

createApp({
  data() {
    return {
      view: 'loading', // loading | role-select | pin | categories | category-detail
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
  },

  async mounted() {
    try {
      const currentRole = await getCurrentRole();
      if (currentRole) {
        this.role = currentRole;
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
    showError(err) {
      console.error(err);
      this.errorMessage =
        err && err.message
          ? this.translateError(err.message)
          : "Une erreur inattendue est survenue.";
      this.successMessage = '';
      setTimeout(() => {
        this.errorMessage = '';
      }, 5000);
    },
    showSuccess(text) {
      this.successMessage = text;
      this.errorMessage = '';
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
    // Connexion / rôle / PIN
    // ---------------------------------------------------------------
    chooseRole(role) {
      this.pendingRole = role;
      this.pinInput = '';
      this.pinError = '';
      this.view = 'pin';
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
        await this.enterApp();
      } catch (err) {
        this.pinError = this.translateError(err.message || '');
        this.pinInput = '';
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
      this.view = 'role-select';
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
      await this.loadPhotos();
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
          onEnd: () => this.syncPhotoOrderFromDom(),
        })
      );

      this.unrankedSortable = markRaw(
        Sortable.create(unrankedEl, {
          group: { name: 'photos', pull: true, put: false },
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
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
      const unrankedEl = this.$refs.unrankedList;
      if (!rankedEl || !unrankedEl) return;

      const rankedIds = Array.from(rankedEl.children).map((el) => el.dataset.id);
      const unrankedIds = Array.from(unrankedEl.children).map((el) => el.dataset.id);

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
      unrankedIds.forEach((id) => {
        const photo = byId.get(id);
        if (photo && photo.priority_rank !== null) {
          photo.priority_rank = null;
        }
      });

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
    async confirmDeletePhoto(photo) {
      if (!confirm(`Supprimer la photo "${photo.product_name}" ?`)) return;
      try {
        await api.deletePhoto(photo);
        this.allPhotos = this.allPhotos.filter((p) => p.id !== photo.id);
        this.showSuccess('Photo supprimée.');
      } catch (err) {
        this.showError(err);
      }
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
    async confirmDeleteCategory(category) {
      if (!confirm(`Supprimer la catégorie "${category.name}" et toutes ses photos ?`)) return;
      try {
        await api.deleteCategory(category.id);
        this.categories = this.categories.filter((c) => c.id !== category.id);
        this.showSuccess('Catégorie supprimée.');
      } catch (err) {
        this.showError(err);
      }
    },
    async submitAddCategory() {
      const name = this.newCategoryName.trim();
      if (!name) return;
      try {
        const category = await api.addCategory(name);
        this.categories.push(category);
        this.categoryEdits[category.id] = category.name;
        this.newCategoryName = '';
        this.showSuccess('Catégorie ajoutée.');
      } catch (err) {
        this.showError(err);
      }
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
  },
}).mount('#app');
