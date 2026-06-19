const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']);

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) {
    return '';
  }
  return parts.pop()?.toLowerCase() ?? '';
}

/**
 * Detect HEIC by MIME type, extension, OR file header magic bytes.
 * iOS camera capture can send files as image/jpeg with HEIC data inside.
 */
async function isHeic(file: File): Promise<boolean> {
  const ext = getExtension(file.name);
  if (ext === 'heic' || ext === 'heif') {
    return true;
  }
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return true;
  }

  // Check magic bytes — HEIC/HEIF files contain "ftyp" at byte 4
  // followed by "heic", "heix", "hevc", "mif1", etc.
  try {
    const header = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(header);
    // ftyp signature at bytes 4-7
    if (
      bytes[4] === 0x66 && // f
      bytes[5] === 0x74 && // t
      bytes[6] === 0x79 && // y
      bytes[7] === 0x70 // p
    ) {
      // Check brand at bytes 8-11
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'hevx'].includes(brand)) {
        return true;
      }
    }
  } catch {
    // Can't read header — not HEIC
  }

  return false;
}

function isAllowedFile(file: File): boolean {
  const ext = getExtension(file.name);
  // Check by extension
  if (ext && ALLOWED_EXTENSIONS.has(ext)) {
    return true;
  }
  // Check by MIME type
  if (file.type) {
    for (const prefix of ALLOWED_MIME_PREFIXES) {
      if (file.type.startsWith(prefix)) {
        return true;
      }
    }
  }
  // iOS camera can send files with no extension but valid image MIME
  if (!ext && file.type.startsWith('image/')) {
    return true;
  }
  return false;
}

export type PreparedFile = {
  file: File | null;
  error: string | null;
};

/**
 * Validate and prepare a file for upload.
 * Converts HEIC to JPEG client-side (including iOS camera captures
 * that report as JPEG but contain HEIC data).
 */
export async function prepareFileForUpload(
  file: File,
  onConvertStart?: () => void,
  onConvertEnd?: () => void,
): Promise<PreparedFile> {
  try {
    // Validate type
    if (!isAllowedFile(file)) {
      return {
        file: null,
        error: 'Unsupported file type. Please upload a JPG, PNG, WEBP, HEIC, or PDF.',
      };
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return {
        file: null,
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
      };
    }

    // Detect and convert HEIC (including misidentified iOS camera captures)
    const heic = await isHeic(file);
    if (heic) {
      try {
        onConvertStart?.();
        const heic2any = (await import('heic2any')).default;
        const result = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.85,
        });
        onConvertEnd?.();

        const convertedBlob = Array.isArray(result) ? result[0] : result;
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
        const convertedFile = new File([convertedBlob], `${baseName}.jpg`, {
          type: 'image/jpeg',
        });

        if (convertedFile.size > MAX_FILE_SIZE) {
          return {
            file: null,
            error: `Converted file too large (${(convertedFile.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
          };
        }

        return { file: convertedFile, error: null };
      } catch (e) {
        onConvertEnd?.();
        console.error('[prepareFileForUpload] HEIC conversion failed:', e);
        return {
          file: null,
          error: 'Could not process this photo. Try taking a screenshot or converting to JPEG first.',
        };
      }
    }

    // Ensure the file has an extension for the server-side check
    const ext = getExtension(file.name);
    if (!ext && file.type.startsWith('image/')) {
      // iOS sometimes sends files without extensions — add one
      const typeExt = file.type === 'image/png' ? 'png' : 'jpg';
      const renamed = new File([file], `photo.${typeExt}`, { type: file.type });
      return { file: renamed, error: null };
    }

    return { file, error: null };
  } catch (e) {
    console.error('[prepareFileForUpload] Unexpected error:', e);
    return {
      file: null,
      error: 'Something went wrong processing this file. Please try again.',
    };
  }
}
