const fs = require('fs');

function esc(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function gen(src, out, name) {
  const c = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(out, 'export const ' + name + ': string = `' + esc(c) + '`;\n');
  console.log('generated', out, c.length, 'bytes');
}

gen('node_modules/maplibre-gl/dist/maplibre-gl.js', 'src/assets/maplibreGlJs.ts', 'MAPLIBRE_GL_JS');
gen('node_modules/maplibre-gl/dist/maplibre-gl.css', 'src/assets/maplibreGlCss.ts', 'MAPLIBRE_GL_CSS');
gen('node_modules/pmtiles/dist/pmtiles.js', 'src/assets/pmtilesJs.ts', 'PMTILES_JS');
gen(
  'node_modules/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js',
  'src/assets/maplibreGlLeafletJs.ts',
  'MAPLIBRE_GL_LEAFLET_JS'
);
