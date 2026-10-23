export interface RegisterRequestDto {
  name: string;
  email: string;
  password: string;
  acceptedTerms: true;
  termsVersion: string;
}
