import { Request, Response } from 'express';
import { UserService } from '../../../../ports/inbound/user_service';

export const makeUserController = (userService: UserService) => ({
  me: async (req: Request, res: Response) => {
    try {
      const user = await userService.getById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
      return res.status(200).json({
        success: true,
        data: { user_id: user.userId, name: user.name, email: user.email },
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },
});
