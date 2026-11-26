import * as THREE from 'three';

function createCanvasTexture(
  size: number,
  drawFn: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeat = 1,
  maxAnisotropy = 4,
  isColor = true,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawFn(ctx, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function drawCamoPattern(
  ctx: CanvasRenderingContext2D,
  s: number,
  base: string,
  colors: string[],
): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const x = Math.random() * s;
    const y = Math.random() * s;
    const w = 10 + Math.random() * 28;
    const h = 8 + Math.random() * 22;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Subtle ripstop fabric weave
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  for (let g = 0; g < s; g += 8) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g);
    ctx.lineTo(s, g);
    ctx.stroke();
  }
}

export interface ProceduralTextureSet {
  terrain: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  skyDome: THREE.CanvasTexture;
  containerRed: THREE.CanvasTexture;
  containerTeal: THREE.CanvasTexture;
  crateWood: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  sandbag: THREE.CanvasTexture;
  woodlandCamo: THREE.CanvasTexture;
  desertCamo: THREE.CanvasTexture;
  arcticCamo: THREE.CanvasTexture;
  urbanRipstop: THREE.CanvasTexture;
  leatherGrain: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  nexteraTerrain: THREE.CanvasTexture;
  nexteraSkyDome: THREE.CanvasTexture;
  nexteraPad: THREE.CanvasTexture;
  nexteraPodCyan: THREE.CanvasTexture;
  nexteraPodOrange: THREE.CanvasTexture;
  nexteraCrate: THREE.CanvasTexture;
  realisticTerrain: THREE.CanvasTexture;
  realisticSkyDome: THREE.CanvasTexture;
  asphaltRoad: THREE.CanvasTexture;
  brickConcrete: THREE.CanvasTexture;
  vehicleOlive: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const terrain = createCanvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = '#4a563b';
      ctx.fillRect(0, 0, s, s);

      // Rich soil, moss, and dry grass patches
      for (let i = 0; i < 4200; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 1.5 + Math.random() * 7;
        const roll = Math.random();
        ctx.fillStyle =
          roll < 0.28
            ? 'rgba(54, 67, 42, 0.42)'
            : roll < 0.58
              ? 'rgba(89, 98, 63, 0.34)'
              : roll < 0.85
                ? 'rgba(104, 88, 62, 0.28)'
                : 'rgba(128, 118, 86, 0.22)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    28,
    maxAnisotropy,
  );

  const terrainBump = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 3000; i++) {
        const v = Math.floor(85 + Math.random() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
      }
    },
    28,
    maxAnisotropy,
    false,
  );

  const skyDome = createCanvasTexture(
    512,
    (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0.0, '#1e3a5f');
      grad.addColorStop(0.32, '#4776a3');
      grad.addColorStop(0.54, '#95b4cc');
      grad.addColorStop(0.68, '#d4c3aa');
      grad.addColorStop(1.0, '#787b74');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Soft atmospheric cloud wisps
      for (let i = 0; i < 65; i++) {
        const x = Math.random() * s;
        const y = s * 0.22 + Math.random() * (s * 0.32);
        const rw = 30 + Math.random() * 90;
        const rh = 6 + Math.random() * 14;
        ctx.fillStyle = 'rgba(255, 248, 238, 0.08)';
        ctx.beginPath();
        ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1,
    maxAnisotropy,
  );

  const makeCorrugated = (baseHex: string, darkHex: string, lightHex: string) =>
    createCanvasTexture(
      256,
      (ctx, s) => {
        ctx.fillStyle = baseHex;
        ctx.fillRect(0, 0, s, s);
        const ribs = 16;
        const ribW = s / ribs;
        for (let i = 0; i < ribs; i++) {
          ctx.fillStyle = darkHex;
          ctx.fillRect(i * ribW, 0, ribW * 0.32, s);
          ctx.fillStyle = lightHex;
          ctx.fillRect(i * ribW + ribW * 0.32, 0, ribW * 0.22, s);
        }
        // Rust & weathering streaks
        for (let i = 0; i < 450; i++) {
          ctx.fillStyle = Math.random() > 0.7 ? 'rgba(105, 52, 24, 0.2)' : 'rgba(15, 23, 42, 0.14)';
          ctx.fillRect(Math.random() * s, Math.random() * s, 3, 4 + Math.random() * 8);
        }
      },
      2,
      maxAnisotropy,
    );

  const containerRed = makeCorrugated('#7d2e26', '#541c16', '#983d33');
  const containerTeal = makeCorrugated('#244f59', '#16353d', '#316875');

  const crateWood = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#7e5d3b';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 6; i++) {
        const y = (s / 6) * i;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(82, 58, 33, 0.28)' : 'rgba(152, 116, 77, 0.16)';
        ctx.fillRect(0, y, s, s / 6);
        ctx.fillStyle = '#402c18';
        ctx.fillRect(0, y, s, 2);
      }
      ctx.strokeStyle = '#533b22';
      ctx.lineWidth = 18;
      ctx.strokeRect(9, 9, s - 18, s - 18);
      ctx.beginPath();
      ctx.moveTo(14, 14);
      ctx.lineTo(s - 14, s - 14);
      ctx.stroke();
    },
    1,
    maxAnisotropy,
  );

  const concrete = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#6f7370';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(42, 46, 44, 0.22)' : 'rgba(155, 158, 154, 0.16)';
        ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 2, 2 + Math.random() * 2);
      }
      ctx.strokeStyle = 'rgba(30, 34, 32, 0.34)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, s - 4, s - 4);
    },
    3,
    maxAnisotropy,
  );

  const sandbag = createCanvasTexture(
    128,
    (ctx, s) => {
      ctx.fillStyle = '#9c8a6b';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(65, 53, 35, 0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i < s; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
    },
    2,
    maxAnisotropy,
  );

  const woodlandCamo = createCanvasTexture(
    256,
    (ctx, s) => drawCamoPattern(ctx, s, '#3d4c32', ['#2a3522', '#525f3f', '#5a4a35', '#23281d']),
    2,
    maxAnisotropy,
  );

  const desertCamo = createCanvasTexture(
    256,
    (ctx, s) => drawCamoPattern(ctx, s, '#b69f7b', ['#99815d', '#cbb692', '#7d684a', '#a8906c']),
    2,
    maxAnisotropy,
  );

  const arcticCamo = createCanvasTexture(
    256,
    (ctx, s) => drawCamoPattern(ctx, s, '#dce2ea', ['#b9c4d1', '#eef2f6', '#7b8a9c', '#cbd5e1']),
    2,
    maxAnisotropy,
  );

  const urbanRipstop = createCanvasTexture(
    256,
    (ctx, s) => drawCamoPattern(ctx, s, '#222730', ['#181c23', '#2d333f', '#15181e', '#384152']),
    2,
    maxAnisotropy,
  );

  const leatherGrain = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#752222';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1800; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(30, 8, 8, 0.22)' : 'rgba(175, 72, 72, 0.14)';
        ctx.beginPath();
        ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    2,
    maxAnisotropy,
  );

  const contactShadowCanvas = document.createElement('canvas');
  contactShadowCanvas.width = 128;
  contactShadowCanvas.height = 128;
  const csCtx = contactShadowCanvas.getContext('2d');
  if (csCtx) {
    const grad = csCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.26)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    csCtx.fillStyle = grad;
    csCtx.fillRect(0, 0, 128, 128);
  }
  const contactShadow = new THREE.CanvasTexture(contactShadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  const nexteraTerrain = createCanvasTexture(
    512,
    (ctx, s) => {
      // Dark volcanic basalt & cyber-island turf with subtle tech-grid lines
      ctx.fillStyle = '#24303f';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 3600; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 1.5 + Math.random() * 6;
        const roll = Math.random();
        ctx.fillStyle =
          roll < 0.34
            ? 'rgba(30, 58, 74, 0.38)'
            : roll < 0.68
              ? 'rgba(51, 65, 85, 0.34)'
              : 'rgba(20, 83, 95, 0.22)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.12)';
      ctx.lineWidth = 1.5;
      const step = s / 8;
      for (let i = 0; i <= s; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
    },
    26,
    maxAnisotropy,
  );

  const nexteraSkyDome = createCanvasTexture(
    512,
    (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0.0, '#091426');
      grad.addColorStop(0.32, '#13315c');
      grad.addColorStop(0.55, '#1d5c8f');
      grad.addColorStop(0.7, '#67b7d1');
      grad.addColorStop(1.0, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 55; i++) {
        const x = Math.random() * s;
        const y = s * 0.25 + Math.random() * (s * 0.28);
        ctx.fillStyle = 'rgba(125, 211, 252, 0.08)';
        ctx.beginPath();
        ctx.ellipse(x, y, 36 + Math.random() * 90, 5 + Math.random() * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1,
    maxAnisotropy,
  );

  const nexteraPad = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#2b3443';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#18202c';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, s - 8, s - 8);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.26)';
      ctx.lineWidth = 2;
      ctx.strokeRect(18, 18, s - 36, s - 36);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.fillRect(28, 28, 10, 10);
      ctx.fillRect(s - 38, 28, 10, 10);
      ctx.fillRect(28, s - 38, 10, 10);
      ctx.fillRect(s - 38, s - 38, 10, 10);
    },
    4,
    maxAnisotropy,
  );

  const makeNexteraPod = (bodyHex: string, panelHex: string, accentHex: string) =>
    createCanvasTexture(
      256,
      (ctx, s) => {
        ctx.fillStyle = bodyHex;
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = panelHex;
        ctx.fillRect(14, 18, s - 28, s - 36);
        // Neon energy trim stripe
        ctx.fillStyle = accentHex;
        ctx.fillRect(0, s * 0.46, s, 14);
        // Tech ribs
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        for (let x = 24; x < s - 24; x += 28) {
          ctx.fillRect(x, 26, 8, s - 52);
        }
      },
      1,
      maxAnisotropy,
    );

  const nexteraPodCyan = makeNexteraPod('#1e293b', '#2b3a4f', '#22d3ee');
  const nexteraPodOrange = makeNexteraPod('#262a34', '#363b47', '#f97316');

  const nexteraCrate = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 18;
      ctx.strokeRect(9, 9, s - 18, s - 18);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 4;
      ctx.strokeRect(24, 24, s - 48, s - 48);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(s * 0.35, s * 0.45, s * 0.3, s * 0.1);
    },
    1,
    maxAnisotropy,
  );

  const realisticTerrain = createCanvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = '#4f6239';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 6500; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 1 + Math.random() * 5.5;
        const roll = Math.random();
        ctx.fillStyle =
          roll < 0.28
            ? 'rgba(58, 79, 38, 0.42)'
            : roll < 0.56
              ? 'rgba(98, 114, 64, 0.36)'
              : roll < 0.8
                ? 'rgba(118, 97, 68, 0.26)'
                : 'rgba(139, 134, 98, 0.18)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    32,
    maxAnisotropy,
  );

  const realisticSkyDome = createCanvasTexture(
    512,
    (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0.0, '#1e4e8c');
      grad.addColorStop(0.28, '#4a85bf');
      grad.addColorStop(0.52, '#99c2e3');
      grad.addColorStop(0.68, '#e3e8ea');
      grad.addColorStop(1.0, '#8f9b8c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Sun halo & sunlit daylight cloud layers
      const sunGrad = ctx.createRadialGradient(s * 0.72, s * 0.34, 4, s * 0.72, s * 0.34, 110);
      sunGrad.addColorStop(0, 'rgba(255, 251, 232, 0.92)');
      sunGrad.addColorStop(0.3, 'rgba(255, 240, 200, 0.35)');
      sunGrad.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, s, s);

      for (let i = 0; i < 85; i++) {
        const x = Math.random() * s;
        const y = s * 0.24 + Math.random() * (s * 0.28);
        const rw = 26 + Math.random() * 82;
        const rh = 6 + Math.random() * 14;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1,
    maxAnisotropy,
  );

  const asphaltRoad = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#33363b';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 3200; i++) {
        const shade = Math.random() > 0.5 ? 'rgba(20, 22, 26, 0.28)' : 'rgba(98, 102, 110, 0.22)';
        ctx.fillStyle = shade;
        ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
      }
      // Dashed yellow highway centerline
      ctx.fillStyle = '#d9a424';
      for (let y = 12; y < s; y += 48) {
        ctx.fillRect(s / 2 - 4, y, 8, 24);
      }
      // White edge lines
      ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
      ctx.fillRect(10, 0, 5, s);
      ctx.fillRect(s - 15, 0, 5, s);
    },
    6,
    maxAnisotropy,
  );

  const brickConcrete = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#8b857a';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 32) {
        ctx.fillStyle = 'rgba(55, 52, 46, 0.22)';
        ctx.fillRect(0, y, s, 2);
      }
      for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(40, 38, 34, 0.16)' : 'rgba(215, 208, 196, 0.14)';
        ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
    },
    3,
    maxAnisotropy,
  );

  const vehicleOlive = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#4e583d';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(32, 38, 24, 0.2)' : 'rgba(116, 125, 92, 0.14)';
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
      }
      ctx.strokeStyle = 'rgba(25, 30, 18, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, s - 20, s - 20);
    },
    1,
    maxAnisotropy,
  );

  return {
    terrain,
    terrainBump,
    skyDome,
    containerRed,
    containerTeal,
    crateWood,
    concrete,
    sandbag,
    woodlandCamo,
    desertCamo,
    arcticCamo,
    urbanRipstop,
    leatherGrain,
    contactShadow,
    nexteraTerrain,
    nexteraSkyDome,
    nexteraPad,
    nexteraPodCyan,
    nexteraPodOrange,
    nexteraCrate,
    realisticTerrain,
    realisticSkyDome,
    asphaltRoad,
    brickConcrete,
    vehicleOlive,
    dispose: () => {
      terrain.dispose();
      terrainBump.dispose();
      skyDome.dispose();
      containerRed.dispose();
      containerTeal.dispose();
      crateWood.dispose();
      concrete.dispose();
      sandbag.dispose();
      woodlandCamo.dispose();
      desertCamo.dispose();
      arcticCamo.dispose();
      urbanRipstop.dispose();
      leatherGrain.dispose();
      contactShadow.dispose();
      nexteraTerrain.dispose();
      nexteraSkyDome.dispose();
      nexteraPad.dispose();
      nexteraPodCyan.dispose();
      nexteraPodOrange.dispose();
      nexteraCrate.dispose();
      realisticTerrain.dispose();
      realisticSkyDome.dispose();
      asphaltRoad.dispose();
      brickConcrete.dispose();
      vehicleOlive.dispose();
    },
  };
}
