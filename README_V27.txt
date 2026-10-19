PORTFOLIO FRANCO NICOSIA — V27

Base: V26 publicada.
Objetivo de esta versión: migrar únicamente los 3 reels de la escena 04 desde URLs externas a archivos locales del proyecto, conservando diseño, interacción y orden visual.

Cambios:
- Reel 01 (centro): Assets/videos/1.mp4
- Reel 02 (izquierda): Assets/videos/2.mp4
- Reel 03 (derecha): Assets/videos/3.mp4
- Posters locales WebP para que las portadas estén disponibles aunque el video todavía no haya cargado.
- Se mantienen los mismos data-reel-src / data-open-reel y el reproductor existente; sólo cambian las rutas a archivos locales.
- Build/cache: 27.0.0

IMPORTANTE SOBRE LOS VIDEOS:
Los archivos recibidos eran demasiado grandes para un deploy GitHub -> Cloudflare Pages. Se generaron copias de despliegue H.264/AAC, 720x1280, 30 fps, manteniendo el contenido completo y la proporción 9:16. Cada archivo queda por debajo del límite de 25 MiB de Cloudflare Pages.

Tamaños aproximados:
- 1.mp4: 20.5 MB
- 2.mp4: 10.9 MB
- 3.mp4: 12.6 MB

No se modificaron las escenas 01, 02 ni 03, ni el layout/estilos de la escena 04.
