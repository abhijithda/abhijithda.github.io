const { updateMediaVisibility } = require('./script');

describe('Display Options', () => {
    let toggleVideos, toggleQrs;

    beforeEach(() => {
        document.body.innerHTML = `
            <input type="checkbox" id="toggleVideos">
            <input type="checkbox" id="toggleQrs">
        `;
        toggleVideos = document.getElementById('toggleVideos');
        toggleQrs = document.getElementById('toggleQrs');
        
        // Mock global variables if they are used directly in script.js
        global.toggleVideos = toggleVideos;
        global.toggleQrs = toggleQrs;
    });

    test('should toggle show-videos class on body when checkbox is clicked', () => {
        toggleVideos.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(true);

        toggleVideos.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(false);
    });

    test('should toggle show-qrs class on body when checkbox is clicked', () => {
        toggleQrs.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(true);

        toggleQrs.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(false);
    });
});

describe('updateMediaVisibility', () => {
    let toggleVideos, toggleQRs;

    beforeEach(() => {
        document.body.innerHTML = `
            <input type="checkbox" id="toggle-videos">
            <input type="checkbox" id="toggle-qrs">
        `;
        toggleVideos = document.getElementById('toggle-videos');
        toggleQRs = document.getElementById('toggle-qrs');
        document.body.className = '';
    });

    test('should toggle show-videos class based on checkbox state', () => {
        toggleVideos.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(true);

        toggleVideos.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(false);
    });

    test('should toggle show-qrs class based on checkbox state', () => {
        toggleQRs.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(true);

        toggleQRs.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(false);
    });
});
