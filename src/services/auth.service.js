const bcrypt = require('bcrypt');

const jwt = require('jsonwebtoken');

const crypto = require('crypto');

const nodemailer = require('nodemailer');

const authRepository = require('../repositories/auth.repository');

// Transporte SMTP para el correo de recuperacion de contrasena.
// Requiere EMAIL_USER y EMAIL_PASS en el .env (app password de Gmail).
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const authService = {
  register: async ({ name, email, password }) => {
    if (!name || !email || !password) {
      throw new Error('Nombre, email y contraseña son obligatorios');
    }

    const existingUser = await authRepository.findUserByEmail(email);

    if (existingUser) {
      throw new Error('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await authRepository.createUser({
      name,
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
          name: user.name,
          email: user.email,
        },
      },
    };
  },
  forgotPassword: async ({ email }) => {
    if (!email) {
      throw new Error('El email es obligatorio');
    }

    const user = await authRepository.findUserByEmail(email);

    // Por seguridad respondemos igual aunque el email no exista
    // así no revelamos qué correos están registrados
    if (!user) {
      return { success: true, message: 'Si el correo existe, recibirás un enlace' };
    }

    // Generar token aleatorio y hashearlo para guardarlo en la BD
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Expira en 1 hora
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await authRepository.createResetToken({
      userId: user.user_id,
      tokenHash,
      expiresAt,
    });

    // El link lleva el token sin hashear (el frontend lo manda de vuelta)
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    await transporter.sendMail({
      from: `"Signa App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Recuperación de contraseña - Signa',
      html: `
        <h2>Recuperar contraseña</h2>
        <p>Hola ${user.name}, recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic en el botón para continuar:</p>
        <a href="${resetLink}" style="background:#3B82F6;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">
          Restablecer contraseña
        </a>
        <p>Este enlace expira en 1 hora.</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
      `,
    });

    return { success: true, message: 'Si el correo existe, recibirás un enlace' };
  },

  resetPassword: async ({ token, newPassword }) => {
    if (!token || !newPassword) {
      throw new Error('Token y nueva contraseña son obligatorios');
    }

    if (newPassword.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    // Hashear el token recibido para comparar con el de la BD
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await authRepository.findResetToken(tokenHash);

    if (!resetToken) {
      throw new Error('Token inválido');
    }

    if (resetToken.used_at) {
      throw new Error('Este token ya fue utilizado');
    }

    if (new Date() > new Date(resetToken.expires_at)) {
      throw new Error('El token ha expirado');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await authRepository.updatePassword({
      userId: resetToken.user_id,
      hashedPassword,
    });

    await authRepository.markTokenAsUsed(resetToken.token_id);

    return { success: true, message: 'Contraseña actualizada correctamente' };
  },
};

module.exports = authService;