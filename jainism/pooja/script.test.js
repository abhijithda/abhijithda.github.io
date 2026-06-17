const { renderChat } = require('./script.js'); // <-- Update function name here

describe('Jaina Pooja FAQ - UI Rendering Logic', () => {
  let container;

  // This runs before every single test to give us a clean, empty DOM
  beforeEach(() => {
    document.body.innerHTML = '<div id="main-content"></div>';
    container = document.getElementById('main-content');
  });

  test('1. Renders both Kannada and English text correctly', () => {
    const mockData = [{
      id: "q_test_1",
      type: "question",
      blocks: [{
        id: "test_b_1",
        type: "paragraph",
        content: {
          kn: ["ಕನ್ನಡ ಪಠ್ಯ (Kannada Text)"],
          en: ["English Text"]
        },
        tags: [], videos: [], images: []
      }]
    }];

    // Execute your function
    renderChat(mockData, container);

    // Verify the text was injected into the DOM
    expect(container.innerHTML).toContain('ಕನ್ನಡ ಪಠ್ಯ (Kannada Text)');
    expect(container.innerHTML).toContain('English Text');
  });

  test('2. Renders [Watch Video] link when video data is present', () => {
    const expectedVideos = [{ url: "https://youtu.be/dQw4w9WgXcQ", youtubeId: "dQw4w9WgXcQ" }]

    const mockDataWithVideo = [{
      id: "test_002",
      type: "answer",
      blocks: [{
        id: "test_002_b_2",
        type: "paragraph",
        content: { kn: ["..."], en: ["..."] },
        tags: [],
        videos: expectedVideos,
        images: []
      }]
    }];

    renderChat(mockDataWithVideo, container);

    // Verify an anchor tag with the correct YouTube URL was created
    const videoLink = container.querySelector('a');
    expect(videoLink).not.toBeNull();
    expect(videoLink.href).toBe(expectedVideos[0].url);
  });

  test('3. Renders images (e.g., personal photos) correctly', () => {
    const mockDataWithImage = [{
      id: "test_003",
      type: "random",
      blocks: [{
        id: "test_003_b_3",
        type: "paragraph",
        content: { kn: ["..."], en: ["..."] },
        tags: [], videos: [],
        images: [{ src: "family-photo.jpg", caption: { kn: "ನನ್ನ ಫೋಟೋ", en: "My Photo" } }]
      }]
    }];

    renderChat(mockDataWithImage, container);

    // Verify the image tag was created with the correct source
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('images/family-photo.jpg');
  });
});
