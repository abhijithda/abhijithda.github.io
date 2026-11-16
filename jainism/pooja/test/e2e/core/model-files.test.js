const { test, expect } = require('@playwright/test');

// Saving the on-device model's cached files to a folder and loading them back, with the browser's REAL Cache API
// and a REAL folder handle (the origin-private file system: the same FileSystemDirectoryHandle interface that
// showDirectoryPicker() returns, but reachable without a picker dialog, which automation can't click).
// The unit tests (ai/engines/model-files.test.js) cover every refusal with fakes; this checks that the real
// browser objects behave the way the code assumes: Response bodies stream into a writable file, files read
// back as File objects, and a Response built from a File can be put into the cache and matched by address.
//
// It uses a small stand-in "model" (a few files, one of 20 MB so streaming is exercised), not the real
// download: the real thing is several GB and comes from servers this test shouldn't depend on.

const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

test.describe('model files: save to a folder, load back into the cache', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(async () => {
            for (const name of await caches.keys()) if (name.startsWith('webllm/')) await caches.delete(name);
            const root = await navigator.storage.getDirectory();
            try { await root.removeEntry('pooja-model-test', { recursive: true }); } catch (_) {}
        });
    });

    test('round trip with real browser objects', async ({ page }) => {
        test.setTimeout(60000);
        const result = await page.evaluate(async MODEL_ID => {
            const m = await import('/ai/engines/model-files.js');
            const record = {
                model_id: MODEL_ID,
                model: `https://huggingface.co/mlc-ai/${MODEL_ID}`,
                model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
            };
            const { modelUrl } = m.locations(record);
            const BIG = 20 * 1024 * 1024;
            const big = new Uint8Array(BIG);
            for (let i = 0; i < BIG; i += 4093) big[i] = (i / 4093) % 251;
            const put = async (scope, url, body) => (await caches.open(m.SCOPES[scope])).put(new Request(url), new Response(body));
            await put('config', modelUrl + 'mlc-chat-config.json', JSON.stringify({ ok: true }));
            await put('model', modelUrl + 'ndarray-cache.json', JSON.stringify({ records: [{ dataPath: 'params_shard_0.bin', nbytes: BIG }, { dataPath: 'params_shard_1.bin', nbytes: 3 }] }));
            await put('model', modelUrl + 'params_shard_0.bin', big);
            await put('model', modelUrl + 'params_shard_1.bin', new Uint8Array([7, 8, 9]));
            await put('model', modelUrl + 'tokenizer.json', '{"t":1}');
            await put('wasm', record.model_lib, new Uint8Array([0, 97, 115, 109]));

            const root = await navigator.storage.getDirectory();
            const dir = await root.getDirectoryHandle('pooja-model-test', { create: true });
            const out = {};

            out.before = (await m.cachedState(record, caches)).complete;
            const saved = await m.saveModelsToFolder({ models: [{ modelId: MODEL_ID, record }], dir, caches });
            out.saved = saved.saved;
            out.savedBytes = saved.bytes;
            out.manifestOnDisk = (await (await dir.getFileHandle(m.MANIFEST_NAME)).getFile()).size > 0;
            out.shardOnDisk = (await (await (await dir.getDirectoryHandle(`${MODEL_ID}-model`)).getFileHandle('params_shard_0.bin')).getFile()).size;

            // The browser's data is cleared.
            for (const name of await caches.keys()) if (name.startsWith('webllm/')) await caches.delete(name);
            out.cleared = (await m.cachedState(record, caches)).reason;

            // Loading the folder puts everything back.
            const lookup = id => (id === MODEL_ID ? record : null);
            const loaded = await m.loadModelsFromFolder({ source: m.folderSource(dir), recordFor: lookup, caches });
            out.restored = loaded.restored;
            out.after = (await m.cachedState(record, caches)).complete;

            // Read back the way WebLLM does: match by address, as a Response.
            const model = await caches.open(m.SCOPES.model);
            const shard = new Uint8Array(await (await model.match(new Request(modelUrl + 'params_shard_0.bin'))).arrayBuffer());
            out.shardIntact = shard.length === BIG && shard[4093] === big[4093] && shard[BIG - 1] === big[BIG - 1];
            out.configJson = await (await (await caches.open(m.SCOPES.config)).match(new Request(modelUrl + 'mlc-chat-config.json'))).json();
            out.wasm = [...new Uint8Array(await (await (await caches.open(m.SCOPES.wasm)).match(new Request(record.model_lib))).arrayBuffer())];

            // A damaged weight file is refused and nothing is put back.
            for (const name of await caches.keys()) if (name.startsWith('webllm/')) await caches.delete(name);
            const handle = await (await dir.getDirectoryHandle(`${MODEL_ID}-model`)).getFileHandle('params_shard_1.bin');
            const w = await handle.createWritable(); await w.write(new Uint8Array([7])); await w.close();
            try { await m.loadModelsFromFolder({ source: m.folderSource(dir), recordFor: lookup, caches }); out.damaged = 'loaded'; }
            catch (e) { out.damaged = e.message; }
            out.cacheAfterRefusal = (await caches.keys()).filter(n => n.startsWith('webllm/') && n !== 'webllm/').length;
            return out;
        }, MODEL_ID);

        expect(result.before).toBe(true);
        expect(result.saved).toEqual([MODEL_ID]);
        expect(result.savedBytes).toBeGreaterThan(20 * 1024 * 1024);
        expect(result.manifestOnDisk).toBe(true);
        expect(result.shardOnDisk).toBe(20 * 1024 * 1024);
        expect(result.cleared).toBe('not downloaded');
        expect(result.restored).toEqual([MODEL_ID]);
        expect(result.after).toBe(true);
        expect(result.shardIntact).toBe(true);
        expect(result.configJson).toEqual({ ok: true });
        expect(result.wasm).toEqual([0, 97, 115, 109]);
        expect(result.damaged).toMatch(/not the size/);
        expect(result.cacheAfterRefusal).toBe(0);
    });
});
