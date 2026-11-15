import { t } from '../i18n';
// Parameter list and feature coverage, written from the original's public documentation.

const PARAMS: [string, string, string][] = [
  ['--ar 16:9', t('Proporción'), t('Ancho y alto del resultado.')],
  ['--seed 42', t('Semilla'), t('Repite el mismo punto de partida (0–4294967295).')],
  ['--c 20', t('Variedad (chaos)'), t('0–100; Variar empieza a redibujar antes.')],
  ['--r 3', t('Repetir'), t('Ejecuta el prompt varias veces (hasta 40).')],
  [t('{rojo, verde}'), t('Permutaciones'), t('Un prompt por cada opción (anidables, también en parámetros).')],
  [t('espacio::2 barco'), t('Multi-prompt y pesos'), t('Cada segmento con peso distinto de 1 se aplica con un slider de concepto (modo attention o weight_norm en la página ComfyUI); 1 = tal cual, los pesos ≤ 0 se ignoran. MOSS y Anima llegan hasta 1.5.')],
  ['--hd / --sd', t('Resolución'), t('HD genera directamente a más megapíxeles: H3 1/4/16 MP (borrador/SD/HD), MOSS 1/2/5, Anima siempre 1.')],
  ['--draft', t('Borrador'), t('Imágenes pequeñas y rápidas (o el botón del rayo).')],
  ['--anima / --moss', t('Modelo'), t('Imagina con Anima o MOSS Image en vez de H3 Image; todo lo que parte de una imagen sigue en H3 Image.')],
  [t('--sref código'), t('Código de estilo'), t('Un número que mezcla siempre los mismos estilos (nodos Style Code de H3, MOSS y Anima); varios con pesos: --sref 123 456::0.5; --sref random elige uno nuevo. Solo al crear imágenes, no al editar.')],
  ['--sw 100', t('Peso del estilo'), t('Fuerza de --sref: 100 es la normal (1.5 en el nodo), 0 lo apaga, máximo ~266.')],
  ['--iw 1.5', t('Peso de imagen'), t('Cuánto sigue el prompt de imagen (0–3): <0.5 solo inspiración, 1 referencia de tema, composición y color, >1.5 muy fiel.')],
  ['--cw 50', t('Peso del personaje'), t('Con una imagen en «Personaje (--cref)»: 0–30 solo la cara, 31–70 cara, pelo y complexión, 71–100 también la ropa (por defecto 100). En H3 va al mejorador de prompt; con --anima usa SnapRef y --cw es su fidelidad.')],
  ['--p / --p ID', t('Personalización'), t('Aplica tus perfiles y moodboards predeterminados, o uno concreto; se guarda como código de versión.')],
  ['--tile', t('Mosaico'), t('Se pasa como {{tile}}; vista de patrón al abrir la imagen.')],
  ['--video', t('Vídeo'), t('Crea un vídeo en vez de imágenes.')],
  ['--motion low|high', t('Movimiento'), t('Cantidad de movimiento del vídeo.')],
  ['--loop', t('Bucle'), t('El vídeo termina en su fotograma inicial.')],
  ['--bs 1|2|4', t('Lote de vídeo'), t('Vídeos por prompt.')],
  ['--v / --niji / --stealth / --public', t('Aceptados'), t('Se aceptan y se muestran, pero no cambian nada aquí.')],
];

const DONE = [
  t('Explorar: tu galería de imágenes y vídeos (recientes, aleatorio, me gusta, búsqueda por prompt) y estilos --sref'),
  t('Explorador de estilos: códigos --sref con vista previa real (H3, prompt de vista previa configurable) y la mezcla de estilos de cada uno; descubrir, me gusta, usados, probar y copiar --sref'),
  t('Atajos al pasar el ratón: usar imagen, usar prompt, buscar parecidas, me gusta'),
  t('Barra de imaginar: prompt de imagen, referencia de estilo, fotograma inicial y final, bucle, describir, fijar imágenes'),
  t('Ajustes: proporción, variedad, SD/HD, imágenes por creación (1–4, una tras otra), vídeo SD/HD, lote y movimiento'),
  t('Modo borrador: imágenes pequeñas y rápidas; «Mejorar», Variar y Remezclar las regeneran a tamaño completo. Ctrl+Enter mantiene el prompt'),
  t('Modo conversacional: describes tu idea (escrita o por voz) y un LLM local (GGUF) escribe y ejecuta el prompt; luego pides cambios o «variación de la imagen 2». El modelo se carga para cada mensaje y se descarga al terminar'),
  t('Personalizar: perfiles que aprenden de muestras de estilos reales (códigos --sref); un perfil es la mezcla de sus mejores códigos; global y adicionales, --p, predeterminados; los «me gusta» de Explorar › Estilos lo afinan'),
  t('Crear: progreso en directo, atajos (me gusta, variar, animar, papelera), repetir, usar, ejecutar en HD'),
  t('Acciones: variar, ampliar, remezclar sutil/fuerte, desplazar, alejar, editor, animar (auto, bucle, manual), usar, describir'),
  t('Vídeo (MiniMax H3 con Pika Flex, siempre con audio; el mejorador escribe el prompt con la guía oficial): texto→vídeo, imagen→vídeo, fotograma final, bucle, hasta 9 imágenes de referencia (Ref2VA), alargar (auto/manual, hasta 4 veces, PrefixStream) y ampliar ×2 (RelayVSR)'),
  t('Editor: borrar y restaurar con pincel, mover/escalar, cambiar proporción, deshacer/rehacer, prompt de edición; Retexturizar (misma estructura, otros materiales, luz y estilo)'),
  t('Organizar: filtros, carpetas (y crear dentro de ellas), papelera, selección múltiple, línea de tiempo, búsquedas guardadas'),
  t('Carpetas: grupos de carpetas, renombrar, descargar, mover a grupo, borrar, arrastrar imágenes y menú de clic derecho (Añadir a… / Quitar de…)'),
  t('Moodboards: crear, añadir imágenes (subir, URL o de tus creaciones), renombrar, borrar, usar con --p, predeterminados y botón de personalización'),
  t('Creador de estilos: muestras de códigos al azar generadas con tu prompt; cada 4 elegidas, una ronda con los códigos mezclados (--sref a b c d); atajos de teclado, probar y guardar estilos'),
  t('Más opciones: copiar prompt/semilla/ID/URL, descargar, buscar parecidas, repetir en HD'),
];

const MISSING = [
  t('Tareas (valorar imágenes a cambio de tiempo de GPU)'),
  t('Selección inteligente y capas del editor'),
  t('Tareas, perfiles públicos, suscripciones, pagos y Discord'),
  t('Descargar vídeos como GIF o «para redes»: se descarga el archivo que genere ComfyUI'),
  t('--tile con el workflow integrado: ComfyUI básico no tiene mosaico; usa un workflow propio con {{tile}}'),
];

export function Help() {
  return (
    <div className="page">
      <h1>{t('Ayuda')}</h1>
      <p className="lead">{t('Parámetros que entiende la barra de imaginar y qué partes del original incluye esta web.')}</p>
      <div className="card">
        <h2>{t('Parámetros')}</h2>
        <p className="hint" style={{ marginBottom: 8 }}>
          {t('Van siempre al final del prompt, separados por un espacio y sin comas:')} <code>{t('un faro bajo la aurora --ar 16:9 --c 20')}</code>
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
        <h2>{t('Incluido')}</h2>
        <ul className="check-list">
          {DONE.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>{t('Aún no incluido')}</h2>
        <ul className="miss-list">
          {MISSING.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
