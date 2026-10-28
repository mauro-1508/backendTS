/** Fuente de verdad de quien es ADMIN (iam); profile solo conoce a los que ya vio. */
export interface AdminDirectory {
  listAdminIds(): Promise<string[]>;
}
