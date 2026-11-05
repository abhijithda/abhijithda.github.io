# Printing the book

You get two kinds of PDF for the **Book** view, plus the **Continuous** view.
In every file name, **A4 / A3 is the sheet of paper you print on.**

| File | What it is | Use it for |
|---|---|---|
| `…-Booklet-A4-….pdf` | Pages arranged on **A4 landscape sheets** in booklet order | **Print this one** to make a folded **A5 book** |
| `…-Booklet-A3-….pdf` | Pages arranged on **A3 landscape sheets** | Print this one to make a folded **A4 book** |
| `…-Book-A4-….pdf` | One numbered **A5 page** per PDF page | Reading on a screen; printing with your printer's own "Booklet" mode |
| `…-Book-A3-….pdf` | One numbered **A4 page** per PDF page | Same, for A4 books |
| `…-Continuous-A4/A3-….pdf` | Whole-page, scrolling layout | Reading or printing loose pages (not for binding) |

## Making a folded booklet (recommended)

1. Open the **Booklet** PDF.
2. Print **double-sided**, choose **Flip on SHORT edge**.
3. Set scale to **100% / Actual size**. Do **not** choose "Fit to page".
4. Take the printed stack, keep it in order, and **fold it in half**. Pages come out in order, odd pages on the right.

Short books (up to 24 pages) are one stack: fold them together and staple along the fold.
Longer books are automatically split into **signatures of 16 pages (4 sheets)**.
Fold each signature separately, nest the sheets, then sew or glue the signatures together at the spine.
The last signature may include a few blank pages so every sheet is full.

Page numbers are printed bottom-centre; the title page has none.
Each page has a wider **inner (binding) margin** on the fold side, so text isn't lost in the spine.

## Printing without a booklet

If you only want single pages (loose-leaf, a ring binder, or a print shop), use the **Book** PDF.
If your printer's dialog has its own **Booklet** option, you can also use the Book PDF with that.

## Printing straight from the browser

Printing the Book view from Chrome ("Save as PDF") gives the single-page **Book** layout: A5 pages when the paper size setting is Dynamic or A4, and A4 pages for A3.
To turn that PDF into a printable booklet:

```
npm run impose:booklet -- path/to/book.pdf
npm run impose:booklet -- path/to/book.pdf out.pdf --sheets-per-signature=6
```

`--sheets-per-signature=0` forces one single stack however long the book is.

## Photo rules (applied automatically)

- A photo keeps its shape. It is never stretched or squashed.
- It uses the full column width when it has enough pixels to print sharply, but never taller than one page.
- It is never enlarged past **150 dpi**, so a small or low-resolution photo prints smaller and sharp instead of big and blurry.
  For a full-width A5 column (about 120mm) a photo needs roughly **720 px** across.
  For a full-width A4 column (about 178mm) it needs roughly **1050 px**.
- A photo and its captions stay together on one page.

The numbers live in the CSS as `--min-dpi` and `--img-cap` (see `views/book/book-view.css` and `views/continuous/continuous-view.css`).

## Checking a PDF yourself

```
pdfimages -list your.pdf
```

The last two columns (x-ppi, y-ppi) are each photo's printed resolution.
They should be equal (shape kept) and not much below 150.
