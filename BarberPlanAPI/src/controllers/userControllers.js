//manejar http request
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { createUser, getAllUsers } from "../models/userModel.js";

export const getUsers = async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener usuarios" });
    }
};

export const addUser = async (req, res) => {
    try {
        const { nombre, correo, pw, apellido, usuario, rol, code } = req.body;

        if (!nombre || !correo || !pw || !apellido || !usuario || !rol) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        // Validar que el campo `code` solo sea obligatorio si el rol es barbero
        if (rol === 'barbero' && (!code || code.trim() === '')) {
            return res.status(400).json({ error: "El código de barbería es obligatorio para barberos" });
        }

        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pw, salt);

        const newUser = await createUser({
            nombre,
            correo,
            pw: hashedPassword,
            apellido,
            usuario,
            rol,
            code: rol === 'barbero' ? code : null, // Solo guardar el código si es barbero
        });

        res.status(201).json({ message: "Usuario creado", id: newUser.insertedId });
    } catch (error) {
        console.error("Error al crear usuario:", error);
        res.status(400).json({ error: "Error al crear usuario" });
    }
};
export const loginUser = async (req, res) => {
  try {
    const { correo, pw } = req.body;

    // Validar que se envíen las credenciales
    if (!correo || !pw) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Buscar al usuario por correo
    const user = await getAllUsers().then(users => users.find(u => u.correo === correo));
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Verificar la contraseña
    const isPasswordValid = await bcrypt.compare(pw, user.pw);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    // Generar el token JWT
    const token = jwt.sign(
      { id: user._id, correo: user.correo, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Incluir los datos del usuario en la respuesta
    res.json({
      message: "Login exitoso",
      token,
      user: { id: user._id,
          correo: user.correo,
          nombre: user.nombre,
          apellido: user.apellido,
          usuario: user.usuario,
          rol: user.rol,
          code: user.rol === 'barbero' ? user.code : null, },
    });



  } catch (error) {
    console.error("Error en loginUser:", error);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
};