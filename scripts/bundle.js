// Gộp mã nguồn + thư viện thành vài file trong thư mục out/ để bản đóng gói không phụ thuộc node_modules
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..'), out = path.join(root, 'out');
const pkg = require('../package.json');
fs.rmSync(out, { recursive: true, force: true });
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], logLevel: 'warning', legalComments: 'none' };
esbuild.buildSync({ ...common, entryPoints: [path.join(root, 'main.js')], outfile: path.join(out, 'main.js') });
esbuild.buildSync({ ...common, entryPoints: [path.join(root, 'engine', 'worker.js')], outfile: path.join(out, 'engine', 'worker.js') });
for (const f of ['preload.js', 'index.html', 'app.js']) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, author: pkg.author, main: 'main.js' }, null, 2));
console.log('bundle ok →', path.relative(root, out));
