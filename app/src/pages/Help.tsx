// Parameter list and feature coverage, written from the original's public documentation.

const PARAMS: [string, string, string][] = [
  ['--ar 16:9', 'Proporción', 'Ancho y alto del resultado.'],
  ['--seed 42', 'Semilla', 'Repite el mismo punto de partida (0–4294967295).'],
  ['--c 20', 'Variedad (chaos)', '0–100; Variar empieza a redibujar antes.'],
  ['--r 3', 'Repetir', 'Ejecuta el prompt varias veces (hasta 40).'],
  ['{rojo, verde}', 'Permutaciones', 'Un prompt por cada opción (anidables, también en parámetros).'],
  ['espacio::2 barco', 'Multi-prompt y pesos', 'Cada segmento con peso distinto de 1 se aplica con un slider de concepto (modo attention o weight_norm en la página ComfyUI); 1 = tal cual, los pesos ≤ 0 se ignoran. MOSS y Anima llegan hasta 1.5.'],
  ['--hd / --sd', 'Resolución', 'HD genera directamente a más megapíxeles: H3 1/4/16 MP (borrador/SD/HD), MOSS 1/2/5, Anima siempre 1.'],
  ['--draft', 'Borrador', 'Imágenes pequeñas y rápidas (o el botón del rayo).'],
  ['--anima / --moss', 'Modelo', 'Imagina con Anima o MOSS Image en vez de H3 Image; todo lo que parte de una imagen sigue en H3 Image.'],
  ['--sref código', 'Código de estilo', 'Un número que mezcla siempre los mismos estilos (nodos Style Code de H3, MOSS y Anima); varios con pesos: --sref 123 456::0.5; --sref random elige uno nuevo. Solo al crear imágenes, no al editar.'],
  ['--sw 100', 'Peso del estilo', 'Fuerza de --sref: 100 es la normal (1.5 en el nodo), 0 lo apaga, máximo ~266.'],
  ['--iw 1.5', 'Peso de imagen', 'Cuánto sigue el prompt de imagen (0–3): <0.5 solo inspiración, 1 referencia de tema, composición y color, >1.5 muy fiel.'],
  ['--cw 50', 'Peso del personaje', 'Con una imagen en «Personaje (--cref)»: 0–30 solo la cara, 31–70 cara, pelo y complexión, 71–100 también la ropa (por defecto 100). En H3 va al mejorador de prompt; con --anima usa SnapRef y --cw es su fidelidad.'],
  ['--p / --p ID', 'Personalización', 'Aplica tus perfiles y moodboards predeterminados, o uno concreto; se guarda como código de versión.'],
  ['--tile', 'Mosaico', 'Se pasa como {{tile}}; vista de patrón al abrir la imagen.'],
  ['--video', 'Vídeo', 'Crea un vídeo en vez de imágenes.'],
  ['--motion low|high', 'Movimiento', 'Cantidad de movimiento del vídeo.'],
  ['--loop', 'Bucle', 'El vídeo termina en su fotograma inicial.'],
  ['--bs 1|2|4', 'Lote de vídeo', 'Vídeos por prompt.'],
  ['--v / --niji / --stealth / --public', 'Aceptados', 'Se aceptan y se muestran, pero no cambian nada aquí.'],
];

const DONE = [
  'Explorar: tu galería de imágenes y vídeos (recientes, aleatorio, me gusta, búsqueda por prompt) y estilos --sref',
  'Explorador de estilos: códigos --sref con vista previa real (H3, prompt de vista previa configurable) y la mezcla de estilos de cada uno; descubrir, me gusta, usados, probar y copiar --sref',
  'Atajos al pasar el ratón: usar imagen, usar prompt, buscar parecidas, me gusta',
  'Barra de imaginar: prompt de imagen, referencia de estilo, fotograma inicial y final, bucle, describir, fijar imágenes',
  'Ajustes: proporción, variedad, SD/HD, imágenes por creación (1–4, una tras otra), vídeo SD/HD, lote y movimiento',
  'Modo borrador: imágenes pequeñas y rápidas; «Mejorar», Variar y Remezclar las regeneran a tamaño completo. Ctrl+Enter mantiene el prompt',
  'Modo conversacional: describes tu idea (escrita o por voz) y un LLM local (GGUF) escribe y ejecuta el prompt; luego pides cambios o «variación de la imagen 2». El modelo se carga para cada mensaje y se descarga al terminar',
  'Personalizar: perfiles que aprenden de muestras de estilos reales (códigos --sref); un perfil es la mezcla de sus mejores códigos; global y adicionales, --p, predeterminados; los «me gusta» de Explorar › Estilos lo afinan',
  'Crear: progreso en directo, atajos (me gusta, variar, animar, papelera), repetir, usar, ejecutar en HD',
  'Acciones: variar, ampliar, remezclar sutil/fuerte, desplazar, alejar, editor, animar (auto, bucle, manual), usar, describir',
  'Vídeo: texto→vídeo, imagen→vídeo, fotograma final, bucle, alargar (auto/manual, hasta 4 veces)',
  'Editor: borrar y restaurar con pincel, mover/escalar, cambiar proporción, deshacer/rehacer, prompt de edición; Retexturizar (misma estructura, otros materiales, luz y estilo)',
  'Organizar: filtros, carpetas (y crear dentro de ellas), papelera, selección múltiple, línea de tiempo, búsquedas guardadas',
  'Carpetas: grupos de carpetas, renombrar, descargar, mover a grupo, borrar, arrastrar imágenes y menú de clic derecho (Añadir a… / Quitar de…)',
  'Moodboards: crear, añadir imágenes (subir, URL o de tus creaciones), renombrar, borrar, usar con --p, predeterminados y botón de personalización',
  'Creador de estilos: muestras de códigos al azar generadas con tu prompt; cada 4 elegidas, una ronda con los códigos mezclados (--sref a b c d); atajos de teclado, probar y guardar estilos',
  'Más opciones: copiar prompt/semilla/ID/URL, descargar, buscar parecidas, repetir en HD',
];

const MISSING = [
  'Tareas (valorar imágenes a cambio de tiempo de GPU)',
  'Selección inteligente y capas del editor',
  'Tareas, perfiles públicos, suscripciones, pagos y Discord',
  'Descargar vídeos como GIF o «para redes»: se descarga el archivo que genere ComfyUI',
  'Vídeo con los workflows integrados: por ahora necesita un workflow propio',
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
