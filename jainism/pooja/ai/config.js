// ai/config.js — The few values to edit when deploying the assistant.

// Cloud engine: URL of your proxy (see ai/proxy/worker.js). It holds the API
// key; the browser never does. Leave empty and "Cloud" stays disabled in
// Settings, with an explanation.
export const CLOUD_ENDPOINT = '';

// Local engine: runs in the browser on WebGPU through WebLLM.
// Loaded only when the reader picks "Local", from a CDN, pinned to an exact
// version. NOTE: verify that this version and model id still exist before
// deploying (WebLLM's model list changes) — they are not checked at build time.
export const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';
export const LOCAL_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export const LOCAL_MODEL_SIZE_HINT = 'about 1 GB';

export const MAX_ANSWER_TOKENS = 600;
