/**
 * Getting a backup off the phone, and back on again, with the modules the app
 * already ships.
 *
 * ── WHY IT LOOKS LIKE THIS ──────────────────────────────────────────────────
 *
 * There is no document picker and no share sheet in this project's dependencies —
 * `expo-file-system` is here only because `expo` itself brings it — and a backup
 * button is not worth a new native module and a rebuild of the Android project. What
 * that module DOES have on Android is the Storage Access Framework: the system
 * folder picker, which grants the app read/write on one folder the user chose. That
 * is enough for both directions:
 *
 *   export  → pick a folder (Download, Drive, an SD card) → write the file into it
 *   import  → pick that folder again → list the backups in it → read one
 *
 * SAF picks a FOLDER, never a file, which is why import is "choose the folder you
 * saved to" and then a list rather than a single file dialog. It also means the
 * exported file lands somewhere the user can actually reach with a file manager, a
 * cable, or an upload — which is the whole point. A file written to the app's own
 * private directory would survive an update and die with an uninstall, i.e. exactly
 * the case a backup exists for.
 *
 * Everything here is best-effort and reports failure as a value: a denied permission
 * and a cancelled picker are the same thing from the user's side (nothing happened),
 * and both are ordinary. `PASTE` in the backup screen is the escape hatch that needs
 * no file system at all.
 */

import { Platform } from 'react-native';
/*
 * The legacy entry point on purpose: the modern `File`/`Directory` API has no SAF
 * equivalent, and SAF is the only way to reach a folder the user can find again.
 */
import * as FileSystem from 'expo-file-system/legacy';

const JSON_MIME = 'application/json';

/** Can this platform show a folder picker at all? SAF is Android-only. */
export function canPickFolder(): boolean {
  return Platform.OS === 'android' && FileSystem.StorageAccessFramework != null;
}

/**
 * The app's own documents directory, as a fallback destination.
 *
 * Reachable by the app and nobody else, which makes it a weak backup — it dies with
 * an uninstall. It exists so that "export" still produces a file on a platform with
 * no picker, and so the path can be shown to a user who wants to pull it off with
 * `adb` or a desktop file browser.
 */
export function appFolderUri(): string | null {
  return FileSystem.documentDirectory ?? null;
}

/** The name a SAF URI ends in, decoded: `...%2FDownload%2Fbackup.json` → `backup.json`. */
export function displayName(uri: string): string {
  const decoded = safeDecode(uri);
  const tail = decoded.split('/').pop() ?? decoded;
  return tail;
}

/** The folder a SAF tree URI points at, in words: "Download", "SD card / backups". */
export function folderLabel(folderUri: string): string {
  const decoded = safeDecode(folderUri);
  const afterTree = decoded.split('tree/').pop() ?? decoded;
  // `primary:Download` — the volume prefix is noise to everyone but Android.
  const withoutVolume = afterTree.includes(':') ? afterTree.split(':').slice(1).join(':') : afterTree;
  const cleaned = withoutVolume.replace(/^\/+|\/+$/g, '').replace(/\//g, ' / ');
  return cleaned === '' ? 'the folder you picked' : cleaned;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A URI that isn't valid percent-encoding is still a string worth showing.
    return value;
  }
}

/**
 * Ask for a folder. `null` means the user backed out, or the platform has no picker
 * — both of which are "nothing happened", not an error to report.
 */
export async function pickFolder(): Promise<string | null> {
  if (!canPickFolder()) return null;
  try {
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    return result.granted ? result.directoryUri : null;
  } catch {
    return null;
  }
}

/**
 * Write the backup into a folder the user picked. Returns the file's name.
 *
 * SAF creates the file from a base name and a MIME type — it appends the extension
 * itself, and it never overwrites: a second export in the same minute becomes
 * `name (1).json`. Both behaviours are what you want from a backup.
 */
export async function writeToFolder(
  folderUri: string,
  baseName: string,
  contents: string,
): Promise<string> {
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    folderUri,
    baseName,
    JSON_MIME,
  );
  await FileSystem.writeAsStringAsync(fileUri, contents);
  return displayName(fileUri);
}

/** Write into the app's own documents directory. Returns the full path. */
export async function writeToAppFolder(baseName: string, contents: string): Promise<string> {
  const folder = appFolderUri();
  if (!folder) throw new Error('This device has no writable app folder.');
  const fileUri = `${folder}${baseName}.json`;
  await FileSystem.writeAsStringAsync(fileUri, contents);
  return fileUri.replace('file://', '');
}

export interface FoundFile {
  uri: string;
  name: string;
}

/**
 * The JSON files in a folder, newest-looking first.
 *
 * Sorted by NAME descending, which is chronological because `backupBaseName` puts a
 * sortable date in it — SAF exposes no modification time, so the name is the only
 * ordering available, and it is the one the file was named for.
 *
 * Filtered to `.json` rather than to our own prefix: a user who renamed their backup
 * to `before-holiday.json` should still find it in this list.
 */
export async function listJsonFiles(folderUri: string): Promise<FoundFile[]> {
  const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
  return uris
    .map((uri) => ({ uri, name: displayName(uri) }))
    .filter((file) => file.name.toLowerCase().endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function readTextFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri);
}

/** Every unreadable file, every denied permission, in one sentence for the screen. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() === '' ? 'Something went wrong reaching the file system.' : message;
}
