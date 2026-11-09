// Share card (1080x1350 image) + invite links. Uses the Android share sheet when available.

/** `inv` is the public invite id from the server (a hash), never the private visitor id. */
export function inviteUrl(inv: string) {
  return inv ? `${location.origin}/?with=${inv}` : location.origin;
}

const fmtMin = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return `${m} minute${m === 1 ? '' : 's'}`;
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draws the card. `scene` is a snapshot of the 3D view (may be null if WebGL readback fails). */
export async function makeCard(opts: { seconds: number; others: number; scene: HTMLCanvasElement | null; link: string }) {
  await Promise.all([
    document.fonts.load('600 80px "Zen Old Mincho"'),
    document.fonts.load('500 40px "Zen Maru Gothic"'),
  ]).catch(() => {});
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2ede1';
  g.fillRect(0, 0, W, H);

  // scene photo, cover-fit into a rounded frame
  const fx = 60;
  const fy = 60;
  const fw = W - 120;
  const fh = 780;
  // neon frame
  const frame = g.createLinearGradient(0, 0, W, H);
  frame.addColorStop(0, '#9945ff');
  frame.addColorStop(1, '#14f195');
  g.save();
  roundRect(g, fx - 8, fy - 8, fw + 16, fh + 16, 46);
  g.fillStyle = frame;
  g.fill();
  g.restore();
  g.save();
  roundRect(g, fx, fy, fw, fh, 40);
  g.clip();
  if (opts.scene && opts.scene.width > 0) {
    const s = opts.scene;
    const scale = Math.max(fw / s.width, fh / s.height);
    const dw = s.width * scale;
    const dh = s.height * scale;
    g.drawImage(s, fx + (fw - dw) / 2, fy + (fh - dh) / 2, dw, dh);
  } else {
    const grd = g.createLinearGradient(0, fy, 0, fy + fh);
    grd.addColorStop(0, '#e9e2d0');
    grd.addColorStop(1, '#a7b48f');
    g.fillStyle = grd;
    g.fillRect(fx, fy, fw, fh);
  }
  g.restore();

  // text
  g.textAlign = 'center';
  g.fillStyle = '#3f4237';
  g.font = '600 72px "Zen Old Mincho", serif';
  g.fillText(`sat ${fmtMin(opts.seconds)}. touched grass.`, W / 2, 990);
  g.font = '500 40px "Zen Maru Gothic", sans-serif';
  g.fillStyle = '#6f7364';
  const withLine =
    opts.others > 0
      ? `with ${opts.others} ${opts.others === 1 ? 'other person' : 'other people'} in the Quiet Hall`
      : 'in the Quiet Hall';
  g.fillText(withLine, W / 2, 1060);

  // footer
  g.strokeStyle = 'rgba(63,66,55,0.15)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(160, 1140);
  g.lineTo(W - 160, 1140);
  g.stroke();
  const sol = g.createLinearGradient(300, 0, 780, 0);
  sol.addColorStop(0, '#9945ff');
  sol.addColorStop(1, '#14c47e');
  g.fillStyle = sol;
  g.font = '700 38px "Zen Maru Gothic", sans-serif';
  g.fillText('gm. sit with me →', W / 2, 1210);
  g.fillStyle = '#6f7364';
  g.font = '400 30px "Zen Maru Gothic", sans-serif';
  g.fillText(opts.link.replace(/^https?:\/\//, ''), W / 2, 1260);

  return new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
}

/** Share via the system sheet; falls back to download + copy link. Returns a short status for a toast. */
export async function shareCard(blob: Blob | null, link: string, text: string): Promise<string> {
  const file = blob ? new File([blob], 'quiet-hall.png', { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${link}` });
      return '';
    }
    if (navigator.share) {
      await navigator.share({ title: 'Quiet Hall', text, url: link });
      return '';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return '';
  }
  if (blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quiet-hall.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const copied = await copy(link);
  return blob ? (copied ? 'Image saved · link copied' : 'Image saved') : copied ? 'Link copied' : link;
}

export async function shareInvite(link: string): Promise<string> {
  const text = 'Sit with me in the Quiet Hall: a calm place to breathe together.';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Quiet Hall', text, url: link });
      return '';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return '';
  }
  return (await copy(link)) ? 'Invite link copied' : link;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
