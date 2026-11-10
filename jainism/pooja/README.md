# F.A.Q.s Collection

## Vison

A Jain Pooja (or confusing Jainism Concepts related to that) F.A.Q.s style based website - where a question would be answered, and then follow-up questions on parts of those answers could be asked. In other words, a topic would be shared, and follow-ups questions will be asked, or more follow-up details will be added emphasizing the points of the previous ones.

The information I've gathered is over-time, and I expect one to follow to similar pattern!!! Not expecting anyone to complete this entire content in one day! But rather keep coming back to read and continue. 
So, I kind of somewhat like to present topics and follow-ups not grouped together, but rather present in interleaved fashion i.e., rather than consolidating similar topics now, I like to keep it spread out. This probably re-emphasizes what was said earlier, and gives times to one to think about it and come back, and/or remember previously discussed points even after changing the topics. I believe this'll kind of help solidify one on those topics.

1. One may like to read in their own language of choice, and/or maybe take printouts in multiple (maybe 2 or 3 ) languages to share it with others.
2. All the reference videos are linked to emphasize the content.
3. Shloka, Mantra, Notes would also accompany.
4. A follow-up question could be actually be referring to 1, 2 or more previous topics asking how can those be happenning? (Like, if this is the case, then how can that be?), or a follow-up answer could address multiple items.
5. Part of an answer could be followed up (say when there are multiple points/paras).
6. Same item could be have multiple followups over a period of time.
7. Add in images (and maybe with captions, or maybe few words describing about that). Include stories like Manatunga acharya story that came up as an example to one of the questions. Similarly, there'll be few stories not part of any follow-up, but that later would lead to follow-ups/questions!
8. In future, we may want to create a book out of this content. Maybe, even on web, we can provide a way to read it like a book. (Maybe Manga way (don't mean opposite direction page flipping. Just book format - pages n all)?!)
9. One should be able to take printouts of any view they like. I.e., maybe they like author of the video, so just include thumbnail (along with contents ofcourse), or just QR-code to scan and watch videos, or have both (in PIP format?). Let user choose what they like. Even the web-view can have customization of columns/items that they want to see, so we should have some customization/settings button.
10. The videos will play on youtube (almost every video is from youtube), and users can keep track of what or how much they've watched those videos. And probably good to get into their YT history so that they get recommendations in future ! :) )
11. The content is like going to be static, or not expecting much change. Maybe I'll or a group of people will update. But users of this site are mainly readers.
12. User may want to come back to where they had stopped reading. (Or maybe, provide completed reading option like in hellointerview website?). One could probably authenticate with github or google, or just use browser caching, or maybe both!. 
13. Include timestamps of when it was added. (Helps me at the least).
14. In web-view I should be able to see what's the follow-up for, so an excerpt (that can be expanded in place?) attached to the follow-up in a Whatsapp reply style would be great. (Not talking about Whatsapp theme, colors or styling. Just the reply-excerpt giving the content, and having ability to jump to that context to read more).
15. I also want to include photos/images that are kind of randomly inserted without relevant to a topic (and not attached to a topic, and could be treated as separate topic if required, and could have follow-ups much later!). Some may be like my grandparents or parents photos, and some related to Jain Idols. (Some images will be related to follow-up, but not all of them.)
16. NOTE: The data that was parsed from Google Docs/pdfs is in json format, but the Docs/Pdfs is still not organized. I.e., it starts out randomly. So, the starting point still needs to be updated, and need to add some context - maybe like preface in a book?!. (But those will come much later. Should I say low priority due to time & energy constraints?!)
nitially I got  Print mode implemented  to show QR-code only without videos, and later removed it so that I can take printouts in different ways to share it with others who need it probably differently. (Older people may not scan QR-code, and may just want to see the thumbnail!)

### UI

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


## Offline use and link preview

### Offline use

`sw.js` is a service worker that lets the book be opened with no signal after
one visit on a good connection. What it does:

- **Saves the app itself.** On install it crawls `index.html` → its `<script>`
  and `<link>` tags → every module each script imports → every `url()` in the
  CSS, and saves all of it plus `data.json`. There is no file list to maintain;
  a new module is picked up the next time the worker updates.
- **Saves the pictures.** After activating, it saves every image `data.json`
  uses, one at a time. A missing image is reported but never breaks the rest.
- **Shows progress on Home.** One line under the progress counter: *Saving a
  copy…*, *Ready to use offline*, *Offline copy incomplete*, or *You're offline —
  showing the copy saved on this device*.
- **Online readers always get the latest.** Pages, scripts, styles and
  `data.json` are network-first; the saved copy is used when offline or when
  the network does not answer within 3 seconds. After one timeout the saved
  copy is used straight away for 30 seconds (otherwise each file in the page's
  load chain would wait its own 3 seconds).
- **Leaves other sites alone.** YouTube thumbnails and the QR-code service are
  not saved, so offline they show as empty boxes; videos need a connection anyway.

Things to know:

- A device has to open the site **once online** (and stay on Home until the
  line says *Ready*). That is the whole setup.
- **iPhone/iPad:** Safari may delete a website's saved data after about a week
  of not using it (unless the site is added to the Home Screen). Offline can
  therefore quietly disappear for someone who opens the book rarely.
- Change `VERSION` at the top of `sw.js` to make every device discard its saved
  copy and download everything again. Normal content changes don't need it.
- It only runs over https or `localhost`, and is skipped under automation
  (Playwright, Puppeteer, `scripts/render-prints.js`) so it can't interfere with
  mocked requests or print rendering. Tests that need it open `/?sw=on`
  (`test/e2e/core/offline.test.js`).
- To reset while developing: DevTools → Application → Service Workers →
  *Unregister*, and Storage → *Clear site data*.

### Link preview (WhatsApp, Facebook, Telegram, X)

The `<meta property="og:…">` tags in `index.html` give shared links a title,
description and picture, using `images/og-image.jpg` (1200×630, about 160 KB: WhatsApp
may ignore images much over ~300 KB). Chat apps read these tags from the raw
HTML and never run JavaScript, so they can't be generated in the browser. The
only address that has to be written out is the one in `og:image`, which must be
an absolute https URL (`https://abhijithda.github.io/jainism/pooja/images/og-image.jpg`).
If the site moves, change that one line. `og:url` is left out on purpose
(optional), and X reuses the `og:` title, description and image.

Chat apps remember a link's preview. After changing `images/og-image.jpg` or the text,
an already-shared link can keep the old preview for days; sharing the link with
a changed ending (`…/pooja/?v=2`) shows the new one straight away.
