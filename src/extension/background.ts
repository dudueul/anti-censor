import { processBlob, outputName } from '../adapters/canvas';
import { loadSettings, settingsToPipelineOptions } from './settings';

const MENU_ID = 'anti-censor-image';
const VIDEO_MENU_ID = 'anti-censor-video';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Obfuscate image (anti-censor)',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: VIDEO_MENU_ID,
    title: 'Obfuscate video (anti-censor)',
    contexts: ['video'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.srcUrl) void obfuscateAndDownload(info.srcUrl);
  if (info.menuItemId === VIDEO_MENU_ID && info.srcUrl) void obfuscateVideo(info.srcUrl);
});

/** Video needs a DOM (decode via <video>), so it runs in an offscreen document. */
async function obfuscateVideo(srcUrl: string): Promise<void> {
  try {
    await ensureOffscreen();
    const res = (await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'video',
      srcUrl,
    })) as { ok: boolean; dataUrl?: string; error?: string };
    if (res?.ok && res.dataUrl) {
      await chrome.downloads.download({
        url: res.dataUrl,
        filename: outputName(fileNameFromUrl(srcUrl), 'video/webm').replace(/\.[^.]+$/, '.webm'),
        saveAs: true,
      });
    } else {
      console.error('[anti-censor] video obfuscation failed:', res?.error);
    }
  } catch (err) {
    console.error('[anti-censor] video obfuscation failed:', err);
  }
}

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Decode and re-encode video with WebCodecs to obfuscate it.',
  });
}

async function obfuscateAndDownload(srcUrl: string): Promise<void> {
  try {
    const settings = await loadSettings();
    const resp = await fetch(srcUrl);
    const blob = await resp.blob();
    const out = await processBlob(blob, {
      ...settingsToPipelineOptions(settings),
      stripMeta: settings.stripMetadata,
      outputType: settings.outputType,
      outputQuality: settings.outputQuality,
    });
    const dataUrl = await blobToDataUrl(out);
    const name = outputName(fileNameFromUrl(srcUrl), settings.outputType);
    await chrome.downloads.download({ url: dataUrl, filename: name, saveAs: true });
  } catch (err) {
    console.error('[anti-censor] context-menu obfuscation failed:', err);
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').pop() || 'image');
  } catch {
    return 'image';
  }
}

/** Service workers lack URL.createObjectURL; encode the blob as a data URL. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}
