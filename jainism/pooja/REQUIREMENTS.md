# Jaina Pooja FAQ — User Requirements

This document captures requirements and design decisions from the product owner,
in their own words, from the development conversation.

---

## General

- Building a Jain FAQ website from repo https://github.com/abhijithda/abhijithda.github.io
- The code is inside jainism/pooja folder
- Segregate the continuous view and the book view code in the "book" branch
- Fix regressions in continuous view first — it was branched out of master which has clean continuous view

---

## Continuous View

- Two column kn and en view (Kannada left, English right)
- Header related CSS should be in header only
- Need to reload previous settings
- The view-toggle CSS belongs in header.css (it's a header element)
- Keep the header same for both/all views
- The page has become dynamic size. Width is fixed, but the height keeps changing. I would like it to be fixed as well.
- No search for book view? Would it be difficult - if so let's skip for now, and can revisit later once this is final.

---

## Book View — Layout

- I would like to view both pages on the screen (two-page spread)
- Width is fixed, height should be fixed as well
- Keep the header same for both views
- No search for book view? Let's skip for now
- Print view should print the entire book, not just the current page

### Image pages
- Standalone images (such as first image) will have dedicated page
- Make it occupy full page (keeping proper aspect ratio)
- Only standalone images (if item type is image) should be at the center of the page. Not the block images that belong to Question / Answer or any other item type.
- Non-image items with image blocks - don't need to be centered. Expand them to full size keeping the aspect ratio, and continue filling the page.
- Image items - just keep image and captions only in the page.

### Card splitting and page filling
- No need to keep the card in one page. When I add stories, one card could span multiple pages.
- I would like to see contents take up the entire page.
- Not worried about card split. It can continue to next page.
- We could split them at the individual element of the english or kannada content list.
- Even if one line of one lang can fit, we should pull it in... consider 10+ langs getting selected by user.

### Color coding
- Keep the same background color as that of continuous view. I liked those.
- Shloka and mantra borders are missing. I'm thinking, those background colors could be kept as they're special.
- Similar to header line, can we have footer line?

---

## Language Picker

- If too many langs get added, then we can't show them all. Should we stick to current drop down selection of langs? Maybe tick/select few from the dropdown list?
- Existing lang picker in settings could be updated for this functionality. I would like to keep the header same for both/all views.
- Could keep adding more langs like Tamil, Hindi...

### Clarification (AI asked, user answered):
**Q: Recommendation on lang picker UI?**
A: Exactly right — a dropdown with multi-select checkboxes is the right pattern. One control, scales to any number of languages, and the selected ones stack in the card (kn → separator → en → separator → ta → ...).

---

## Media — Video & QR Codes

- Need to show videos/QR-code & images as well
- Showing QR-code small that cannot be scanned properly doesn't make sense at all
- How would multiple videos appear? Maybe show QR-code next to video?
- I don't think we need "Scan to watch" text below QR-code

### Clarification (AI asked, user answered):
**Q: Video thumbnail size — 80px wide feels right for a half-page column. Agree?**
A: (Accepted — then revised after seeing it was too large)

**Q: When only QR is shown (no video thumb), should the QR be a bit larger?**
A: (No separate QR-only mode needed — QR always appears next to video)

**Q: Images from `images` blocks — same inline strip treatment, or a full-width treatment within the card?**
A: If we're not making photo and text content not appear in same row... make it as big as appropriate considering physical page constraints.

**Q: For really long blocks that don't fit on a page — should they continue onto the next page (split mid-card), or stay whole and push to the next page entirely?**
A: Not worried about card split. It can continue to next page. And it doesn't have to split mid-card, it should make sure to fill the current page before going to new page.

---

## Jump to Page

- Jump to page option like Acrobat?!

---

## Print

- Print view shows only one - current page... I was expecting entire book will be printed with that!
- Read ticks should be visible in print so that one can carry the progress from laptop to printouts

---

## Captions

- Some images have only Kannada captions!
- Captions are expected to be right below image, but now they're at the bottom of the page
- I've checked that the captions are present in both langs in data.json, but missing for those images (both langs should always show)

---

## CSS Architecture

- Could we modularise CSS — so that definition in one view doesn't affect the other?
- How about switching the CSS file load based on the view selection (maybe via JS)?
- Card types contain both/all views? Shouldn't they be segregated? Or, is this the preferred way? (I think, after checking it, I'm liking this though!)

---

## Settings

- Settings should be identical for both views (same header, same dropdown)
- Lang picker moves into Settings dropdown (not a separate element in header)

---

## Book View — Navigation

- Prev / Next buttons
- Jump to page like Acrobat (page number input box)
- Keyboard navigation (arrow keys, page up/down)

---

## Read Tracking

- Keep read ticks in book view. They can disable in settings if they don't want.
- Read progress should show in print view so that one can carry the progress from laptop to printouts

---

## Pending / Deferred

- Search in book view — skipped for now, can revisit later
- Additional languages (Tamil, Hindi) — needs translation data added to data.json first
- Stories spanning multiple cards/pages — card splitting already supports this
