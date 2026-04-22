const authService = require('../services/auth.service');

const usersController = {
   getProfile: async (req, res) => {
    try {
      const userId = req.user.id; 

      const result = await userService.getProfile(userId);

      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
};

module.exports = usersController;