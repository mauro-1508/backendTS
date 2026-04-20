const authService = require('../services/auth.service');

const authController = {
  register: async (req, res) => {
     console.log(req.body);   
    try {
      const { name, email, password } = req.body;

      const result = await authService.register({
        name,
        email,
        password,
      });

      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await authService.login({
        email,
        password,
      });

      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  },

  profile: async (req,res) => {
    try {
       return res.status(200).json({
      success: true,
      message: 'Perfil obtenido',
      data: req.user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Error al obtener perfil',
    });
  }
  }

};
module.exports = authController;