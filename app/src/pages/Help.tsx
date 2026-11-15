// Parameter list and feature coverage, written from the original's public documentation.

const PARAMS: [string, string, string][] = [
  ['--ar 16:9', 'Proporción', 'Ancho y alto del resultado.'],
  ['--no texto', 'Excluir', 'Va al prompt negativo.'],
  ['--seed 42', 'Semilla', 'Repite el mismo punto de partida (0–4294967295).'],
  ['--s 250', 'Estilización', '0–1000; con H3 Image por ahora solo se pasa a tus workflows como {{stylize}}.'],
  ['--c 20', 'Variedad (chaos)', '0–100; Variar empieza a redibujar antes.'],
  ['--w 100', 'Rareza (weird)', '0–3000; se pasa a tus workflows como {{weird}}.'],
  ['--raw', 'Modo raw', 'Se pasa a tus workflows como {{mode}}.'],
  ['--q 2', 'Calidad', 'Se pasa a tus workflows como {{quality}}.'],
  ['--r 3', 'Repetir', 'Ejecuta el prompt varias veces (hasta 40).'],
  ['{rojo, verde}', 'Permutaciones', 'Un prompt por cada opción (anidables, también en parámetros).'],
  ['espacio::2 barco', 'Multi-prompt y pesos', 'Se convierte a la sintaxis (texto:peso) de ComfyUI; pesos negativos van al negativo.'],
  ['--hd / --sd', 'Resolución', 'HD genera directamente a más megapíxeles (4 MP con H3 Image).'],
  ['--draft', 'Borrador', 'Imágenes pequeñas y rápidas (o el botón del rayo).'],
  ['--anima / --moss', 'Modelo', 'Imagina con Anima o MOSS Image en vez de H3 Image; todo lo que parte de una imagen sigue en H3 Image.'],
  ['--fast / --relax / --turbo', 'Velocidad', 'Se pasa a tus workflows como {{speed}}.'],
  ['--sref código', 'Código de estilo', 'Añade las palabras de ese estilo (pestaña Estilos de Explorar).'],
  ['--sw 100', 'Peso del estilo', 'Se pasa a tus workflows como {{style_weight}}.'],
  ['--iw 1.5', 'Peso de imagen', 'Se pasa a tus workflows como {{image_weight}}.'],
  ['--p / --p ID', 'Personalización', 'Aplica tus perfiles y moodboards predeterminados, o uno concreto; se guarda como código de versión.'],
  ['--tile', 'Mosaico', 'Se pasa como {{tile}}; vista de patrón al abrir la imagen.'],
  ['--video', 'Vídeo', 'Crea un vídeo en vez de imágenes.'],
  ['--motion low|high', 'Movimiento', 'Cantidad de movimiento del vídeo.'],
  ['--loop', 'Bucle', 'El vídeo termina en su fotograma inicial.'],
  ['--bs 1|2|4', 'Lote de vídeo', 'Vídeos por prompt.'],
  ['--v / --niji / --p / --stealth / --public', 'Aceptados', 'Se aceptan y se muestran, pero no cambian nada aquí.'],
];

const DONE = [
  'Explorar: Para ti, Aleatorio, En tendencia, Top (hoy/semana/mes), Me gusta, búsqueda, imágenes y vídeos',
  'Explorador de estilos: populares, aleatorios, me gusta, probar estilo y copiar --sref',
  'Atajos al pasar el ratón: usar imagen, usar prompt, buscar parecidas, me gusta',
  'Barra de imaginar: prompt de imagen, referencia de estilo, fotograma inicial y final, bucle, describir, fijar imágenes',
  'Ajustes: proporción, estilización, rareza, variedad, SD/HD, raw, imágenes por creación (1–4, una tras otra), vídeo SD/HD, lote y movimiento',
  'Modo borrador: imágenes pequeñas y rápidas; «Mejorar», Variar y Remezclar las regeneran a tamaño completo. Ctrl+Enter mantiene el prompt',
  'Modo conversacional: describes tu idea (escrita o por voz) y se escribe y ejecuta el prompt; luego pides cambios o «variación de la imagen 2»',
  'Personalizar: perfil global que se desbloquea eligiendo imágenes, perfiles adicionales, códigos --p, predeterminados; los «me gusta» de Explorar lo afinan',
  'Crear: progreso en directo, atajos (me gusta, variar, animar, papelera), repetir, usar, ejecutar en HD',
  'Acciones: variar, ampliar, remezclar sutil/fuerte, desplazar, alejar, editor, animar (auto, bucle, manual), usar, describir',
  'Vídeo: texto→vídeo, imagen→vídeo, fotograma final, bucle, alargar (auto/manual, hasta 4 veces)',
  'Editor: borrar y restaurar con pincel, mover/escalar, cambiar proporción, deshacer/rehacer, prompt de edición',
  'Organizar: filtros, carpetas (y crear dentro de ellas), papelera, selección múltiple, línea de tiempo, búsquedas guardadas',
  'Carpetas: grupos de carpetas, renombrar, descargar, mover a grupo, borrar, arrastrar imágenes y menú de clic derecho (Añadir a… / Quitar de…)',
  'Moodboards: crear, añadir imágenes (subir, URL o de tus creaciones), renombrar, borrar, usar con --p, predeterminados y botón de personalización',
  'Creador de estilos: elegir muestras, rondas que crean códigos --sref, vistas previas, atajos de teclado, probar y guardar estilos',
  'Más opciones: copiar prompt/semilla/ID/URL, descargar, buscar parecidas, repetir en HD',
];

const MISSING = [
  'Modo conversacional con IA de verdad: el integrado usa reglas sencillas en el navegador; para un LLM añade tu workflow en la página ComfyUI («Modo conversacional»)',
  'Tareas (valorar imágenes a cambio de tiempo de GPU)',
  'Selección inteligente y capas del editor',
  'Tareas, perfiles públicos, suscripciones, pagos y Discord',
  'Descargar vídeos como GIF o «para redes»: se descarga el archivo que genere ComfyUI',
  'Describir y vídeo con los workflows integrados: por ahora necesitan un workflow propio',
  '--tile con el workflow integrado: ComfyUI básico no tiene mosaico; usa un workflow propio con {{tile}}',
];

export function Help() {
  return (
    <div className="page">
      <h1>Ayuda</h1>
      <p className="lead">Parámetros que entiende la barra de imaginar y qué partes del original incluye esta web.</p>
      <div className="card">
        <h2>Parámetros</h2>
        <p className="hint" style={{ marginBottom: 8 }}>
          Van siempre al final del prompt, separados por un espacio y sin comas: <code>un faro bajo la aurora --ar 16:9 --s 250</code>
        </p>
        <div className="table-wrap">
          <table className="params-table">
            <tbody>
              {PARAMS.map(([p, n, d]) => (
                <tr key={p}>
                  <td>
                    <code>{p}</code>
                  </td>
                  <td>{n}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>Incluido</h2>
        <ul className="check-list">
          {DONE.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>Aún no incluido</h2>
        <ul className="miss-list">
          {MISSING.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
