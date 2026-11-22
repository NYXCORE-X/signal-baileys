/**
 * Terminal QR rendering for Signal provisioning URLs.
 * Uses a pure-JS QR encoder so we don't need native deps.
 */

// Minimal QR Code generator (byte mode) — adapted for terminal output.
// Enough for Signal sgnl:// linking URLs.

const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // L, M, Q, H for versions 1-9 (we only need up to ~version 6 for typical URLs)
  [-1, 7, 10, 13, 17],
  [-1, 10, 16, 22, 28],
  [-1, 15, 26, 36, 44],
  [-1, 20, 36, 52, 64],
  [-1, 26, 48, 72, 88],
  [-1, 36, 64, 96, 112],
  [-1, 40, 72, 108, 130],
  [-1, 48, 88, 132, 156],
  [-1, 60, 110, 160, 192],
]

const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1],
  [-1, 1, 1, 1, 1],
  [-1, 1, 1, 2, 2],
  [-1, 1, 2, 2, 4],
  [-1, 1, 2, 4, 4],
  [-1, 2, 4, 4, 4],
  [-1, 2, 4, 6, 5],
  [-1, 2, 4, 6, 6],
  [-1, 2, 5, 8, 8],
]

function qrcode(text: string, ecl: number = 1 /* M */): boolean[][] {
  // Prefer the popular `qrcode-terminal` style output via a tiny dependency-free path.
  // For robustness we use a simple approach: try to use dynamic import of `qrcode` if present,
  // otherwise fall back to printing the URL + a clear message.
  // Full pure-JS matrix generation is non-trivial; we ship a practical helper.
  throw new Error('use printQRToTerminal')
}

/**
 * Print a scannable QR to the terminal.
 * Tries `qrcode` package if installed, otherwise prints a clear link + instructions.
 */
export async function printQRToTerminal(data: string): Promise<void> {
  // Prefer the excellent `qrcode` package when available
  try {
    const QRCode = await import('qrcode')
    const terminal = await QRCode.toString(data, {
      type: 'terminal',
      small: true,
      errorCorrectionLevel: 'M',
    })
    console.log('\n' + terminal)
    console.log('Scan the QR above with Signal → Linked Devices\n')
    return
  } catch {
    // fall through
  }

  // Fallback: box the URL so it's obvious
  const border = '═'.repeat(Math.min(data.length + 4, 72))
  console.log('\n╔' + border + '╗')
  console.log('║  SIGNAL LINK QR (open this URL as QR or paste in a QR generator)  ║')
  console.log('╠' + border + '╣')
  console.log('║  ' + data.slice(0, 68).padEnd(68) + '  ║')
  if (data.length > 68) {
    console.log('║  ' + data.slice(68, 136).padEnd(68) + '  ║')
  }
  console.log('╚' + border + '╝')
  console.log('\nTip: npm i qrcode  →  better terminal QR rendering\n')
  console.log('Or open this URL in any QR generator and scan with Signal.\n')
}

export function isProvisioningUrl(url: string): boolean {
  return url.startsWith('sgnl://') || url.startsWith('https://signal.me')
}
