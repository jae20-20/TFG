// Batería de seguridad: autorización entre barberías (IDOR), inyección NoSQL, exposición de datos,
// validación de entradas y CORS. Levanta su propia API (puerto 5099) sobre la BD desechable
// BarberPlan_test sembrada con tests/semilla.mjs, y la borra al terminar. Solo hace lecturas o
// peticiones que el servidor rechaza antes de escribir.
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { crearCliente, crearComprobador, crearEntorno } from "./entorno.mjs";
import { sembrarDatos } from "./semilla.mjs";

const { check, terminar } = crearComprobador("seguridad");
const entorno = await crearEntorno({ puerto: 5099, sembrar: sembrarDatos });
const req = crearCliente(entorno.api);
const firmar = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m" });

try {
    // Admin falso: rol admin pero no administra ninguna barbería (atacante de otro tenant)
    const adminAjeno = firmar({ id: new ObjectId().toString(), rol: "admin", barberiaId: new ObjectId().toString() });
    const clienteFalso = firmar({ id: new ObjectId().toString(), rol: "cliente", barberiaId: null });

    // --- NoSQL injection en login
    let r = await req("POST", "/usuarios/login", { body: { correo: { $regex: "^a" }, pw: "x" } });
    check("Login con operador $regex en correo -> 400", r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);
    r = await req("POST", "/usuarios/login", { body: { correo: { $ne: null }, pw: { $ne: null } } });
    check("Login con $ne en correo y pw -> 400", r.status === 400, `${r.status}`);
    r = await req("POST", "/usuarios/login", { body: { correo: "no-existe-" + Date.now() + "@x.com", pw: "x" } });
    check("Login correo inexistente -> 401 genérico (sin enumeración)", r.status === 401 && r.data?.error === "Correo o contraseña incorrectos", `${r.status} ${JSON.stringify(r.data)}`);

    // --- Exposición masiva GET /usuarios/
    r = await req("GET", "/usuarios/");
    check("GET /usuarios/ sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("GET", "/usuarios/", { token: clienteFalso });
    check("GET /usuarios/ como cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", "/usuarios/", { token: adminAjeno });
    check("GET /usuarios/ como admin sin barbería -> 404 (no lista global)", r.status === 404, `${r.status}`);

    // Datos reales públicos para usar como objetivos
    const barberias = (await req("GET", "/barberias")).data || [];
    check("Hay barberías para probar", barberias.length > 0, `${barberias.length}`);
    const barberia = barberias[0];

    // --- Listado público de barberos sin PII
    r = await req("GET", `/barberias/${barberia._id}/barberos`);
    const barberos = r.data || [];
    const camposPrivados = ["correo", "telefono", "pw", "vacaciones", "diasLibres", "horarioPersonal"];
    const filtrados = barberos.filter((b) => camposPrivados.some((c) => c in b));
    check("Barberos públicos sin correo/teléfono/horarios", r.status === 200 && barberos.length > 0 && filtrados.length === 0,
        `${barberos.length} barberos, campos: ${Object.keys(barberos[0] || {}).join(",")}`);
    r = await req("GET", `/barberias/${barberia._id}/barberos`, { token: adminAjeno });
    check("Admin ajeno también recibe solo datos públicos", (r.data || []).every((b) => !("correo" in b)), `${r.status}`);

    const barbero = barberos.find((b) => b.rol === "barbero") || barberos[0];

    // --- IDOR GET /usuarios/:id
    r = await req("GET", `/usuarios/${barbero._id}`, { token: clienteFalso });
    check("GET /usuarios/:id de otro usuario como cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `/usuarios/${barbero._id}`, { token: adminAjeno });
    check("GET /usuarios/:id como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `/usuarios/${new ObjectId()}`, { token: adminAjeno });
    check("GET /usuarios/:id inexistente -> 404", r.status === 404, `${r.status}`);
    const propioToken = firmar({ id: barbero._id, rol: barbero.rol, barberiaId: barberia._id });
    r = await req("GET", `/usuarios/${barbero._id}`, { token: propioToken });
    check("GET /usuarios/:id del propio usuario -> 200 sin pw", r.status === 200 && !("pw" in (r.data || {})), `${r.status}`);

    // --- Citas de otra barbería
    r = await req("GET", `/citas/barberia/${barberia._id}`, { token: adminAjeno });
    check("GET /citas/barberia/:id como admin ajeno -> 403", r.status === 403, `${r.status}`);

    // --- Camino legítimo: el admin real de la barbería conserva su acceso
    // GET /barberias/:id ya no expone adminId: el admin aparece en el equipo público con rol "admin"
    const adminDe = async (barberiaId) =>
        ((await req("GET", `/barberias/${barberiaId}/barberos`)).data || []).find((b) => b.rol === "admin")?._id;
    const detalle = (await req("GET", `/barberias/${barberia._id}`)).data;
    check("GET /barberias/:id público sin adminId", detalle && !("adminId" in detalle), `${Object.keys(detalle || {}).join(",")}`);
    const adminReal = firmar({ id: await adminDe(barberia._id), rol: "admin", barberiaId: barberia._id });
    r = await req("GET", `/barberias/${barberia._id}/barberos`, { token: adminReal });
    check("Admin propio recibe barberos completos (correo incluido)", r.status === 200 && (r.data || []).some((b) => "correo" in b), `${r.status}`);
    r = await req("GET", `/usuarios/${barbero._id}`, { token: adminReal });
    check("Admin propio: GET /usuarios/:id de su barbero -> 200", r.status === 200, `${r.status}`);
    r = await req("GET", `/citas/barberia/${barberia._id}`, { token: adminReal });
    check("Admin propio: GET /citas/barberia/:id -> 200", r.status === 200, `${r.status}`);
    const citasReales = r.data || [];

    // --- Ciclo de vida de citas. Solo peticiones que se rechazan antes de escribir:
    // nunca se lanza una transición válida con un token legítimo contra datos reales.
    const ACCIONES_CITA = ["confirmar", "rechazar", "completar", "no-presentada", "cancelar", "pago"];
    const citaObjetivo = citasReales[0];
    if (citaObjetivo) {
        const otroBarbero = barberos.find((b) => b.rol === "barbero" && b._id !== citaObjetivo.barberoId?.toString());
        const barberoNoAsignado = otroBarbero
            ? firmar({ id: otroBarbero._id, rol: "barbero", barberiaId: barberia._id })
            : firmar({ id: new ObjectId().toString(), rol: "barbero", barberiaId: barberia._id });
        for (const accion of ACCIONES_CITA) {
            r = await req("PUT", `/citas/${citaObjetivo._id}/${accion}`, { token: adminAjeno, body: { pagado: true } });
            check(`PUT /citas/:id/${accion} como admin de otra barbería -> 403`, r.status === 403, `${r.status}`);
            r = await req("PUT", `/citas/${citaObjetivo._id}/${accion}`, { token: barberoNoAsignado, body: { pagado: true } });
            check(`PUT /citas/:id/${accion} como barbero no asignado -> 403`, r.status === 403, `${r.status}`);
        }
        r = await req("PUT", `/citas/${citaObjetivo._id}/confirmar`, { token: clienteFalso });
        check("Cliente intenta aceptar una reserva -> 403", r.status === 403, `${r.status}`);
        r = await req("PUT", `/citas/${citaObjetivo._id}/cancelar`, { token: clienteFalso });
        check("Cliente ajeno cancela una cita -> 403", r.status === 403, `${r.status}`);
        r = await req("GET", `/citas/${citaObjetivo._id}`, { token: barberoNoAsignado });
        check("GET /citas/:id como barbero no asignado -> 403", r.status === 403, `${r.status}`);
    }

    // Citas de todas las barberías, cada una con el token de su admin real
    const citasConAdmin = [];
    for (const b of barberias) {
        const tokenAdminB = firmar({ id: await adminDe(b._id), rol: "admin", barberiaId: b._id });
        const citasB = (await req("GET", `/citas/barberia/${b._id}`, { token: tokenAdminB })).data || [];
        citasB.forEach((cita) => citasConAdmin.push({ cita, tokenAdminB }));
    }

    const finalConAdmin = citasConAdmin.find(({ cita }) => cita.estado === "cancelada") || citasConAdmin.find(({ cita }) => cita.estado === "completada");
    if (finalConAdmin) {
        const { cita: citaFinal, tokenAdminB } = finalConAdmin;
        for (const accion of ["confirmar", "rechazar", "completar", "no-presentada", "cancelar"]) {
            r = await req("PUT", `/citas/${citaFinal._id}/${accion}`, { token: tokenAdminB });
            check(`Transición inválida: ${accion} sobre cita ${citaFinal.estado} -> 409`, r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
        }
        if (citaFinal.estado === "cancelada") {
            r = await req("PUT", `/citas/${citaFinal._id}/pago`, { token: tokenAdminB, body: { pagado: true } });
            check("Registrar el pago de una cita cancelada -> 409", r.status === 409, `${r.status}`);
            if (citaFinal.clienteId) {
                const clienteDueno = firmar({ id: citaFinal.clienteId, rol: "cliente", barberiaId: null });
                r = await req("POST", `/citas/${citaFinal._id}/resena`, { token: clienteDueno, body: { valoracion: 5 } });
                check("Reseña sobre una cita cancelada -> 409", r.status === 409, `${r.status}`);
            }
        }
    } else {
        console.log("SKIP  Transiciones desde estado final (no hay citas canceladas ni completadas)");
    }

    const ahoraMadrid = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).slice(0, 16).replace(" ", "T");
    const futuraConAdmin = citasConAdmin.find(({ cita }) => cita.estado === "confirmada" && `${cita.fecha}T${cita.horaInicio}` > ahoraMadrid);
    if (futuraConAdmin) {
        const { cita: citaFutura, tokenAdminB } = futuraConAdmin;
        r = await req("PUT", `/citas/${citaFutura._id}/completar`, { token: tokenAdminB });
        check("Completar una cita antes de su hora -> 409", r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
        r = await req("PUT", `/citas/${citaFutura._id}/no-presentada`, { token: tokenAdminB });
        check("Marcar no presentada antes de su hora -> 409", r.status === 409, `${r.status}`);
        r = await req("PUT", `/citas/${citaFutura._id}/confirmar`, { token: tokenAdminB });
        check("Aceptar una cita ya confirmada -> 409", r.status === 409, `${r.status}`);
        if (citaFutura.clienteId) {
            const clienteDueno = firmar({ id: citaFutura.clienteId, rol: "cliente", barberiaId: null });
            r = await req("POST", `/citas/${citaFutura._id}/resena`, { token: clienteDueno, body: { valoracion: 5 } });
            check("Reseña sobre una cita no completada -> 409", r.status === 409, `${r.status}`);
        }
    } else {
        console.log("SKIP  Asistencia prematura (no hay citas confirmadas futuras)");
    }

    r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberia._id}&incluirEnCurso[$ne]=x`);
    check("Disponibilidad con operador en incluirEnCurso -> se ignora (200)", r.status === 200, `${r.status}`);

    r = await req("PUT", "/citas/abc/rechazar", { token: adminReal });
    check("PUT /citas/abc/rechazar -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", "/citas/abc/no-presentada", { token: adminReal });
    check("PUT /citas/abc/no-presentada -> 400", r.status === 400, `${r.status}`);

    // --- Analíticas ---
    const rutaAnaliticas = `/citas/barberia/${barberia._id}/analiticas`;
    r = await req("GET", rutaAnaliticas);
    check("Analíticas sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("GET", rutaAnaliticas, { token: clienteFalso });
    check("Analíticas como cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", rutaAnaliticas, { token: adminAjeno });
    check("Analíticas como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=anio`, { token: adminReal });
    check("Analíticas con periodo inválido -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=mes&fecha=2026-02-30`, { token: adminReal });
    check("Analíticas con fecha imposible -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo[$ne]=x`, { token: adminReal });
    check("Analíticas con operador en query -> se ignora (periodo por defecto)", r.status === 200 && r.data?.periodo === "mes", `${r.status} ${r.data?.periodo}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=mes&periodo=dia`, { token: adminReal });
    check("Analíticas con periodo repetido (array) -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `${rutaAnaliticas}?periodo=semana&fecha=2026-09-29`, { token: adminReal });
    check("Admin propio: analíticas semanales -> 200 sin pw ni correo",
        r.status === 200 && r.data?.desde === "2026-09-28" && r.data?.hasta === "2026-10-04" && r.data?.serie?.length === 7
        && !/"pw"|"correo"/.test(JSON.stringify(r.data)),
        `${r.status} ${r.data?.desde}..${r.data?.hasta}`);
    for (const b of barberias) {
        const adminB = firmar({ id: await adminDe(b._id), rol: "admin", barberiaId: b._id });
        r = await req("GET", `/citas/barberia/${b._id}/analiticas?periodo=mes`, { token: adminB });
        check(`Analíticas mensuales de ${b.nombre} -> 200 (incluye cálculo de clientes recurrentes)`, r.status === 200, `${r.status} ${JSON.stringify(r.data?.error ?? "")}`);
    }
    // --- Etiquetas de estilo (tags) de la tarjeta de barbería ---
    const rutaBarberia = `/barberias/${barberia._id}`;
    r = await req("PUT", rutaBarberia, { body: { tags: ["urbana"] } });
    check("PUT /barberias/:id sin token -> 401", r.status === 401, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: ["urbana"] }, token: adminAjeno });
    check("PUT /barberias/:id como admin de otra barbería -> 403", r.status === 403, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: "urbana" }, token: adminReal });
    check("Tags como string (no array) -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: [{ $ne: null }] }, token: adminReal });
    check("Tags con operador Mongo dentro del array -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: Array(9).fill("estilo") }, token: adminReal });
    check("Tags con más de 8 elementos -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: ["a".repeat(25)] }, token: adminReal });
    check("Tag de más de 24 caracteres -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { tags: ["<script>alert(1)</script>"] }, token: adminReal });
    check("Tag con HTML/script -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { modoConfirmacion: "siempre" }, token: adminReal });
    check("Modo de confirmación inventado -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { modoConfirmacion: { $ne: null } }, token: adminReal });
    check("Modo de confirmación con operador Mongo -> 400", r.status === 400, `${r.status}`);
    r = await req("PUT", rutaBarberia, { body: { modoConfirmacion: "manual" }, token: adminAjeno });
    check("Cambiar el modo de confirmación de otra barbería -> 403", r.status === 403, `${r.status}`);

    r = await req("GET", "/usuarios/", { token: adminReal });
    const ajenos = (r.data || []).filter((u) => u.barberiaId?.toString() !== barberia._id);
    check("Admin propio: GET /usuarios/ solo usuarios de su barbería", r.status === 200 && r.data.length > 0 && ajenos.length === 0 && r.data.every((u) => !("pw" in u)),
        `${r.status}, ${r.data?.length} usuarios, ${ajenos.length} ajenos`);

    // --- Escalada de privilegios en registro (se rechaza antes de tocar la BD)
    r = await req("POST", "/usuarios/registro", { body: { nombre: "x", apellido: "x", correo: "x@x.x", pw: "x", usuario: "x", rol: "admin" } });
    check("Registro con rol admin -> 400", r.status === 400 && r.data?.error === "Rol no válido", `${r.status} ${JSON.stringify(r.data)}`);

    // --- IDs mal formados -> 400 (antes 500)
    r = await req("GET", "/usuarios/abc", { token: adminReal });
    check("GET /usuarios/abc -> 400", r.status === 400, `${r.status}`);
    r = await req("DELETE", "/usuarios/123", { token: adminReal });
    check("DELETE /usuarios/123 -> 400 sin llegar a BD", r.status === 400, `${r.status}`);
    r = await req("GET", "/barberias/no-es-un-id");
    check("GET /barberias/no-es-un-id -> 400", r.status === 400, `${r.status}`);

    // --- Contraseña mínima (se rechaza antes de tocar la BD)
    r = await req("POST", "/usuarios/registro", { body: { nombre: "x", apellido: "x", correo: "x@x.x", pw: "1234", usuario: "x", rol: "cliente", ciudad: "x" } });
    check("Registro con contraseña de 4 caracteres -> 400", r.status === 400 && /al menos 8/.test(r.data?.error), `${r.status} ${JSON.stringify(r.data)}`);

    // --- Disponibilidad: barbero de otra barbería
    if (barberias.length > 1) {
        r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberias[1]._id}`);
        check("Disponibilidad con barbero de otra barbería -> 404", r.status === 404, `${r.status}`);
    }

    // --- Reserva fuera de horario (nunca se crea: la hora no está entre los huecos libres)
    const servicios = (await req("GET", `/barberias/${barberia._id}/servicios`)).data || [];
    // Siempre futura: con una fecha fija la reserva se rechazaría por fecha pasada antes de mirar el horario
    const fechaPrueba = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const dispo = (await req("GET", `/citas/disponibilidad/${barbero._id}/${fechaPrueba}?barberiaId=${barberia._id}`)).data;
    if (servicios.length && !dispo.horariosDisponibles.includes("03:00")) {
        r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioId: servicios[0]._id, fecha: fechaPrueba, horaInicio: "03:00" } });
        check("Reserva a las 03:00 (fuera de horario) -> 409", r.status === 409, `${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioId: "x", fecha: fechaPrueba, horaInicio: "10:00" } });
    check("Reserva con servicioId inválido -> 400", r.status === 400, `${r.status}`);
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioId: servicios[0]?._id, fecha: "mañana", horaInicio: "25:99" } });
    check("Reserva con fecha/hora mal formadas -> 400", r.status === 400, `${r.status}`);

    // --- Solicitudes con datos no válidos (se rechazan antes de insertar)
    const barberoToken = firmar({ id: barbero._id, rol: "barbero", barberiaId: barberia._id });
    if (barbero.rol === "barbero") {
        r = await req("POST", "/solicitudes", { token: barberoToken, body: { tipo: "hack", fechaInicio: "2026-10-05", fechaFin: "2026-10-05" } });
        check("Solicitud con tipo inventado -> 400", r.status === 400, `${r.status}`);
        r = await req("POST", "/solicitudes", { token: barberoToken, body: { tipo: "vacaciones", fechaInicio: "2020-01-01", fechaFin: "2035-01-01" } });
        check("Solicitud de 15 años de vacaciones -> 400", r.status === 400, `${r.status}`);
        r = await req("POST", "/solicitudes", { token: barberoToken, body: { tipo: "bloqueo_servicio", fechaInicio: "2026-10-05", fechaFin: "2026-10-05", servicioId: new ObjectId().toString() } });
        check("Bloqueo de servicio inexistente -> 400", r.status === 400, `${r.status}`);
        r = await req("PUT", `/barberos/${barbero._id}`, { token: barberoToken, body: { serviciosBloqueados: [] } });
        check("Barbero se auto-desbloquea servicios -> 403", r.status === 403, `${r.status}`);
    }

    // --- Citas con varios servicios y desbloqueo de servicios (solo validaciones, sin escrituras)
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberia._id}&duracion=abc`);
    check("Disponibilidad con duracion no numérica -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/2026-10-05?barberiaId=${barberia._id}&duracion[$gt]=0`);
    check("Disponibilidad con operador en duracion -> no 500", r.status !== 500, `${r.status}`);
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioIds: { $ne: null }, fecha: "2030-01-01", horaInicio: "10:00" } });
    check("Reserva con servicioIds como objeto -> 400", r.status === 400, `${r.status}`);
    r = await req("POST", "/citas", { token: clienteFalso, body: { barberiaId: barberia._id, barberoId: barbero._id, servicioIds: ["abc"], fecha: "2030-01-01", horaInicio: "10:00" } });
    check("Reserva con servicioIds mal formados -> 400", r.status === 400, `${r.status}`);
    r = await req("DELETE", `/barberos/mi/servicios-bloqueados/${new ObjectId()}`, { token: clienteFalso });
    check("Desbloqueo de servicio con rol cliente -> 403", r.status === 403, `${r.status}`);
    r = await req("DELETE", `/barberos/mi/servicios-bloqueados/${new ObjectId()}`, { token: adminAjeno });
    check("Desbloqueo de servicio con rol admin -> 403", r.status === 403, `${r.status}`);
    r = await req("DELETE", "/barberos/mi/servicios-bloqueados/abc", { token: propioToken });
    check("Desbloqueo de servicio con id mal formado -> 400", r.status === 400, `${r.status}`);

    // Días disponibles del mes: validaciones públicas (solo lecturas)
    const mesActualTexto = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }).slice(0, 7);
    for (const [mes, esperado] of [["2026-13", 400], ["abc", 400], ["2000-01", 400], ["2999-01", 400], [mesActualTexto, 200]]) {
        r = await req("GET", `/citas/disponibilidad/${barbero._id}/mes/${mes}?barberiaId=${barberia._id}`);
        check(`Días del mes con mes=${mes} -> ${esperado}`, r.status === esperado, `${r.status}`);
    }
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/mes/${mesActualTexto}?barberiaId=${barberia._id}&duracion=999999`);
    check("Días del mes con duración enorme -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/disponibilidad/${barbero._id}/mes/${mesActualTexto}?barberiaId[$ne]=x`);
    check("Días del mes con operador en barberiaId -> 400", r.status === 400, `${r.status}`);
    r = await req("GET", `/citas/disponibilidad/abc/mes/${mesActualTexto}?barberiaId=${barberia._id}`);
    check("Días del mes con barbero mal formado -> 400", r.status === 400, `${r.status}`);

    // --- CORS
    r = await req("GET", "/barberias", { origin: "https://evil.example" });
    check("CORS: origen no permitido sin cabecera ACAO", !r.headers.get("access-control-allow-origin"), `${r.headers.get("access-control-allow-origin")}`);
    r = await req("GET", "/barberias", { origin: "http://localhost:4200" });
    check("CORS: localhost:4200 permitido", r.headers.get("access-control-allow-origin") === "http://localhost:4200", `${r.headers.get("access-control-allow-origin")}`);
    r = await req("GET", "/barberias", { origin: "capacitor://localhost" });
    check("CORS: capacitor://localhost permitido", r.headers.get("access-control-allow-origin") === "capacitor://localhost");
} finally {
    await entorno.cerrar();
}

terminar();
