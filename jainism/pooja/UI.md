Project: FAQ Multimedia Collection (Multi-lingual)

1. Core Layout Structure

Container: A max-width 1000px chat-style interface.
Cards: Distinct "Question" (Red) and "Answer" (Green) cards.
Content Rows: Paragraphs are structured as .block-row containing:
.block-id: Unique identifier (e.g., A-1.1).
.col-kn: Kannada text column.
.col-en: English text column.
.col-media: Multimedia column (200px width).

2. Multimedia & "One Control" Logic

Global Toggles: User can toggle 🎬 Videos and 📱 QR Codes via header switches. These add show-videos and show-qrs classes to the <body>.
Picture-in-Picture Overlay: When both are active, the QR code (85px) must sit exactly in the bottom-right corner of the video thumbnail.
Scanability: QR code must be 85px for reliable smartphone scanning, especially on printouts.
Smart Expansion: If a paragraph has no media content (empty .col-media), the text columns must expand to fill 100% of the card width to save space.

3. Visual & Aesthetic Rules

Adjacent Borders: Inner block borders (for Shlokas/Notes) must be adjacent to the main card border with no white gap.
Interactive Elements: The reply-excerpt bar must show a pointer (hand) cursor and be non-selectable to signify it is a clickable UI element.
Alignment: Media containers must use line-height: 0 to prevent the common browser "gap" at the bottom of images, ensuring the QR code is perfectly flush.

4. Printing Requirements (Paper Saving)

Compact View: Hide header, search bar, and UI toggles.
Column Preservation: Force text to stay in row format (display: flex) even on paper, but ensure a min-width so words don't break into single characters.
Ink Optimization: Hide media columns for paragraphs that don't have active Video/QR content to reduce total page count.