const { renderChat } = require('./script.js');

describe('Jaina Pooja FAQ - UI Rendering Logic', () => {
  let container;

  beforeEach(() => {
    // Provide a fresh, empty DOM container for every row
    container = document.createElement('div');
  });

  // 1. Define the test slice
  const testCases = [
    {
      name: 'Renders Kannada and English',
      lang: 'all',
      mockBlocks: [{
        id: "test_b_1", type: "paragraph",
        content: { kn: ["ಕನ್ನಡ ಪಠ್ಯ"], en: ["English Text"] },
        tags: [], videos: [], images: []
      }],
      // The specific assertions for this row
      assert: (dom) => {
        expect(dom.innerHTML).toContain('ಕನ್ನಡ ಪಠ್ಯ');
        expect(dom.innerHTML).toContain('English Text');
      }
    },
    {
      name: 'Renders Kannada and not English',
      lang: 'kn',
      mockBlocks: [{
        id: "test_b_1", type: "paragraph",
        content: { kn: ["ಕನ್ನಡ ಪಠ್ಯ"], en: ["English Text"] },
        tags: [], videos: [], images: []
      }],
      // The specific assertions for this row
      assert: (dom) => {
        expect(dom.innerHTML).toContain('ಕನ್ನಡ ಪಠ್ಯ');
        expect(dom.innerHTML).not.toContain('English Text');
      }
    },
    {
      name: 'Renders English and not Kannada',
      lang: 'en',
      mockBlocks: [{
        id: "test_b_1", type: "paragraph",
        content: { kn: ["ಕನ್ನಡ ಪಠ್ಯ"], en: ["English Text"] },
        tags: [], videos: [], images: []
      }],
      // The specific assertions for this row
      assert: (dom) => {
        expect(dom.innerHTML).toContain('English Text');
        expect(dom.innerHTML).not.toContain('ಕನ್ನಡ ಪಠ್ಯ');
      }
    },
    {
      name: 'Renders [Watch Video] links and QR codes',
      lang: 'all',
      mockBlocks: [{
        id: "test_b_2", type: "paragraph",
        content: { kn: [], en: [] },
        videos: [{ url: "https://youtu.be/dQw4w9WgXcQ", youtubeId: "dQw4w9WgXcQ" }],
        images: []
      }],
      assert: (dom) => {
        const videoLink = dom.querySelector('a');
        expect(videoLink).not.toBeNull();
        expect(videoLink.href).toBe('https://youtu.be/dQw4w9WgXcQ');

        const qrCode = dom.querySelector('.qr-code img');
        expect(qrCode).not.toBeNull();
        expect(qrCode.src).toContain('api.qrserver.com');
      }
    },
    {
      name: 'Renders personal images correctly based on language selection',
      lang: 'kn',
      mockBlocks: [{
        id: "test_b_3", type: "paragraph",
        content: { kn: [], en: [] },
        videos: [],
        images: [{ src: "family-photo.jpg", caption: { kn: "ನನ್ನ ಫೋಟೋ", en: "My Photo" } }]
      }],
      assert: (dom) => {
        const img = dom.querySelector('img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toBe('images/family-photo.jpg');
        
        const caption = dom.querySelector('.image-caption');
        expect(caption.innerHTML).toBe('ನನ್ನ ಫೋಟೋ');
      }
    }
  ];

  // 2. Execute the table
  // Jest automatically injects the row data into the destructured parameters
  test.each(testCases)('✓ $name', ({ lang, mockBlocks, assert }) => {
    
    // Arrange: Build the standard JSON wrapper expected by your function
    const mockData = [{
      id: "q_test",
      type: "question",
      blocks: mockBlocks
    }];

    // Act: Execute the UI rendering
    renderChat(mockData, container, lang);

    // Assert: Run the row-specific validation callback
    assert(container);
  });
});