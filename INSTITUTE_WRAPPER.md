# U.S. Data Center Ecosystem Tracker — UVA National Security Institute wrapper

The publication-ready wrapper is in `dist/institute/`. It is a standalone static page for the U.S. Data Center Ecosystem Tracker, embedding its three public dashboard views and adding research context, coverage metrics, methodology, and interpretation guidance.

## Preview

After deployment, the wrapper is available at:

`https://ntimbs.github.io/us-data-center-dashboard/institute/`

## Institute website handoff

The Institute web team can use either of these approaches:

1. Copy `dist/institute/index.html`, `styles.css`, and `app.js` into a static page directory. If the page is hosted outside this repository, replace the relative dashboard URLs (`../`, `../hex/`, and `../virginia/`) with the full GitHub Pages URLs.
2. Recreate the narrative sections in the Institute content management system and embed the dashboard with an iframe. A minimal embed is:

```html
<iframe
  src="https://ntimbs.github.io/us-data-center-dashboard/"
  title="U.S. Data Center Ecosystem Tracker"
  loading="lazy"
  style="width:100%;height:820px;border:0;"
  allow="fullscreen">
</iframe>
```

The page uses no build system or JavaScript dependencies. Google Fonts are the only external visual dependency; they can be replaced with the Institute site's font stack if required.
