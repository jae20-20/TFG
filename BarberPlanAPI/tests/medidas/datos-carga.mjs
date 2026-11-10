// Datos de las medidas (carga e índices): barberías, barberos, clientes y citas de tamaño realista.
// El cliente de prueba (cliente0) tiene una cita con cada barbero: 60 citas con los datos por defecto.
import bcrypt from "bcryptjs";
import { crearBarberia, crearCita, fechaRelativa, usuarioBase } from "../semilla.mjs";
import { ObjectId } from "./mongodb-api.mjs";

export const PW = "CargaPrueba123";
export const NUM_BARBERIAS = 20;
export const BARBEROS_POR_BARBERIA = 3;
export const NUM_CLIENTES = 40;
export const CITAS_POR_BARBERO = 25;
const HORAS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];

// citasPorBarbero: cuántas citas tiene cada barbero (la primera es del cliente de prueba). Con más de 60 las
// citas se reparten en más días, siempre sin solapar
export const sembrarCarga = async (bd, { citasPorBarbero = CITAS_POR_BARBERO } = {}) => {
    const hash = await bcrypt.hash(PW, 10);
    const servicios = [
        { _id: new ObjectId(), nombre: "Corte", descripcion: "Corte clásico", precio: 15, duracion: 30, createdAt: new Date() },
        { _id: new ObjectId(), nombre: "Barba", descripcion: "Perfilado de barba", precio: 10, duracion: 30, createdAt: new Date() }
    ];
    const clientes = Array.from({ length: NUM_CLIENTES }, (_, i) => usuarioBase({
        _id: new ObjectId(), nombre: `Cliente${i}`, apellido: "Carga", correo: `cliente${i}@carga.test`, usuario: `cliente_carga_${i}`, rol: "cliente", ciudad: "Madrid", barberiaId: null,
        ...(i === 0 && { pw: hash })
    }));
    const clientePrueba = clientes[0];

    const usuarios = [...clientes];
    const barberias = [];
    const citas = [];
    let barberoMedido = null;
    let barberiaMedida = null;

    for (let b = 0; b < NUM_BARBERIAS; b++) {
        const admin = usuarioBase({ _id: new ObjectId(), nombre: `Admin${b}`, apellido: "Carga", correo: `admin${b}@carga.test`, usuario: `admin_carga_${b}`, rol: "admin" });
        const barberos = Array.from({ length: BARBEROS_POR_BARBERIA }, (_, i) => usuarioBase({
            _id: new ObjectId(), nombre: `Barbero${b}${i}`, apellido: "Carga", correo: `barbero${b}_${i}@carga.test`, usuario: `barbero_carga_${b}_${i}`, rol: "barbero", cargo: "Barbero"
        }));
        const barberia = crearBarberia(`Barbería Carga ${b}`, ["Madrid", "Valencia", "Sevilla"][b % 3], admin._id, barberos.map((x) => x._id), servicios[0]);
        barberia.servicios = servicios;
        barberia.tags = ["clásica", "barba"];
        for (const u of [admin, ...barberos]) u.barberiaId = barberia._id;
        usuarios.push(admin, ...barberos);
        barberias.push(barberia);

        for (const barbero of barberos) {
            for (let i = 0; i < citasPorBarbero; i++) {
                // 15 días por 4 franjas (09:00, 10:00, 11:00, 12:00) = 60 huecos distintos por barbero; a partir de ahí
                // se pasa a otra ventana de 15 días (hacia atrás), sin solapar nunca
                const hueco = i % 60;
                const ventana = Math.floor(i / 60);
                const dia = (hueco % 15) - 5 - ventana * 20;
                const horaInicio = HORAS[Math.floor(hueco / 15) * 2];
                const [h, m] = horaInicio.split(":").map(Number);
                const horaFin = `${String(h + (m === 30 ? 1 : 0)).padStart(2, "0")}:${m === 30 ? "00" : "30"}`;
                // El cliente de la prueba tiene una cita con cada barbero; el resto se reparte
                const cliente = i === 0 ? clientePrueba : clientes[1 + ((b * 7 + i) % (NUM_CLIENTES - 1))];
                citas.push(crearCita({ barberia, barbero, cliente, servicio: servicios[0], fecha: fechaRelativa(dia), horaInicio, horaFin, estado: dia < 0 ? "completada" : "confirmada" }));
            }
        }
        if (b === 0) { barberoMedido = barberos[0]; barberiaMedida = barberia; }
    }

    await bd.collection("Usuarios").insertMany(usuarios);
    await bd.collection("Barberias").insertMany(barberias);
    for (let i = 0; i < citas.length; i += 5000) await bd.collection("Citas").insertMany(citas.slice(i, i + 5000));
    return {
        clientePrueba, barberoMedido, barberiaMedida,
        resumen: { barberias: barberias.length, barberos: barberias.length * BARBEROS_POR_BARBERIA, clientes: clientes.length, citas: citas.length, citasDelClienteDePrueba: citas.filter((c) => c.clienteId.equals(clientePrueba._id)).length }
    };
};
