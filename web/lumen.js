import { app } from '../../scripts/app.js';

// Lumen opens over the ComfyUI window, not in a new one: app-style windows block window.open.
// Closing only hides it, so jobs that are running keep being followed.
let overlay;

function close() {
    overlay.style.display = 'none';
}

function open() {
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#000';
        const frame = document.createElement('iframe');
        frame.src = '/lumen/imagine';
        frame.title = 'Lumen';
        frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
        const button = document.createElement('button');
        button.textContent = '✕';
        button.title = 'Volver a ComfyUI (Esc)';
        button.style.cssText = 'position:absolute;top:10px;right:14px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer';
        button.onclick = close;
        overlay.append(frame, button);
        document.body.append(overlay);
        frame.addEventListener('load', () => frame.contentWindow.addEventListener('keydown', (e) => e.key === 'Escape' && !e.defaultPrevented && close()));
    }
    overlay.style.display = 'block';
}

app.registerExtension({
    name: 'Lumen.Open',
    commands: [{ id: 'Lumen.Open', label: 'Open Lumen', icon: 'pi pi-sparkles', function: open }],
    menuCommands: [{ path: ['Lumen'], commands: ['Lumen.Open'] }],
    setup() {
        app.extensionManager.registerSidebarTab({
            id: 'lumen', icon: 'pi pi-sparkles', title: 'Lumen', tooltip: 'Lumen', type: 'custom',
            render(container) {
                const button = document.createElement('button');
                button.textContent = 'Abrir Lumen';
                button.style.cssText = 'display:block;width:calc(100% - 32px);margin:16px;padding:10px 14px;border:0;border-radius:8px;background:#e8e8e8;color:#111;font-weight:600;cursor:pointer';
                button.onclick = open;
                container.replaceChildren(button);
            },
        });
    },
});
