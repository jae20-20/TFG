// Datos para la colección de Postman: las tres cuentas de prueba (dueño, barbero y cliente) con
// contraseñas generadas en cada ejecución, la barbería del dueño, un barbero extra que el dueño borra
// en U8 y dos citas pasadas confirmadas: citaPasadaId (completar y reseñar, C13 y C17) y
// citaNoPresentadaId (marcar como no presentada, C14).
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "./semilla.mjs";

// Cumple la política de contraseñas nuevas: al menos 8 caracteres, una letra y un número
const passwordAleatoria = () => `Pm${randomBytes(6).toString("hex")}7`;

export const sembrarPostman = async (bd) => {
    const pw = { admin: passwordAleatoria(), barbero: passwordAleatoria(), cliente: passwordAleatoria(), extra: passwordAleatoria() };
    const hash = async (texto) => bcrypt.hash(texto, await bcrypt.genSalt(10));

    const servicio = { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte clásico", precio: 15, duracion: 30, createdAt: new Date() };
    const admin = usuarioBase({ _id: new ObjectId(), nombre: "Dueño", apellido: "Postman", correo: "dueno.postman@prueba.test", usuario: "dueno_postman", rol: "admin", pw: await hash(pw.admin) });
    const barbero = usuarioBase({ _id: new ObjectId(), nombre: "Barbero", apellido: "Postman", correo: "barbero.postman@prueba.test", usuario: "barbero_postman", rol: "barbero", cargo: "Barbero", pw: await hash(pw.barbero) });
    const barberoExtra = usuarioBase({ _id: new ObjectId(), nombre: "Barbero", apellido: "Extra", correo: "barbero.extra@prueba.test", usuario: "barbero_extra", rol: "barbero", cargo: "Barbero", pw: await hash(pw.extra) });
    const cliente = usuarioBase({ _id: new ObjectId(), nombre: "Cliente", apellido: "Postman", correo: "cliente.postman@prueba.test", usuario: "cliente_postman", rol: "cliente", ciudad: "Alicante", barberiaId: null, pw: await hash(pw.cliente) });

    const barberia = crearBarberia("Barbería Postman principal", "Alicante", admin._id, [barbero._id, barberoExtra._id], servicio);
    // Hoy cerrada: así C1 propone el primer día a partir de mañana y C2 ofrece el día completo,
    // sea cual sea la hora a la que se ejecute la colección
    barberia.schedule.exceptions.push({ date: fechaRelativa(0), type: "closed" });
    Object.assign(admin, { barberiaId: barberia._id });
    Object.assign(barbero, { barberiaId: barberia._id });
    Object.assign(barberoExtra, { barberiaId: barberia._id });

    const citaPasada = crearCita({ barberia, barbero, cliente, servicio, fecha: fechaRelativa(-1), horaInicio: "10:00", horaFin: "10:30", estado: "confirmada" });
    const citaNoPresentada = crearCita({ barberia, barbero, cliente, servicio, fecha: fechaRelativa(-1), horaInicio: "11:00", horaFin: "11:30", estado: "confirmada" });
    citaPasada._id = new ObjectId();
    citaNoPresentada._id = new ObjectId();

    await bd.collection("Usuarios").insertMany([admin, barbero, barberoExtra, cliente]);
    await bd.collection("Barberias").insertOne(barberia);
    await bd.collection("Citas").insertMany([citaPasada, citaNoPresentada]);

    return {
        adminCorreo: admin.correo,
        adminPw: pw.admin,
        barberoCorreo: barbero.correo,
        barberoPw: pw.barbero,
        clienteCorreo: cliente.correo,
        clientePw: pw.cliente,
        clienteUsuario: cliente.usuario,
        barberoExtraId: barberoExtra._id.toString(),
        citaPasadaId: citaPasada._id.toString(),
        citaNoPresentadaId: citaNoPresentada._id.toString()
    };
};
