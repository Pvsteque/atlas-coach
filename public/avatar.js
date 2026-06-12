/* ════════════════════════════════════════════════════════════════════
   ATLAS AVATAR — coach animé façon Bitmoji (profil, articulé, IK)
   Personnage basé sur la photo du coach : boucles brunes, barbe courte,
   t-shirt noir oversize, jogging noir, baskets orange, montre noire.
   API : AtlasAvatar.play(containerEl, exerciseName, {category}) → {stop}
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Palette ──────────────────────────────────────────────────────
  const SKIN = '#e9b486', SKIN_D = '#c9935f';
  const HAIR = '#33241a';
  const SHIRT = '#3a3c47', SHIRT_D = '#262830';
  const PANTS = '#282a33', PANTS_D = '#191a21';
  const SHOE = '#ff7a00', SHOE_D = '#b65a02';
  const EQ = '#3c3f52', EQ_S = '#646a87', EQ_D = '#2b2d3f';
  const GLOW = 'rgba(255,122,0,.5)';

  // ── Morphologie (px, viewBox 360×220) ────────────────────────────
  const TORSO = 36;     // bassin → cou
  const HEAD_OFF = 12;  // cou → centre tête
  const HEAD_R = 14.5;
  const UARM = 22, FARM = 20;
  const THIGH = 31, SHIN = 29;
  const ANKLE_H = 5;    // hauteur cheville au sol
  const GROUND = 196;
  const SH_FRAC = .84;  // épaule sur l'axe du tronc

  const rad = d => d * Math.PI / 180;

  // direction "vers le bas du corps" tournée de a° vers l'avant (+x)
  const dirDn = a => [Math.sin(rad(a)), Math.cos(rad(a))];
  // direction "vers le haut du tronc"
  const dirUp = a => [Math.sin(rad(a)), -Math.cos(rad(a))];

  // IK 2 segments : renvoie l'articulation du milieu
  function ik(ax, ay, tx, ty, L1, L2, bend) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
    const m = L1 + L2 - .4;
    if (d > m) { dx *= m / d; dy *= m / d; d = m; tx = ax + dx; ty = ay + dy; }
    if (d < 1e-3) { d = 1e-3; dx = 0; dy = d; }
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const mx = ax + a * dx / d, my = ay + a * dy / d;
    return [mx + bend * h * dy / d, my - bend * h * dx / d, tx, ty];
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t); // smoothstep

  /* ── Pose de base (debout, détendu) ─────────────────────────────
     Canaux : px,py bassin · torso (0=droit, +avant) · neck
     Bras FK : shF,elF,shB,elB (0=le long du corps, + vers l'avant,
               el = flexion du coude vers l'avant)
     Bras IK : hxF,hyF,hxB,hyB (ancres mains, monde)
     Jambes FK : hipF,kneeF,hipB,kneeB (+hanche avant, +genou flexion arrière)
     Jambes IK : fxF,fxB (x talon, sol) · fyF,fyB optionnels
     footF,footB : angle du pied (0 = à plat) · legRef : réf. jambes FK */
  const BASE = {
    px: 180, py: 131, torso: 2, neck: 0,
    shF: 4, elF: 10, shB: -2, elB: 8,
    hxF: 0, hyF: 0, hxB: 0, hyB: 0,
    hipF: 0, kneeF: 0, hipB: 0, kneeB: 0,
    fxF: 188, fyF: GROUND, fxB: 171, fyB: GROUND,
    footF: 0, footB: 0, legRef: 0,
  };
  const P = o => Object.assign({}, BASE, o);

  /* ════════════════════════════════════════════════════════════════
     PATTERNS — chaque mouvement : keyframes {t, p, cap} + config
     armMode/legMode : 'fk' | 'ik' · armBend/legBend : sens du coude/genou
     equip : 'barHands'|'barBack'|'db'|'dbF'|'goblet'|'none'|'cableHigh'|'cableLow'
     props : décor statique · glow : segments illuminés
     ════════════════════════════════════════════════════════════════ */
  const PATTERNS = {

    squat: {
      dur: 3400, armMode: 'ik', armBend: 1, legMode: 'ik', legBend: 1, equip: 'barBack',
      glow: ['thighF', 'thighB', 'glute'],
      props: [],
      frames: [
        { t: 0, cap: 'Gaine le ventre, regard devant', p: P({ torso: 6, hxF: 181, hyF: 99, hxB: 171, hyB: 100 }) },
        { t: .42, cap: 'Descente contrôlée, genoux dans l’axe', p: P({ px: 171, py: 162, torso: 32, neck: -16, hxF: 191, hyF: 137, hxB: 181, hyB: 138, fxF: 193, fxB: 168 }) },
        { t: .56, cap: 'Cuisses parallèles — bas du mouvement', p: P({ px: 170, py: 164, torso: 34, neck: -17, hxF: 191, hyF: 139, hxB: 181, hyB: 140, fxF: 193, fxB: 168 }) },
        { t: 1, cap: 'Pousse fort dans le sol, hanches en avant', p: P({ torso: 6, hxF: 181, hyF: 99, hxB: 171, hyB: 100 }) },
      ],
    },

    goblet: null, // alias rempli plus bas (squat + haltère devant)

    hinge: {
      dur: 3400, armMode: 'ik', armBend: -1, legMode: 'ik', legBend: 1, equip: 'barHands',
      glow: ['thighB', 'glute', 'backLow'],
      props: [],
      frames: [
        { t: 0, cap: 'Debout, barre collée aux cuisses', p: P({ torso: 8, hxF: 196, hyF: 124, hxB: 184, hyB: 124 }) },
        { t: .45, cap: 'Hanches en arrière, dos plat', p: P({ px: 168, py: 142, torso: 72, neck: -42, hxF: 196, hyF: 178, hxB: 184, hyB: 178, fxF: 190, fxB: 169 }) },
        { t: .58, cap: 'Étirement des ischios — ne pas arrondir', p: P({ px: 167, py: 144, torso: 75, neck: -44, hxF: 196, hyF: 182, hxB: 184, hyB: 182, fxF: 190, fxB: 169 }) },
        { t: 1, cap: 'Pousse le sol, serre les fessiers en haut', p: P({ torso: 8, hxF: 196, hyF: 124, hxB: 184, hyB: 124 }) },
      ],
    },

    lunge: {
      dur: 3200, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'db',
      glow: ['thighF', 'glute'],
      props: [],
      frames: [
        { t: 0, cap: 'Grand pas devant, buste droit', p: P({ px: 176, py: 131, torso: 4, fxF: 218, fxB: 142, footB: 24 }) },
        { t: .45, cap: 'Descends à la verticale, genou arrière vers le sol', p: P({ px: 178, py: 160, torso: 8, fxF: 218, fxB: 142, footB: 48 }) },
        { t: .56, cap: 'Genou avant au-dessus de la cheville', p: P({ px: 178, py: 162, torso: 8, fxF: 218, fxB: 142, footB: 52 }) },
        { t: 1, cap: 'Pousse sur le talon avant pour remonter', p: P({ px: 176, py: 131, torso: 4, fxF: 218, fxB: 142, footB: 24 }) },
      ],
    },

    hipthrust: {
      dur: 3000, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'barHip',
      glow: ['glute', 'thighB'],
      props: [{ k: 'rect', x: 236, y: 128, w: 86, h: 18, r: 5 }, { k: 'rect', x: 248, y: 146, w: 10, h: 50 }, { k: 'rect', x: 300, y: 146, w: 10, h: 50 }],
      frames: [
        { t: 0, cap: 'Haut du dos sur le banc, pieds à plat', p: P({ px: 196, py: 158, torso: -64, neck: 40, shF: 6, elF: 4, shB: 2, elB: 4, fxF: 162, fxB: 143 }) },
        { t: .42, cap: 'Pousse dans les talons, monte le bassin', p: P({ px: 200, py: 136, torso: -86, neck: 58, shF: 10, elF: 6, shB: 6, elB: 6, fxF: 162, fxB: 143 }) },
        { t: .56, cap: 'Verrouille en haut, serre fort les fessiers', p: P({ px: 200, py: 133, torso: -88, neck: 62, shF: 10, elF: 6, shB: 6, elB: 6, fxF: 162, fxB: 143 }) },
        { t: 1, cap: 'Redescends en contrôle, sans relâcher', p: P({ px: 196, py: 158, torso: -64, neck: 40, shF: 6, elF: 4, shB: 2, elB: 4, fxF: 162, fxB: 143 }) },
      ],
    },

    bench: {
      dur: 3000, armMode: 'ik', armBend: 1, legMode: 'ik', legBend: 1, equip: 'barHands',
      glow: ['chest', 'armUF'],
      props: [{ k: 'rect', x: 96, y: 158, w: 150, h: 14, r: 5 }, { k: 'rect', x: 112, y: 172, w: 9, h: 24 }, { k: 'rect', x: 216, y: 172, w: 9, h: 24 }],
      frames: [
        { t: 0, cap: 'Omoplates serrées, barre au-dessus des pecs', p: P({ px: 150, py: 150, torso: -88, neck: 86, hxF: 185, hyF: 96, hxB: 173, hyB: 96, fxF: 246, fxB: 228, legRef: -88 }) },
        { t: .44, cap: 'Descente lente jusqu’à la poitrine', p: P({ px: 150, py: 150, torso: -88, neck: 86, hxF: 185, hyF: 134, hxB: 173, hyB: 134, fxF: 246, fxB: 228, legRef: -88 }) },
        { t: .56, cap: 'Légère pause — coudes à ~45°', p: P({ px: 150, py: 150, torso: -88, neck: 86, hxF: 185, hyF: 137, hxB: 173, hyB: 137, fxF: 246, fxB: 228, legRef: -88 }) },
        { t: 1, cap: 'Pousse la barre vers le plafond', p: P({ px: 150, py: 150, torso: -88, neck: 86, hxF: 185, hyF: 96, hxB: 173, hyB: 96, fxF: 246, fxB: 228, legRef: -88 }) },
      ],
    },

    pushup: {
      dur: 2800, armMode: 'ik', armBend: 1, legMode: 'fk', equip: 'none',
      glow: ['chest', 'armUF'],
      props: [],
      frames: [
        { t: 0, cap: 'Corps gainé, aligné des épaules aux chevilles', p: P({ px: 150, py: 158, torso: 77, neck: -58, hxF: 188, hyF: GROUND, hxB: 178, hyB: GROUND, hipF: 14, kneeF: 4, hipB: 10, kneeB: 4, legRef: -77, footF: 132, footB: 132 }) },
        { t: .45, cap: 'Descends poitrine vers le sol, coudes ~45°', p: P({ px: 152, py: 170, torso: 80, neck: -62, hxF: 188, hyF: GROUND, hxB: 178, hyB: GROUND, hipF: 6, kneeF: 2, hipB: 2, kneeB: 2, legRef: -77, footF: 128, footB: 128 }) },
        { t: .56, cap: 'Frôle le sol sans te poser', p: P({ px: 152, py: 172, torso: 80, neck: -62, hxF: 188, hyF: GROUND, hxB: 178, hyB: GROUND, hipF: 6, kneeF: 2, hipB: 2, kneeB: 2, legRef: -77, footF: 128, footB: 128 }) },
        { t: 1, cap: 'Repousse le sol, corps rigide', p: P({ px: 150, py: 158, torso: 77, neck: -58, hxF: 188, hyF: GROUND, hxB: 178, hyB: GROUND, hipF: 14, kneeF: 4, hipB: 10, kneeB: 4, legRef: -77, footF: 132, footB: 132 }) },
      ],
    },

    ohp: {
      dur: 3000, armMode: 'ik', armBend: 1, legMode: 'ik', legBend: 1, equip: 'barHands',
      glow: ['shoulder', 'armUF'],
      props: [],
      frames: [
        { t: 0, cap: 'Barre aux clavicules, abdos serrés', p: P({ torso: 0, hxF: 200, hyF: 101, hxB: 190, hyB: 101 }) },
        { t: .42, cap: 'Pousse au-dessus de la tête, sans cambrer', p: P({ torso: -2, neck: 4, hxF: 188, hyF: 46, hxB: 178, hyB: 46 }) },
        { t: .56, cap: 'Verrouille les coudes, tête qui « passe »', p: P({ torso: -2, neck: 4, hxF: 187, hyF: 43, hxB: 177, hyB: 43 }) },
        { t: 1, cap: 'Redescends en contrôle aux épaules', p: P({ torso: 0, hxF: 200, hyF: 101, hxB: 190, hyB: 101 }) },
      ],
    },

    raise: {
      dur: 2800, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'db',
      glow: ['shoulder'],
      props: [],
      frames: [
        { t: 0, cap: 'Haltères le long du corps, coudes souples', p: P({ shF: 8, elF: 12, shB: 4, elB: 12 }) },
        { t: .45, cap: 'Monte jusqu’à l’horizontale, sans élan', p: P({ shF: 88, elF: 10, shB: 82, elB: 10 }) },
        { t: .55, cap: 'Petite pause en haut', p: P({ shF: 90, elF: 10, shB: 84, elB: 10 }) },
        { t: 1, cap: 'Redescends lentement — résiste', p: P({ shF: 8, elF: 12, shB: 4, elB: 12 }) },
      ],
    },

    pullup: {
      dur: 3200, armMode: 'ik', armBend: -1, legMode: 'fk', equip: 'none',
      glow: ['backUp', 'armUF'],
      props: [{ k: 'rect', x: 70, y: 18, w: 220, h: 6, r: 3 }, { k: 'rect', x: 70, y: 0, w: 8, h: 22 }, { k: 'rect', x: 282, y: 0, w: 8, h: 22 }],
      frames: [
        { t: 0, cap: 'Suspension complète, épaules actives', p: P({ px: 180, py: 108, torso: 4, neck: 6, hxF: 196, hyF: 24, hxB: 168, hyB: 24, hipF: 10, kneeF: 26, hipB: 6, kneeB: 22, footF: -40, footB: -40 }) },
        { t: .42, cap: 'Tire les coudes vers le bas, poitrine vers la barre', p: P({ px: 180, py: 68, torso: 8, neck: 8, hxF: 196, hyF: 24, hxB: 168, hyB: 24, hipF: 14, kneeF: 34, hipB: 10, kneeB: 30, footF: -40, footB: -40 }) },
        { t: .55, cap: 'Menton au-dessus de la barre', p: P({ px: 180, py: 63, torso: 8, neck: 8, hxF: 196, hyF: 24, hxB: 168, hyB: 24, hipF: 14, kneeF: 34, hipB: 10, kneeB: 30, footF: -40, footB: -40 }) },
        { t: 1, cap: 'Descente freinée, bras presque tendus', p: P({ px: 180, py: 108, torso: 4, neck: 6, hxF: 196, hyF: 24, hxB: 168, hyB: 24, hipF: 10, kneeF: 26, hipB: 6, kneeB: 22, footF: -40, footB: -40 }) },
      ],
    },

    pulldown: {
      dur: 3000, armMode: 'ik', armBend: -1, legMode: 'fk', equip: 'cableHigh',
      glow: ['backUp', 'armUF'],
      props: [{ k: 'rect', x: 132, y: 156, w: 96, h: 12, r: 4 }, { k: 'rect', x: 150, y: 168, w: 9, h: 28 }, { k: 'rect', x: 202, y: 168, w: 9, h: 28 }],
      frames: [
        { t: 0, cap: 'Assis, bras tendus, buste légèrement incliné', p: P({ px: 172, py: 122, torso: -8, neck: 10, hxF: 196, hyF: 50, hxB: 184, hyB: 50, hipF: 78, kneeF: 86, hipB: 72, kneeB: 84, legRef: 0, footF: 0, footB: 0 }) },
        { t: .42, cap: 'Tire la barre vers le haut des pecs', p: P({ px: 172, py: 122, torso: -16, neck: 14, hxF: 200, hyF: 102, hxB: 188, hyB: 102, hipF: 78, kneeF: 86, hipB: 72, kneeB: 84 }) },
        { t: .55, cap: 'Serre les omoplates, coudes vers le bas', p: P({ px: 172, py: 122, torso: -17, neck: 14, hxF: 200, hyF: 105, hxB: 188, hyB: 105, hipF: 78, kneeF: 86, hipB: 72, kneeB: 84 }) },
        { t: 1, cap: 'Remonte en contrôle, étire le dos', p: P({ px: 172, py: 122, torso: -8, neck: 10, hxF: 196, hyF: 50, hxB: 184, hyB: 50, hipF: 78, kneeF: 86, hipB: 72, kneeB: 84 }) },
      ],
    },

    row: {
      dur: 3000, armMode: 'ik', armBend: -1, legMode: 'ik', legBend: 1, equip: 'barHands',
      glow: ['backUp', 'armUF'],
      props: [],
      frames: [
        { t: 0, cap: 'Buste penché, dos plat, barre bras tendus', p: P({ px: 166, py: 140, torso: 64, neck: -26, hxF: 206, hyF: 178, hxB: 194, hyB: 178, fxF: 190, fxB: 168 }) },
        { t: .42, cap: 'Tire la barre vers le nombril', p: P({ px: 166, py: 140, torso: 62, neck: -26, hxF: 200, hyF: 140, hxB: 188, hyB: 140, fxF: 190, fxB: 168 }) },
        { t: .55, cap: 'Coudes près du corps, omoplates serrées', p: P({ px: 166, py: 140, torso: 62, neck: -26, hxF: 199, hyF: 137, hxB: 187, hyB: 137, fxF: 190, fxB: 168 }) },
        { t: 1, cap: 'Redescends sans arrondir le dos', p: P({ px: 166, py: 140, torso: 64, neck: -26, hxF: 206, hyF: 178, hxB: 194, hyB: 178, fxF: 190, fxB: 168 }) },
      ],
    },

    cablerow: {
      dur: 3000, armMode: 'ik', armBend: -1, legMode: 'fk', equip: 'cableMid',
      glow: ['backUp', 'armUF'],
      props: [{ k: 'rect', x: 120, y: 156, w: 90, h: 12, r: 4 }, { k: 'rect', x: 296, y: 60, w: 16, h: 136, r: 3 }],
      frames: [
        { t: 0, cap: 'Assis, jambes fléchies, bras tendus devant', p: P({ px: 158, py: 122, torso: 12, neck: -4, hxF: 226, hyF: 118, hxB: 216, hyB: 118, hipF: 74, kneeF: 58, hipB: 70, kneeB: 56, footF: -18, footB: -18 }) },
        { t: .42, cap: 'Tire la poignée vers le ventre, buste stable', p: P({ px: 158, py: 122, torso: -4, neck: 2, hxF: 188, hyF: 124, hxB: 178, hyB: 124, hipF: 74, kneeF: 58, hipB: 70, kneeB: 56 }) },
        { t: .55, cap: 'Épaules basses, serre le dos', p: P({ px: 158, py: 122, torso: -6, neck: 2, hxF: 186, hyF: 124, hxB: 176, hyB: 124, hipF: 74, kneeF: 58, hipB: 70, kneeB: 56 }) },
        { t: 1, cap: 'Reviens en contrôle, étire sans arrondir', p: P({ px: 158, py: 122, torso: 12, neck: -4, hxF: 226, hyF: 118, hxB: 216, hyB: 118, hipF: 74, kneeF: 58, hipB: 70, kneeB: 56 }) },
      ],
    },

    curl: {
      dur: 2800, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'db',
      glow: ['armUF'],
      props: [],
      frames: [
        { t: 0, cap: 'Coudes collés au corps, poignets neutres', p: P({ shF: 6, elF: 14, shB: 2, elB: 12 }) },
        { t: .42, cap: 'Monte sans balancer le buste', p: P({ shF: 8, elF: 118, shB: 4, elB: 112, torso: 0 }) },
        { t: .55, cap: 'Contracte le biceps en haut', p: P({ shF: 8, elF: 126, shB: 4, elB: 120 }) },
        { t: 1, cap: 'Redescends lentement — 2-3 secondes', p: P({ shF: 6, elF: 14, shB: 2, elB: 12 }) },
      ],
    },

    triceps: {
      dur: 2800, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'cableDown',
      glow: ['armBF'],
      props: [{ k: 'rect', x: 286, y: 10, w: 16, h: 186, r: 3 }],
      frames: [
        { t: 0, cap: 'Coudes fixes le long du corps', p: P({ torso: 10, shF: 22, elF: 108, shB: 18, elB: 104 }) },
        { t: .42, cap: 'Étends les bras vers le bas', p: P({ torso: 10, shF: 22, elF: 18, shB: 18, elB: 16 }) },
        { t: .55, cap: 'Verrouille — contracte le triceps', p: P({ torso: 10, shF: 22, elF: 12, shB: 18, elB: 10 }) },
        { t: 1, cap: 'Remonte en freinant, coudes immobiles', p: P({ torso: 10, shF: 22, elF: 108, shB: 18, elB: 104 }) },
      ],
    },

    dip: {
      dur: 3000, armMode: 'ik', armBend: -1, legMode: 'fk', equip: 'none',
      glow: ['armBF', 'chest'],
      props: [{ k: 'rect', x: 116, y: 96, w: 8, h: 100 }, { k: 'rect', x: 240, y: 96, w: 8, h: 100 }, { k: 'rect', x: 108, y: 90, w: 56, h: 7, r: 3 }, { k: 'rect', x: 232, y: 90, w: 24, h: 7, r: 3 }],
      frames: [
        { t: 0, cap: 'Bras tendus sur les barres, buste penché', p: P({ px: 180, py: 130, torso: 14, neck: -4, hxF: 196, hyF: 94, hxB: 156, hyB: 94, hipF: 12, kneeF: 52, hipB: 8, kneeB: 48, footF: -50, footB: -50 }) },
        { t: .44, cap: 'Descends coudes à ~90°, contrôle', p: P({ px: 180, py: 152, torso: 22, neck: -6, hxF: 196, hyF: 94, hxB: 156, hyB: 94, hipF: 16, kneeF: 60, hipB: 12, kneeB: 56, footF: -50, footB: -50 }) },
        { t: .56, cap: 'Poitrine légèrement en avant', p: P({ px: 180, py: 154, torso: 23, neck: -6, hxF: 196, hyF: 94, hxB: 156, hyB: 94, hipF: 16, kneeF: 60, hipB: 12, kneeB: 56, footF: -50, footB: -50 }) },
        { t: 1, cap: 'Repousse fort jusqu’aux bras tendus', p: P({ px: 180, py: 130, torso: 14, neck: -4, hxF: 196, hyF: 94, hxB: 156, hyB: 94, hipF: 12, kneeF: 52, hipB: 8, kneeB: 48, footF: -50, footB: -50 }) },
      ],
    },

    crunch: {
      dur: 2600, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'none',
      glow: ['abs'],
      props: [],
      frames: [
        { t: 0, cap: 'Dos au sol, mains aux tempes, pieds à plat', p: P({ px: 150, py: 184, torso: -80, neck: 50, shF: 150, elF: 130, shB: 146, elB: 130, fxF: 232, fxB: 216, legRef: 0 }) },
        { t: .42, cap: 'Enroule le haut du dos, nombril rentré', p: P({ px: 150, py: 184, torso: -52, neck: 34, shF: 150, elF: 130, shB: 146, elB: 130, fxF: 232, fxB: 216 }) },
        { t: .55, cap: 'Souffle à fond en haut', p: P({ px: 150, py: 184, torso: -48, neck: 32, shF: 150, elF: 130, shB: 146, elB: 130, fxF: 232, fxB: 216 }) },
        { t: 1, cap: 'Redescends vertèbre par vertèbre', p: P({ px: 150, py: 184, torso: -80, neck: 50, shF: 150, elF: 130, shB: 146, elB: 130, fxF: 232, fxB: 216 }) },
      ],
    },

    legraise: {
      dur: 3000, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['abs'],
      props: [],
      frames: [
        { t: 0, cap: 'Allongé, lombaires plaquées au sol', p: P({ px: 150, py: 184, torso: -86, neck: 60, shF: 30, elF: 6, shB: 26, elB: 6, hipF: 8, kneeF: 4, hipB: 4, kneeB: 4, legRef: 86, footF: -88, footB: -88 }) },
        { t: .45, cap: 'Monte les jambes tendues à la verticale', p: P({ px: 150, py: 184, torso: -86, neck: 60, shF: 30, elF: 6, shB: 26, elB: 6, hipF: 92, kneeF: 4, hipB: 88, kneeB: 4, legRef: 86, footF: -30, footB: -30 }) },
        { t: .55, cap: 'Bassin gainé, ne cambre pas', p: P({ px: 150, py: 184, torso: -86, neck: 60, shF: 30, elF: 6, shB: 26, elB: 6, hipF: 94, kneeF: 4, hipB: 90, kneeB: 4, legRef: 86, footF: -30, footB: -30 }) },
        { t: 1, cap: 'Redescends sans toucher le sol', p: P({ px: 150, py: 184, torso: -86, neck: 60, shF: 30, elF: 6, shB: 26, elB: 6, hipF: 8, kneeF: 4, hipB: 4, kneeB: 4, legRef: 86, footF: -88, footB: -88 }) },
      ],
    },

    plank: {
      dur: 3600, armMode: 'ik', armBend: 1, legMode: 'fk', equip: 'none',
      glow: ['abs'],
      props: [],
      frames: [
        { t: 0, cap: 'Coudes sous les épaules, corps aligné', p: P({ px: 146, py: 172, torso: 75, neck: -56, hxF: 190, hyF: GROUND, hxB: 181, hyB: GROUND, hipF: 8, kneeF: 2, hipB: 4, kneeB: 2, legRef: -75, footF: 126, footB: 126 }) },
        { t: .5, cap: 'Respire calmement, fessiers serrés', p: P({ px: 146, py: 170, torso: 75, neck: -54, hxF: 190, hyF: GROUND, hxB: 181, hyB: GROUND, hipF: 8, kneeF: 2, hipB: 4, kneeB: 2, legRef: -75, footF: 126, footB: 126 }) },
        { t: 1, cap: 'Ne laisse pas tomber les hanches', p: P({ px: 146, py: 172, torso: 75, neck: -56, hxF: 190, hyF: GROUND, hxB: 181, hyB: GROUND, hipF: 8, kneeF: 2, hipB: 4, kneeB: 2, legRef: -75, footF: 126, footB: 126 }) },
      ],
    },

    calf: {
      dur: 2400, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['calfF', 'calfB'],
      props: [{ k: 'rect', x: 150, y: 188, w: 70, h: 8, r: 2 }],
      frames: [
        { t: 0, cap: 'Pointes sur la marche, talons bas — étire', p: P({ py: 134, shF: 28, elF: 64, shB: 24, elB: 60, hipF: 2, kneeF: 2, hipB: -2, kneeB: 2, footF: 14, footB: 14 }) },
        { t: .42, cap: 'Monte sur la pointe des pieds', p: P({ py: 124, shF: 28, elF: 64, shB: 24, elB: 60, hipF: 2, kneeF: 2, hipB: -2, kneeB: 2, footF: -28, footB: -28 }) },
        { t: .56, cap: 'Contracte fort le mollet en haut', p: P({ py: 122, shF: 28, elF: 64, shB: 24, elB: 60, hipF: 2, kneeF: 2, hipB: -2, kneeB: 2, footF: -32, footB: -32 }) },
        { t: 1, cap: 'Redescends lentement sous le niveau', p: P({ py: 134, shF: 28, elF: 64, shB: 24, elB: 60, hipF: 2, kneeF: 2, hipB: -2, kneeB: 2, footF: 14, footB: 14 }) },
      ],
    },

    legext: {
      dur: 2800, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['thighF'],
      props: [{ k: 'rect', x: 128, y: 150, w: 88, h: 14, r: 4 }, { k: 'rect', x: 122, y: 70, w: 14, h: 96, r: 4 }, { k: 'rect', x: 140, y: 164, w: 10, h: 32 }, { k: 'rect', x: 196, y: 164, w: 10, h: 32 }],
      frames: [
        { t: 0, cap: 'Assis, dos collé au dossier', p: P({ px: 162, py: 124, torso: -6, neck: 4, shF: 30, elF: 50, shB: 26, elB: 48, hipF: 86, kneeF: 92, hipB: 82, kneeB: 90, legRef: 0, footF: -10, footB: -10 }) },
        { t: .42, cap: 'Tends les jambes — quadriceps', p: P({ px: 162, py: 124, torso: -6, neck: 4, shF: 30, elF: 50, shB: 26, elB: 48, hipF: 86, kneeF: 8, hipB: 82, kneeB: 10, footF: -10, footB: -10 }) },
        { t: .55, cap: 'Petite pause, contraction maximale', p: P({ px: 162, py: 124, torso: -6, neck: 4, shF: 30, elF: 50, shB: 26, elB: 48, hipF: 86, kneeF: 4, hipB: 82, kneeB: 6, footF: -10, footB: -10 }) },
        { t: 1, cap: 'Redescends en freinant', p: P({ px: 162, py: 124, torso: -6, neck: 4, shF: 30, elF: 50, shB: 26, elB: 48, hipF: 86, kneeF: 92, hipB: 82, kneeB: 90, footF: -10, footB: -10 }) },
      ],
    },

    legcurl: {
      dur: 2800, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['thighB'],
      props: [{ k: 'rect', x: 110, y: 158, w: 150, h: 12, r: 5 }, { k: 'rect', x: 126, y: 170, w: 10, h: 26 }, { k: 'rect', x: 226, y: 170, w: 10, h: 26 }],
      frames: [
        { t: 0, cap: 'À plat ventre, jambes tendues', p: P({ px: 192, py: 150, torso: 86, neck: -68, shF: 130, elF: 40, shB: 126, elB: 40, hipF: -4, kneeF: 6, hipB: -8, kneeB: 6, legRef: -86, footF: -140, footB: -140 }) },
        { t: .42, cap: 'Ramène les talons vers les fessiers', p: P({ px: 192, py: 150, torso: 86, neck: -68, shF: 130, elF: 40, shB: 126, elB: 40, hipF: -4, kneeF: 112, hipB: -8, kneeB: 108, legRef: -86, footF: -60, footB: -60 }) },
        { t: .55, cap: 'Contracte l’ischio en haut', p: P({ px: 192, py: 150, torso: 86, neck: -68, shF: 130, elF: 40, shB: 126, elB: 40, hipF: -4, kneeF: 120, hipB: -8, kneeB: 116, legRef: -86, footF: -60, footB: -60 }) },
        { t: 1, cap: 'Redescends lentement', p: P({ px: 192, py: 150, torso: 86, neck: -68, shF: 130, elF: 40, shB: 126, elB: 40, hipF: -4, kneeF: 6, hipB: -8, kneeB: 6, legRef: -86, footF: -140, footB: -140 }) },
      ],
    },

    legpress: {
      dur: 3000, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['thighF', 'glute'],
      props: [{ k: 'rect', x: 96, y: 120, w: 16, h: 76, r: 3 }, { k: 'rect', x: 104, y: 150, w: 70, h: 14, r: 4 }, { k: 'rect', x: 258, y: 56, w: 18, h: 120, r: 3, rot: 18 }],
      frames: [
        { t: 0, cap: 'Dos plaqué au siège, pieds sur la plateforme', p: P({ px: 152, py: 138, torso: -36, neck: 24, shF: 44, elF: 70, shB: 40, elB: 68, hipF: 128, kneeF: 106, hipB: 124, kneeB: 104, legRef: 36, footF: -64, footB: -64 }) },
        { t: .42, cap: 'Pousse sans verrouiller les genoux', p: P({ px: 152, py: 138, torso: -36, neck: 24, shF: 44, elF: 70, shB: 40, elB: 68, hipF: 102, kneeF: 22, hipB: 98, kneeB: 24, legRef: 36, footF: -52, footB: -52 }) },
        { t: .55, cap: 'Jambes presque tendues', p: P({ px: 152, py: 138, torso: -36, neck: 24, shF: 44, elF: 70, shB: 40, elB: 68, hipF: 100, kneeF: 16, hipB: 96, kneeB: 18, legRef: 36, footF: -52, footB: -52 }) },
        { t: 1, cap: 'Plie en contrôle, genoux vers la poitrine', p: P({ px: 152, py: 138, torso: -36, neck: 24, shF: 44, elF: 70, shB: 40, elB: 68, hipF: 128, kneeF: 106, hipB: 124, kneeB: 104, legRef: 36, footF: -64, footB: -64 }) },
      ],
    },

    shrug: {
      dur: 2200, armMode: 'fk', legMode: 'ik', legBend: 1, equip: 'db',
      glow: ['traps'],
      props: [],
      frames: [
        { t: 0, cap: 'Haltères en mains, bras relâchés', p: P({ py: 131, shF: 4, elF: 4, shB: 0, elB: 4 }) },
        { t: .42, cap: 'Hausse les épaules vers les oreilles', p: P({ py: 128, neck: -4, shF: 4, elF: 4, shB: 0, elB: 4 }) },
        { t: .55, cap: 'Tiens 1 seconde en haut', p: P({ py: 128, neck: -4, shF: 4, elF: 4, shB: 0, elB: 4 }) },
        { t: 1, cap: 'Relâche lentement', p: P({ py: 131, shF: 4, elF: 4, shB: 0, elB: 4 }) },
      ],
    },

    run: {
      dur: 900, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['thighF', 'calfF'],
      props: [],
      frames: [
        { t: 0, cap: 'Foulée dynamique, buste légèrement penché', p: P({ py: 128, torso: 10, shF: 44, elF: 86, shB: -36, elB: 70, hipF: 44, kneeF: 28, hipB: -28, kneeB: 64, footF: -8, footB: -46 }) },
        { t: .5, cap: 'Bras en opposition, épaules relâchées', p: P({ py: 126, torso: 10, shF: -36, elF: 70, shB: 44, elB: 86, hipF: -28, kneeF: 64, hipB: 44, kneeB: 28, footF: -46, footB: -8 }) },
        { t: 1, cap: 'Pose médio-pied, reste léger', p: P({ py: 128, torso: 10, shF: 44, elF: 86, shB: -36, elB: 70, hipF: 44, kneeF: 28, hipB: -28, kneeB: 64, footF: -8, footB: -46 }) },
      ],
    },

    jump: {
      dur: 1300, armMode: 'fk', legMode: 'fk', equip: 'none',
      glow: ['thighF', 'calfF'],
      props: [],
      frames: [
        { t: 0, cap: 'Pieds joints, bras le long du corps', p: P({ py: 131, shF: 8, elF: 8, shB: 4, elB: 8, hipF: 2, kneeF: 4, hipB: -2, kneeB: 4 }) },
        { t: .3, cap: 'Impulsion — bras vers le haut', p: P({ py: 118, shF: 168, elF: 8, shB: 162, elB: 8, hipF: 10, kneeF: 10, hipB: 6, kneeB: 10, footF: -16, footB: -16 }) },
        { t: .55, cap: 'Réception amortie, genoux souples', p: P({ py: 142, torso: 12, shF: 24, elF: 16, shB: 18, elB: 16, hipF: 38, kneeF: 52, hipB: 32, kneeB: 50 }) },
        { t: 1, cap: 'Enchaîne avec rythme', p: P({ py: 131, shF: 8, elF: 8, shB: 4, elB: 8, hipF: 2, kneeF: 4, hipB: -2, kneeB: 4 }) },
      ],
    },
  };

  // goblet = squat avec haltère tenu devant la poitrine (bras en FK)
  PATTERNS.goblet = Object.assign({}, PATTERNS.squat, {
    equip: 'goblet', armMode: 'fk',
    frames: PATTERNS.squat.frames.map(f => ({
      t: f.t, cap: f.cap,
      p: Object.assign({}, f.p, { shF: 36, elF: 112, shB: 32, elB: 108 }),
    })),
  });

  /* ════════════════════════════════════════════════════════════════
     MAPPING exercice → pattern (noms français du catalogue Atlas)
     ════════════════════════════════════════════════════════════════ */
  const RULES = [
    [/leg.?curl|ischio|fémoral|glute.?ham|ghr/, 'legcurl'],
    [/leg.?ext|extension.*(jambe|quadri)|abduc|adduc/, 'legext'],
    [/presse|leg.?press/, 'legpress'],
    [/goblet/, 'goblet'],
    [/squat|chaise/, 'squat'],
    [/soulev|deadlift|terre|rdl|roumain|good.?morning|hyperextension|lombaire|pull.?through|reverse.?hyper|back.?extension|swing/, 'hinge'],
    [/fente|lunge|step.?up|bulgare|split/, 'lunge'],
    [/hip.?thrust|pont|glute.?bridge|fessier.*pont/, 'hipthrust'],
    [/mollet|calf|chameau/, 'calf'],
    [/pompe|push.?up/, 'pushup'],
    [/dips?\b/, 'dip'],
    [/développé.*(couché|incliné|décliné)|bench|écarté|fly|pec.?deck|pull.?over/, 'bench'],
    [/élévation|lateral|frontale|oiseau|reverse.?fly|face.?pull|w.?raise|rotation.*(interne|externe)|coiffe/, 'raise'],
    [/développé.*(militaire|épaule|assis|haltère)|ohp|overhead|arnold|handstand/, 'ohp'],
    [/traction|pull.?up|chin.?up|muscle.?up/, 'pullup'],
    [/tirage.*(vertical|poitrine|nuque)|poulie.*haute|pulldown|lat.*machine/, 'pulldown'],
    [/tirage.*(horizontal|bas)|rameur|seated.?row|poulie.*basse/, 'cablerow'],
    [/rowing|row\b|tirage/, 'row'],
    [/curl.*(marteau|biceps|incliné|pupitre|concentr)|biceps|marteau/, 'curl'],
    [/curl/, 'curl'],
    [/triceps|pushdown|barre.*front|kick.?back|extension.*(nuque|couché|corde)/, 'triceps'],
    [/shrug|hauss|trapèze/, 'shrug'],
    [/crunch|sit.?up|relevé.*buste|enroulé|twist|oblique|bicyclette/, 'crunch'],
    [/relevé.*(jambe|genou)|leg.?raise|toes.?to.?bar|ciseaux|l.?sit|dragon.?flag/, 'legraise'],
    [/gainage|planche|plank|dead.?bug|bird.?dog|superman|hollow|ab.?wheel|rollout/, 'plank'],
    [/burpee|jumping|saut|box.?jump|corde|étoile/, 'jump'],
    [/course|sprint|tapis|vélo|elliptique|escalier|montée|mountain.?climber|cardio|hiit|marche|rameur/, 'run'],
  ];
  const CAT_DEFAULT = {
    jambes: 'squat', dos: 'row', pecs: 'bench', epaules: 'ohp',
    bras: 'curl', abdos: 'crunch', mollets: 'calf', cardio: 'run',
  };

  function resolve(name, category) {
    const n = (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nAcc = (name || '').toLowerCase();
    for (const [re, key] of RULES) {
      if (re.test(nAcc) || re.test(n)) return key;
    }
    return CAT_DEFAULT[(category || '').toLowerCase()] || 'squat';
  }

  /* ════════════════════════════════════════════════════════════════
     RENDU
     ════════════════════════════════════════════════════════════════ */
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const lineAttrs = (color, w) => ({ stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none' });

  // Tête façon Bitmoji, dessinée face à +x, centrée sur (0,0)
  function buildHead() {
    const g = el('g', {});
    const add = (t, a) => g.appendChild(el(t, a));
    // cou (court, sous la tête)
    add('rect', { x: -4.5, y: 8, width: 9, height: 9, rx: 4, fill: SKIN });
    // crâne
    add('circle', { cx: 0, cy: 0, r: HEAD_R, fill: SKIN });
    // oreille
    add('circle', { cx: -5.5, cy: 1.5, r: 3.1, fill: SKIN, stroke: SKIN_D, 'stroke-width': .7 });
    // barbe courte : mâchoire + menton (demi-anneau bas/avant)
    add('path', { d: 'M -7.5 7.5 Q -2 16.5 6.5 13.5 Q 13.2 11 14 3.5 L 10.6 3.2 Q 9.8 9.4 5 11 Q -1.5 13 -5.2 6.2 Z', fill: HAIR, opacity: .92 });
    // moustache discrète
    add('path', { d: 'M 9.2 6.2 Q 11.8 5.4 13.4 6 Q 12.4 8 10 7.8 Z', fill: HAIR, opacity: .85 });
    // cheveux bouclés (amas de cercles sur le dessus, front dégagé)
    [[-9.5, -7.5, 6.2], [-4, -12, 6.6], [2.5, -13.2, 6], [8, -12.2, 4.9], [11.4, -9.4, 3.6], [-12.4, -2.8, 4.4], [-7, -12.6, 4.6]].forEach(c =>
      add('circle', { cx: c[0], cy: c[1], r: c[2], fill: HAIR }));
    // sourcil
    add('path', { d: 'M 6.4 -6.8 Q 9.6 -8.2 12.2 -7', stroke: HAIR, 'stroke-width': 1.7, 'stroke-linecap': 'round', fill: 'none' });
    // œil
    add('circle', { cx: 9.8, cy: -3.4, r: 1.8, fill: '#241a12' });
    // nez (profil)
    add('path', { d: 'M 14 -1.5 Q 16.6 0.8 14.4 2.6', stroke: SKIN_D, 'stroke-width': 1.4, 'stroke-linecap': 'round', fill: 'none' });
    // sourire (visible dans la barbe)
    add('path', { d: 'M 9 7.6 Q 11.4 8.8 13.2 7.4', stroke: '#f7e6d2', 'stroke-width': 1.5, 'stroke-linecap': 'round', fill: 'none' });
    return g;
  }

  function buildEquip(kind) {
    const g = el('g', {});
    const add = (t, a) => { const e = el(t, a); g.appendChild(e); return e; };
    const plate = (r1, r2) => {
      add('circle', { cx: 0, cy: 0, r: r1, fill: EQ_D, stroke: EQ_S, 'stroke-width': 1.4 });
      add('circle', { cx: 0, cy: 0, r: r2, fill: EQ, stroke: EQ_S, 'stroke-width': .9 });
      add('circle', { cx: 0, cy: 0, r: 2.2, fill: EQ_S });
    };
    if (kind === 'barHands' || kind === 'barBack' || kind === 'barHip') plate(15, 8.5);
    else if (kind === 'db' || kind === 'dbF' || kind === 'goblet') {
      add('rect', { x: -2.2, y: -7.5, width: 4.4, height: 15, rx: 1.6, fill: EQ, stroke: EQ_S, 'stroke-width': .8 });
      add('circle', { cx: 0, cy: -7.5, r: 4.6, fill: EQ_D, stroke: EQ_S, 'stroke-width': 1 });
      add('circle', { cx: 0, cy: 7.5, r: 4.6, fill: EQ_D, stroke: EQ_S, 'stroke-width': 1 });
    } else if (kind === 'cableHigh' || kind === 'cableDown' || kind === 'cableMid') {
      add('rect', { x: -11, y: -2.6, width: 22, height: 5.2, rx: 2.4, fill: EQ, stroke: EQ_S, 'stroke-width': .9 });
    }
    return g;
  }

  function play(container, exName, opts) {
    opts = opts || {};
    if (!container) return { stop() {} };
    if (container.__atlasAv) container.__atlasAv.stop();

    const key = opts.pattern || resolve(exName, opts.category);
    const pat = PATTERNS[key] || PATTERNS.squat;

    // ── construction du SVG ──
    const svg = el('svg', { viewBox: '0 0 360 220', class: 'atlas-avatar-svg' });
    svg.style.cssText = 'width:100%;height:auto;display:block;';
    const add = (t, a, parent) => { const e = el(t, a); (parent || svg).appendChild(e); return e; };

    // fond
    const defs = add('defs', {});
    defs.innerHTML =
      '<radialGradient id="aav_bg" cx="50%" cy="18%" r="95%">' +
      '<stop offset="0%" stop-color="#15151f"/><stop offset="60%" stop-color="#0b0b12"/><stop offset="100%" stop-color="#07070c"/>' +
      '</radialGradient>' +
      '<radialGradient id="aav_glow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="rgba(255,122,0,.55)"/><stop offset="70%" stop-color="rgba(255,122,0,.18)"/><stop offset="100%" stop-color="rgba(255,122,0,0)"/>' +
      '</radialGradient>';
    add('rect', { width: 360, height: 220, fill: 'url(#aav_bg)' });
    add('line', { x1: 0, y1: GROUND + ANKLE_H + 1, x2: 360, y2: GROUND + ANKLE_H + 1, stroke: '#23233a', 'stroke-width': 1.4 });
    add('line', { x1: 0, y1: GROUND + ANKLE_H + 1, x2: 360, y2: GROUND + ANKLE_H + 1, stroke: 'rgba(255,122,0,.14)', 'stroke-width': 4, opacity: .5 });

    // décor du pattern
    (pat.props || []).forEach(pr => {
      if (pr.k === 'rect') add('rect', {
        x: pr.x, y: pr.y, width: pr.w, height: pr.h, rx: pr.r || 1.5,
        fill: EQ, stroke: EQ_S, 'stroke-width': .9,
        transform: pr.rot ? `rotate(${pr.rot} ${pr.x + pr.w / 2} ${pr.y + pr.h / 2})` : '',
      });
    });
    // câble (ligne dynamique)
    let cable = null, pulley = null;
    if (pat.equip === 'cableHigh') { pulley = [304, 16]; }
    if (pat.equip === 'cableDown') { pulley = [294, 14]; }
    if (pat.equip === 'cableMid') { pulley = [304, 122]; }
    if (pulley) {
      add('circle', { cx: pulley[0], cy: pulley[1], r: 5, fill: EQ_D, stroke: EQ_S, 'stroke-width': 1.2 });
      cable = add('line', Object.assign({ x1: 0, y1: 0, x2: 0, y2: 0 }, lineAttrs('#6a6f8d', 1.6)));
    }

    // ombre
    const shadow = add('ellipse', { cx: 180, cy: GROUND + ANKLE_H + 2, rx: 40, ry: 4.5, fill: 'rgba(0,0,0,.55)' });

    // ── segments du personnage (ordre de peinture) ──
    const armBU = add('line', lineAttrs(SHIRT_D, 12));   // bras arrière manche
    const armBUs = add('line', lineAttrs(SKIN_D, 8));    // bras arrière peau
    const armBF = add('line', lineAttrs(SKIN_D, 7));     // avant-bras arrière
    const handB = add('circle', { r: 4.2, fill: SKIN_D });
    const watch = add('line', lineAttrs('#0c0c10', 4.5));// montre (poignet arrière)
    const equipB = (pat.equip === 'db') ? buildEquip('db') : null;
    if (equipB) svg.appendChild(equipB);

    const thighB = add('line', lineAttrs(PANTS_D, 12.5));
    const shinB = add('line', lineAttrs(PANTS_D, 9.5));
    const footB = add('line', lineAttrs(SHOE_D, 6.5));

    const torsoL = add('line', lineAttrs(SHIRT, 25));    // tronc (tee oversize)
    const hipL = add('line', lineAttrs(PANTS, 19));      // short du bassin

    const thighF = add('line', lineAttrs(PANTS, 13));
    const shinF = add('line', lineAttrs(PANTS, 10));
    const footF = add('line', lineAttrs(SHOE, 7));

    const headG = buildHead(); svg.appendChild(headG);

    const armFU = add('line', lineAttrs(SHIRT, 13));     // manche avant
    const armFUs = add('line', lineAttrs(SKIN, 8.5));
    const armFF = add('line', lineAttrs(SKIN, 7.5));
    const handF = add('circle', { r: 4.5, fill: SKIN });
    const equipF = (pat.equip && pat.equip !== 'none') ? buildEquip(pat.equip === 'db' ? 'db' : pat.equip) : null;
    if (equipF) svg.appendChild(equipF);

    // glows musculaires
    const glows = (pat.glow || []).map(() => add('ellipse', { rx: 14, ry: 9, fill: 'url(#aav_glow)', style: 'pointer-events:none' }));

    container.innerHTML = '';
    container.appendChild(svg);

    // légende de phase (chip HTML au-dessus de la scène)
    let chip = null;
    if (opts.captions !== false) {
      chip = document.createElement('div');
      chip.style.cssText = 'position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:flex-start;pointer-events:none;';
      chip.innerHTML = '<span style="background:rgba(10,10,16,.82);border:1px solid rgba(255,122,0,.35);color:#ffb877;font-size:11px;font-weight:600;padding:5px 11px;border-radius:100px;line-height:1.4;backdrop-filter:blur(4px);max-width:100%;"></span>';
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      container.appendChild(chip);
    }
    const chipSpan = chip ? chip.firstChild : null;

    // ── boucle d'animation ──
    const segLine = (n, x1, y1, x2, y2) => { n.setAttribute('x1', x1); n.setAttribute('y1', y1); n.setAttribute('x2', x2); n.setAttribute('y2', y2); };
    const pt = (o, d, len) => [o[0] + d[0] * len, o[1] + d[1] * len];
    const frames = pat.frames;
    let raf = 0, start = performance.now(), lastCap = '';
    const speed = opts.speed || 1;

    function samplePose(tc) {
      let i = 0;
      while (i < frames.length - 1 && frames[i + 1].t < tc) i++;
      const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
      const span = Math.max(1e-4, b.t - a.t);
      const f = ease(Math.min(1, Math.max(0, (tc - a.t) / span)));
      const p = {};
      for (const k in BASE) p[k] = lerp(a.p[k], b.p[k], f);
      return [p, (f < .5 ? a : b).cap || a.cap];
    }

    function frame(now) {
      if (!svg.isConnected) { cancelAnimationFrame(raf); return; }
      const tc = (((now - start) * speed) % pat.dur) / pat.dur;
      const [p, cap] = samplePose(tc);

      // tronc
      const pelvis = [p.px, p.py];
      const up = dirUp(p.torso);
      const neck = pt(pelvis, up, TORSO);
      const shoulder = pt(pelvis, up, TORSO * SH_FRAC);
      const headC = pt(neck, dirUp(p.torso + p.neck), HEAD_OFF + 4);
      segLine(torsoL, pelvis[0], pelvis[1], neck[0], neck[1]);
      const hipDir = dirUp(p.torso);
      segLine(hipL, pelvis[0] - hipDir[0] * 2, pelvis[1] - hipDir[1] * 2, pelvis[0] + hipDir[0] * 9, pelvis[1] + hipDir[1] * 9);
      headG.setAttribute('transform', `translate(${headC[0]},${headC[1]}) rotate(${p.torso + p.neck})`);

      // jambes
      let kF, aF, kB, aB;
      if (pat.legMode === 'ik') {
        const ankF = [p.fxF, (p.fyF || GROUND) - ANKLE_H];
        const ankB = [p.fxB, (p.fyB || GROUND) - ANKLE_H];
        const rF = ik(pelvis[0], pelvis[1], ankF[0], ankF[1], THIGH, SHIN, pat.legBend || 1);
        const rB = ik(pelvis[0], pelvis[1], ankB[0], ankB[1], THIGH, SHIN, pat.legBend || 1);
        kF = [rF[0], rF[1]]; aF = [rF[2], rF[3]];
        kB = [rB[0], rB[1]]; aB = [rB[2], rB[3]];
      } else {
        const ref = p.legRef || 0;
        const dTF = dirDn(ref + p.hipF), dTB = dirDn(ref + p.hipB);
        kF = pt(pelvis, dTF, THIGH); kB = pt(pelvis, dTB, THIGH);
        const dSF = dirDn(ref + p.hipF - p.kneeF), dSB = dirDn(ref + p.hipB - p.kneeB);
        aF = pt(kF, dSF, SHIN); aB = pt(kB, dSB, SHIN);
      }
      segLine(thighF, pelvis[0], pelvis[1], kF[0], kF[1]);
      segLine(shinF, kF[0], kF[1], aF[0], aF[1]);
      segLine(thighB, pelvis[0], pelvis[1], kB[0], kB[1]);
      segLine(shinB, kB[0], kB[1], aB[0], aB[1]);
      const fDirF = [Math.cos(rad(p.footF)), Math.sin(rad(p.footF))];
      const fDirB = [Math.cos(rad(p.footB)), Math.sin(rad(p.footB))];
      segLine(footF, aF[0] - fDirF[0] * 2.5, aF[1] + ANKLE_H - 2 - fDirF[1] * 2.5, aF[0] + fDirF[0] * 9.5, aF[1] + ANKLE_H - 2 + fDirF[1] * 9.5);
      segLine(footB, aB[0] - fDirB[0] * 2.5, aB[1] + ANKLE_H - 2 - fDirB[1] * 2.5, aB[0] + fDirB[0] * 9.5, aB[1] + ANKLE_H - 2 + fDirB[1] * 9.5);

      // bras
      let eF, hF, eB, hB;
      if (pat.armMode === 'ik') {
        const rF = ik(shoulder[0], shoulder[1], p.hxF, p.hyF, UARM, FARM, pat.armBend || -1);
        const rB = ik(shoulder[0], shoulder[1], p.hxB, p.hyB, UARM, FARM, pat.armBend || -1);
        eF = [rF[0], rF[1]]; hF = [rF[2], rF[3]];
        eB = [rB[0], rB[1]]; hB = [rB[2], rB[3]];
      } else {
        const dUF = dirDn(p.torso + p.shF), dUB = dirDn(p.torso + p.shB);
        eF = pt(shoulder, dUF, UARM); eB = pt(shoulder, dUB, UARM);
        const dFF = dirDn(p.torso + p.shF + p.elF), dFB = dirDn(p.torso + p.shB + p.elB);
        hF = pt(eF, dFF, FARM); hB = pt(eB, dFB, FARM);
      }
      const sleeve = (s, e, fr) => [lerp(s[0], e[0], fr), lerp(s[1], e[1], fr)];
      const slF = sleeve(shoulder, eF, .55), slB = sleeve(shoulder, eB, .55);
      segLine(armFU, shoulder[0], shoulder[1], slF[0], slF[1]);
      segLine(armFUs, slF[0], slF[1], eF[0], eF[1]);
      segLine(armFF, eF[0], eF[1], hF[0], hF[1]);
      handF.setAttribute('cx', hF[0]); handF.setAttribute('cy', hF[1]);
      segLine(armBU, shoulder[0], shoulder[1], slB[0], slB[1]);
      segLine(armBUs, slB[0], slB[1], eB[0], eB[1]);
      segLine(armBF, eB[0], eB[1], hB[0], hB[1]);
      handB.setAttribute('cx', hB[0]); handB.setAttribute('cy', hB[1]);
      const wPos = sleeve(eB, hB, .82);
      segLine(watch, wPos[0] - 2.4, wPos[1], wPos[0] + 2.4, wPos[1]);

      // équipement
      if (equipF) {
        let ex, ey;
        const fwd = [Math.cos(rad(p.torso)), Math.sin(rad(p.torso))];
        if (pat.equip === 'barBack') { ex = shoulder[0] - fwd[0] * 9; ey = shoulder[1] - fwd[1] * 9; }
        else if (pat.equip === 'barHip') { ex = pelvis[0] + hipDir[0] * 6; ey = pelvis[1] + hipDir[1] * 6 - 8; }
        else if (pat.equip === 'goblet') { ex = pt(pelvis, up, TORSO * .62)[0] + dirDn(p.torso - 90)[0] * -16; ey = pt(pelvis, up, TORSO * .62)[1] + 0; ex = hF[0]; ey = hF[1] - 2; }
        else { ex = (hF[0] + hB[0]) / 2; ey = (hF[1] + hB[1]) / 2; }
        equipF.setAttribute('transform', `translate(${ex},${ey})`);
        if (cable) segLine(cable, pulley[0], pulley[1], ex, ey);
      }
      if (equipB) equipB.setAttribute('transform', `translate(${hB[0]},${hB[1]})`);

      // ombre
      shadow.setAttribute('cx', pelvis[0]);
      const air = Math.max(0, GROUND - 5 - Math.max(aF[1], aB[1]));
      shadow.setAttribute('rx', Math.max(22, 44 - air * .6));
      shadow.setAttribute('opacity', Math.max(.25, .6 - air * .012));

      // glows
      const segPos = {
        thighF: () => [(pelvis[0] + kF[0]) / 2, (pelvis[1] + kF[1]) / 2],
        thighB: () => [(pelvis[0] + kB[0]) / 2 - 2, (pelvis[1] + kB[1]) / 2],
        shinF: () => [(kF[0] + aF[0]) / 2, (kF[1] + aF[1]) / 2],
        calfF: () => [(kF[0] + aF[0]) / 2 - 2, (kF[1] + aF[1]) / 2],
        calfB: () => [(kB[0] + aB[0]) / 2 - 2, (kB[1] + aB[1]) / 2],
        glute: () => [pelvis[0] - up[0] * 2 - 7, pelvis[1] - 2],
        chest: () => { const c = pt(pelvis, up, TORSO * .72); return [c[0] + 8, c[1]]; },
        abs: () => { const c = pt(pelvis, up, TORSO * .42); return [c[0] + 6, c[1]]; },
        backUp: () => { const c = pt(pelvis, up, TORSO * .7); return [c[0] - 9, c[1]]; },
        backLow: () => { const c = pt(pelvis, up, TORSO * .3); return [c[0] - 8, c[1]]; },
        shoulder: () => [shoulder[0], shoulder[1] - 2],
        traps: () => [(shoulder[0] + neck[0]) / 2, (shoulder[1] + neck[1]) / 2 - 3],
        armUF: () => [(shoulder[0] + eF[0]) / 2, (shoulder[1] + eF[1]) / 2],
        armBF: () => [(shoulder[0] + eF[0]) / 2 - 3, (shoulder[1] + eF[1]) / 2],
      };
      const pulse = .8 + .2 * Math.sin(now / 300);
      (pat.glow || []).forEach((gk, i) => {
        const fn = segPos[gk]; if (!fn) return;
        const [gx, gy] = fn();
        const n = glows[i];
        n.setAttribute('cx', gx); n.setAttribute('cy', gy);
        n.setAttribute('opacity', pulse);
      });

      // légende
      if (chipSpan && cap && cap !== lastCap) { chipSpan.textContent = cap; lastCap = cap; }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const ctrl = {
      stop() { cancelAnimationFrame(raf); if (container.__atlasAv === ctrl) container.__atlasAv = null; },
      pattern: key,
    };
    container.__atlasAv = ctrl;
    return ctrl;
  }

  window.AtlasAvatar = { play, resolve, PATTERNS };
})();
