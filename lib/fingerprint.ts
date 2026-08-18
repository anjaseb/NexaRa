// Fingerprint leve, só com o que o browser expõe sem permissões especiais.
// Não é infalível (reset de fábrica ou browser diferente mudam o valor) —
// é tratado como SINAL, nunca como bloqueio automático definitivo (spec
// secção 9). Para maior precisão em produção, considerar o pacote
// FingerprintJS (https://fingerprint.com), pago acima de um certo volume.
export async function gerarFingerprint(): Promise<string> {
  const partes: string[] = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String((navigator as any).hardwareConcurrency ?? ''),
  ];

  // Canvas fingerprint — pequenas diferenças de GPU/driver geram hashes distintos
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Nexara-fp', 2, 2);
      partes.push(canvas.toDataURL());
    }
  } catch {
    // Alguns browsers bloqueiam canvas fingerprinting — segue sem essa parte
  }

  const texto = partes.join('|');
  const encoder = new TextEncoder();
  const dados = encoder.encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dados);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
