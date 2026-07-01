import type { PipelineOptions } from '../core/pipeline';

/** User-configurable settings, persisted in chrome.storage.local. */
export interface Settings {
  /** Auto-intercept images on upload (file inputs / paste). */
  autoIntercept: boolean;
  /** Overall transform strength 0..1. */
  strength: number;
  /** Allow a horizontal flip (changes orientation; off for text/known-orientation). */
  flipAllowed: boolean;
  /** Maximum evasion: seam carving + elastic warp + PRNU suppression (slower). */
  maximize: boolean;
  /** Strip EXIF/XMP/C2PA metadata before processing. */
  stripMetadata: boolean;
  /** Output format for the re-encoded image. */
  outputType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Output quality (lossy formats). */
  outputQuality: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autoIntercept: false,
  strength: 0.4,
  flipAllowed: false,
  maximize: false,
  stripMetadata: true,
  outputType: 'image/jpeg',
  outputQuality: 0.92,
};

const KEY = 'anti-censor-settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const got = await chrome.storage.local.get(KEY);
    return { ...DEFAULT_SETTINGS, ...(got[KEY] as Partial<Settings> | undefined) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({ [KEY]: { ...current, ...s } });
}

/** Map persisted settings to the pure pipeline options. */
export function settingsToPipelineOptions(s: Settings): PipelineOptions {
  return {
    strength: s.strength,
    flipAllowed: s.flipAllowed,
    elastic: s.maximize,
    carve: s.maximize,
    prnu: s.maximize,
  };
}
