import { processBlob, outputName } from '../adapters/canvas';
import {
  loadSettings,
  settingsToPipelineOptions,
  type Settings,
} from './settings';

/**
 * Best-effort auto-intercept of image uploads. When enabled, replaces images
 * passing through file inputs and paste with their obfuscated version before the
 * page consumes them.
 *
 * Caveat (see docs/DESIGN.md risks): true interception of every upload path is
 * impossible — pages read files via input.files, drag-drop, paste, FormData,
 * direct canvas capture, etc. This covers the standard `<input type=file>` and
 * paste cases; the right-click context-menu action is the robust fallback.
 */

let settings: Settings | null = null;
const processed = new WeakSet<File>();

async function getSettings(): Promise<Settings> {
  if (!settings) settings = await loadSettings();
  return settings;
}

chrome.storage.onChanged.addListener(() => {
  settings = null; // refresh on next use
});

function opts(s: Settings) {
  return {
    ...settingsToPipelineOptions(s),
    stripMeta: s.stripMetadata,
    outputType: s.outputType,
    outputQuality: s.outputQuality,
  };
}

async function transformFile(file: File, s: Settings): Promise<File> {
  if (!file.type.startsWith('image/') || processed.has(file)) return file;
  const blob = await processBlob(file, opts(s));
  const nf = new File([blob], outputName(file.name, s.outputType), {
    type: blob.type,
    lastModified: file.lastModified,
  });
  processed.add(nf);
  return nf;
}

async function handleFileInput(input: HTMLInputElement): Promise<void> {
  const s = await getSettings();
  if (!s.autoIntercept || !input.files || input.files.length === 0) return;
  const files = Array.from(input.files);
  if (files.every((f) => processed.has(f) || !f.type.startsWith('image/'))) return;

  const dt = new DataTransfer();
  for (const f of files) dt.items.add(await transformFile(f, s));
  input.files = dt.files;
  // Re-dispatch so the page's own change handlers see the swapped files.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Capture-phase: stop the original event reaching the page, process, re-dispatch.
document.addEventListener(
  'change',
  (e) => {
    const t = e.target as HTMLInputElement | null;
    if (!t || t.tagName !== 'INPUT' || t.type !== 'file') return;
    if ((e as Event & { __antiCensor?: boolean }).__antiCensor) return;
    if (!t.files || t.files.length === 0) return;
    const needs = Array.from(t.files).some(
      (f) => f.type.startsWith('image/') && !processed.has(f),
    );
    if (!needs) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    void handleFileInput(t);
  },
  true,
);

// Paste interception (clipboard images).
document.addEventListener(
  'paste',
  (e) => {
    void (async () => {
      const s = await getSettings();
      if (!s.autoIntercept) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          // We cannot rewrite the clipboard payload synchronously; surface a
          // console hint and rely on the file-input / context-menu paths.
          console.debug('[anti-censor] pasted image detected; use the context-menu action to obfuscate it before sharing.');
        }
      }
    })();
  },
  true,
);
