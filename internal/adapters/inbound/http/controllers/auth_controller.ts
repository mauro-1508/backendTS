import { Request, Response } from 'express';
import { AuthService } from '../../../../ports/inbound/auth_service';

export const makeAuthController = (authService: AuthService) => ({
  register: async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      const result = await authService.register({ name, email, password });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  forgotPassword: async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword({ email });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  verifyCode: async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      const result = await authService.verifyCode({ email, code });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  resetPassword: async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      const result = await authService.resetPassword({ email, code, newPassword });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },
});
