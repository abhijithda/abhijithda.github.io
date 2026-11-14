// ai/engines/index.js — Picks the engine for the Settings choice.
// Engines are created once and reused (the local one keeps its loaded model).

import { createCloudEngine } from './cloud.js';
import { createLocalEngine } from './local.js';

const cache = {};

/** @param {'cloud'|'local'} name @returns {Object|null} null for 'off' or unknown */
export function getEngine(name) {
    if (name !== 'cloud' && name !== 'local') return null;
    return cache[name] ||= (name === 'cloud' ? createCloudEngine() : createLocalEngine());
}
