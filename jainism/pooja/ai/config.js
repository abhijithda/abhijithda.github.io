// ai/config.js — The few values to edit when deploying the assistant.

// Cloud engine: URL of your proxy (see ai/proxy/worker.js and ai/proxy/README.md).
// It holds the API key; the browser never does. Leave empty and "Cloud" stays
// disabled in Settings, with an explanation. After deploying the proxy, paste
// the URL it printed, e.g. 'https://pooja-ai-proxy.<your-subdomain>.workers.dev'.
export const CLOUD_ENDPOINT = 'https://pooja-ai-proxy.abhijith-da.workers.dev';

// Local engine: runs in the browser on WebGPU through WebLLM.
// Loaded only when the reader picks "Local", from a CDN, pinned to an exact
// version. All six model ids below were checked against the model list inside
// WebLLM 0.2.79 itself; re-check them whenever WEBLLM_URL's version changes,
// because WebLLM's list changes and nothing verifies it at build time.
export const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';

// The three sizes a reader can choose (setting `aiLocalModel`, ids in core/settings.js).
//  model   : the normal build (half-precision shaders).
//  compat  : the f32 build of the same model, used when the f16 build's shaders
//            fail to compile on a reader's GPU/driver ("compatibility mode",
//            see engines/local.js). Larger download, more graphics memory.
//  size    : rough one-time download, shown to the reader before they pick it.
//  gpu     : rough graphics memory needed while it runs (from WebLLM's own
//            figures for the f16 build, rounded up).
export const LOCAL_TIERS = {
    small:  { label: 'Small',  model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', compat: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', size: 'about 1 GB', gpu: 'about 2 GB' },
    medium: { label: 'Medium', model: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',   compat: 'Qwen2.5-3B-Instruct-q4f32_1-MLC',   size: 'about 2 GB', gpu: 'about 3 GB' },
    large:  { label: 'Large',  model: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',   compat: 'Qwen2.5-7B-Instruct-q4f32_1-MLC',   size: 'about 5 GB', gpu: 'about 6 GB' },
};
// The small tier under its older names (the default, and what older code and tests refer to).
export const LOCAL_MODEL_ID = LOCAL_TIERS.small.model;
export const LOCAL_MODEL_ID_COMPAT = LOCAL_TIERS.small.compat;
export const LOCAL_MODEL_SIZE_HINT = LOCAL_TIERS.small.size;
// Cache that WebLLM keeps its compiled model code in. A stale copy (left by an
// older WebLLM version) is one known cause of load failures; cleared on retry.
export const WEBLLM_WASM_CACHE = 'webllm/wasm';

export const MAX_ANSWER_TOKENS = 600;
