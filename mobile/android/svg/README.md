# AndroidSVG Canvas renderer

AndroidSVG 1.4 source from the official Maven source archive. `upstream.json` records its SHA-256 and every original Java file hash. Apache License 2.0; upstream copyright headers are retained. The optional SVGImageView is excluded because Zyra draws onto a bounded native Canvas.

One compatibility change in SVGParser: setting `FEATURE_PROCESS_DOCDECL` to false may throw when the parser does not support document declarations at all (including Layoutlib's parser). The helper tolerates that exception only if `getFeature` confirms declarations are already disabled. A parser that reports declarations enabled still fails. Unit tests exercise both cases. The app additionally disables internal entity expansion and only loads its own bundled file artwork through this renderer.

This is the same parser and Canvas code for previews and the APK. There is no substitute icon path for screenshots. Remote project SVG artwork requires separate validation and is not enabled by this module.
