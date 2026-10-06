/** Token program owner address → display name (no "use client": shared by the server page and the dialog). */
export const tokenProgramName = (p: string) =>
  p.startsWith("TokenzQd") ? "Token-2022" : "SPL";
