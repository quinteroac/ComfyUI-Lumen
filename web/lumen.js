import { app } from '../../scripts/app.js';

const open = () => window.open('/lumen/imagine', 'lumen');

app.registerExtension({
    name: 'Lumen.Open',
    commands: [{ id: 'Lumen.Open', label: 'Open Lumen', icon: 'pi pi-sparkles', function: open }],
    menuCommands: [{ path: ['Lumen'], commands: ['Lumen.Open'] }],
});
