const fs = require('fs');
const path = require('path');

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        file = path.join(dir, file);
        if (fs.statSync(file).isDirectory()) walk(file);
        else if (file.endsWith('.tscn')) {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (line.includes('type="ColorRect"')) {
                    console.log(file + ':' + (i + 1) + ' ' + line.trim());
                }
            });
        }
    });
}
walk('client/scenes');
