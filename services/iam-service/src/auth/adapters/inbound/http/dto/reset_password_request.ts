export interface ResetPasswordRequestDto {
  email: string;
  code: string;
  newPassword: string;
}
