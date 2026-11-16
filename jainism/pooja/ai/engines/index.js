// ai/engines/index.js — Picks the engine for the Settings choice.
// Engines are created once and reused (the local one keeps its loaded model).

import { LOCAL_TIERS } from '../config.js';
import { loadSettings } from '../../core/settings.js';
import { createCloudEngine } from './cloud.js';
import { createCustomEngine } from './custom.js';
import { createLocalEngine } from './local.js';
import { createLocalServerEngine } from './local-server.js';

const cache = {};

/**
 * @param {'cloud'|'local'} name  the Settings choice; 'cloud' is this site's assistant or the reader's own service,
 *                                 depending on the "cloud source" setting; 'local' is a model in this browser or one
 *                                 on this computer (a local model server), depending on the "local source" setting
 * @returns {Object|null} null for 'off' or unknown
 */
export function getEngine(name) {
    if (name === 'cloud') {
        // Read on every call, so switching between the two in Settings applies at once.
        if (loadSettings().aiCloudSource === 'own') {
            // Reads the reader's service details on every call, so editing them applies at once.
            return cache.custom ||= createCustomEngine({ getConfig: () => loadSettings().aiCustom });
        }
        return cache.cloud ||= createCloudEngine();
    }

    if (name === 'local') {
        // A model already on this computer, through Ollama / LM Studio: no download, no graphics memory of its own.
        if (loadSettings().aiLocalSource === 'server') {
            // The browser model (if one was loaded) is released, so the two never hold memory at once.
            if (cache.local) { cache.local.engine.dispose?.(); cache.local = null; }
            return cache.localServer ||= createLocalServerEngine({ getConfig: () => loadSettings().aiLocalServer });
        }
        const tier = loadSettings().aiLocalModel;
        const t = LOCAL_TIERS[tier] || LOCAL_TIERS.small;
        const id = LOCAL_TIERS[tier] ? tier : 'small';
        if (cache.local?.tier !== id) {
            // Only one on-device model is kept in graphics memory: a 7B model next to a
            // 1.5B one could be the difference between working and a crash.
            cache.local?.engine.dispose?.();
            cache.local = { tier: id, engine: createLocalEngine({ modelId: t.model, compatModelId: t.compat }) };
        }
        return cache.local.engine;
    }
    return null;
}
