// Sonda de Atlas: cuántas lecturas por segundo da la base de datos sin pasar por la API. Sirve para separar el techo de
// la base de datos (y de la red hasta ella) del de la aplicación: si aquí 100 lectores en paralelo ya se quedan en ~100
// lecturas/s, ninguna ruta de la API puede superar ese ritmo multiplicado por sus consultas.
//
//   node tests/medidas/sonda-atlas.mjs [--duracion=10]
//
// Lee un único documento por _id en una BD desechable (BarberPlan_sonda_test), que borra al terminar.
import { URI_PRUEBAS, exigirBaseDePruebas } from "../entorno.mjs"; // carga el .env de la API y fija la conexión de pruebas
import { MongoClient } from "./mongodb-api.mjs";

const argumentos = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "true"] = a.slice(2).split("="); return [k, v]; }));
const DURACION_S = Number(argumentos.duracion) || 10;

const cliente = new MongoClient(URI_PRUEBAS);
await cliente.connect();
const bd = cliente.db(exigirBaseDePruebas("BarberPlan_sonda_test"));
try {
    await bd.dropDatabase();
    const { insertedId } = await bd.collection("lecturas").insertOne({ a: 1 });

    const ping = [];
    for (let i = 0; i < 10; i++) {
        const inicio = performance.now();
        await bd.command({ ping: 1 });
        ping.push(performance.now() - inicio);
    }
    console.log(`Ida y vuelta a Atlas (ping): ${(ping.reduce((s, x) => s + x, 0) / ping.length).toFixed(0)} ms de media\n`);

    for (const lectores of [1, 10, 100]) {
        let lecturas = 0;
        const latencias = [];
        const fin = Date.now() + DURACION_S * 1000;
        await Promise.all(Array.from({ length: lectores }, async () => {
            while (Date.now() < fin) {
                const inicio = performance.now();
                await bd.collection("lecturas").findOne({ _id: insertedId });
                latencias.push(performance.now() - inicio);
                lecturas++;
            }
        }));
        latencias.sort((a, b) => a - b);
        console.log(`${String(lectores).padStart(3)} lectores en paralelo: ${(lecturas / DURACION_S).toFixed(0)} lecturas/s, latencia media ${(latencias.reduce((s, x) => s + x, 0) / latencias.length).toFixed(0)} ms, p99 ${latencias[Math.floor(latencias.length * 0.99)].toFixed(0)} ms`);
    }
} finally {
    await bd.dropDatabase();
    await cliente.close();
}
