<a href="assets/icons/icon.png"><img src="assets/icons/icon.png" alt="Icono de Bitácora Dev" width="140" height="140" /></a>

# Bitácora Dev

🇪🇸 **Español** · 🇬🇧 [English](README.md)

![HTML](https://img.shields.io/badge/HTML-5-E34F26?logo=html5&logoColor=white) ![Local first](https://img.shields.io/badge/local--first-s%C3%AD-2f8c5b) ![ES%20%2F%20EN](https://img.shields.io/badge/ES%20%2F%20EN-biling%C3%BCe-49a86e)

Un cuaderno de bitácora para proyectos que cambian con el tiempo. La mayoría de las herramientas guardan el estado actual de un proyecto; Bitácora Dev guarda además el camino recorrido para llegar hasta ahí. Organiza el trabajo en **proyectos, versiones, instrucciones y notas, decisiones, tareas pendientes y conversaciones con IA**, de modo que lo que sobrevive no es solo el resultado final, sino también la historia del proyecto.

La aplicación funciona directamente en el navegador y está pensada para trabajar en local. La IA es opcional: el historial, los editores, la búsqueda, las reversiones y la gestión de proyectos siguen funcionando sin un modelo conectado.

<details>
<summary><strong>Contenido</strong></summary>

- [Qué es](#qué-es)
- [Ventajas](#ventajas)
- [Compatibilidad](#compatibilidad)
- [Instalación](#instalación)
- [Se lleva bien con Scriptya](#se-lleva-bien-con-scriptya)
- [Cómo funciona](#cómo-funciona)
- [Notas, reversiones y tareas pendientes](#notas-reversiones-y-tareas-pendientes)
- [Asistente de IA](#asistente-de-ia)
- [Configuración](#configuración)
- [Importar y exportar](#importar-y-exportar)
- [Comandos](#comandos)
- [Privacidad](#privacidad)
- [Licencia](#licencia)

</details>

## Qué es

Cada proyecto tiene su propia historia: cada avance significativo se registra como una versión, y cada versión puede explicar qué se hizo, por qué se hizo, qué ocurrió después y qué quedó pendiente. Por ejemplo, en un proyecto de software una versión no tiene por qué ser solo `v1.2`: puede ser la nota que explica por qué se abandonó una librería, qué alternativa se probó y qué queda por resolver. El objetivo no es crear muchas versiones porque sí, sino que las que existen tengan sentido.

Aunque el nombre está pensado para software, la estructura también encaja con un ensayo, una investigación, un trabajo académico, documentación, diseño o cualquier proyecto donde los cambios y las decisiones importen.

![Vista de escritorio de Bitácora Dev](assets/screenshots/es-desktop.png)

🎬 [Ver la demo](assets/demo/demo.mp4)

Cuando un proyecto crece, recordar su estado actual es fácil; lo difícil es recordar **por qué llegó ahí**. Bitácora Dev no solo guarda versiones: guarda la historia del proyecto.

## Ventajas

- **Historial por proyecto.** Cada proyecto reúne sus versiones, notas, tareas pendientes y conversación.
- **Árbol de versiones.** `1.0`, `2.0`, `3.0` se separan visualmente de `1.1`, `1.2`, `2.1`, etc., de modo que las etapas del proyecto se leen de un vistazo. Cualquier versión puede duplicarse para empezar la siguiente nota a partir del mismo texto.
- **Búsqueda.** La búsqueda de proyectos también encuentra contenido de las versiones; la del historial localiza texto dentro de instrucciones y notas.
- **Reversiones sin borrar el historial.** Una versión puede indicar que revierte otra, y ambas siguen formando parte de la historia.
- **Tareas pendientes persistentes.** Añade una tarea a mano, extráelas en bloque del historial con IA, o pide al asistente que añada, confirme o elimine una por su nombre; sea cual sea su origen, cada tarea puede quedar abierta, marcarse como completada o eliminarse.
- **IA contextual.** El asistente consulta la evolución del proyecto, la resume, detecta contradicciones, extrae y gestiona tareas pendientes y responde preguntas sobre decisiones y cambios — trabaja a partir del historial registrado y no genera código nuevo.
- **Análisis semántico de cambios.** Con IA activa, las versiones se comparan y se explica su significado; sin IA, la aplicación no finge que un diff superficial es un análisis semántico.
- **Reescritura de texto.** Selecciona parte de una nota y pide una reescritura profesional, reflexiva, técnica, concisa, tipo sugerencia, o una traducción al inglés.
- **Importación y exportación.** Importa JSON, TXT, Markdown, DOCX y PDF; exporta versiones o proyectos completos como TXT, DOCX o PDF, o exporta la base de datos completa como copia de seguridad en JSON para restaurarla más tarde.
- **Proveedores locales o en la nube.** Usa servicios locales como LM Studio u Ollama, o configura proveedores en la nube compatibles desde el navegador.
- **Local-first.** El núcleo de la aplicación no depende de un backend propio para conservar los proyectos.

## Compatibilidad

- **Entorno:** navegador moderno con JavaScript activado.
- **Núcleo local:** proyectos, versiones, notas, búsqueda, tareas pendientes, reversiones y almacenamiento se gestionan en el navegador.
- **IA:** proveedores locales y en la nube configurados desde **Ajustes**.
- **Documentos:** las funciones de DOCX y PDF cargan sus librerías cuando se necesitan; esas operaciones pueden requerir acceso a los CDN configurados.
- **Proveedores en la nube:** las peticiones salen del navegador directamente y pueden depender de CORS y de las políticas del proveedor.

## Instalación

No hay compilación ni instalación tradicional. Abre `script/bitacora-dev.html` en un navegador moderno.

Para empezar:

1. Haz clic en **+ Proyecto**.
2. Añade un nombre, una descripción y, si quieres, un icono.
3. Crea la primera versión y escribe en **INSTRUCCIONES Y NOTAS** qué estás haciendo y por qué.
4. Crea nuevas versiones cuando haya un avance significativo o una decisión que merezca conservarse — evita crear una por cada edición mínima.

¿Prefieres probar antes con datos ya cargados? `assets/demo/` incluye dos bases de datos independientes y listas para importar (`bitacora-dev-demo-es.json` y `bitacora-dev-demo-en.json`, cada una con sus propios proyectos, versiones, conversaciones y tareas), pensadas para mostrar historiales largos, el árbol de versiones, las reversiones, la reescritura y el análisis con IA. Se importan igual que cualquier archivo: **Importar** → elige el archivo.

## Se lleva bien con Scriptya

[Scriptya](https://github.com/filonux/Scriptya) es otro proyecto de Filonux: un menú que organiza tus scripts en carpetas, los ejecuta con búsqueda difusa y puede convertir cualquiera de ellos —bitacora-dev incluido— en una app independiente con su propio icono, en el menú de aplicaciones o en el escritorio, sin tener que escribir un `.desktop` a mano.

Le puedes apuntar a la carpeta `script/` de este repositorio y lanzar Bitácora Dev desde ahí, o usar `scriptya --icons` para dejarlo instalado como app aparte. Scriptya también lee metadatos opcionales al principio de cada script (nombre para el menú, descripción, si pide confirmación, si necesita `sudo`...); `bitacora-dev.html` todavía no los incluye, pero es un candidato natural para una futura actualización.

## Cómo funciona

La **barra lateral** reúne la identidad del programa, la búsqueda y creación de proyectos, la importación, la exportación, los ajustes y la lista de proyectos (el más reciente primero, cada uno con su icono). El **área principal** gestiona el proyecto seleccionado: el bloque HISTORIAL muestra el número de versiones, la fecha de la última actualización, la búsqueda del historial y el botón para crear una nueva nota — hay uno arriba y otro al final, para que un historial largo no obligue a hacer scroll. El **panel de IA**, a la derecha, es contextual al proyecto abierto.

Un proyecto es el cuaderno en sí —nombre, descripción, icono, historial, conversación y tareas pendientes—, y las versiones son las entradas que va acumulando con el tiempo. Cada versión guarda su número, sus **INSTRUCCIONES Y NOTAS**, sus fechas y, si aplica, una reversión. La vista en árbol separa de un vistazo los grandes hitos (`1.0`, `2.0`, `3.0`) del trabajo incremental dentro de cada uno (`1.1`, `1.2`...), admite formatos como `1`, `1.0`, `1.1` o `v4.1`, y no impone ninguna regla estricta sobre qué cuenta como raíz — esa decisión es tuya:

```text
1.0
    1.1
    1.2
    1.3

2.0
    2.1
    2.2
```

Una versión puede duplicarse en cualquier momento: la app copia sus instrucciones y notas en una nueva entrada añadida al final del historial, con el siguiente número sugerido automáticamente a partir de la última versión actual del proyecto — por ejemplo, mientras `2.1` sea la última versión, duplicarla (o duplicar una versión anterior) sugiere `2.2`.

## Notas, reversiones y tareas pendientes

**INSTRUCCIONES Y NOTAS** no se limita a lo técnico: puede recoger qué había que hacer, qué se decidió, qué se observó, qué problema apareció, qué solución se adoptó y qué queda pendiente — la idea es poder abrir una versión meses después y seguir entendiendo qué estaba pasando.

Cuando se deshace una decisión, no hace falta borrar el historial: cada versión tiene un campo **Revierte** que lista las versiones anteriores del proyecto, así que registrar una reversión es cuestión de un clic y la relación queda registrada (la IA también puede usarla como contexto):

```text
2.1  →  nueva arquitectura
2.2  →  revierte 2.1
```

Las **tareas pendientes** mantienen el trabajo futuro separado del registro histórico. Añade una directamente desde el campo situado encima de la lista, o deja que la IA las genere: la acción «extraer pendientes» lee el historial y añade cada tarea que encuentra — los duplicados que ya estén en la lista se descartan automáticamente — y también puedes pedirle al asistente, de forma directa o con las acciones rápidas de añadir / confirmar / quitar, que añada, complete o elimine una tarea concreta por su nombre. Sea cual sea su origen, cada tarea puede quedar abierta, completarse o eliminarse, y las que vienen de la IA llevan una pequeña etiqueta para distinguirlas de las que escribiste tú.

## Asistente de IA

El panel contextual ofrece acciones rápidas —**resumir el proyecto** (estado, objetivo, última versión y riesgos visibles), **cambios clave entre versiones** (compara las tres más recientes), **detectar contradicciones** (instrucciones incompatibles, decisiones contradictorias, posibles reversiones), **extraer tareas pendientes** y **añadir / confirmar / quitar un pendiente** (cada una deja un mensaje ya redactado en el cuadro de chat, tú solo rellenas la tarea) — o puedes preguntar directamente, por ejemplo «¿qué cambió entre 2.1 y 2.2?» o «¿qué sigue pendiente?». El asistente distingue hechos registrados de inferencias, no inventa información que no esté en el historial y, si le pides código que no está ya en una versión, explica que su función es consultar y organizar la historia del proyecto, no generar código nuevo. Si el historial no cabe en la ventana de contexto del proveedor, recorta las versiones más antiguas y lo indica.

**Analizar cambios** compara dos versiones y, con IA activa, devuelve una explicación semántica —no un simple diff de texto— con un resumen, los cambios relevantes, el impacto o riesgos y una conclusión, empezando siempre por un estado claro: **HAY CAMBIOS**, **SIN CAMBIOS**, **SIN RELACIÓN** o **RESULTADO NO CONCLUYENTE**. El análisis puede guardarse como comentario de la versión, regenerarse (**reanalizar**) o recorrerse con los controles **Anterior** / **Más reciente** si lo repites varias veces; editar la nota de una versión borra automáticamente el análisis guardado, para que nunca quede desactualizado sin avisar.

**Reescribir** deja seleccionar parte de una nota y pedir un estilo —profesional, reflexivo, técnico, conciso, tipo sugerencia o traducción al inglés—; el resultado se puede copiar, aplicar, descartar o refinar con una instrucción adicional antes de aplicarlo.

Sin un proveedor conectado, esta sección se desactiva y lo indica explícitamente; el resto de la aplicación sigue funcionando igual.

## Configuración

**Idioma.** La interfaz funciona en español e inglés y afecta a controles, mensajes, acciones rápidas y herramientas de IA —incluido el nombre de la app, que aparece como «Dev Log» en inglés—. El asistente siempre responde en el idioma de interfaz seleccionado, sin importar el idioma de las notas.

**Proveedores de IA.** Desde **Ajustes** puedes elegir entre LM Studio, Ollama, OpenAI, Anthropic, OpenRouter, xAI/Grok, Groq, Google Gemini o DeepSeek, configurar URL base, modelo y clave, detectar modelos y probar la conexión. Llamar a la API de Anthropic directamente desde el navegador requiere activar su modo de acceso directo compatible con CORS; LM Studio y Ollama normalmente solo necesitan CORS activado en el servidor local. Las claves se guardan en el perfil del navegador.

**Guardado.** Bitácora Dev usa `localStorage` con autoguardado — activado por defecto, con un intervalo configurable (250 ms, 500 ms, 1 s o 2 s), o puedes desactivarlo por completo — además de guardado manual. Si el navegador bloquea el almacenamiento local, avisa de que los cambios solo durarán la sesión — exporta como JSON en ese caso.

**Configuración de la API.** La configuración del proveedor de IA se exporta e importa por separado de la base de datos, y puede protegerse con contraseña (cifrado AES-256, mínimo 6 caracteres) para mantener ambas copias de seguridad independientes.

## Importar y exportar

**Importar:** JSON (restaura la base de datos completa), TXT/Markdown (crea un proyecto a partir de texto), DOCX o PDF (extraen el texto).

**Exportar:** un proyecto o una versión individual como TXT, DOCX o PDF. **Exportar todo** ofrece esos mismos tres formatos combinando todos los proyectos en un archivo, o bien una copia de seguridad completa en JSON — el único formato que Importar puede restaurar.

## Comandos

La paleta de **Comandos** (`Ctrl + K` / `Cmd + K`) da acceso rápido a crear un proyecto, crear una versión, abrir el asistente, abrir Ajustes o exportar.

## Privacidad

Bitácora Dev es local-first: el historial principal vive en el navegador y no requiere un backend propio. Al conectar un proveedor de IA en la nube, las peticiones sí salen del navegador hacia ese proveedor — revisa sus condiciones antes de enviar información sensible. Para un flujo totalmente local, usa LM Studio u Ollama.

## Licencia

Bitácora Dev se distribuye bajo la **Licencia Pública General de GNU v3.0 (GPLv3)**, con el texto completo en el archivo [LICENSE](LICENSE) (también mencionado en **Ajustes**).

© 2026 Filonux.

---

Hecho por **[Filonux](https://github.com/filonux)**.
