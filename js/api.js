// =====================================================================
// Accès aux données Supabase (base de données + stockage)
// =====================================================================
// Toutes les fonctions renvoient directement les données ou lèvent une
// exception en cas d'erreur (réseau, policy RLS refusée, etc.), pour
// que l'appelant puisse afficher un message clair à l'utilisateur.

/** Lève une exception si la réponse Supabase contient une erreur. */
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const api = {
  // ---------------------------------------------------------------
  // Catégories
  // ---------------------------------------------------------------
  async fetchCategories() {
    // `photos(count)` embarque le nombre de photos de chaque catégorie
    // (relation photos.category_id -> categories.id) : utilisé par le
    // mode confort visuel pour afficher "12 photos" sous chaque carte.
    const rows = unwrap(
      await supabaseClient.from('categories').select('*, photos(count)').order('name')
    );
    return rows.map((c) => ({ ...c, photo_count: c.photos?.[0]?.count ?? 0 }));
  },

  async addCategory(name) {
    return unwrap(await supabaseClient.from('categories').insert({ name }).select().single());
  },

  async renameCategory(id, name) {
    return unwrap(
      await supabaseClient.from('categories').update({ name }).eq('id', id).select().single()
    );
  },

  async deleteCategory(id) {
    // Les photos et commentaires de la catégorie sont supprimés en
    // cascade côté base de données (contrainte ON DELETE CASCADE),
    // mais pas les fichiers du Storage : on tente de les nettoyer avant.
    // Seul le consommateur a le droit de supprimer des fichiers du
    // Storage (voir policies RLS) : si l'acheteur supprime une
    // catégorie, ce nettoyage échoue silencieusement et laisse des
    // fichiers orphelins plutôt que de bloquer la suppression.
    try {
      const photos = unwrap(
        await supabaseClient.from('photos').select('image_path').eq('category_id', id)
      );
      if (photos.length) {
        await supabaseClient.storage.from('photos').remove(photos.map((p) => p.image_path));
      }
    } catch (err) {
      // Nettoyage best-effort : on continue même en cas d'échec.
    }
    return unwrap(await supabaseClient.from('categories').delete().eq('id', id));
  },

  // ---------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------
  async fetchPhotosByCategory(categoryId) {
    // Les commentaires sont récupérés en une seule requête grâce à la
    // relation de clé étrangère comments.photo_id -> photos.id.
    return unwrap(
      await supabaseClient
        .from('photos')
        .select('*, comments(*)')
        .eq('category_id', categoryId)
        .order('created_at')
    );
  },

  /** Renvoie le rang le plus élevé actuellement utilisé dans une catégorie (0 si aucun). */
  async fetchMaxRank(categoryId) {
    const rows = unwrap(
      await supabaseClient
        .from('photos')
        .select('priority_rank')
        .eq('category_id', categoryId)
        .not('priority_rank', 'is', null)
        .order('priority_rank', { ascending: false })
        .limit(1)
    );
    return rows.length ? rows[0].priority_rank : 0;
  },

  async insertPhoto({ categoryId, uploadedBy, productName, imagePath, priorityRank }) {
    return unwrap(
      await supabaseClient
        .from('photos')
        .insert({
          category_id: categoryId,
          uploaded_by: uploadedBy,
          product_name: productName,
          image_path: imagePath,
          priority_rank: priorityRank,
        })
        .select()
        .single()
    );
  },

  /** Met à jour le rang de plusieurs photos en une fois (après un glisser-déposer). */
  async updatePhotoRanks(updates) {
    // updates: [{ id, priority_rank }, ...]
    // Chaque requête doit être "await"ée : les query builders Supabase
    // sont "thenable" mais n'exécutent la requête HTTP que lorsqu'on
    // les attend réellement (await / .then).
    await Promise.all(
      updates.map(async (u) => {
        unwrap(
          await supabaseClient
            .from('photos')
            .update({ priority_rank: u.priority_rank })
            .eq('id', u.id)
        );
      })
    );
  },

  async deletePhoto(photo) {
    await supabaseClient.storage.from('photos').remove([photo.image_path]);
    return unwrap(await supabaseClient.from('photos').delete().eq('id', photo.id));
  },

  async uploadPhotoFile(path, blob) {
    return unwrap(
      await supabaseClient.storage
        .from('photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    );
  },

  getPublicUrl(path) {
    return supabaseClient.storage.from('photos').getPublicUrl(path).data.publicUrl;
  },

  // ---------------------------------------------------------------
  // Commentaires
  // ---------------------------------------------------------------
  async addComment(photoId, author, text) {
    return unwrap(
      await supabaseClient
        .from('comments')
        .insert({ photo_id: photoId, author, text })
        .select()
        .single()
    );
  },

  // ---------------------------------------------------------------
  // Liste de courses
  // ---------------------------------------------------------------
  /** Renvoie la liste active, ou null s'il n'y en a aucune. */
  async fetchActiveList() {
    const rows = unwrap(
      await supabaseClient.from('shopping_lists').select('*').eq('status', 'active').limit(1)
    );
    return rows.length ? rows[0] : null;
  },

  /** Crée la liste active (réservé au consommateur, voir policies RLS). */
  async createActiveList() {
    return unwrap(
      await supabaseClient
        .from('shopping_lists')
        .insert({ status: 'active' })
        .select()
        .single()
    );
  },

  async fetchListItems(listId) {
    return unwrap(
      await supabaseClient
        .from('shopping_list_items')
        .select('*, categories(name), photos(image_path)')
        .eq('list_id', listId)
        .order('created_at')
    );
  },

  /**
   * Ajoute une photo à la liste, ou incrémente sa quantité si elle y
   * figure déjà (et n'est pas encore marquée "prise").
   */
  async addPhotoToList({ listId, photo, existingItem }) {
    if (existingItem) {
      return api.incrementListItem(existingItem);
    }
    return unwrap(
      await supabaseClient
        .from('shopping_list_items')
        .insert({
          list_id: listId,
          category_id: photo.category_id,
          photo_id: photo.id,
          label: photo.product_name,
          quantity: 1,
        })
        .select('*, categories(name), photos(image_path)')
        .single()
    );
  },

  /** Ajoute un article texte libre, ou incrémente s'il existe déjà (même nom, même catégorie, non pris). */
  async addTextItemToList({ listId, categoryId, label, existingItem }) {
    if (existingItem) {
      return api.incrementListItem(existingItem);
    }
    return unwrap(
      await supabaseClient
        .from('shopping_list_items')
        .insert({
          list_id: listId,
          category_id: categoryId,
          photo_id: null,
          label,
          quantity: 1,
        })
        .select('*, categories(name), photos(image_path)')
        .single()
    );
  },

  async incrementListItem(item) {
    return unwrap(
      await supabaseClient
        .from('shopping_list_items')
        .update({ quantity: item.quantity + 1 })
        .eq('id', item.id)
        .select('*, categories(name), photos(image_path)')
        .single()
    );
  },

  async decrementListItem(item) {
    if (item.quantity <= 1) return item;
    return unwrap(
      await supabaseClient
        .from('shopping_list_items')
        .update({ quantity: item.quantity - 1 })
        .eq('id', item.id)
        .select('*, categories(name), photos(image_path)')
        .single()
    );
  },

  async deleteListItem(id) {
    return unwrap(await supabaseClient.from('shopping_list_items').delete().eq('id', id));
  },

  /** Bascule le statut "pris" d'un article (réservé à l'acheteur, voir trigger RLS). */
  async toggleListItemTaken(item) {
    const taken = !item.taken;
    return unwrap(
      await supabaseClient
        .from('shopping_list_items')
        .update({ taken, taken_at: taken ? new Date().toISOString() : null })
        .eq('id', item.id)
        .select('*, categories(name), photos(image_path)')
        .single()
    );
  },

  /** Archive la liste active et en crée une nouvelle vide, de façon atomique (réservé au consommateur). */
  async terminerListeCourses() {
    return unwrap(await supabaseClient.rpc('terminer_liste_courses'));
  },
};
