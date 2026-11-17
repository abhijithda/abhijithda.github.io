# abhijithda.github.io

Source of <https://abhijithda.github.io/> - Abhijith D.A.'s personal site.

Plain static files served directly by GitHub Pages (Jekyll is turned off by `.nojekyll`). There is no build step.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Home page |
| `404.html` | Not-found page |
| `assets/` | Shared CSS, JS and images for the home page (Bootstrap 4.3.1, jQuery) |
| `jainism/pooja/` | Jain Pooja F.A.Q.s web app - see [its README](jainism/pooja/README.md) |
| `to-migrate/` | Old notes and media waiting to move to the new site; see its README |
| `.github/workflows/` | CI, print-PDF publishing and AI-proxy deploy workflows (GitHub only reads workflows from here) |

## Preview locally

```
python -m http.server 8000
```

Then open <http://localhost:8000/>.

## Pooja app: tests

```
cd jainism/pooja
npm ci
npm test
```

CI (`.github/workflows/ci.yml`) runs the same on every push and pull request.
