import { loadSettings, saveSettings, type Settings } from './settings';

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

async function init(): Promise<void> {
  const s = await loadSettings();

  const autoIntercept = $<HTMLInputElement>('autoIntercept');
  const strength = $<HTMLInputElement>('strength');
  const strengthVal = $<HTMLSpanElement>('strengthVal');
  const flipAllowed = $<HTMLInputElement>('flipAllowed');
  const maximize = $<HTMLInputElement>('maximize');
  const stripMetadata = $<HTMLInputElement>('stripMetadata');
  const outputType = $<HTMLSelectElement>('outputType');
  const outputQuality = $<HTMLInputElement>('outputQuality');
  const outputQualityVal = $<HTMLSpanElement>('outputQualityVal');

  autoIntercept.checked = s.autoIntercept;
  strength.value = String(s.strength);
  strengthVal.textContent = s.strength.toFixed(2);
  flipAllowed.checked = s.flipAllowed;
  maximize.checked = s.maximize;
  stripMetadata.checked = s.stripMetadata;
  outputType.value = s.outputType;
  outputQuality.value = String(s.outputQuality);
  outputQualityVal.textContent = s.outputQuality.toFixed(2);

  const persist = (patch: Partial<Settings>) => void saveSettings(patch);

  autoIntercept.addEventListener('change', () =>
    persist({ autoIntercept: autoIntercept.checked }),
  );
  strength.addEventListener('input', () => {
    const v = Number(strength.value);
    strengthVal.textContent = v.toFixed(2);
    persist({ strength: v });
  });
  flipAllowed.addEventListener('change', () =>
    persist({ flipAllowed: flipAllowed.checked }),
  );
  maximize.addEventListener('change', () => persist({ maximize: maximize.checked }));
  stripMetadata.addEventListener('change', () =>
    persist({ stripMetadata: stripMetadata.checked }),
  );
  outputType.addEventListener('change', () =>
    persist({ outputType: outputType.value as Settings['outputType'] }),
  );
  outputQuality.addEventListener('input', () => {
    const v = Number(outputQuality.value);
    outputQualityVal.textContent = v.toFixed(2);
    persist({ outputQuality: v });
  });
}

void init();
