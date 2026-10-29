import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Phone version of the web's src/lib/image.ts plus its file input: take a photo with the camera (arrival, pickup)
 * or pick one from the library (listing photos), scale it down to `maxDim` on the longest side, and return a JPEG
 * data URL, the same form the web keeps on listings and bookings. Never throws.
 */

/** Longest side: 800 px for listing photos, 640 px for arrival and pickup photos (the web uses the same sizes). */
export const PHOTO_MAX_DIM = 800;
export const PHOTO_QUALITY = 0.75;

export type PhotoSource = 'camera' | 'library';

export type PhotoResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'CANCELLED' | 'DENIED' | 'FAILED'; message: string };

const DENIED: Record<PhotoSource, string> = {
  camera: 'Dwell needs the camera for this photo. Turn it on in Settings, then try again.',
  library: 'Dwell needs access to your photos to add one. Turn it on in Settings, then try again.',
};

type Picker = Pick<typeof ImagePicker, 'requestCameraPermissionsAsync' | 'requestMediaLibraryPermissionsAsync' | 'launchCameraAsync' | 'launchImageLibraryAsync'>;
type Resize = (uri: string, width: number, height: number, maxDim: number) => Promise<string | null>;

/** Scale down (never up) and re-encode as JPEG. Returns base64, or null if the image couldn't be processed. */
const resizeToJpeg: Resize = async (uri, width, height, maxDim) => {
  const scale = Math.min(1, maxDim / Math.max(width, height, 1));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
  return saved.base64 ?? null;
};

export async function takePhoto(source: PhotoSource, deps: { picker?: Picker; resize?: Resize; maxDim?: number } = {}): Promise<PhotoResult> {
  const picker = deps.picker ?? ImagePicker;
  const resize = deps.resize ?? resizeToJpeg;
  try {
    const permission = source === 'camera' ? await picker.requestCameraPermissionsAsync() : await picker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'DENIED', message: DENIED[source] };

    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
    const result = source === 'camera' ? await picker.launchCameraAsync(options) : await picker.launchImageLibraryAsync(options);
    if (result.canceled || result.assets.length === 0) return { ok: false, reason: 'CANCELLED', message: '' };

    const asset = result.assets[0];
    const base64 = await resize(asset.uri, asset.width, asset.height, deps.maxDim ?? PHOTO_MAX_DIM);
    if (!base64) return { ok: false, reason: 'FAILED', message: 'That photo couldn’t be read. Try another one.' };
    return { ok: true, dataUrl: `data:image/jpeg;base64,${base64}` };
  } catch {
    return { ok: false, reason: 'FAILED', message: 'That photo couldn’t be read. Try another one.' };
  }
}
