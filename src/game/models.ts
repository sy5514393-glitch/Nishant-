import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import { EmoteId, MapId, OutfitId, WEAPON_BY_ID, WeaponId } from './types';

export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= 17.5) return 0;

  // Smoothly blend from flat central compound to rolling terrain
  const blend = THREE.MathUtils.smoothstep(r, 17.5, 28);
  const hills =
    Math.sin(x * 0.055) * Math.cos(z * 0.055) * 1.35 +
    Math.sin((x - z) * 0.032) * 0.65;

  // Natural outer valley rim beyond R = 80
  const rim = r > 80 ? Math.pow((r - 80) * 0.14, 1.45) : 0;
  return hills * blend + rim;
}

export interface OperatorRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  gunGroup: THREE.Group;
  backGunGroup: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  contactShadow: THREE.Mesh;
  armorMaterial: THREE.MeshStandardMaterial;
  hpBarFill?: THREE.Mesh;
  hpBarGroup?: THREE.Group;
}

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
}

export function createWeaponMesh(
  weaponId: WeaponId,
  includeMuzzle = true,
): {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
} {
  const group = new THREE.Group();
  const gunMetalMat = new THREE.MeshStandardMaterial({
    color: weaponId === 'sniper' ? 0x263128 : 0x1a2028,
    roughness: 0.25,
    metalness: 0.88,
  });
  const gunPolymerMat = new THREE.MeshStandardMaterial({
    color: weaponId === 'shotgun' ? 0x5c3820 : weaponId === 'sniper' ? 0x3b4d34 : 0x2a2d34,
    roughness: weaponId === 'shotgun' ? 0.62 : 0.56,
    metalness: 0.14,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: WEAPON_BY_ID[weaponId].accentHex,
    emissive: WEAPON_BY_ID[weaponId].accentHex,
    emissiveIntensity: 0.28,
    roughness: 0.3,
    metalness: 0.5,
  });

  let muzzleZ = 0.78;

  if (weaponId === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.1, 0.32), gunMetalMat);
    receiver.castShadow = true;
    group.add(receiver);

    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.08, 0.22), gunPolymerMat);
    shroud.position.set(0, 0.005, 0.22);
    group.add(shroud);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.2, 8), gunMetalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.012, 0.36);
    group.add(barrel);

    const stickMag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.22, 0.055), gunPolymerMat);
    stickMag.position.set(0, -0.14, 0.09);
    stickMag.rotation.x = -0.18;
    group.add(stickMag);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.06), gunPolymerMat);
    grip.position.set(0, -0.08, -0.07);
    grip.rotation.x = 0.25;
    group.add(grip);

    const foldingStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.085, 0.19), gunMetalMat);
    foldingStock.position.set(0, -0.01, -0.24);
    group.add(foldingStock);

    const reflex = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.042, 0.065), accentMat);
    reflex.position.set(0, 0.072, 0.02);
    group.add(reflex);

    muzzleZ = 0.48;
  } else if (weaponId === 'shotgun') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.115, 0.34), gunMetalMat);
    receiver.castShadow = true;
    group.add(receiver);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.13, 0.3), gunPolymerMat);
    stock.position.set(0, -0.04, -0.29);
    stock.rotation.x = 0.15;
    group.add(stock);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.56, 10), gunMetalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.026, 0.42);
    group.add(barrel);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.48, 8), gunMetalMat);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.016, 0.38);
    group.add(magTube);

    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 8), gunPolymerMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.018, 0.32);
    group.add(pump);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.04, 0.14), accentMat);
    saddle.position.set(0, 0.01, 0.02);
    group.add(saddle);

    muzzleZ = 0.72;
  } else if (weaponId === 'sniper') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.105, 0.52), gunPolymerMat);
    chassis.castShadow = true;
    group.add(chassis);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.32), gunPolymerMat);
    stock.position.set(0, -0.02, -0.38);
    group.add(stock);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.72, 10), gunMetalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, 0.58);
    group.add(barrel);

    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.044, 0.11), gunMetalMat);
    muzzleBrake.position.set(0, 0.024, 0.94);
    group.add(muzzleBrake);

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.34, 10), gunMetalMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.105, 0.04);
    group.add(scopeTube);

    const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 10), accentMat);
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0, 0.105, 0.21);
    group.add(scopeLens);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.12, 0.09), gunMetalMat);
    mag.position.set(0, -0.095, 0.06);
    group.add(mag);

    muzzleZ = 1.02;
  } else if (weaponId === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.068, 0.25), gunMetalMat);
    slide.position.set(0, 0.025, 0.06);
    slide.castShadow = true;
    group.add(slide);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.04, 0.22), gunPolymerMat);
    frame.position.set(0, -0.015, 0.05);
    group.add(frame);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.12, 0.065), gunPolymerMat);
    grip.position.set(0, -0.075, -0.03);
    grip.rotation.x = 0.24;
    group.add(grip);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 8), gunMetalMat);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.022, 0.25);
    group.add(suppressor);

    const sightDot = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.016, 0.025), accentMat);
    sightDot.position.set(0, 0.064, 0.15);
    group.add(sightDot);

    muzzleZ = 0.34;
  } else {
    // M4A1 Carbine (default)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.44), gunMetalMat);
    receiver.castShadow = true;
    group.add(receiver);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.36), gunPolymerMat);
    rail.position.set(0, 0.068, 0.06);
    group.add(rail);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.25), gunPolymerMat);
    stock.position.set(0, -0.015, -0.32);
    group.add(stock);

    const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), gunPolymerMat);
    pistolGrip.position.set(0, -0.09, -0.1);
    pistolGrip.rotation.x = 0.28;
    group.add(pistolGrip);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.46, 10), gunMetalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, 0.42);
    group.add(barrel);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 10), gunMetalMat);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.015, 0.68);
    group.add(suppressor);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.21, 0.08), gunMetalMat);
    magazine.position.set(0, -0.14, 0.08);
    magazine.rotation.x = 0.24;
    group.add(magazine);

    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.055, 0.1), accentMat);
    optic.position.set(0, 0.105, 0.01);
    group.add(optic);

    muzzleZ = 0.78;
  }

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.015, muzzleZ);
  group.add(muzzlePoint);

  const muzzleFlash = new THREE.Mesh(
    new THREE.ConeGeometry(weaponId === 'shotgun' ? 0.18 : 0.13, 0.34, 6),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.92,
    }),
  );
  muzzleFlash.rotation.x = Math.PI / 2;
  muzzleFlash.position.set(0, 0.015, muzzleZ + 0.14);
  muzzleFlash.visible = false;
  if (includeMuzzle) {
    group.add(muzzleFlash);
  }

  return { group, muzzlePoint, muzzleFlash };
}

export function attachOperatorWeapons(
  rig: OperatorRig,
  activeWeapon: WeaponId,
  backWeapon?: WeaponId | null,
): void {
  while (rig.gunGroup.children.length > 0) {
    const child = rig.gunGroup.children[0];
    rig.gunGroup.remove(child);
    disposeObject3D(child);
  }
  while (rig.backGunGroup.children.length > 0) {
    const child = rig.backGunGroup.children[0];
    rig.backGunGroup.remove(child);
    disposeObject3D(child);
  }

  const activeModel = createWeaponMesh(activeWeapon, true);
  rig.gunGroup.add(activeModel.group);
  rig.muzzlePoint = activeModel.muzzlePoint;
  rig.muzzleFlash = activeModel.muzzleFlash;

  if (backWeapon) {
    const backModel = createWeaponMesh(backWeapon, false);
    backModel.group.scale.setScalar(0.88);
    backModel.group.rotation.set(Math.PI * 0.38, 0, Math.PI * 0.16);
    rig.backGunGroup.add(backModel.group);
    rig.backGunGroup.visible = true;
  } else {
    rig.backGunGroup.visible = false;
  }
}

export function createOperatorModel(
  isPlayer: boolean,
  shadowTexture: THREE.Texture,
  textures: ProceduralTextureSet,
  outfitId: OutfitId = 'tactical-camo',
): OperatorRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Outfit-driven textures & materials
  let jacketMat: THREE.MeshStandardMaterial;
  let pantsMat: THREE.MeshStandardMaterial;
  let armorMaterial: THREE.MeshStandardMaterial;
  let bootColor = 0x16181b;
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc99672,
    roughness: 0.68,
    metalness: 0.02,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x181b20,
    roughness: 0.72,
    metalness: 0.12,
  });

  switch (outfitId) {
    case 'desert-pmc':
      jacketMat = new THREE.MeshStandardMaterial({
        map: textures.desertCamo,
        roughness: 0.86,
        metalness: 0.03,
      });
      pantsMat = new THREE.MeshStandardMaterial({
        color: 0x6b5c46,
        roughness: 0.88,
        metalness: 0.03,
      });
      armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x4b4032,
        roughness: 0.65,
        metalness: 0.18,
      });
      bootColor = 0x5c4732;
      break;

    case 'urban-swat':
      jacketMat = new THREE.MeshStandardMaterial({
        map: textures.urbanRipstop,
        roughness: 0.72,
        metalness: 0.1,
      });
      pantsMat = new THREE.MeshStandardMaterial({
        map: textures.urbanRipstop,
        roughness: 0.74,
        metalness: 0.08,
      });
      armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x12151a,
        roughness: 0.42,
        metalness: 0.45,
      });
      break;

    case 'ghillie-recon':
      jacketMat = new THREE.MeshStandardMaterial({
        map: textures.woodlandCamo,
        roughness: 0.94,
        metalness: 0.01,
      });
      pantsMat = new THREE.MeshStandardMaterial({
        map: textures.woodlandCamo,
        roughness: 0.94,
        metalness: 0.01,
      });
      armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x354428,
        roughness: 0.88,
        metalness: 0.04,
      });
      bootColor = 0x26211a;
      break;

    case 'arctic-winter':
      jacketMat = new THREE.MeshStandardMaterial({
        map: textures.arcticCamo,
        roughness: 0.68,
        metalness: 0.06,
      });
      pantsMat = new THREE.MeshStandardMaterial({
        map: textures.arcticCamo,
        roughness: 0.72,
        metalness: 0.04,
      });
      armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.52,
        metalness: 0.25,
      });
      bootColor = 0x29323d;
      break;

    case 'crimson-mercenary':
      jacketMat = new THREE.MeshStandardMaterial({
        map: textures.leatherGrain,
        roughness: 0.44,
        metalness: 0.18,
      });
      pantsMat = new THREE.MeshStandardMaterial({
        color: 0x1c2026,
        roughness: 0.82,
        metalness: 0.05,
      });
      armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x262930,
        roughness: 0.52,
        metalness: 0.35,
      });
      break;

    case 'tactical-camo':
    default:
      jacketMat = new THREE.MeshStandardMaterial({
        map: textures.woodlandCamo,
        roughness: 0.86,
        metalness: 0.04,
      });
      pantsMat = new THREE.MeshStandardMaterial({
        map: textures.woodlandCamo,
        roughness: 0.88,
        metalness: 0.03,
      });
      armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b3626,
        roughness: 0.58,
        metalness: 0.22,
      });
      break;
  }

  const bootMat = new THREE.MeshStandardMaterial({
    color: bootColor,
    roughness: 0.72,
    metalness: 0.14,
  });

  const gunMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1a2028,
    roughness: 0.26,
    metalness: 0.88,
  });

  const gunPolymerMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d34,
    roughness: 0.58,
    metalness: 0.15,
  });

  // Ground contact shadow
  const shadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.58,
    }),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.03;
  root.add(shadowMesh);

  // Articulated Anatomical Legs (hip pivot at y = 0.78)
  const buildLeg = (sideX: number): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(sideX, 0.78, 0);

    const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), pantsMat);
    hipJoint.position.set(0, -0.02, 0);
    legPivot.add(hipJoint);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.096, 0.34, 12), pantsMat);
    thigh.position.set(0, -0.19, 0);
    thigh.castShadow = true;
    legPivot.add(thigh);

    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), armorMaterial);
    kneePad.position.set(0, -0.36, 0.045);
    kneePad.scale.set(0.95, 0.85, 0.7);
    legPivot.add(kneePad);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.072, 0.33, 12), pantsMat);
    shin.position.set(0, -0.52, -0.01);
    shin.castShadow = true;
    legPivot.add(shin);

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.084, 0.16, 10), bootMat);
    bootShaft.position.set(0, -0.66, 0);
    bootShaft.castShadow = true;
    legPivot.add(bootShaft);

    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.27), bootMat);
    bootSole.position.set(0, -0.735, 0.04);
    bootSole.castShadow = true;
    legPivot.add(bootSole);

    const bootToe = new THREE.Mesh(new THREE.SphereGeometry(0.076, 10, 8), bootMat);
    bootToe.position.set(0, -0.72, 0.145);
    bootToe.scale.set(0.98, 0.62, 1.05);
    legPivot.add(bootToe);

    return legPivot;
  };

  const leftLeg = buildLeg(-0.145);
  const rightLeg = buildLeg(0.145);
  bodyGroup.add(leftLeg);
  bodyGroup.add(rightLeg);

  // Pelvis & Tactical Belt + Thigh Holster
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.18, 14), pantsMat);
  pelvis.position.set(0, 0.82, 0);
  pelvis.scale.set(1.06, 1, 0.72);
  pelvis.castShadow = true;
  bodyGroup.add(pelvis);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.065, 14), bootMat);
  belt.position.set(0, 0.9, 0);
  belt.scale.set(1.07, 1, 0.74);
  bodyGroup.add(belt);

  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.17, 0.11), bootMat);
  rightLeg.add(holster);
  holster.position.set(0.105, -0.15, 0.02);

  // Anatomical Tapered Human Torso (shoulders broader than waist)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.56, 14), jacketMat);
  torso.position.set(0, 1.18, 0);
  torso.scale.set(1.14, 1, 0.72);
  torso.castShadow = true;
  bodyGroup.add(torso);

  const chestPec = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), jacketMat);
  chestPec.position.set(0, 1.29, 0.04);
  chestPec.scale.set(1.22, 0.68, 0.72);
  bodyGroup.add(chestPec);

  // Plate Carrier / Vest (or Jacket Collar for Crimson Mercenary)
  if (outfitId !== 'crimson-mercenary') {
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.22, 0.4, 12), armorMaterial);
    vest.position.set(0, 1.19, 0.015);
    vest.scale.set(1.08, 1, 0.78);
    vest.castShadow = true;
    bodyGroup.add(vest);

    // Shoulder Straps
    for (const sx of [-0.14, 0.14]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.24), armorMaterial);
      strap.position.set(sx, 1.42, 0);
      bodyGroup.add(strap);
    }

    // 3 Front Magazine Pouches
    for (let i = -1; i <= 1; i++) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.145, 0.065), bootMat);
      pouch.position.set(i * 0.115, 1.09, 0.185);
      bodyGroup.add(pouch);
    }
  } else {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 8, 14, Math.PI * 1.4), jacketMat);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI * 0.8;
    collar.position.set(0, 1.45, 0.02);
    bodyGroup.add(collar);

    const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.48, 0.03), gunMetalMat);
    zipper.position.set(0, 1.18, 0.175);
    bodyGroup.add(zipper);
  }

  // Urban SWAT Shoulder Pauldrons
  if (outfitId === 'urban-swat') {
    for (const sx of [-0.33, 0.33]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), armorMaterial);
      pad.position.set(sx, 1.38, 0);
      pad.rotation.z = sx < 0 ? 0.4 : -0.4;
      bodyGroup.add(pad);
    }
  }

  // Ghillie Recon Moss Mantle & Hood Drape
  if (outfitId === 'ghillie-recon') {
    const ghillieMat1 = new THREE.MeshStandardMaterial({ color: 0x3b4d2b, roughness: 0.96 });
    const ghillieMat2 = new THREE.MeshStandardMaterial({ color: 0x556839, roughness: 0.96 });
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.41, 0.4, 10, 1, true), ghillieMat1);
    mantle.position.set(0, 1.34, -0.02);
    mantle.castShadow = true;
    bodyGroup.add(mantle);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tuft = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), i % 2 === 0 ? ghillieMat1 : ghillieMat2);
      tuft.position.set(Math.cos(a) * 0.27, 1.32 + (i % 2) * 0.08, Math.sin(a) * 0.21);
      bodyGroup.add(tuft);
    }
  }

  // Arctic Winter Fur Collar
  if (outfitId === 'arctic-winter') {
    const furMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.95 });
    const furCollar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 14), furMat);
    furCollar.rotation.x = Math.PI / 2;
    furCollar.position.set(0, 1.45, 0.01);
    bodyGroup.add(furCollar);
  }

  // Tactical Backpack + Radio Antenna
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.16), armorMaterial);
  pack.position.set(0, 1.2, -0.23);
  pack.castShadow = true;
  bodyGroup.add(pack);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.32, 6), gunMetalMat);
  antenna.position.set(-0.13, 1.53, -0.23);
  bodyGroup.add(antenna);

  // Articulated Human Arms (deltoid shoulder, tapered bicep/forearm, palm & thumb)
  const forearmMat = outfitId === 'desert-pmc' ? skinMat : jacketMat;
  const buildArm = (sx: number, upperRotX: number, upperRotZ: number): THREE.Group => {
    const armGroup = new THREE.Group();
    armGroup.position.set(sx, 1.38, 0.02);
    armGroup.rotation.set(upperRotX, 0, upperRotZ);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), jacketMat);
    shoulder.castShadow = true;
    armGroup.add(shoulder);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.064, 0.24, 10), jacketMat);
    upperArm.position.set(0, -0.13, 0);
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.064, 8, 8), forearmMat);
    elbow.position.set(0, -0.25, 0.01);
    armGroup.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.048, 0.24, 10), forearmMat);
    forearm.position.set(0, -0.35, 0.08);
    forearm.rotation.x = -0.58;
    forearm.castShadow = true;
    armGroup.add(forearm);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.082), gloveMat);
    palm.position.set(0, -0.45, 0.18);
    armGroup.add(palm);

    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.035, 4, 6), gloveMat);
    thumb.position.set(sx < 0 ? 0.032 : -0.032, -0.43, 0.19);
    thumb.rotation.z = sx < 0 ? -0.4 : 0.4;
    armGroup.add(thumb);

    bodyGroup.add(armGroup);
    return armGroup;
  };

  const leftArm = buildArm(-0.3, -0.82, 0.24);
  const rightArm = buildArm(0.3, -0.95, -0.14);

  // Realistic Human Neck & Sculpted Facial Head Group
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.13, 10), skinMat);
  neck.position.set(0, 1.48, 0.005);
  bodyGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.49, 0);
  bodyGroup.add(headGroup);

  // Cranium + Jawline / Chin
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.138, 16, 14), skinMat);
  cranium.position.set(0, 0.155, -0.01);
  cranium.scale.set(0.92, 1.06, 1.0);
  cranium.castShadow = true;
  headGroup.add(cranium);

  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.072, 0.11, 12), skinMat);
  jaw.position.set(0, 0.078, 0.024);
  jaw.scale.set(0.9, 1, 0.94);
  headGroup.add(jaw);

  // Left & Right Ears
  for (const ex of [-0.125, 0.125]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), skinMat);
    ear.position.set(ex, 0.145, -0.01);
    ear.scale.set(0.45, 1.0, 0.72);
    headGroup.add(ear);
  }

  // Nose Bridge
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 6), skinMat);
  nose.rotation.x = Math.PI * 0.44;
  nose.position.set(0, 0.135, 0.135);
  headGroup.add(nose);

  // Human Eyes (sclera + iris) & Eyebrows + Mouth
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.85 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x9f6454, roughness: 0.65 });

  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), scleraMat);
    eyeWhite.position.set(side * 0.044, 0.162, 0.118);
    eyeWhite.scale.set(1.1, 0.82, 0.7);
    headGroup.add(eyeWhite);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), irisMat);
    pupil.position.set(side * 0.044, 0.162, 0.13);
    headGroup.add(pupil);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.016), browMat);
    brow.position.set(side * 0.046, 0.186, 0.122);
    brow.rotation.z = side * -0.08;
    headGroup.add(brow);
  }

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.012, 0.014), lipMat);
  mouth.position.set(0, 0.082, 0.118);
  headGroup.add(mouth);

  // Hair / Sideburns under headgear
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.142, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    browMat,
  );
  hair.position.set(0, 0.165, -0.02);
  headGroup.add(hair);

  // Outfit-specific Headgear & Semi-Transparent Tactical Eyewear
  if (outfitId === 'desert-pmc') {
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      armorMaterial,
    );
    capDome.position.set(0, 0.175, -0.012);
    headGroup.add(capDome);

    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.018, 0.14), armorMaterial);
    capBrim.position.set(0, 0.195, 0.135);
    capBrim.rotation.x = 0.12;
    headGroup.add(capBrim);
  } else if (outfitId === 'crimson-mercenary') {
    const beanie = new THREE.Mesh(
      new THREE.SphereGeometry(0.154, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.92 }),
    );
    beanie.position.set(0, 0.175, -0.02);
    headGroup.add(beanie);
  } else if (outfitId === 'ghillie-recon') {
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      jacketMat,
    );
    hood.position.set(0, 0.168, -0.025);
    hood.castShadow = true;
    headGroup.add(hood);
  } else {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.162, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      armorMaterial,
    );
    helmet.position.set(0, 0.178, -0.015);
    helmet.castShadow = true;
    headGroup.add(helmet);

    const visorMat = new THREE.MeshStandardMaterial({
      color: outfitId === 'arctic-winter' ? 0x38bdf8 : outfitId === 'urban-swat' ? 0x1e293b : 0xf59e0b,
      roughness: 0.12,
      metalness: 0.55,
      transparent: true,
      opacity: 0.48,
      emissive: isPlayer ? 0x0c4a6e : 0x451a03,
      emissiveIntensity: 0.18,
    });
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, outfitId === 'urban-swat' ? 0.08 : 0.055, 0.045),
      visorMat,
    );
    visor.position.set(0, 0.162, 0.132);
    headGroup.add(visor);
  }

  // Detailed Tactical Weapon Mounts (hand weapon + holstered back weapon)
  const gunGroup = new THREE.Group();
  gunGroup.position.set(0.2, 1.21, 0.32);
  bodyGroup.add(gunGroup);

  const backGunGroup = new THREE.Group();
  backGunGroup.position.set(-0.08, 1.22, -0.35);
  bodyGroup.add(backGunGroup);

  const initialWeapon = createWeaponMesh('carbine', true);
  gunGroup.add(initialWeapon.group);

  // Enemy floating health bar
  let hpBarGroup: THREE.Group | undefined;
  let hpBarFill: THREE.Mesh | undefined;
  if (!isPlayer) {
    hpBarGroup = new THREE.Group();
    hpBarGroup.position.set(0, 2.08, 0);
    hpBarGroup.visible = false;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide }),
    );
    hpBarGroup.add(bg);

    hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.065),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }),
    );
    hpBarFill.position.z = 0.005;
    hpBarGroup.add(hpBarFill);

    root.add(hpBarGroup);
  }

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    gunGroup,
    backGunGroup,
    muzzlePoint: initialWeapon.muzzlePoint,
    muzzleFlash: initialWeapon.muzzleFlash,
    contactShadow: shadowMesh,
    armorMaterial,
    hpBarFill,
    hpBarGroup,
  };
}

export function resetOperatorCombatPose(rig: OperatorRig): void {
  rig.leftArm.rotation.set(-0.82, 0, 0.24);
  rig.rightArm.rotation.set(-0.95, 0, -0.14);
  rig.headGroup.rotation.set(0, 0, 0);
  rig.bodyGroup.rotation.set(0, 0, 0);
  rig.gunGroup.visible = true;
}

export function applyOperatorEmotePose(
  rig: OperatorRig,
  emoteId: EmoteId,
  elapsed: number,
): void {
  // Holster rifle cleanly while gesturing/dancing
  rig.gunGroup.visible = false;

  switch (emoteId) {
    case 'wave': {
      rig.rightArm.rotation.set(-2.55, 0, -0.45 + Math.sin(elapsed * 9.5) * 0.38);
      rig.leftArm.rotation.set(0.1, 0, 0.18);
      rig.headGroup.rotation.set(0.06, 0, Math.sin(elapsed * 4.2) * 0.12);
      rig.bodyGroup.position.y = Math.sin(elapsed * 3) * 0.015;
      rig.bodyGroup.rotation.set(0, 0, 0);
      rig.leftLeg.rotation.x = 0;
      rig.rightLeg.rotation.x = 0;
      break;
    }

    case 'dance': {
      const beat = elapsed * 7.5;
      rig.bodyGroup.position.y = Math.abs(Math.sin(beat)) * 0.11;
      rig.bodyGroup.rotation.y = Math.sin(beat * 0.5) * 0.32;
      rig.bodyGroup.rotation.z = Math.cos(beat * 0.5) * 0.09;
      rig.leftArm.rotation.set(-1.5 + Math.sin(beat) * 0.85, 0, 0.55 + Math.cos(beat) * 0.25);
      rig.rightArm.rotation.set(-1.5 - Math.sin(beat) * 0.85, 0, -0.55 - Math.cos(beat) * 0.25);
      rig.leftLeg.rotation.x = Math.sin(beat) * 0.36;
      rig.rightLeg.rotation.x = -Math.sin(beat) * 0.36;
      rig.headGroup.rotation.set(Math.sin(beat * 2) * 0.12, 0, Math.sin(beat) * 0.14);
      break;
    }

    case 'salute': {
      rig.rightArm.rotation.set(-2.15, -0.4, 0.52);
      rig.leftArm.rotation.set(0.08, 0, 0.12);
      rig.headGroup.rotation.set(-0.08, 0, 0);
      rig.bodyGroup.position.y = 0;
      rig.bodyGroup.rotation.set(0, 0, 0);
      rig.leftLeg.rotation.x = 0;
      rig.rightLeg.rotation.x = 0;
      break;
    }

    case 'victory-cheer': {
      const pump = Math.sin(elapsed * 8.2);
      rig.bodyGroup.position.y = Math.max(0, pump) * 0.14;
      rig.leftArm.rotation.set(-2.75 + pump * 0.35, 0, 0.35);
      rig.rightArm.rotation.set(-2.75 + pump * 0.35, 0, -0.35);
      rig.headGroup.rotation.set(-0.2 + pump * 0.1, 0, 0);
      rig.bodyGroup.rotation.set(0, 0, 0);
      rig.leftLeg.rotation.x = pump * 0.18;
      rig.rightLeg.rotation.x = -pump * 0.18;
      break;
    }

    case 'taunt': {
      const sway = Math.sin(elapsed * 5.2);
      rig.bodyGroup.position.y = Math.abs(sway) * 0.04;
      rig.bodyGroup.rotation.y = sway * 0.22;
      rig.rightArm.rotation.set(-1.45, 0.45, -0.25);
      rig.leftArm.rotation.set(-1.15, -0.3, 0.35);
      rig.headGroup.rotation.set(0.08, -sway * 0.15, 0);
      rig.leftLeg.rotation.x = 0.14;
      rig.rightLeg.rotation.x = -0.14;
      break;
    }
  }
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface BuiltEnvironment {
  worldGroup: THREE.Group;
  obstacles: ObstacleBox[];
}

export function buildBattlegroundEnvironment(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  raycastBlockers: THREE.Object3D[],
  mapId: MapId = 'nextera',
): BuiltEnvironment {
  const obstacles: ObstacleBox[] = [];
  const worldGroup = new THREE.Group();
  const isNextera = mapId === 'nextera';
  const isRealistic = mapId === 'realistic';

  // Atmospheric Sky Dome
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(220, 32, 20),
    new THREE.MeshBasicMaterial({
      map: isNextera
        ? textures.nexteraSkyDome
        : isRealistic
          ? textures.realisticSkyDome
          : textures.skyDome,
      side: THREE.BackSide,
      fog: false,
    }),
  );
  worldGroup.add(skyDome);

  // Undulating Ground Terrain with heightmap displacement + bump map
  const groundGeo = new THREE.PlaneGeometry(420, 420, 96, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    posAttr.setY(i, groundHeightAt(vx, vz));
  }
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: isNextera
      ? textures.nexteraTerrain
      : isRealistic
        ? textures.realisticTerrain
        : textures.terrain,
    bumpMap: textures.terrainBump,
    bumpScale: isNextera ? 0.1 : 0.16,
    roughness: isNextera ? 0.78 : 0.92,
    metalness: isNextera ? 0.14 : 0.02,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  worldGroup.add(ground);
  raycastBlockers.push(ground);

  // Central Compound Concrete Apron / Nextera Grav-Pad Plaza
  const padMat = new THREE.MeshStandardMaterial({
    map: isNextera ? textures.nexteraPad : textures.concrete,
    roughness: isNextera ? 0.45 : 0.86,
    metalness: isNextera ? 0.35 : 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const centralPad = new THREE.Mesh(new THREE.BoxGeometry(30, 0.12, 30), padMat);
  centralPad.position.set(0, 0.05, 0);
  centralPad.receiveShadow = true;
  worldGroup.add(centralPad);

  // Realistic Valley Asphalt Highway Crossroads, Outpost Buildings & Tactical Vehicles
  if (isRealistic) {
    const roadMat = new THREE.MeshStandardMaterial({
      map: textures.asphaltRoad,
      roughness: 0.85,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const roadNS = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.09, 165), roadMat);
    roadNS.position.set(0, 0.06, 0);
    roadNS.receiveShadow = true;
    worldGroup.add(roadNS);

    const roadEW = new THREE.Mesh(new THREE.BoxGeometry(165, 0.08, 6.8), roadMat);
    roadEW.position.set(0, 0.055, 0);
    roadEW.receiveShadow = true;
    worldGroup.add(roadEW);

    const wallMat = new THREE.MeshStandardMaterial({
      map: textures.brickConcrete,
      roughness: 0.84,
      metalness: 0.05,
    });
    const roofTrimMat = new THREE.MeshStandardMaterial({ color: 0x2f353b, roughness: 0.6, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.12,
      metalness: 0.85,
    });

    const buildOutpostBuilding = (bx: number, bz: number, rotY: number) => {
      const gy = groundHeightAt(bx, bz);
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, gy - 0.05, bz);
      bGroup.rotation.y = rotY;

      const body = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.6, 5.4), wallMat);
      body.position.y = 1.8;
      body.castShadow = true;
      body.receiveShadow = true;
      bGroup.add(body);
      raycastBlockers.push(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.28, 5.8), roofTrimMat);
      roof.position.y = 3.72;
      roof.castShadow = true;
      bGroup.add(roof);

      for (const wx of [-1.8, 0, 1.8]) {
        const winFront = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.9, 0.1), glassMat);
        winFront.position.set(wx, 2.05, 2.72);
        bGroup.add(winFront);
        const winBack = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.9, 0.1), glassMat);
        winBack.position.set(wx, 2.05, -2.72);
        bGroup.add(winBack);
      }

      const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.12), roofTrimMat);
      door.position.set(0, 1.1, 2.72);
      bGroup.add(door);

      worldGroup.add(bGroup);
      const cos = Math.abs(Math.cos(rotY));
      const sin = Math.abs(Math.sin(rotY));
      obstacles.push({
        minX: bx - (7.2 * cos + 5.4 * sin) / 2,
        maxX: bx + (7.2 * cos + 5.4 * sin) / 2,
        minZ: bz - (7.2 * sin + 5.4 * cos) / 2,
        maxZ: bz + (7.2 * sin + 5.4 * cos) / 2,
        height: 3.7,
      });
    };

    buildOutpostBuilding(-22, -14, 0.12);
    buildOutpostBuilding(24, -18, -0.35);

    const vehMat = new THREE.MeshStandardMaterial({
      map: textures.vehicleOlive,
      roughness: 0.56,
      metalness: 0.35,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.88, metalness: 0.08 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.35, metalness: 0.78 });

    const buildTacticalVehicle = (vx: number, vz: number, rotY: number) => {
      const gy = groundHeightAt(vx, vz);
      const vGroup = new THREE.Group();
      vGroup.position.set(vx, gy, vz);
      vGroup.rotation.y = rotY;

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.78, 4.5), vehMat);
      chassis.position.y = 0.72;
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      vGroup.add(chassis);
      raycastBlockers.push(chassis);

      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.72, 2.15), vehMat);
      cab.position.set(0, 1.44, 0.15);
      cab.castShadow = true;
      vGroup.add(cab);
      raycastBlockers.push(cab);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.5, 0.12), glassMat);
      windshield.position.set(0, 1.44, 1.21);
      windshield.rotation.x = -0.25;
      vGroup.add(windshield);

      for (const [wx, wz] of [
        [-1.06, 1.45],
        [1.06, 1.45],
        [-1.06, -1.45],
        [1.06, -1.45],
      ]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 14), tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(wx, 0.45, wz);
        tire.castShadow = true;
        vGroup.add(tire);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 10), rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(wx, 0.45, wz);
        vGroup.add(rim);
      }

      worldGroup.add(vGroup);
      const cos = Math.abs(Math.cos(rotY));
      const sin = Math.abs(Math.sin(rotY));
      obstacles.push({
        minX: vx - (2.2 * cos + 4.5 * sin) / 2,
        maxX: vx + (2.2 * cos + 4.5 * sin) / 2,
        minZ: vz - (2.2 * sin + 4.5 * cos) / 2,
        maxZ: vz + (2.2 * sin + 4.5 * cos) / 2,
        height: 1.85,
      });
    };

    buildTacticalVehicle(-5.5, 11.5, 0.42);
    buildTacticalVehicle(16.5, 5.5, -1.1);
  }

  // Helipad / Grav-Pad Ring Marking
  const helipadRing = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.65, 48),
    new THREE.MeshStandardMaterial({
      color: isNextera ? 0x22d3ee : isRealistic ? 0xeab308 : 0xd97706,
      emissive: isNextera ? 0x0891b2 : 0x000000,
      emissiveIntensity: isNextera ? 0.9 : 0,
      roughness: isNextera ? 0.25 : 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  helipadRing.rotation.x = -Math.PI / 2;
  helipadRing.position.set(0, 0.12, 0);
  worldGroup.add(helipadRing);

  const registerBox = (x: number, z: number, w: number, h: number, d: number) => {
    obstacles.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      height: h,
    });
  };

  const trimMat = new THREE.MeshStandardMaterial({
    color: isNextera ? 0x0f172a : 0x1e293b,
    roughness: 0.38,
    metalness: 0.75,
  });

  const neonCyanMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    metalness: 0.4,
  });

  // Nextera 4 Corner Energy Pylons around Central Grav-Pad
  if (isNextera) {
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(13.6, 13.9, 64),
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.set(0, 0.12, 0);
    worldGroup.add(outerRing);

    for (const [px, pz] of [
      [-14.2, -14.2],
      [14.2, -14.2],
      [-14.2, 14.2],
      [14.2, 14.2],
    ]) {
      const pylon = new THREE.Group();
      pylon.position.set(px, 0, pz);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.2, 6), trimMat);
      base.position.y = 1.1;
      base.castShadow = true;
      pylon.add(base);
      raycastBlockers.push(base);

      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.3, 8), neonCyanMat);
      core.position.y = 2.6;
      pylon.add(core);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 6), trimMat);
      cap.position.y = 3.5;
      pylon.add(cap);

      worldGroup.add(pylon);
      registerBox(px, pz, 1.1, 3.6, 1.1);
    }
  }

  // Tactical Watchtower / Nextera Intel Spire at (-11, -11)
  {
    const tx = -11;
    const tz = -11;
    const tower = new THREE.Group();
    tower.position.set(tx, groundHeightAt(tx, tz), tz);

    const legGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.4, 8);
    for (const [lx, lz] of [
      [-1.3, -1.3],
      [1.3, -1.3],
      [-1.3, 1.3],
      [1.3, 1.3],
    ]) {
      const leg = new THREE.Mesh(legGeo, trimMat);
      leg.position.set(lx, 2.2, lz);
      leg.castShadow = true;
      tower.add(leg);
      raycastBlockers.push(leg);
    }

    const deckMat = new THREE.MeshStandardMaterial({
      map: isNextera ? textures.nexteraPad : textures.crateWood,
      roughness: isNextera ? 0.42 : 0.8,
      metalness: isNextera ? 0.45 : 0.05,
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 3.2), deckMat);
    deck.position.y = 3.2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    tower.add(deck);
    raycastBlockers.push(deck);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.18, 3.5),
      new THREE.MeshStandardMaterial({
        map: isNextera ? textures.nexteraPodCyan : textures.containerTeal,
        roughness: isNextera ? 0.35 : 0.6,
        metalness: isNextera ? 0.55 : 0.35,
      }),
    );
    roof.position.y = 5.4;
    roof.castShadow = true;
    tower.add(roof);

    if (isNextera) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 28), neonCyanMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 5.85;
      tower.add(halo);
    }

    worldGroup.add(tower);
    registerBox(tx, tz, 3.0, 5.4, 3.0);
  }

  // Concrete Guard Bunker / Nextera Turbine Shield Bunker at (11, 10)
  {
    const bx = 11;
    const bz = 10;
    const bunker = new THREE.Group();
    bunker.position.set(bx, groundHeightAt(bx, bz), bz);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 0.45), padMat);
    backWall.position.set(0, 1.4, -2.0);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    bunker.add(backWall);
    raycastBlockers.push(backWall);

    const sideWallL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.8, 4.0), padMat);
    sideWallL.position.set(-2.38, 1.4, 0);
    sideWallL.castShadow = true;
    bunker.add(sideWallL);
    raycastBlockers.push(sideWallL);

    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 4.5), padMat);
    roofSlab.position.set(0, 2.95, 0);
    roofSlab.castShadow = true;
    bunker.add(roofSlab);

    if (isNextera) {
      const trimStrip = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.09, 4.6), neonCyanMat);
      trimStrip.position.set(0, 3.12, 0);
      bunker.add(trimStrip);
    }

    worldGroup.add(bunker);
    registerBox(bx, bz - 2.0, 5.2, 2.8, 0.5);
    registerBox(bx - 2.38, bz, 0.5, 2.8, 4.0);
  }

  // Shipping Containers / Nextera Sci-Fi Modular Pods
  const podTexA = isNextera ? textures.nexteraPodOrange : textures.containerRed;
  const podTexB = isNextera ? textures.nexteraPodCyan : textures.containerTeal;

  const containerSpecs = [
    { x: -16, z: -2, w: 3.2, h: 3.0, d: 7.4, rot: 0.08, tex: podTexA },
    { x: 18, z: -16, w: 3.2, h: 3.0, d: 7.4, rot: Math.PI / 2 - 0.1, tex: podTexB },
    { x: -24, z: 22, w: 3.2, h: 3.0, d: 7.4, rot: Math.PI / 3, tex: podTexB },
    { x: 26, z: 18, w: 3.2, h: 3.0, d: 7.4, rot: -0.3, tex: podTexA },
    { x: 0, z: -38, w: 3.2, h: 3.0, d: 7.4, rot: Math.PI / 2, tex: podTexA },
    { x: -38, z: -6, w: 3.2, h: 3.0, d: 7.4, rot: 0.05, tex: podTexB },
    { x: 40, z: -2, w: 3.2, h: 3.0, d: 7.4, rot: 0.1, tex: podTexB },
    { x: 6, z: 38, w: 3.2, h: 3.0, d: 7.4, rot: Math.PI / 2 + 0.12, tex: podTexA },
  ];

  for (const spec of containerSpecs) {
    const gy = groundHeightAt(spec.x, spec.z);
    const group = new THREE.Group();
    group.position.set(spec.x, gy - 0.15, spec.z);
    group.rotation.y = spec.rot;

    const hullMat = new THREE.MeshStandardMaterial({
      map: spec.tex,
      roughness: isNextera ? 0.38 : 0.56,
      metalness: isNextera ? 0.55 : 0.38,
    });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), hullMat);
    hull.position.y = spec.h / 2;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);
    raycastBlockers.push(hull);

    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.14, 0.14, spec.d + 0.14), trimMat);
    roofCap.position.y = spec.h + 0.04;
    group.add(roofCap);

    if (isNextera) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w + 0.18, 0.07, spec.d + 0.18),
        spec.tex === podTexB
          ? neonCyanMat
          : new THREE.MeshStandardMaterial({
              color: 0xf97316,
              emissive: 0xea580c,
              emissiveIntensity: 0.85,
              roughness: 0.25,
            }),
      );
      strip.position.y = spec.h - 0.12;
      group.add(strip);
    }

    worldGroup.add(group);

    const cos = Math.abs(Math.cos(spec.rot));
    const sin = Math.abs(Math.sin(spec.rot));
    const effW = spec.w * cos + spec.d * sin;
    const effD = spec.w * sin + spec.d * cos;
    registerBox(spec.x, spec.z, effW, spec.h, effD);
  }

  // Supply Crates / Tech Alloy Crates
  const crateMat = new THREE.MeshStandardMaterial({
    map: isNextera ? textures.nexteraCrate : textures.crateWood,
    roughness: isNextera ? 0.42 : 0.78,
    metalness: isNextera ? 0.5 : 0.08,
  });

  const crateCoords = [
    [-6, -5, 1.8],
    [7, -5, 1.6],
    [-9, 9, 1.8],
    [13, -8, 1.5],
    [-28, -26, 2.0],
    [28, -30, 2.0],
    [-28, 36, 1.8],
    [32, 34, 1.9],
    [-48, 18, 2.0],
    [48, -24, 2.0],
  ];

  for (const [x, z, size] of crateCoords) {
    const gy = groundHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, gy - 0.06, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
    box.position.y = size / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);
    raycastBlockers.push(box);

    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.05, 0.12, size + 0.05),
      isNextera ? neonCyanMat : trimMat,
    );
    strap.position.y = size * 0.5;
    g.add(strap);

    worldGroup.add(g);
    registerBox(x, z, size, size, size);
  }

  // Sandbag Barricades (Compound) or Sci-Fi Energy Barriers (Nextera)
  const sandbagMat = new THREE.MeshStandardMaterial({
    map: isNextera ? textures.nexteraPad : textures.sandbag,
    roughness: isNextera ? 0.42 : 0.92,
    metalness: isNextera ? 0.55 : 0.02,
  });
  const sandbagSpecs = [
    { x: 0, z: 13.5, rot: 0 },
    { x: 0, z: -13.5, rot: 0 },
    { x: 13.5, z: 0, rot: Math.PI / 2 },
    { x: -13.5, z: 0, rot: Math.PI / 2 },
    { x: -19, z: 8, rot: Math.PI / 4 },
    { x: 19, z: -4, rot: Math.PI / 4 },
  ];

  const bagGeo = new THREE.CapsuleGeometry(0.24, 0.65, 4, 8);
  bagGeo.rotateZ(Math.PI / 2);

  for (const b of sandbagSpecs) {
    const gy = groundHeightAt(b.x, b.z);
    const group = new THREE.Group();
    group.position.set(b.x, gy, b.z);
    group.rotation.y = b.rot;

    if (isNextera) {
      const barrierBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 0.55), sandbagMat);
      barrierBase.position.y = 0.52;
      barrierBase.castShadow = true;
      barrierBase.receiveShadow = true;
      group.add(barrierBase);
      raycastBlockers.push(barrierBase);

      const barrierGlow = new THREE.Mesh(new THREE.BoxGeometry(4.26, 0.12, 0.6), neonCyanMat);
      barrierGlow.position.y = 1.08;
      group.add(barrierGlow);
    } else {
      for (let row = 0; row < 3; row++) {
        const count = 4;
        for (let col = 0; col < count; col++) {
          const bag = new THREE.Mesh(bagGeo, sandbagMat);
          const offset = row % 2 === 0 ? 0 : 0.25;
          bag.position.set((col - 1.5) * 0.95 + offset * 0.4, 0.22 + row * 0.34, 0);
          bag.castShadow = true;
          bag.receiveShadow = true;
          group.add(bag);
          raycastBlockers.push(bag);
        }
      }
    }

    worldGroup.add(group);
    const cos = Math.abs(Math.cos(b.rot));
    const sin = Math.abs(Math.sin(b.rot));
    registerBox(b.x, b.z, 4.4 * cos + 0.9 * sin, 1.25, 4.4 * sin + 0.9 * cos);
  }

  // Trees grounded on terrain (Bioluminescent Teal-Sage in Nextera, Pine in Compound)
  const trunkMat = new THREE.MeshStandardMaterial({
    color: isNextera ? 0x1e293b : 0x453020,
    roughness: isNextera ? 0.65 : 0.92,
    metalness: isNextera ? 0.25 : 0,
  });
  const foliageMat1 = new THREE.MeshStandardMaterial({
    color: isNextera ? 0x115e59 : 0x2b492e,
    roughness: isNextera ? 0.65 : 0.85,
  });
  const foliageMat2 = new THREE.MeshStandardMaterial({
    color: isNextera ? 0x0f766e : 0x355837,
    roughness: isNextera ? 0.6 : 0.83,
  });

  const treeCount = 52;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + (i % 3) * 0.17;
    const radius = 26 + ((i * 37) % 62);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const scale = 0.85 + ((i * 19) % 35) / 100;
    const ty = groundHeightAt(tx, tz);

    const tree = new THREE.Group();
    tree.position.set(tx, ty - 0.1, tz);
    tree.scale.setScalar(scale);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.8, 7), trunkMat);
    trunk.position.y = 1.4;
    trunk.castShadow = true;
    tree.add(trunk);
    raycastBlockers.push(trunk);

    const tier1 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.9, 8), foliageMat1);
    tier1.position.y = 3.2;
    tier1.castShadow = true;
    tree.add(tier1);

    const tier2 = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.5, 8), foliageMat2);
    tier2.position.y = 4.65;
    tier2.castShadow = true;
    tree.add(tier2);

    const tier3 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.9, 8), foliageMat1);
    tier3.position.y = 5.9;
    tree.add(tier3);

    worldGroup.add(tree);
    registerBox(tx, tz, 0.8 * scale, 3.0, 0.8 * scale);
  }

  // Instanced Wild Grass / Cyber Foliage Tufts
  const grassCount = 650;
  const grassGeo = new THREE.ConeGeometry(0.14, 0.55, 4);
  grassGeo.translate(0, 0.25, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    color: isNextera ? 0x1e6b6b : 0x5c6e42,
    roughness: 0.86,
    metalness: isNextera ? 0.1 : 0.0,
  });
  const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();

  for (let i = 0; i < grassCount; i++) {
    const a = ((i * 137.5) % 360) * (Math.PI / 180);
    const r = 19 + ((i * 29) % 64);
    const gx = Math.cos(a) * r;
    const gz = Math.sin(a) * r;
    const gy = groundHeightAt(gx, gz);
    dummy.position.set(gx, gy - 0.04, gz);
    dummy.rotation.set(((i % 5) - 2) * 0.08, a, ((i % 3) - 1) * 0.08);
    const s = 0.75 + (i % 7) * 0.14;
    dummy.scale.set(s, s * 1.15, s);
    dummy.updateMatrix();
    grassInst.setMatrixAt(i, dummy.matrix);
    if (isNextera) {
      c.setHSL(0.49 + ((i % 9) - 4) * 0.01, 0.42, 0.26 + (i % 6) * 0.025);
    } else {
      c.setHSL(0.22 + ((i % 9) - 4) * 0.008, 0.28, 0.32 + (i % 6) * 0.025);
    }
    grassInst.setColorAt(i, c);
  }
  grassInst.instanceMatrix.needsUpdate = true;
  if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
  grassInst.computeBoundingSphere();
  worldGroup.add(grassInst);

  // Perimeter Ridge Boulders / Basalt Monoliths
  const rockMat = new THREE.MeshStandardMaterial({
    color: isNextera ? 0x334155 : 0x585c56,
    roughness: isNextera ? 0.72 : 0.9,
    metalness: isNextera ? 0.22 : 0.04,
    flatShading: true,
  });
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, 72);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;

  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const r = 84 + ((i * 23) % 24);
    const rx = Math.cos(angle) * r;
    const rz = Math.sin(angle) * r;
    const ry = groundHeightAt(rx, rz);
    const sx = 3.5 + ((i * 13) % 5);
    const sy = 2.6 + ((i * 17) % 6);
    const sz = 3.2 + ((i * 11) % 4);
    dummy.position.set(rx, ry + sy * 0.3, rz);
    dummy.rotation.set((i % 5) * 0.2, angle, (i % 3) * 0.15);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    if (isNextera) {
      c.setHSL(0.57, 0.18, 0.22 + ((i * 7) % 14) / 100);
    } else {
      c.setHSL(0.24, 0.06, 0.28 + ((i * 7) % 14) / 100);
    }
    rockInst.setColorAt(i, c);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  worldGroup.add(rockInst);

  scene.add(worldGroup);

  return { worldGroup, obstacles };
}

export function createPickupModel(kind: 'ammo' | 'medkit'): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'ammo') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.42, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x3b492c, roughness: 0.5, metalness: 0.38 }),
    );
    box.position.y = 0.21;
    box.castShadow = true;
    group.add(box);

    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.67, 0.08, 0.46),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0x92400e,
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.5,
      }),
    );
    band.position.y = 0.24;
    group.add(band);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.08, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 }),
    );
    handle.position.y = 0.44;
    group.add(handle);
  } else {
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.38, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.38, metalness: 0.15 }),
    );
    caseMesh.position.y = 0.19;
    caseMesh.castShadow = true;
    group.add(caseMesh);

    const crossMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.4,
      roughness: 0.35,
    });
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.1), crossMat);
    crossH.position.y = 0.39;
    group.add(crossH);

    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.32), crossMat);
    crossV.position.y = 0.39;
    group.add(crossV);
  }

  return group;
}

export function createWeaponDropModel(weaponId: WeaponId): THREE.Group {
  const group = new THREE.Group();
  const accentHex = WEAPON_BY_ID[weaponId].accentHex;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.56, 28),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 24),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.045;
  group.add(disc);

  const weaponModel = createWeaponMesh(weaponId, false).group;
  weaponModel.scale.setScalar(1.25);
  weaponModel.position.set(0, 0.38, 0);
  weaponModel.rotation.set(0.28, 0, -0.32);
  group.add(weaponModel);

  return group;
}

export function createGlooWallModel(): {
  group: THREE.Group;
  colliderMeshes: THREE.Mesh[];
} {
  const group = new THREE.Group();
  const colliderMeshes: THREE.Mesh[] = [];

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.72,
  });
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.38,
    roughness: 0.18,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78,
  });

  // Base stabilizer plinth
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 0.42), frameMat);
  base.position.y = 0.12;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Center armored cryo shield panel
  const centerPanel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.15, 0.24), shieldMat);
  centerPanel.position.set(0, 1.18, 0);
  centerPanel.castShadow = true;
  centerPanel.receiveShadow = true;
  group.add(centerPanel);
  colliderMeshes.push(centerPanel);

  // Left & right angled wing panels for realistic wraparound cover
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.22), shieldMat);
  leftWing.position.set(-1.26, 1.12, -0.2);
  leftWing.rotation.y = 0.36;
  leftWing.castShadow = true;
  group.add(leftWing);
  colliderMeshes.push(leftWing);

  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.22), shieldMat);
  rightWing.position.set(1.26, 1.12, -0.2);
  rightWing.rotation.y = -0.36;
  rightWing.castShadow = true;
  group.add(rightWing);
  colliderMeshes.push(rightWing);

  // Metallic vertical ribs
  [-0.82, 0.82].forEach((rx) => {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.25, 0.3), frameMat);
    rib.position.set(rx, 1.16, 0);
    rib.castShadow = true;
    group.add(rib);
  });

  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.28), frameMat);
  topTrim.position.set(0, 2.28, 0);
  group.add(topTrim);

  return { group, colliderMeshes };
}

export function createGrenadeModel(): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0x3b4d2b,
      roughness: 0.48,
      metalness: 0.35,
    }),
  );
  body.scale.set(1, 1.24, 1);
  body.castShadow = true;
  group.add(body);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.124, 0.124, 0.04, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0x92400e,
      emissiveIntensity: 0.45,
      roughness: 0.35,
    }),
  );
  group.add(band);

  const spoon = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.12, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 }),
  );
  spoon.position.set(0.06, 0.11, 0);
  group.add(spoon);

  const fuseBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  );
  fuseBeacon.position.set(0, 0.17, 0);
  group.add(fuseBeacon);

  return group;
}
