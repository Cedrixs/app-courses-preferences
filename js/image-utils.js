// =====================================================================
// Compression d'image côté navigateur
// =====================================================================
// Redimensionne et recompresse une photo avant envoi, pour économiser
// le quota de stockage gratuit de Supabase (1 Go).

/**
 * Compresse un fichier image en JPEG.
 * @param {File} file - fichier image d'origine (venant de l'appareil photo ou de la galerie)
 * @param {{maxWidth?: number, quality?: number}} options
 * @returns {Promise<Blob>} image compressée au format JPEG
 */
function compressImage(file, options = {}) {
  const maxWidth = options.maxWidth || 1200;
  const quality = options.quality || 0.7;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Impossible de lire le fichier image."));

    reader.onload = (readEvent) => {
      const img = new Image();

      img.onerror = () => reject(new Error("Fichier image invalide ou corrompu."));

      img.onload = () => {
        // Ne jamais agrandir une image plus petite que maxWidth.
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Échec de la compression de l'image."));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      };

      img.src = readEvent.target.result;
    };

    reader.readAsDataURL(file);
  });
}
