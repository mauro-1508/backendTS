const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../../../config/jwt');
const { createHash } = require('crypto');
const transporter = require('../../../config/mailer');
const authRepository = require('../repositories/auth.repository');

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
      jwtConfig.secret,
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

    // Respondemos igual aunque no exista por seguridad
    if (!user) {
      return { success: true, message: 'Si el correo existe, recibirás un código' };
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Hashear el código para guardarlo en la BD
    const tokenHash = createHash('sha256').update(code).digest('hex');

    // Expira en 15 minutos
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await authRepository.createResetToken({
      userId: user.user_id,
      tokenHash,
      expiresAt,
    });

    // Enviar correo con el código
    await transporter.sendMail({
      from: `"Signa App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Código de recuperación - Signa',
      html: `
        <h2>Recuperar contraseña</h2>
        <p>Hola ${user.name}, tu código de verificación es:</p>
        <h1 style="letter-spacing:8px;color:#3B82F6;">${code}</h1>
        <p>Este código expira en <strong>15 minutos</strong>.</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
      `,
    });

    return { success: true, message: 'Si el correo existe, recibirás un código' };
  },

  verifyCode: async ({ email, code }) => {
    if (!email || !code) {
      throw new Error('Email y código son obligatorios');
    }

    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new Error('Código inválido');
    }

    // Hashear el código recibido para comparar con la BD
    const tokenHash = createHash('sha256').update(code).digest('hex');

    const resetToken = await authRepository.findResetToken(tokenHash);

    if (!resetToken) {
      throw new Error('Código inválido');
    }

    if (resetToken.used_at) {
      throw new Error('Este código ya fue utilizado');
    }

    if (new Date() > new Date(resetToken.expires_at)) {
      throw new Error('El código ha expirado');
    }

    // Verificar que el token pertenece al usuario
    if (resetToken.user_id !== user.user_id) {
      throw new Error('Código inválido');
    }

    return {
      success: true,
      message: 'Código verificado correctamente',
      data: { token_id: resetToken.token_id }
    };
  },

  resetPassword: async ({ email, code, newPassword }) => {
    if (!email || !code || !newPassword) {
      throw new Error('Email, código y nueva contraseña son obligatorios');
    }

    if (newPassword.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    // Verificar el código primero
    const verification = await authService.verifyCode({ email, code });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await authRepository.findUserByEmail(email);

    await authRepository.updatePassword({
      userId: user.user_id,
      hashedPassword,
    });

    // Marcar el token como usado
    await authRepository.markTokenAsUsed(verification.data.token_id);

    return { success: true, message: 'Contraseña actualizada correctamente' };
  },

  googleLogin: async ({ email, name }) => {
    if (!email || !name) {
      throw new Error('Email y nombre son obligatorios');
    }
    const existingUser = await authRepository.findUserByEmail(email);

    if (existingUser) {
      // Si el usuario ya existe, simplemente generamos un token
      const token = jwt.sign(
        {
          user_id: existingUser.user_id,
          email: existingUser.email,
        },
        jwtConfig.secret,
        { expiresIn: '1d' }
      );
      return { success: true, message: 'Inicio de sesión exitoso', data: { token } };
    }

    // Si el usuario no existe, lo creamos
    const newUser = await authRepository.createUser({
      email,
      name,
      password: null, // No tiene contraseña
    });

    // Generamos un token para el nuevo usuario
    const token = jwt.sign(
      {
        user_id: newUser.user_id,
        email: newUser.email,
      },
      jwtConfig.secret,
      { expiresIn: '1d' }
    );

    return { success: true, message: 'Cuenta creada y sesión iniciada', data: { token } };
  },
};

module.exports = authService;