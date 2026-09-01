export function generateSixDigitCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

export function generateFourDigitOtp(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return String(n);
}
