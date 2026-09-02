/**
 * Getting a backup off the phone, and back on again.
 *
 *   EXPORT  → the system folder picker → the file is written into the folder the
 *             user chose (Download, Drive, an SD card), where a file manager can
 *             see it and a cable or an upload can move it.
 *   IMPORT  → the system FILE browser → the user finds that JSON and picks it.
 *
 * Two different Android pickers, because they are two different intents:
 * `expo-file-system`'s Storage Access Framework grants write access to a FOLDER
 * (there is no "save as" dialog in it), and `expo-document-picker` opens the
 * browse-and-select UI for reading ONE file. Anything less than the second one is
 * not what "find the file I exported" means: a list the app assembles itself can
 * only show the folders the app has already been granted, which is exactly the
 * folder the user is trying to remember.
 *
 * A file written to the app's own documents directory would survive an app update
 * and die with an uninstall — i.e. exactly the case a backup exists for — so that
 * path is only the fallback for a platform with no folder picker.
 *
 * Everything here reports failure as a value where failure is ORDINARY: a cancelled
 * picker is "nothing happened", not an error. Real errors (an unreadable file, a
 * revoked permission) throw, and the caller turns them into one sentence with
 * `describeError`.
 */

import { Platform } from 'react-native';
/*
 * The legacy entry point on purpose: the modern `File`/`Directory` API has no SAF
 * equivalent, and SAF is the only way to reach a folder the user can find again.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

const JSON_MIME = 'application/json';
/**
 * The CSV export's type.
 *
 * Named separately rather than parameterised at every call, because the MIME type
 * is what SAF derives the extension from: a `.csv` written as `application/json`
 * arrives as `name.json` holding commas, and every tool that opens it is wrong
 * about what it is.
 */
const CSV_MIME = 'text/csv';

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
  const withoutVolume = afterTree.includes(':')
    ? afterTree.split(':').slice(1).join(':')
    : afterTree;
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
  mimeType: string = JSON_MIME,
): Promise<{ name: string; uri: string }> {
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    folderUri,
    baseName,
    mimeType,
  );
  await FileSystem.writeAsStringAsync(fileUri, contents);
  /*
   * The URI as well as the name, because the automatic backup has to be able to
   * DELETE this file later: SAF cannot overwrite (a second write becomes
   * `name (1).json`), so an unattended weekly copy is only sustainable if the old
   * ones can be rotated out, and a URI is the only handle SAF accepts.
   */
  return { name: displayName(fileUri), uri: fileUri };
}

/**
 * Delete one file by URI. Best-effort: a `false` is not worth reporting.
 *
 * Used only by the backup rotation, and only on URIs this app wrote itself. A
 * delete that fails leaves one extra copy in a folder, which is the mildest
 * possible failure — so it is swallowed rather than surfaced, and the next
 * rotation will try the same file again.
 */
export async function deleteFile(uri: string): Promise<boolean> {
  try {
    if (canPickFolder()) {
      await FileSystem.StorageAccessFramework.deleteAsync(uri);
      return true;
    }
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

/** Write into the app's own documents directory. Returns the full path. */
export async function writeToAppFolder(
  baseName: string,
  contents: string,
  extension = 'json',
): Promise<string> {
  const folder = appFolderUri();
  if (!folder) throw new Error('This device has no writable app folder.');
  const fileUri = `${folder}${baseName}.${extension}`;
  await FileSystem.writeAsStringAsync(fileUri, contents);
  return fileUri.replace('file://', '');
}

/**
 * What `saveJsonFile` did. `cancelled` is a user decision, not a failure.
 *
 * `folderUri` is present only when the file went into a folder the user granted —
 * i.e. not on the sandbox fallback. It is carried back so the AUTOMATIC backup can
 * adopt that grant: the moment somebody exports by hand, the app knows a durable
 * place to write, and asking a second time for the same permission on a settings
 * row would be the app not paying attention. See `lib/autoBackup.ts`.
 */
export type SaveOutcome =
  | { saved: true; name: string; where: string; folderUri?: string }
  | { saved: false; cancelled: true };

/**
 * Write the file somewhere the user picked and can find again.
 *
 * The folder picker first, because that is the only destination that survives an
 * uninstall. Where there is no picker at all, the app's own documents directory —
 * stated as a path, so it is at least reachable over a cable.
 */
export async function saveJsonFile(baseName: string, contents: string): Promise<SaveOutcome> {
  return saveTextFile(baseName, contents, JSON_MIME, 'json');
}

/**
 * The same folder picker, for the CSV export.
 *
 * A thin wrapper rather than a second implementation: the picker, the fallback, the
 * cancelled-is-not-an-error rule and the "say where it went" contract are identical,
 * and the only thing that differs is the MIME type SAF derives the extension from.
 */
export async function saveCsvFile(baseName: string, contents: string): Promise<SaveOutcome> {
  return saveTextFile(baseName, contents, CSV_MIME, 'csv');
}

async function saveTextFile(
  baseName: string,
  contents: string,
  mimeType: string,
  extension: string,
): Promise<SaveOutcome> {
  if (!canPickFolder()) {
    const path = await writeToAppFolder(baseName, contents, extension);
    return { saved: true, name: `${baseName}.${extension}`, where: path };
  }

  const folder = await pickFolder();
  if (!folder) return { saved: false, cancelled: true };

  const { name } = await writeToFolder(folder, baseName, contents, mimeType);
  return { saved: true, name, where: folderLabel(folder), folderUri: folder };
}

export interface PickedFile {
  uri: string;
  name: string;
}

/**
 * Open the phone's file browser and hand back the file the user picked.
 * `null` means they backed out.
 *
 * `type: '*&#47;*'` deliberately: filtering to `application/json` hides the very file
 * this is for whenever the provider reports it as `octet-stream` or as nothing at
 * all, which is common for a file that arrived over a cable or a chat. A wrong pick
 * is caught a moment later by `parseBackup`, which says what was wrong with it —
 * that is a better failure than a picker that shows an empty folder.
 *
 * `copyToCacheDirectory` so the returned URI is one the file system can read: a raw
 * `content://` URI from another app's provider is not.
 */
export async function pickJsonFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name || displayName(asset.uri) };
}

export async function readTextFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri);
}

/** Every unreadable file, every denied permission, in one sentence for the screen. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() === '' ? 'Something went wrong reaching the file system.' : message;
}
