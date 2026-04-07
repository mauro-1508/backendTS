const bcrypt = require('bcrypt');

const jwt = require('jsonwebtoken');

const authRepository = require('../repositories/auth.repository');

const authService = {
  register: async ({ nombre, email, password }) => {
    if (!nombre || !email || !password) {
      throw new Error('Nombre, email y contraseña son obligatorios');
    }

    const existingUser = await authRepository.findUserByEmail(email);

    if (existingUser) {
      throw new Error('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await authRepository.createUser({
      nombre,
      email,
      password: hashedPassword,
    });

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: newUser,
    };
  },

  login: async ({ email, password }) => {
    if (!email || !password) {
      throw new Error('Email y contraseña son obligatorios');
    }

    const user = await authRepository.findUserByEmail(email);

    if (!user) {
      throw new Error('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error('Credenciales inválidas');
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return {
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token,
        user: {
          user_id: user.user_id,
          nombre: user.nombre,
          email: user.email,
        },
      },
    };
  },
};

module.exports = authService;