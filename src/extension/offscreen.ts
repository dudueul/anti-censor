import { processVideo } from '../adapters/video';
import { loadSettings, settingsToPipelineOptions } from './settings';

/**
 * Offscreen document worker. The MV3 service worker has no DOM, so it cannot run
 * the video adapter (which decodes via an <video> element). This offscreen page —
 * a chrome-extension:// origin, hence a secure context with WebCodecs — receives
 * a video URL, transforms it, and returns a data URL the background page can
 * hand to chrome.downloads.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'video') return undefined;
  void (async () => {
    try {
      const settings = await loadSettings();
      const resp = await fetch(msg.srcUrl);
      const blob = await resp.blob();
      const out = await processVideo(blob, settingsToPipelineOptions(settings));
      sendResponse({ ok: true, dataUrl: await blobToDataUrl(out) });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep the message channel open for the async response
});

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}
