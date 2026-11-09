// Prueba de humo de una API desplegada. SOLO LEE: no crea, modifica ni borra nada (el inicio de sesión no escribe).
//
//   npm run humo -- <urlApi> <origenWeb>
//   p. ej. npm run humo -- https://barberplan-api.onrender.com https://barberplan.vercel.app
//
// Para la comprobación del inicio de sesión, la cuenta de prueba va en variables de entorno (no en la línea de comandos,
// que queda en el historial):  HUMO_CORREO  y  HUMO_PW.  Sin ellas, esa comprobación se omite.
// Termina con código 1 si alguna comprobación falla.

const [urlApiBruta, origenWebBruto] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!urlApiBruta || !origenWebBruto) {
    console.error("Uso: npm run humo -- <urlApi> <origenWeb>\n  p. ej. npm run humo -- https://mi-api.onrender.com https://mi-web.vercel.app");
    process.exit(2);
}

const quitarBarraFinal = (url) => url.replace(/\/+$/, "");
const api = quitarBarraFinal(urlApiBruta);
const origenWeb = quitarBarraFinal(origenWebBruto);
const origenAjeno = "https://origen-no-permitido.example";
const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(api);
const PLAZO_ARRANQUE_EN_FRIO_MS = 90_000;
const PLAZO_NORMAL_MS = 20_000;

const resultados = [];
const registrar = (estado, nombre, detalle = "") => {
    resultados.push({ estado, nombre });
    const marca = { OK: "OK      ", FALLO: "FALLO   ", AVISO: "AVISO   ", OMITIDO: "OMITIDO " }[estado];
    console.log(`${marca} ${nombre}${detalle ? `  -> ${detalle}` : ""}`);
};
const comprobar = async (nombre, prueba) => {
    try {
        const { ok, detalle, aviso } = await prueba();
        registrar(ok ? (aviso ? "AVISO" : "OK") : "FALLO", nombre, detalle);
    } catch (error) {
        registrar("FALLO", nombre, `${error.name}: ${error.message}`);
    }
};

const pedir = async (ruta, { metodo = "GET", cabeceras = {}, cuerpo, plazo = PLAZO_NORMAL_MS } = {}) => {
    const inicio = Date.now();
    const respuesta = await fetch(api + ruta, {
        method: metodo,
        headers: { ...(cuerpo !== undefined && { "Content-Type": "application/json" }), ...cabeceras },
        body: cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(plazo)
    });
    const texto = await respuesta.text();
    let datos = null;
    try { datos = JSON.parse(texto); } catch { /* no es JSON */ }
    return { estado: respuesta.status, cabeceras: respuesta.headers, datos, texto, ms: Date.now() - inicio };
};

console.log(`Prueba de humo (solo lectura)\n  API: ${api}\n  Origen de la web: ${origenWeb}\n`);

// 1. Estado: la primera petición puede tardar ~1 min si la instancia dormía (Render gratuito)
await comprobar("Estado de la API: GET / responde 200 con JSON (sin tocar la base de datos)", async () => {
    const r = await pedir("/", { plazo: PLAZO_ARRANQUE_EN_FRIO_MS });
    const ok = r.estado === 200 && typeof r.datos?.message === "string";
    return { ok, aviso: ok && r.ms > 8000, detalle: `${r.estado} en ${(r.ms / 1000).toFixed(1)} s${r.ms > 8000 ? " (arranque en frío: la instancia estaba dormida)" : ""}` };
});

await comprobar("La API va por HTTPS", async () => ({ ok: esLocal || api.startsWith("https://"), detalle: esLocal ? "local (se admite http)" : api }));

await comprobar("Cabeceras de seguridad de la API (nosniff y sin x-powered-by)", async () => {
    const r = await pedir("/");
    return { ok: r.cabeceras.get("x-content-type-options") === "nosniff" && !r.cabeceras.has("x-powered-by"), detalle: `nosniff=${r.cabeceras.get("x-content-type-options")}, x-powered-by=${r.cabeceras.get("x-powered-by") ?? "ausente"}` };
});

// 2. CORS desde la web
await comprobar("CORS: la web puede leer la API (GET /barberias con su Origin)", async () => {
    const r = await pedir("/barberias", { cabeceras: { Origin: origenWeb } });
    const permitido = r.cabeceras.get("access-control-allow-origin");
    return { ok: r.estado === 200 && permitido === origenWeb, detalle: `${r.estado}, Access-Control-Allow-Origin=${permitido ?? "ausente"}` };
});

await comprobar("CORS: la petición previa (OPTIONS) de un inicio de sesión desde la web se acepta", async () => {
    const r = await pedir("/usuarios/login", {
        metodo: "OPTIONS",
        cabeceras: { Origin: origenWeb, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" }
    });
    const permitido = r.cabeceras.get("access-control-allow-origin");
    const cabecerasPermitidas = (r.cabeceras.get("access-control-allow-headers") || "").toLowerCase();
    return {
        ok: r.estado >= 200 && r.estado < 300 && permitido === origenWeb && cabecerasPermitidas.includes("authorization") && cabecerasPermitidas.includes("content-type"),
        detalle: `${r.estado}, origen=${permitido ?? "ausente"}, cabeceras=${cabecerasPermitidas || "ausentes"}`
    };
});

await comprobar("CORS: un origen que no es la web NO recibe permiso", async () => {
    const r = await pedir("/barberias", { cabeceras: { Origin: origenAjeno } });
    const permitido = r.cabeceras.get("access-control-allow-origin");
    return { ok: !permitido, detalle: `Access-Control-Allow-Origin=${permitido ?? "ausente"}` };
});

// 3. Datos públicos
await comprobar("Listado de barberías: 200, lista sin la galería de imágenes", async () => {
    const r = await pedir("/barberias");
    const lista = Array.isArray(r.datos) ? r.datos : null;
    const sinGaleria = lista?.every((b) => !("galeriaTrabajos" in b)) ?? false;
    const kb = Math.round(r.texto.length / 1024);
    return { ok: r.estado === 200 && lista !== null && sinGaleria, aviso: kb > 1024, detalle: `${r.estado}, ${lista?.length ?? "?"} barberías, ${kb} KB${kb > 1024 ? " (más de 1 MB: revisa el peso de las imágenes)" : ""}` };
});

// 4. Limitador y proxy
await comprobar("Limitador de peticiones: la API informa de su límite", async () => {
    const r = await pedir("/");
    const limite = r.cabeceras.get("x-ratelimit-limit") ?? r.cabeceras.get("ratelimit-limit");
    const restantes = r.cabeceras.get("x-ratelimit-remaining") ?? r.cabeceras.get("ratelimit-remaining");
    return { ok: Boolean(limite), detalle: `límite=${limite ?? "ausente"}, restantes=${restantes ?? "ausente"}` };
});

await comprobar("TRUST_PROXY: un X-Forwarded-For inventado NO da un contador propio (no se puede esquivar el límite)", async () => {
    const restantes = [];
    for (const ip of ["203.0.113.11", "203.0.113.22", "203.0.113.33"]) {
        const r = await pedir("/", { cabeceras: { "X-Forwarded-For": ip } });
        restantes.push(Number(r.cabeceras.get("x-ratelimit-remaining") ?? r.cabeceras.get("ratelimit-remaining")));
    }
    // Con un solo contador, cada petición deja menos que la anterior; con un contador por cabecera inventada, todos serían iguales
    const decrecen = restantes.every((n, i) => Number.isFinite(n) && (i === 0 || n < restantes[i - 1]));
    return { ok: decrecen, detalle: `restantes: ${restantes.join(" -> ")}` };
});

// 5. Cuenta de prueba
const correo = process.env.HUMO_CORREO;
const pw = process.env.HUMO_PW;
let token = null;
if (!correo || !pw) {
    registrar("OMITIDO", "Inicio de sesión con la cuenta de prueba", "define HUMO_CORREO y HUMO_PW para comprobarlo");
} else {
    await comprobar("Inicio de sesión con la cuenta de prueba: 200 con token (no escribe nada)", async () => {
        const r = await pedir("/usuarios/login", { metodo: "POST", cuerpo: { correo, pw } });
        token = r.datos?.token ?? null;
        return { ok: r.estado === 200 && typeof token === "string" && r.datos?.user?.rol !== undefined, detalle: `${r.estado}, rol=${r.datos?.user?.rol ?? "?"}` };
    });
    if (token) {
        await comprobar("Con el token: GET /usuarios/perfil -> 200 sin contraseña", async () => {
            const r = await pedir("/usuarios/perfil", { cabeceras: { Authorization: `Bearer ${token}` } });
            return { ok: r.estado === 200 && r.datos?.correo === String(correo).trim().toLowerCase() && !("pw" in (r.datos ?? {})), detalle: `${r.estado}` };
        });
    }
}

await comprobar("Sin token: GET /usuarios/perfil -> 401", async () => {
    const r = await pedir("/usuarios/perfil");
    return { ok: r.estado === 401, detalle: `${r.estado}` };
});

// 6. Errores sin detalles internos
await comprobar("Errores: ruta inexistente -> 404 JSON { error } y JSON mal formado -> 400 sin pila", async () => {
    const noExiste = await pedir("/ruta-que-no-existe");
    const malFormado = await pedir("/usuarios/login", { metodo: "POST", cuerpo: "{ esto no es json" });
    const limpio = (r) => !/\bat .*\(|node_modules|stack|mongo/i.test(r.texto);
    return {
        ok: noExiste.estado === 404 && typeof noExiste.datos?.error === "string" && malFormado.estado === 400 && typeof malFormado.datos?.error === "string" && limpio(noExiste) && limpio(malFormado),
        detalle: `${noExiste.estado} y ${malFormado.estado}`
    };
});

const fallos = resultados.filter((r) => r.estado === "FALLO").length;
const avisos = resultados.filter((r) => r.estado === "AVISO").length;
const omitidos = resultados.filter((r) => r.estado === "OMITIDO").length;
console.log(`\n${resultados.length} comprobaciones: ${resultados.length - fallos - avisos - omitidos} correctas, ${avisos} avisos, ${omitidos} omitidas, ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
