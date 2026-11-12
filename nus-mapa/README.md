# II Afterwork Impulsa't · Mapa de connexions

Web para las interacciones de los asistentes del II Afterwork Impulsa't · «Teixint complicitats» (19/11/2026, Seminari de Tarragona). Diseño adaptado al cartel y a las piezas de redes de Tarragona Impulsa: degradado violeta-magenta, rosa intenso, tramas de puntos, tipografía geométrica (Outfit) y su logo.
La interfaz está en catalán y funciona en el navegador del móvil, sin instalar nada.

## Páginas

| Ruta | Para quién | Qué hace |
| --- | --- | --- |
| `/` | Asistentes | Registro (nom, empresa, sector, comunitat, contacte opcional y consentimiento) y después «El meu QR» (con entrada por código), sus connexions y el programa |
| `/c/XXXX` | Asistentes | Se abre al escanear el QR de otra persona con la cámara del móvil: elige **contacte/cafè** o **proposta de col·laboració** y ve el contacto del otro |
| `/pantalla` | Proyector | Grafo en directo (se actualiza cada 3 s), contadores, leyenda de xarxes y QR de registro. Con la tecla **F** se pone a pantalla completa |
| `/admin` | Organización | Interruptor de la **revelació** (20:00), abrir o cerrar el registro, punto de ayuda en la acogida, lista de personas, exportaciones y borrado RGPD |
| `/cartell` | Imprimir | Cartel A4 con el QR de registro |

Una connexió es mutua: basta con que uno de los dos escanee. Si alguien la marca como col·laboració, pasa a ser col·laboració (nunca baja a cafè).
En la pantalla solo aparecen nom, xarxa y sector. El contacto solo lo ve quien se ha conectado contigo.

## Publicar en Netlify

> El *drag & drop* de Netlify **no** sirve: no despliega funciones con dependencias. Usa una de estas dos vías.

**Opción A · GitHub (recomendada)**
1. Sube esta carpeta a un repositorio de GitHub (sin `node_modules`).
2. Netlify → *Add new site → Import an existing project* → elige el repositorio. La configuración ya la lee de `netlify.toml` (no hace falta comando de build).
3. *Site configuration → Environment variables* → añade `ADMIN_KEY` con una clave larga. Vuelve a desplegar.

**Opción B · Netlify CLI**
```bash
npm install
npx netlify-cli login
npx netlify-cli init            # crea o vincula el site
npx netlify-cli env:set ADMIN_KEY "una-clave-larga"
npx netlify-cli deploy --prod
```

Los datos se guardan en **Netlify Blobs**, que se activa solo; no hay base de datos que configurar.
Opcional: si usas un dominio propio, define `BASE_URL` (por ejemplo, `https://nus.ivanutge.com`) para que los QR apunten siempre a él.

## Probar en local

```bash
npm install
ADMIN_KEY=prova npm run dev     # http://localhost:8888
```
Usa la misma lógica, con los datos en `.local-data.json`.

## Cambiar xarxes, sectores o colores
Edita `lib/config.mjs` y vuelve a desplegar. Los `id` de las xarxes no deben cambiar una vez que haya registros.

## Checklist antes del acto
- [ ] Desplegar, poner `ADMIN_KEY` y abrir `/admin`.
- [ ] Prueba con 3 o 4 móviles (iPhone y Android): registro, escaneo, col·laboració y que aparezca en `/pantalla`.
- [ ] Prueba la **revelació** desde `/admin`.
- [ ] Comprobar la wifi o la cobertura del claustre y el ordenador del proyector (Chrome a pantalla completa con la tecla F).
- [ ] **Borrar los datos de prueba** (escribir `ESBORRAR` en `/admin`).
- [ ] Imprimir `/cartell` para la acogida y el punto de ayuda.

## Después del acto
- Exportar desde `/admin`: `graf.json` y `connexions.csv` (para la memoria) y `seguiment.csv` (para el mensaje a +30 días).
- Cerrar el registro.
- Cuando termine el seguimiento, borrar todos los datos (RGPD).
