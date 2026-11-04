// Datos mínimos para la batería de seguridad: dos barberías independientes (cada una con admin, barberos,
// servicios y horario) y citas en varios estados. Los identificadores se generan en cada ejecución.
import { ObjectId } from "mongodb";

const DIAS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Fecha "YYYY-MM-DD" en Madrid desplazada n días respecto a hoy
export const fechaRelativa = (dias) => {
    const fecha = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
    return fecha.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
};

export const usuarioBase = (datos) => ({
    pw: "hash-no-valido",
    telefono: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...datos
});

export const crearBarberia = (nombre, ciudad, adminId, barberos, servicio) => ({
    _id: new ObjectId(),
    nombre,
    ciudad,
    direccion: "Calle de prueba 1",
    telefono: null,
    descripcion: null,
    horario: null,
    schedule: {
        timezone: "Europe/Madrid",
        weeklyTemplate: Object.fromEntries(DIAS.map((dia) => [dia, [{ start: "09:00", end: "20:00" }]])),
        exceptions: []
    },
    adminId,
    barberos,
    servicios: [servicio],
    createdAt: new Date(),
    updatedAt: new Date()
});

export const crearCita = ({ barberia, barbero, cliente, servicio, fecha, horaInicio, horaFin, estado }) => ({
    clienteId: cliente._id,
    barberoId: barbero._id,
    barberiaId: barberia._id,
    servicioId: servicio._id,
    servicioNombre: servicio.nombre,
    servicioPrecio: servicio.precio,
    servicioDuracion: servicio.duracion,
    servicios: [servicio],
    clienteNombre: cliente.nombre,
    fecha,
    horaInicio,
    horaFin,
    estado,
    pagado: false,
    importePagado: servicio.precio,
    createdAt: new Date(),
    updatedAt: new Date()
});

export const sembrarDatos = async (bd) => {
    const servicioA = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte clásico", precio: 15, duracion: 30, createdAt: new Date() };
    const servicioB = { _id: new ObjectId(), nombre: "Barba", descripcion: "Perfilado", precio: 10, duracion: 30, createdAt: new Date() };

    const adminA = usuarioBase({ _id: new ObjectId(), nombre: "Alba", apellido: "Admin", correo: "admin.a@prueba.test", usuario: "admin_a", rol: "admin" });
    const adminB = usuarioBase({ _id: new ObjectId(), nombre: "Berta", apellido: "Admin", correo: "admin.b@prueba.test", usuario: "admin_b", rol: "admin" });
    const barberoA1 = usuarioBase({ _id: new ObjectId(), nombre: "Carlos", apellido: "Barbero", correo: "barbero.a1@prueba.test", usuario: "barbero_a1", rol: "barbero", cargo: "Barbero" });
    const barberoA2 = usuarioBase({ _id: new ObjectId(), nombre: "Dani", apellido: "Barbero", correo: "barbero.a2@prueba.test", usuario: "barbero_a2", rol: "barbero", cargo: "Barbero" });
    const barberoB = usuarioBase({ _id: new ObjectId(), nombre: "Eva", apellido: "Barbera", correo: "barbero.b@prueba.test", usuario: "barbero_b", rol: "barbero", cargo: "Barbero" });
    const cliente = usuarioBase({ _id: new ObjectId(), nombre: "Fran", apellido: "Cliente", correo: "cliente@prueba.test", usuario: "cliente_1", rol: "cliente", ciudad: "Madrid", barberiaId: null });

    const barberiaA = crearBarberia("Barbería A", "Madrid", adminA._id, [barberoA1._id, barberoA2._id], servicioA);
    const barberiaB = crearBarberia("Barbería B", "Sevilla", adminB._id, [barberoB._id], servicioB);
    Object.assign(adminA, { barberiaId: barberiaA._id });
    Object.assign(barberoA1, { barberiaId: barberiaA._id });
    Object.assign(barberoA2, { barberiaId: barberiaA._id });
    Object.assign(adminB, { barberiaId: barberiaB._id });
    Object.assign(barberoB, { barberiaId: barberiaB._id });

    const citas = [
        crearCita({ barberia: barberiaA, barbero: barberoA1, cliente, servicio: servicioA, fecha: fechaRelativa(7), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" }),
        crearCita({ barberia: barberiaA, barbero: barberoA1, cliente, servicio: servicioA, fecha: fechaRelativa(8), horaInicio: "16:00", horaFin: "16:30", estado: "pendiente" }),
        crearCita({ barberia: barberiaA, barbero: barberoA1, cliente, servicio: servicioA, fecha: fechaRelativa(-3), horaInicio: "11:00", horaFin: "11:30", estado: "cancelada" }),
        crearCita({ barberia: barberiaA, barbero: barberoA1, cliente, servicio: servicioA, fecha: fechaRelativa(-5), horaInicio: "12:00", horaFin: "12:30", estado: "completada" }),
        crearCita({ barberia: barberiaB, barbero: barberoB, cliente, servicio: servicioB, fecha: fechaRelativa(9), horaInicio: "17:00", horaFin: "17:30", estado: "confirmada" })
    ];

    await bd.collection("Usuarios").insertMany([adminA, adminB, barberoA1, barberoA2, barberoB, cliente]);
    await bd.collection("Barberias").insertMany([barberiaA, barberiaB]);
    await bd.collection("Citas").insertMany(citas);
};
