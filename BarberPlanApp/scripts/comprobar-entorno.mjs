// Guardián del build de producción (se ejecuta solo con `npm run build`, mediante «prebuild»): impide publicar la web con los
// marcadores sin rellenar, que dejarían la app apuntando a una API inexistente o con la política de privacidad a medias.
//
//   · src/environments/environment.prod.ts: apiUrl (https, sin marcadores) y los datos del responsable de la política
//   · src/app/pages/privacidad/privacidad.page.html: hosting, región y fecha de eliminación
//
// Marcador = texto entre corchetes en mayúsculas, como [URL-DE-LA-API] o [CORREO DE CONTACTO].
// Para compilar igualmente (por ejemplo, para probar el build en local) define PERMITIR_MARCADORES=1.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --raiz=<carpeta> permite comprobar otra copia del proyecto (lo usa la batería de pruebas de la API)
const argumentoRaiz = process.argv.find((a) => a.startsWith("--raiz="))?.slice("--raiz=".length);
const raiz = argumentoRaiz ? path.resolve(argumentoRaiz) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVOS = ["src/environments/environment.prod.ts", "src/app/pages/privacidad/privacidad.page.html"];
const RE_MARCADOR = /\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.\-/]{3,}\]/g;

const problemas = [];
for (const relativo of ARCHIVOS) {
    const lineas = fs.readFileSync(path.join(raiz, relativo), "utf8").split(/\r?\n/);
    lineas.forEach((linea, i) => {
        // Los comentarios que explican los marcadores no cuentan
        // («//» solo es un comentario si empieza la línea o va tras un espacio: el de https:// no lo es)
        const sinComentario = linea.replace(/(^|\s)\/\/.*$/, "").replace(/<!--.*?-->/g, "");
        for (const marcador of sinComentario.match(RE_MARCADOR) ?? []) {
            problemas.push(`${relativo}:${i + 1}  falta rellenar ${marcador}`);
        }
    });
}

const entorno = fs.readFileSync(path.join(raiz, ARCHIVOS[0]), "utf8");
const apiUrl = entorno.match(/apiUrl:\s*'([^']*)'/)?.[1] ?? "";
if (!apiUrl.startsWith("https://")) {
    problemas.push(`${ARCHIVOS[0]}  apiUrl debe ser una URL https:// (es «${apiUrl}»)`);
}

if (problemas.length > 0 && process.env.PERMITIR_MARCADORES !== "1") {
    console.error("\nNo se compila para producción: hay valores sin rellenar.\n");
    problemas.forEach((p) => console.error(`  - ${p}`));
    console.error("\nCompleta esos valores (ver docs/DESPLIEGUE.md) o, solo para probar el build en local, ejecuta con PERMITIR_MARCADORES=1.\n");
    process.exit(1);
}
if (problemas.length > 0) {
    console.warn(`Aviso: se compila con ${problemas.length} valor(es) sin rellenar (PERMITIR_MARCADORES=1).`);
} else {
    console.log("Entorno de producción comprobado: sin marcadores y con apiUrl https.");
}
