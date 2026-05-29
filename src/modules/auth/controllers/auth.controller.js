const authService = require('../services/auth.service');

const authController = {
  register: async (req, res) => {
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
 
forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword({ email });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  verifyCode: async (req, res) => {
    try {
      const { email, code } = req.body;
      const result = await authService.verifyCode({ email, code });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      const result = await authService.resetPassword({ email, code, newPassword });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },
};

module.exports = authController;