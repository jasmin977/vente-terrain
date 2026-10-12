import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EntrepotData, Rack, SelectionEntrepot, VueEntrepot } from "../types/entrepot";
import { COULEURS_STATUT, statutRack, type StatutStock } from "../utils/statutEntrepot";
import {
  CASE_LARGEUR,
  HAUTEUR_MURS,
  NB_PORTES,
  NIVEAU_HAUTEUR,
  PORTE_LARGEUR,
  RACK_PROFONDEUR,
  SOCLE,
  hauteurRack,
  longueurRack,
} from "./geometrie";

// Scène 3D du dépôt, dessinée en géométrie vectorielle (aucune image ni modèle importé) : bâtiment, allées,
// étagères à étages avec leurs cartons, camions garés devant les portes. Caméra orbitale (vue d'ensemble,
// dessus, à l'intérieur) ou marche à pied dans les allées ; clic sur une case, une étagère ou un camion.

const COULEURS = {
  solDehors: 0xb4b0a6,
  solHall: 0xd9d4c9,
  ligneAllee: 0xe2b93b,
  montant: 0x2f5d9e,
  lisse: 0xe07b22,
  plancher: 0xd2b27d,
  mur: 0xf3efe6,
  murArete: 0x8b8378,
  porte: 0x4a4640,
  selection: 0xff9a1f,
  recherche: 0x1fbf75,
};
const CARTONS = [0xc79a62, 0xb98a52, 0xd3ad78, 0xa9794a, 0xcfa56d, 0xbf9360];
const CAMIONS = [0xf6f4ee, 0xe9efe6, 0xefe9de, 0xe6ecf2, 0xf1e8e8];
const CABINES = [0x2f5d9e, 0x2d7a5a, 0x9c7a4e, 0x7a4e9c, 0xb0352a];

const EYE = 1.7;

interface Anim {
  depuis: { p: THREE.Vector3; c: THREE.Vector3 };
  vers: { p: THREE.Vector3; c: THREE.Vector3 };
  debut: number;
  duree: number;
}

export interface OptionsScene {
  conteneur: HTMLElement;
  /** Clic sur un objet (null : clic dans le vide). */
  surSelection: (selection: SelectionEntrepot | null) => void;
}

const cle = (s: SelectionEntrepot | null) =>
  !s ? "" : s.type === "rack" ? `r:${s.rackId}` : s.type === "case" ? `c:${s.rackId}:${s.niveau}:${s.travee}` : `v:${s.vendeurId}`;

const hash = (texte: string) => {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export class ScenEntrepot {
  private readonly conteneur: HTMLElement;
  private readonly surSelection: (s: SelectionEntrepot | null) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private readonly controles: OrbitControls;
  private readonly lanceur = new THREE.Raycaster();
  private readonly observateur: ResizeObserver;
  private contenu = new THREE.Group();
  private cliquables: THREE.Object3D[] = [];
  private data: EntrepotData | null = null;
  private selection: SelectionEntrepot | null = null;
  private survol: SelectionEntrepot | null = null;
  private anim: Anim | null = null;
  private horloge = new THREE.Clock();

  // Marche à pied
  private marche = false;
  private lacet = 0;
  private tangage = 0;
  private entree = { avant: 0, cote: 0 };
  private touches = new Set<string>();
  private glisse: { x: number; y: number; deplace: boolean } | null = null;

  private surlignageCase: THREE.Group;
  private surlignageRack: THREE.Group;
  private marqueurs = new THREE.Group();
  private camionsMat = new Map<string, THREE.MeshStandardMaterial[]>();
  // Couleurs de stock (rouge / orange / bleu / vert) sur les cartons et les étiquettes ; filtre : un seul statut en couleur.
  private couleursStock = true;
  private filtreStatut: StatutStock | null = null;

  constructor(opts: OptionsScene) {
    this.conteneur = opts.conteneur;
    this.surSelection = opts.surSelection;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "rc-entrepot__canvas";
    this.renderer.domElement.setAttribute("aria-label", "Vue 3D du dépôt");
    this.conteneur.appendChild(this.renderer.domElement);

    const fond = getComputedStyle(document.documentElement).getPropertyValue("--rc-bg").trim() || "#f5f2ed";
    this.scene.background = new THREE.Color(fond);
    this.scene.fog = new THREE.Fog(new THREE.Color(fond), 90, 220);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948a, 1.05));
    const soleil = new THREE.DirectionalLight(0xffffff, 1.4);
    soleil.position.set(-18, 34, 22);
    soleil.castShadow = true;
    soleil.shadow.mapSize.set(2048, 2048);
    soleil.shadow.camera.left = -45;
    soleil.shadow.camera.right = 45;
    soleil.shadow.camera.top = 45;
    soleil.shadow.camera.bottom = -45;
    soleil.shadow.camera.far = 120;
    soleil.shadow.bias = -0.0004;
    this.scene.add(soleil);

    this.scene.add(this.contenu, this.marqueurs);
    this.surlignageCase = this.creerSurlignage(COULEURS.selection);
    this.surlignageRack = this.creerSurlignage(COULEURS.selection);
    this.scene.add(this.surlignageCase, this.surlignageRack);

    this.camera.position.set(0, 20, 34);
    this.controles = new OrbitControls(this.camera, this.renderer.domElement);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.minDistance = 2;
    this.controles.maxDistance = 90;
    this.controles.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controles.target.set(0, 0, 4);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.auPointeurBas);
    el.addEventListener("pointermove", this.auPointeurDeplace);
    el.addEventListener("pointerup", this.auPointeurHaut);
    el.addEventListener("pointerleave", this.auPointeurQuitte);
    window.addEventListener("keydown", this.auClavier);
    window.addEventListener("keyup", this.auClavierHaut);

    this.observateur = new ResizeObserver(() => this.redimensionner());
    this.observateur.observe(this.conteneur);
    this.redimensionner();
    this.renderer.setAnimationLoop(this.boucle);
  }

  /* ------------------------------------------------------------------ données */

  /** (Re)construit la scène à partir des données ; la caméra et la sélection sont conservées. */
  charger(data: EntrepotData) {
    const premiere = this.data === null;
    this.data = data;
    this.vider(this.contenu);
    this.contenu = new THREE.Group();
    this.scene.add(this.contenu);
    this.cliquables = [];
    this.camionsMat.clear();

    this.construireBatiment(data);
    for (const rack of data.racks) this.construireRack(rack);
    this.construireCamions(data);
    this.mettreAJourSurlignages();
    if (premiere) this.vue("ensemble", false);
  }

  /** Active ou coupe les couleurs de stock (cartons naturels sinon). */
  definirCouleurs(actif: boolean) {
    if (this.couleursStock === actif) return;
    this.couleursStock = actif;
    if (this.data) this.charger(this.data);
  }

  /** Ne garde en couleur que les articles de ce statut (les autres passent en gris transparent). */
  definirFiltre(statut: StatutStock | null) {
    if (this.filtreStatut === statut) return;
    this.filtreStatut = statut;
    if (this.data) this.charger(this.data);
  }

  /** Sélection venue de l'extérieur (liste, recherche) : met en évidence sans rappeler `surSelection`. */
  selectionner(s: SelectionEntrepot | null) {
    this.selection = s;
    this.mettreAJourSurlignages();
  }

  /** Marque (en vert) les cases qui contiennent l'article cherché. */
  marquer(cases: { rackId: string; niveau: number; travee: number }[]) {
    this.vider(this.marqueurs);
    if (!this.data) return;
    const mat = new THREE.MeshBasicMaterial({ color: COULEURS.recherche, transparent: true, opacity: 0.42, depthWrite: false });
    for (const c of cases) {
      const rack = this.data.racks.find((r) => r.id === c.rackId);
      if (!rack) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(CASE_LARGEUR - 0.04, NIVEAU_HAUTEUR - 0.1, RACK_PROFONDEUR - 0.04), mat);
      const p = this.positionCase(rack, c.niveau, c.travee);
      m.position.copy(p);
      this.marqueurs.add(m);
    }
  }

  /* ------------------------------------------------------------------ caméra */

  vue(v: VueEntrepot, animer = true) {
    const d = this.data;
    const L = d?.entrepot.largeur ?? 32;
    const P = d?.entrepot.profondeur ?? 22;
    this.arreterMarche();
    let p = new THREE.Vector3();
    let c = new THREE.Vector3();
    // Écran étroit (téléphone en portrait) : on recule pour que le bâtiment tienne en largeur.
    const recul = Math.max(1, 1.2 / Math.max(0.3, this.camera.aspect));
    if (v === "ensemble") {
      p = new THREE.Vector3(0, Math.max(L, P) * 0.78 * recul, P / 2 + Math.max(L, P) * 0.95 * recul);
      c = new THREE.Vector3(0, 0, 3);
    } else if (v === "dessus") {
      p = new THREE.Vector3(0, Math.max(L, P * 1.5) * 1.2 * recul, 4.05);
      c = new THREE.Vector3(0, 0, 4);
    } else if (v === "interieur") {
      p = new THREE.Vector3(0, EYE, P / 2 - 2.5);
      c = new THREE.Vector3(0, EYE - 0.3, -P / 2 + 3);
    } else {
      // Au bout du couloir d'une allée, regard le long de l'allée.
      const racks = d?.racks.filter((r) => r.allee === v.allee) ?? [];
      const zs = racks.map((r) => r.z);
      const zc = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
      p = new THREE.Vector3(-L / 2 + 1.2, EYE, zc);
      c = new THREE.Vector3(L / 2 - 3, EYE - 0.3, zc);
    }
    this.allerA(p, c, animer ? 900 : 0);
  }

  private allerA(p: THREE.Vector3, c: THREE.Vector3, ms: number) {
    if (ms <= 0) {
      this.camera.position.copy(p);
      this.controles.target.copy(c);
      this.controles.update();
      this.anim = null;
      return;
    }
    this.anim = {
      depuis: { p: this.camera.position.clone(), c: this.controles.target.clone() },
      vers: { p, c },
      debut: performance.now(),
      duree: ms,
    };
  }

  /** Approche la caméra d'une sélection (case, étagère ou camion), du côté du couloir. */
  focaliser(s: SelectionEntrepot) {
    const d = this.data;
    if (!d) return;
    this.arreterMarche();
    if (s.type === "camion") {
      const i = d.camions.findIndex((c) => c.vendeurId === s.vendeurId);
      const portes = this.positionsPortes(d.entrepot.largeur);
      const x = portes[[1, 0, 2][Math.max(0, i) % NB_PORTES] % portes.length];
      const z = d.entrepot.profondeur / 2 + 4.6 + Math.floor(Math.max(0, i) / NB_PORTES) * 12;
      this.allerA(new THREE.Vector3(x + 7, 4.5, z + 9), new THREE.Vector3(x, 1.6, z), 800);
      return;
    }
    const rack = d.racks.find((r) => r.id === s.rackId);
    if (!rack) return;
    const cible = s.type === "case" ? this.positionCase(rack, s.niveau, s.travee) : new THREE.Vector3(rack.x, hauteurRack(rack.niveaux) / 2, rack.z);
    // Du côté du couloir de l'allée (milieu des étagères de la même allée).
    const memeAllee = d.racks.filter((r) => r.allee === rack.allee);
    const cx = memeAllee.reduce((a, r) => a + r.x, 0) / memeAllee.length;
    const cz = memeAllee.reduce((a, r) => a + r.z, 0) / memeAllee.length;
    const lateral = rack.rotation === 90;
    const signe = Math.sign((lateral ? cx - rack.x : cz - rack.z) || 1);
    const decalage = new THREE.Vector3(lateral ? signe * 4.2 : 0, 0.6, lateral ? 0 : signe * 4.2);
    const pos = cible.clone().add(decalage);
    pos.y = Math.max(1.4, Math.min(cible.y + 0.6, 3));
    this.allerA(pos, cible, 800);
  }

  /** Marche à pied dans les allées : ZQSD / WASD / flèches, glisser pour regarder autour. */
  demarrerMarche() {
    if (this.marche) return;
    this.marche = true;
    this.controles.enabled = false;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.lacet = Math.atan2(-dir.x, -dir.z);
    this.tangage = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    // À hauteur d'yeux, dans le bâtiment si on arrive de l'extérieur.
    this.camera.position.y = EYE;
    this.appliquerRegard();
  }

  arreterMarche() {
    if (!this.marche) return;
    this.marche = false;
    this.entree = { avant: 0, cote: 0 };
    this.touches.clear();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.controles.target.copy(this.camera.position).addScaledVector(dir, 6);
    this.controles.enabled = true;
    this.controles.update();
  }

  enMarche() {
    return this.marche;
  }

  /** Commande de déplacement venue de l'écran (boutons tactiles) : -1, 0 ou 1. */
  deplacer(avant: number, cote: number) {
    this.entree = { avant, cote };
  }

  private appliquerRegard() {
    const e = new THREE.Euler(this.tangage, this.lacet, 0, "YXZ");
    this.camera.quaternion.setFromEuler(e);
  }

  /* ------------------------------------------------------------------ construction */

  private vider(g: THREE.Object3D) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => this.libererMateriau(x));
      else if (mat) this.libererMateriau(mat);
    });
    g.clear();
    if (g.parent && g !== this.marqueurs) g.parent.remove(g);
  }

  private libererMateriau(m: THREE.Material) {
    const carte = (m as THREE.MeshBasicMaterial).map;
    carte?.dispose();
    m.dispose();
  }

  private boite(l: number, h: number, p: number, couleur: number, ombre = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, p), new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.7, metalness: 0.05 }));
    m.castShadow = ombre;
    m.receiveShadow = true;
    return m;
  }

  private construireBatiment(d: EntrepotData) {
    const L = d.entrepot.largeur;
    const P = d.entrepot.profondeur;
    const g = this.contenu;

    const dehors = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: COULEURS.solDehors, roughness: 1 }));
    dehors.rotation.x = -Math.PI / 2;
    dehors.position.y = -0.02;
    dehors.receiveShadow = true;
    g.add(dehors);

    const sol = new THREE.Mesh(new THREE.PlaneGeometry(L, P), new THREE.MeshStandardMaterial({ color: COULEURS.solHall, roughness: 0.95 }));
    sol.rotation.x = -Math.PI / 2;
    sol.receiveShadow = true;
    g.add(sol);

    // Lignes jaunes au sol le long des allées.
    const matLigne = new THREE.MeshBasicMaterial({ color: COULEURS.ligneAllee });
    const parAllee = new Map<string, number[]>();
    for (const r of d.racks) parAllee.set(r.allee, [...(parAllee.get(r.allee) ?? []), r.z]);
    for (const zs of parAllee.values()) {
      const zc = (Math.min(...zs) + Math.max(...zs)) / 2;
      for (const dz of [-1.35, 1.35]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(L - 2, 0.07), matLigne);
        l.rotation.x = -Math.PI / 2;
        l.position.set(0, 0.012, zc + dz);
        g.add(l);
      }
    }

    // Murs translucides (on voit l'intérieur depuis l'extérieur) avec leurs arêtes.
    const matMur = new THREE.MeshStandardMaterial({ color: COULEURS.mur, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const matArete = new THREE.LineBasicMaterial({ color: COULEURS.murArete });
    const mur = (l: number, x: number, z: number, ry: number) => {
      const geo = new THREE.BoxGeometry(l, HAUTEUR_MURS, 0.25);
      const m = new THREE.Mesh(geo, matMur);
      m.position.set(x, HAUTEUR_MURS / 2, z);
      m.rotation.y = ry;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), matArete));
      g.add(m);
    };
    mur(L, 0, -P / 2, 0);
    mur(P, -L / 2, 0, Math.PI / 2);
    mur(P, L / 2, 0, Math.PI / 2);
    // Façade avec ses portes : des tronçons de mur entre les ouvertures.
    const portes = this.positionsPortes(L);
    let x = -L / 2;
    for (const px of [...portes, L / 2 + PORTE_LARGEUR / 2]) {
      const fin = px - PORTE_LARGEUR / 2;
      if (fin > x + 0.05) mur(fin - x, (x + fin) / 2, P / 2, 0);
      x = px + PORTE_LARGEUR / 2;
    }
    for (const px of portes) {
      const linteau = this.boite(PORTE_LARGEUR + 0.4, 0.5, 0.3, COULEURS.porte, false);
      linteau.position.set(px, 3.4, P / 2);
      g.add(linteau);
      for (const cote of [-1, 1]) {
        const poteau = this.boite(0.2, 3.4, 0.3, COULEURS.porte, false);
        poteau.position.set(px + cote * (PORTE_LARGEUR / 2 + 0.1), 1.7, P / 2);
        g.add(poteau);
      }
    }
  }

  private positionsPortes(L: number) {
    const pas = L / NB_PORTES;
    return Array.from({ length: NB_PORTES }, (_, i) => -L / 2 + pas * (i + 0.5));
  }

  /** Centre d'une case en coordonnées du monde. */
  private positionCase(rack: Rack, niveau: number, travee: number) {
    const lx = -longueurRack(rack.travees) / 2 + (travee + 0.5) * CASE_LARGEUR;
    const ly = SOCLE + niveau * NIVEAU_HAUTEUR + (NIVEAU_HAUTEUR - 0.06) / 2 + 0.03;
    const a = rack.rotation === 90 ? -Math.PI / 2 : 0;
    return new THREE.Vector3(rack.x + lx * Math.cos(a), ly, rack.z - lx * Math.sin(a));
  }

  private construireRack(rack: Rack) {
    const Lr = longueurRack(rack.travees);
    const Hr = hauteurRack(rack.niveaux);
    const groupe = new THREE.Group();
    groupe.position.set(rack.x, 0, rack.z);
    groupe.rotation.y = rack.rotation === 90 ? -Math.PI / 2 : 0;
    this.contenu.add(groupe);

    // Montants : un à chaque bord de travée, devant et derrière.
    for (let i = 0; i <= rack.travees; i++) {
      for (const dz of [-1, 1]) {
        const m = this.boite(0.07, Hr, 0.07, COULEURS.montant);
        m.position.set(-Lr / 2 + i * CASE_LARGEUR, Hr / 2, (dz * (RACK_PROFONDEUR - 0.07)) / 2);
        groupe.add(m);
      }
    }
    // Lisses (poutres orange) et planchers à chaque niveau.
    for (let n = 0; n < rack.niveaux; n++) {
      const y = SOCLE + n * NIVEAU_HAUTEUR;
      for (const dz of [-1, 1]) {
        const lisse = this.boite(Lr, 0.1, 0.05, COULEURS.lisse);
        lisse.position.set(0, y - 0.05, (dz * (RACK_PROFONDEUR - 0.05)) / 2);
        groupe.add(lisse);
      }
      const plancher = this.boite(Lr, 0.03, RACK_PROFONDEUR - 0.08, COULEURS.plancher);
      plancher.position.set(0, y + 0.015, 0);
      groupe.add(plancher);
    }
    // Étiquette au-dessus de l'étagère.
    const pire = this.couleursStock ? statutRack(rack) : null;
    const etiquette = this.etiquette(rack.nom, 0.5, pire ? COULEURS_STATUT[pire] : undefined);
    etiquette.position.set(0, Hr + 0.4, 0);
    etiquette.userData.sel = { type: "rack", rackId: rack.id } satisfies SelectionEntrepot;
    groupe.add(etiquette);
    this.cliquables.push(etiquette);

    // Cartons dans les cases occupées + zones de clic invisibles sur toutes les cases.
    const parCase = new Map<string, Rack["emplacements"]>();
    for (const e of rack.emplacements) parCase.set(`${e.niveau}:${e.travee}`, [...(parCase.get(`${e.niveau}:${e.travee}`) ?? []), e]);
    const matClic = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const geoClic = new THREE.BoxGeometry(CASE_LARGEUR - 0.06, NIVEAU_HAUTEUR - 0.12, RACK_PROFONDEUR - 0.06);
    for (let n = 0; n < rack.niveaux; n++) {
      for (let t = 0; t < rack.travees; t++) {
        const lx = -Lr / 2 + (t + 0.5) * CASE_LARGEUR;
        const base = SOCLE + n * NIVEAU_HAUTEUR + 0.03;
        const contenu = parCase.get(`${n}:${t}`) ?? [];
        // Jusqu'à trois cartons côte à côte, un par article ; couleur = statut de stock de l'article. Un article
        // en rupture n'a plus de carton : un bloc rouge translucide marque l'emplacement vide.
        const nb = Math.min(3, contenu.length);
        for (let k = 0; k < nb; k++) {
          const e = contenu[k];
          const l = (CASE_LARGEUR - 0.16) / Math.max(1, nb) - 0.04;
          const h = 0.34 + (hash(e.article.id) % 5) * 0.08;
          const x = lx - (CASE_LARGEUR - 0.16) / 2 + (k + 0.5) * ((CASE_LARGEUR - 0.16) / nb);
          const st = e.article.statut;
          const colore = this.couleursStock && (this.filtreStatut === null || this.filtreStatut === st);
          if (st === "RUPTURE" && this.couleursStock) {
            const fantome = new THREE.Mesh(
              new THREE.BoxGeometry(l, h, RACK_PROFONDEUR - 0.22),
              new THREE.MeshBasicMaterial({ color: COULEURS_STATUT.RUPTURE, transparent: true, opacity: colore ? 0.5 : 0.12, depthWrite: false }),
            );
            fantome.position.set(x, base + h / 2, 0);
            groupe.add(fantome);
            continue;
          }
          const couleur = !this.couleursStock ? CARTONS[hash(e.article.id) % CARTONS.length] : colore ? COULEURS_STATUT[st] : 0xb9b5ad;
          const carton = this.boite(l, h, RACK_PROFONDEUR - 0.22, couleur);
          if (this.couleursStock && !colore) {
            const m = carton.material as THREE.MeshStandardMaterial;
            m.transparent = true;
            m.opacity = 0.35;
          } else if (this.couleursStock && (st === "BAS" || st === "NOUVEAU")) {
            // Un léger éclat pour que l'orange et le bleu ressortent dans une allée.
            (carton.material as THREE.MeshStandardMaterial).emissive.setHex(COULEURS_STATUT[st]).multiplyScalar(0.18);
          }
          carton.position.set(x, base + h / 2, 0);
          groupe.add(carton);
        }
        const zone = new THREE.Mesh(geoClic, matClic);
        zone.position.set(lx, base + (NIVEAU_HAUTEUR - 0.12) / 2 + 0.02, 0);
        zone.userData.sel = { type: "case", rackId: rack.id, niveau: n, travee: t } satisfies SelectionEntrepot;
        groupe.add(zone);
        this.cliquables.push(zone);
      }
    }
  }

  private construireCamions(d: EntrepotData) {
    const L = d.entrepot.largeur;
    const P = d.entrepot.profondeur;
    const portes = this.positionsPortes(L);
    // Ordre de stationnement : porte du milieu, gauche, droite, puis une seconde rangée plus loin.
    const ordre = [1, 0, 2];
    d.camions.forEach((c, i) => {
      const rangee = Math.floor(i / NB_PORTES);
      const x = portes[ordre[i % NB_PORTES] % portes.length];
      const camion = this.creerCamion(c.vendeurId, i);
      camion.position.set(x, 0, P / 2 + 1.4 + 3.2 + rangee * 12);
      this.contenu.add(camion);
      const etiquette = this.etiquette(c.nom, 1.4);
      etiquette.position.set(x, 4.2, camion.position.z + 1);
      etiquette.userData.sel = { type: "camion", vendeurId: c.vendeurId } satisfies SelectionEntrepot;
      this.contenu.add(etiquette);
      this.cliquables.push(etiquette);
    });
  }

  private creerCamion(vendeurId: string, i: number) {
    const g = new THREE.Group();
    const sel = { type: "camion", vendeurId } satisfies SelectionEntrepot;
    const matCaisse = new THREE.MeshStandardMaterial({ color: CAMIONS[i % CAMIONS.length], roughness: 0.6 });
    const matCabine = new THREE.MeshStandardMaterial({ color: CABINES[i % CABINES.length], roughness: 0.55 });
    const matVitre = new THREE.MeshStandardMaterial({ color: 0x2b3a46, roughness: 0.2, metalness: 0.3 });
    const matRoue = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.9 });
    this.camionsMat.set(vendeurId, [matCaisse, matCabine]);

    const ajouter = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.sel = sel;
      g.add(m);
      this.cliquables.push(m);
      return m;
    };
    // Caisse arrière (côté bâtiment, z négatif) puis cabine devant (z positif).
    ajouter(new THREE.BoxGeometry(2.5, 2.7, 6.2), matCaisse, 0, 0.55 + 1.35, 0);
    ajouter(new THREE.BoxGeometry(2.4, 2.1, 1.9), matCabine, 0, 0.55 + 1.05, 4.05);
    ajouter(new THREE.BoxGeometry(2.0, 0.8, 0.05), matVitre, 0, 0.55 + 1.45, 5.03);
    ajouter(new THREE.BoxGeometry(2.4, 0.35, 8.4), matRoue, 0, 0.45, 0.9);
    for (const x of [-1.2, 1.2]) {
      for (const z of [-1.8, 1.4, 4.2]) {
        const roue = ajouter(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20), matRoue, x, 0.5, z);
        roue.rotation.z = Math.PI / 2;
      }
    }
    return g;
  }

  /** Texte lisible dans la scène (toujours face à la caméra). */
  private etiquette(texte: string, taille: number, pastille?: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 112;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "rgba(26,24,22,0.86)";
    c.beginPath();
    c.roundRect(4, 4, 376, 104, 26);
    c.fill();
    c.fillStyle = "#fff";
    c.font = "700 54px Manrope, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const texteCourt = texte.length > 12 ? `${texte.slice(0, 11)}…` : texte;
    if (pastille === undefined) {
      c.fillText(texteCourt, 192, 58);
    } else {
      // Pastille du statut le plus urgent de l'étagère, à gauche du nom.
      c.fillStyle = `#${pastille.toString(16).padStart(6, "0")}`;
      c.beginPath();
      c.arc(66, 56, 26, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fff";
      c.fillText(texteCourt, 214, 58);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    s.renderOrder = 10;
    s.scale.set(taille * 3.4, taille * 1.0, 1);
    return s;
  }

  /* ------------------------------------------------------------------ sélection / survol */

  private creerSurlignage(couleur: number) {
    const g = new THREE.Group();
    g.visible = false;
    const boite = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.22, depthWrite: false }));
    const aretes = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: couleur }));
    g.add(boite, aretes);
    g.renderOrder = 5;
    return g;
  }

  private mettreAJourSurlignages() {
    const d = this.data;
    this.surlignageCase.visible = false;
    this.surlignageRack.visible = false;
    for (const mats of this.camionsMat.values()) for (const m of mats) m.emissive.setHex(0x000000);
    const s = this.selection ?? this.survol;
    if (!d || !s) return;
    if (s.type === "camion") {
      for (const m of this.camionsMat.get(s.vendeurId) ?? []) m.emissive.setHex(this.selection ? 0x5a3200 : 0x2a1800);
      return;
    }
    const rack = d.racks.find((r) => r.id === s.rackId);
    if (!rack) return;
    if (s.type === "rack") {
      const Lr = longueurRack(rack.travees);
      const Hr = hauteurRack(rack.niveaux);
      const g = this.surlignageRack;
      g.visible = true;
      g.position.set(rack.x, Hr / 2, rack.z);
      g.rotation.y = rack.rotation === 90 ? -Math.PI / 2 : 0;
      g.scale.set(Lr + 0.2, Hr + 0.1, RACK_PROFONDEUR + 0.2);
      return;
    }
    const g = this.surlignageCase;
    g.visible = true;
    g.position.copy(this.positionCase(rack, s.niveau, s.travee));
    g.rotation.y = rack.rotation === 90 ? -Math.PI / 2 : 0;
    g.scale.set(CASE_LARGEUR - 0.02, NIVEAU_HAUTEUR - 0.06, RACK_PROFONDEUR - 0.02);
  }

  /** Position à l'écran (pixels du conteneur) du centre d'une sélection : pour les tests et les infobulles. */
  positionEcran(s: SelectionEntrepot): { x: number; y: number } | null {
    const d = this.data;
    if (!d) return null;
    let p: THREE.Vector3 | null = null;
    if (s.type === "case") {
      const rack = d.racks.find((r) => r.id === s.rackId);
      if (rack) p = this.positionCase(rack, s.niveau, s.travee);
    } else if (s.type === "rack") {
      const rack = d.racks.find((r) => r.id === s.rackId);
      if (rack) p = new THREE.Vector3(rack.x, hauteurRack(rack.niveaux) + 0.5, rack.z);
    } else {
      const i = d.camions.findIndex((c) => c.vendeurId === s.vendeurId);
      if (i >= 0) {
        const portes = this.positionsPortes(d.entrepot.largeur);
        p = new THREE.Vector3(portes[[1, 0, 2][i % NB_PORTES] % portes.length], 2, d.entrepot.profondeur / 2 + 4.6 + Math.floor(i / NB_PORTES) * 12);
      }
    }
    if (!p) return null;
    const v = p.project(this.camera);
    if (v.z > 1) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  private cible(e: PointerEvent): SelectionEntrepot | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.lanceur.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const touches = this.lanceur.intersectObjects(this.cliquables, false);
    return (touches[0]?.object.userData.sel as SelectionEntrepot | undefined) ?? null;
  }

  private auPointeurBas = (e: PointerEvent) => {
    this.glisse = { x: e.clientX, y: e.clientY, deplace: false };
  };

  private auPointeurDeplace = (e: PointerEvent) => {
    if (this.glisse) {
      const dx = e.clientX - this.glisse.x;
      const dy = e.clientY - this.glisse.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) this.glisse.deplace = true;
      if (this.marche && this.glisse.deplace) {
        // Regard à la souris / au doigt.
        this.lacet -= (e.movementX || dx - 0) * 0.004;
        this.tangage = THREE.MathUtils.clamp(this.tangage - (e.movementY || 0) * 0.004, -1.2, 1.2);
        this.appliquerRegard();
      }
      return;
    }
    if (e.pointerType === "mouse") {
      const s = this.cible(e);
      if (cle(s) !== cle(this.survol)) {
        this.survol = s;
        this.renderer.domElement.style.cursor = s ? "pointer" : "";
        this.mettreAJourSurlignages();
      }
    }
  };

  private auPointeurHaut = (e: PointerEvent) => {
    const g = this.glisse;
    this.glisse = null;
    if (!g || g.deplace) return;
    const s = this.cible(e);
    this.selection = s;
    this.mettreAJourSurlignages();
    this.surSelection(s);
  };

  private auPointeurQuitte = () => {
    if (this.survol) {
      this.survol = null;
      this.mettreAJourSurlignages();
    }
  };

  private auClavier = (e: KeyboardEvent) => {
    if (!this.marche) return;
    const cible = e.target as HTMLElement | null;
    if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;
    this.touches.add(e.key.toLowerCase());
    if (/^(arrow|w|a|s|d|z|q)/.test(e.key.toLowerCase())) e.preventDefault();
  };

  private auClavierHaut = (e: KeyboardEvent) => {
    this.touches.delete(e.key.toLowerCase());
  };

  /* ------------------------------------------------------------------ boucle */

  private margeDroite = 0;

  /** Largeur (px) recouverte à droite par le panneau : la scène se centre dans la zone restante. */
  definirMargeDroite(px: number) {
    this.margeDroite = Math.max(0, px);
    this.redimensionner();
  }

  redimensionner() {
    const w = Math.max(1, this.conteneur.clientWidth);
    const h = Math.max(1, this.conteneur.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    if (this.margeDroite > 0 && this.margeDroite < w * 0.6) this.camera.setViewOffset(w, h, this.margeDroite / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private boucle = () => {
    const dt = Math.min(0.05, this.horloge.getDelta());
    if (this.anim) {
      const t = Math.min(1, (performance.now() - this.anim.debut) / this.anim.duree);
      const k = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.anim.depuis.p, this.anim.vers.p, k);
      this.controles.target.lerpVectors(this.anim.depuis.c, this.anim.vers.c, k);
      if (t >= 1) this.anim = null;
    }
    if (this.marche) this.avancer(dt);
    else this.controles.update();
    this.renderer.render(this.scene, this.camera);
  };

  private avancer(dt: number) {
    const t = this.touches;
    const avant = (t.has("w") || t.has("z") || t.has("arrowup") ? 1 : 0) - (t.has("s") || t.has("arrowdown") ? 1 : 0) + this.entree.avant;
    const cote = (t.has("d") ? 1 : 0) - (t.has("a") || t.has("q") ? 1 : 0) + this.entree.cote;
    // Les flèches gauche / droite pivotent ; A·Q / D se déplacent de côté.
    this.lacet += ((t.has("arrowleft") ? 1 : 0) - (t.has("arrowright") ? 1 : 0)) * dt * 1.8;
    this.appliquerRegard();
    const vitesse = (t.has("shift") ? 5.5 : 2.6) * dt;
    const n = Math.hypot(avant, cote) || 1;
    const dx = (-Math.sin(this.lacet) * avant + Math.cos(this.lacet) * cote) / n;
    const dz = (-Math.cos(this.lacet) * avant - Math.sin(this.lacet) * cote) / n;
    if (avant === 0 && cote === 0) return;
    const p = this.camera.position;
    p.x += dx * vitesse;
    p.z += dz * vitesse;
    this.limiterDeplacement();
  }

  /** Reste dans la zone praticable et contourne les étagères. */
  private limiterDeplacement() {
    const d = this.data;
    const p = this.camera.position;
    p.y = EYE;
    if (!d) return;
    const L = d.entrepot.largeur;
    const P = d.entrepot.profondeur;
    p.x = THREE.MathUtils.clamp(p.x, -L / 2 + 0.4, L / 2 - 0.4);
    p.z = THREE.MathUtils.clamp(p.z, -P / 2 + 0.4, P / 2 + 14);
    const rayon = 0.35;
    for (const r of d.racks) {
      const a = r.rotation === 90 ? Math.PI / 2 : 0;
      const dx = p.x - r.x;
      const dz = p.z - r.z;
      // Position dans le repère de l'étagère.
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      const demiL = longueurRack(r.travees) / 2 + rayon;
      const demiP = RACK_PROFONDEUR / 2 + rayon;
      if (Math.abs(lx) < demiL && Math.abs(lz) < demiP) {
        const sortieX = demiL - Math.abs(lx);
        const sortieZ = demiP - Math.abs(lz);
        let nx = lx;
        let nz = lz;
        if (sortieZ < sortieX) nz = Math.sign(lz || 1) * demiP;
        else nx = Math.sign(lx || 1) * demiL;
        p.x = r.x + nx * Math.cos(a) + nz * Math.sin(a);
        p.z = r.z - nx * Math.sin(a) + nz * Math.cos(a);
      }
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.observateur.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.auPointeurBas);
    el.removeEventListener("pointermove", this.auPointeurDeplace);
    el.removeEventListener("pointerup", this.auPointeurHaut);
    el.removeEventListener("pointerleave", this.auPointeurQuitte);
    window.removeEventListener("keydown", this.auClavier);
    window.removeEventListener("keyup", this.auClavierHaut);
    this.controles.dispose();
    this.vider(this.contenu);
    this.vider(this.marqueurs);
    this.renderer.dispose();
    el.remove();
  }
}
