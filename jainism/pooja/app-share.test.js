// app-share.test.js — Boots the real app.js against the real data.json in jsdom: a share link must show
// only what was shared (nothing leading elsewhere, none of the visitor's saved state touched), and a normal
// page load must be unchanged.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));

function boot(hash) {
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  window.history.replaceState(null, '', '/pooja/' + hash);
  global.fetch = jest.fn(async () => ({ json: async () => data }));
  Element.prototype.scrollIntoView = jest.fn();
  window.scrollTo = jest.fn();
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  jest.isolateModules(() => { require('./app.js'); });
  return new Promise(r => setTimeout(r, 50));
}

beforeEach(() => localStorage.clear());

test('share link to one block of an answer: only that block, its label, its question, no way out', async () => {
  const answer = data.find(i => i.type === 'answer' && i.blocks.length > 2 && (i.references || []).length);
  const block = answer.blocks[1];
  await boot('#/s/' + block.id);
  expect(document.body.classList.contains('shared-view')).toBe(true);
  expect(document.getElementById('shared-bar').hidden).toBe(false);
  const c = document.getElementById('continuous-container');
  expect(c.style.display).toBe('flex');
  expect(c.querySelectorAll('.card > .block-row')).toHaveLength(1);
  expect(c.querySelector('.reply-excerpt')).not.toBeNull();
  expect(c.querySelector('.card > .block-row .block-id').innerText).toMatch(/^[A-Z]-\d+\.\d+$/);
  expect(document.querySelectorAll('a[href]').length).toBe(0);               // nothing links anywhere
  // never touches the visitor's own saved state
  ['lastScreen', 'viewMode', 'scrollPosition', 'readBlocks'].forEach(k => expect(localStorage.getItem(k)).toBeNull());
});

test('share link to a whole item shows every block of it', async () => {
  const answer = data.find(i => i.type === 'answer' && i.blocks.length > 2);
  await boot('#/s/' + answer.id);
  expect(document.querySelectorAll('#continuous-container .card > .block-row')).toHaveLength(answer.blocks.length);
});

test('a link that matches nothing says so, and still shows nothing else', async () => {
  await boot('#/s/zzzzzz');
  expect(document.querySelector('.shared-empty')).not.toBeNull();
  expect(document.querySelectorAll('.card')).toHaveLength(0);
});

test('normal page load is unchanged: Home shows, share icons exist once a view opens', async () => {
  await boot('');
  expect(document.body.classList.contains('shared-view')).toBe(false);
  expect(document.getElementById('home-view').style.display).toBe('block');
  document.getElementById('home-open-continuous').click();
  await new Promise(r => setTimeout(r, 20));
  expect(document.querySelectorAll('#continuous-container .share-btn').length).toBeGreaterThan(100);
  document.querySelector('#continuous-container .block-row .share-btn').click();
  expect(document.querySelector('.share-sheet')).not.toBeNull();
  expect(document.getElementById('share-link').value).toMatch(/#\/s\/[a-z][a-z0-9]{5}$/);
});
