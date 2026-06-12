# Presentation Templates

Built-in presentation templates live in their own folder:

```txt
templates/presentation/
  studio-clean/
    index.ts
```

Each folder is a template bundle. A bundled template should export a skin: the app reuses the same presentation engine and only the skin changes layout positions, colors, typography, and available modules.

Add assets next to `index.ts` when a template needs images, fonts, or other local files. Register the template in `templates/presentation/index.ts` so the app includes it in the Huphe template picker.

Admin-uploaded templates are still stored separately, because those are user-managed templates rather than bundled app templates.
