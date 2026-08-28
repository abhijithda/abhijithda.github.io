// Used by babel-jest only (unit tests). The browser loads these files
// directly as native ES modules via <script type="module">, so this has
// no effect on the shipped site — it only lets Jest's CommonJS `require()`
// understand the `import`/`export` syntax in book-view.js, header.js, and
// continuous-view.js when tests pull them in.
module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
};
