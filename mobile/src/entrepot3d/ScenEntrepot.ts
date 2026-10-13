import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CamionEntrepot, Emplacement, EntrepotData, Rack, SelectionEntrepot, VueEntrepot } from "../types/entrepot";
import { COULEURS_STATUT, statutRack, type StatutStock } from "../utils/statutEntrepot";
import { cleCase, couleurChaleur } from "../utils/ventesEntrepot";
import { COULEUR_NON_SUIVI, COULEURS_PEREMPTION } from "../utils/peremptionEntrepot";
import {
  CASE_LARGEUR,
  HAUTEUR_MURS,
  NB_PORTES,
  NIVEAU_HAUTEUR,
  PORTE_LARGEUR,
  PORTE_PAS,
  RACK_PROFONDEUR,
  SOCLE,
  FRIGO_LARGEUR,
  FRIGO_PORTE,
  FRIGO_PROFONDEUR,
  angleRack,
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
  /** Montée de la caméra à mi-parcours (m) : le trajet décrit un arc au lieu d'une ligne droite. */
  bosse: number;
}

export interface OptionsScene {
  conteneur: HTMLElement;
  /** Clic sur un objet (null : clic dans le vide). */
  surSelection: (selection: SelectionEntrepot | null) => void;
  /** Texte de l'infobulle d'un carton survolé (titre + lignes) ; `autres` : autres articles rangés dans la même case. */
  bulle?: (e: Emplacement) => { titre: string; lignes: string[] };
  /** Appelé quand le dépôt passe de jour à nuit (et inversement) : la page affiche alors l'interrupteur de la lumière. */
  surNuit?: (nuit: boolean) => void;
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
  private readonly formaterBulle?: OptionsScene["bulle"];
  private readonly bulle: HTMLDivElement;
  private cleBulle = "";
  // Cartons de la scène par case et par place (rack:étage:travée:place), pour surligner celui qu'on survole.
  private cartons = new Map<string, THREE.Mesh>();
  private contourSurvol: { carton: THREE.Mesh; contour: THREE.LineSegments; emissif?: number } | null = null;
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
  // Vue d'avant le zoom sur une sélection : on y revient quand on clique ailleurs (ou qu'on ferme le panneau).
  private vueAvantZoom: { p: THREE.Vector3; c: THREE.Vector3 } | null = null;
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
  // Portière droite de chaque camion : elle se rabat quand le camion est sélectionné, laissant voir sa charge.
  private portieres = new Map<string, { pivot: THREE.Group; toit: THREE.MeshStandardMaterial; ouverture: number; cible: number }>();
  private ouverturesPrecedentes = new Map<string, number>();
  // Couleurs de stock (rouge / orange / bleu / vert) sur les cartons et les étiquettes ; filtre : un seul statut en couleur.
  private couleursStock = true;
  private filtreStatut: StatutStock | null = null;
  // Carte de chaleur des ventes : valeurs 0..1 par case et par étagère (null : couleurs de stock).
  private chaleur: { cases: Map<string, number>; racks: Map<string, number> } | null = null;
  // Mode « Péremption » : couleur de chaque article suivi (rouge expiré, orange à vérifier, violet sans date, vert) et de chaque étagère.
  private peremption: { articles: Map<string, number>; racks: Map<string, number> } | null = null;

  // Animations (coupées si l'appareil demande moins de mouvement).
  private readonly calme = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Cases à attention (rupture, expiré) : elles pulsent doucement.
  private pulsants: { mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; type: "opacite" | "emissif"; couleur: number; phase: number }[] = [];
  // Camions qui reculent jusqu'à leur quai ; un camion déjà vu n'arrive pas une seconde fois.
  private arrivees = new Map<string, { camion: THREE.Object3D; etiquette: THREE.Object3D; zFinal: number; debut: number; duree: number }>();
  private camionsConnus = new Set<string>();
  private fermetures = new Map<string, number>();
  // Mouvements de stock entre deux rafraîchissements : cartons qui volent entre la porte et la case, éclats sur la case.
  private quantitesPrec: Map<string, { rack: Rack; niveau: number; travee: number; q: number }> | null = null;
  // Portes du hall : un rideau qui s'enroule quand un camion approche.
  private rideaux: { pivot: THREE.Group; x: number; ouverture: number }[] = [];
  private ouverturesRideaux: number[] = [];
  private camionsObj: THREE.Object3D[] = [];
  // Cartons qui glissent dans leur case au premier chargement du plan.
  private glissades: { o: THREE.Object3D; z: number; debut: number; duree: number }[] = [];
  private entreeAnimee = false;
  private rangRack = 0;
  // Employé qui va et vient dans une allée, un carton dans les bras au retour.
  private employe: {
    groupe: THREE.Group;
    jambes: THREE.Object3D[];
    bras: THREE.Object3D[];
    carton: THREE.Object3D;
    x0: number;
    x1: number;
    z: number;
    rot: number;
    phase: number;
    amp: number;
    /** Chemin d'entrée : de la rue, par la porte du milieu, jusqu'au début de son allée. */
    chemin: THREE.Vector3[];
    longueur: number;
  } | null = null;
  // État de l'employé, conservé quand le plan se reconstruit : dehors (de nuit, lumière éteinte), il entre, travaille, puis ressort.
  private etatEmp = { etat: "travail" as "dehors" | "entre" | "travail" | "sort", debut: 0, d: 0, rot: Math.PI / 2, initialise: false };
  // Nuit et lumière du hall : l'interrupteur n'apparaît que la nuit ; allumé, des luminaires éclairent le hall et l'employé vient travailler.
  private nuit = false;
  private lampe = false;
  private readonly surNuit?: (nuit: boolean) => void;
  private lampes: THREE.PointLight[] = [];
  private matLuminaire: THREE.MeshBasicMaterial | null = null;
  // Lumière du jour : soleil, ciel et brouillard suivent l'heure (Tunis).
  private soleil: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fondJour = new THREE.Color();
  private heureForcee: number | null = null;
  private dernierCiel = 0;
  private effets: { objet: THREE.Mesh; debut: number; duree: number; type: "vol" | "eclat"; de?: THREE.Vector3; a?: THREE.Vector3; fin?: () => void }[] = [];

  constructor(opts: OptionsScene) {
    this.conteneur = opts.conteneur;
    this.surSelection = opts.surSelection;
    this.formaterBulle = opts.bulle;
    this.surNuit = opts.surNuit;
    this.bulle = document.createElement("div");
    this.bulle.className = "rc-entrepot__bulle";
    this.bulle.hidden = true;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "rc-entrepot__canvas";
    this.renderer.domElement.setAttribute("aria-label", "Vue 3D du dépôt");
    this.conteneur.appendChild(this.renderer.domElement);
    this.conteneur.appendChild(this.bulle);

    const fond = getComputedStyle(document.documentElement).getPropertyValue("--rc-bg").trim() || "#f5f2ed";
    this.scene.background = new THREE.Color(fond);
    this.scene.fog = new THREE.Fog(new THREE.Color(fond), 90, 220);

    this.fondJour.set(fond);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9a948a, 1.05);
    this.scene.add(this.hemi);
    const soleil = new THREE.DirectionalLight(0xffffff, 1.4);
    this.soleil = soleil;
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

    for (let k = 0; k < 4; k++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 26, 2);
      l.visible = false;
      this.lampes.push(l);
      this.scene.add(l);
    }

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
    // Comme dans Figma : molette enfoncée + glisser = déplacer la vue (la molette seule zoome) ; clic gauche = tourner.
    this.controles.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controles.panSpeed = 1.2;
    this.controles.target.set(0, 0, 4);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.auPointeurBas);
    el.addEventListener("pointermove", this.auPointeurDeplace);
    el.addEventListener("pointerup", this.auPointeurHaut);
    el.addEventListener("pointerleave", this.auPointeurQuitte);
    el.addEventListener("wheel", this.annulerTrajet, { passive: true });
    el.addEventListener("mousedown", this.sansDefilementAuto);
    window.addEventListener("keydown", this.auClavier);
    window.addEventListener("keyup", this.auClavierHaut);
    this.mettreAJourCiel();

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
    // Un camion déjà ouvert le reste quand le plan se rafraîchit (pas de refermeture / réouverture).
    this.ouverturesPrecedentes = new Map([...this.portieres].map(([id, p]) => [id, p.ouverture]));
    this.portieres.clear();
    this.pulsants = [];
    this.cartons.clear();
    this.contourSurvol = null;
    this.arrivees.clear();
    this.ouverturesRideaux = this.rideaux.map((r) => r.ouverture);
    this.rideaux = [];
    this.camionsObj = [];
    this.glissades = [];
    this.rangRack = 0;
    this.entreeAnimee = premiere && !this.calme;

    this.construireBatiment(data);
    for (const rack of data.racks) this.construireRack(rack);
    this.construireCamions(data);
    this.construireEmploye(data);
    this.positionnerLampes(data);
    this.animerChangements(data);
    this.mettreAJourSurlignages();
    if (premiere) this.vue("ensemble", false);
  }

  /** Active ou coupe les couleurs de stock (cartons naturels sinon). */
  definirCouleurs(actif: boolean) {
    if (this.couleursStock === actif) return;
    this.couleursStock = actif;
    if (this.data) this.charger(this.data);
  }

  /** Carte de chaleur des ventes : colore chaque case selon sa valeur (0 froid … 1 chaud) ; null revient aux couleurs de stock. */
  definirChaleur(c: { cases: Map<string, number>; racks: Map<string, number> } | null) {
    this.chaleur = c;
    if (this.data) this.charger(this.data);
  }

  /** Mode « Péremption » : colore les cartons selon l'état des dates d'expiration de leur article ; null revient au mode précédent. */
  definirPeremption(c: { articles: Map<string, number>; racks: Map<string, number> } | null) {
    this.peremption = c;
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
    if (!s) this.revenirDuZoom();
  }

  /** Retour en douceur à la vue d'avant le zoom (s'il y en a eu un). */
  private revenirDuZoom() {
    const v = this.vueAvantZoom;
    if (!v) return;
    this.vueAvantZoom = null;
    if (!this.marche) this.allerA(v.p, v.c, 800);
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
    this.vueAvantZoom = null;
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
      // Face à un mur d'étagères, depuis le centre libre du dépôt.
      const racks = d?.racks.filter((r) => r.allee === v.allee) ?? [];
      const cx = racks.length ? racks.reduce((a, r) => a + r.x, 0) / racks.length : 0;
      const cz = racks.length ? racks.reduce((a, r) => a + r.z, 0) / racks.length : 0;
      const vers = new THREE.Vector3(-cx, 0, -cz);
      if (vers.length() < 0.5) vers.set(0, 0, 1);
      vers.normalize();
      p = new THREE.Vector3(cx + vers.x * 8.5, EYE, cz + vers.z * 8.5);
      c = new THREE.Vector3(cx, EYE - 0.3, cz);
      if (v.allee === "Frigo") {
        // Chambre froide : on regarde à travers sa porte, depuis le hall.
        const fx0 = L / 2 - FRIGO_LARGEUR;
        const fz1 = -P / 2 + FRIGO_PROFONDEUR;
        p = new THREE.Vector3(fx0 + (FRIGO_PORTE[0] + FRIGO_PORTE[1]) / 2, EYE + 0.4, fz1 + 5);
        c = new THREE.Vector3(fx0 + FRIGO_LARGEUR / 2, EYE - 0.3, -P / 2 + FRIGO_PROFONDEUR / 2);
      }
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
    // Plus le trajet est long, plus il dure ; il décrit un léger arc et démarre / finit en douceur.
    const dist = this.camera.position.distanceTo(p);
    this.anim = {
      depuis: { p: this.camera.position.clone(), c: this.controles.target.clone() },
      vers: { p, c },
      debut: performance.now(),
      duree: Math.max(ms, Math.min(1700, 600 + dist * 32)),
      bosse: this.marche ? 0 : Math.min(5, dist * 0.1),
    };
  }

  /** Approche la caméra d'une sélection (case, étagère ou camion), du côté du couloir. */
  focaliser(s: SelectionEntrepot) {
    const d = this.data;
    if (!d) return;
    this.arreterMarche();
    // On mémorise la vue de départ une seule fois : enchaîner camion puis case revient quand même à la vue d'origine.
    if (!this.vueAvantZoom) {
      const dep = this.anim ? this.anim.vers : { p: this.camera.position, c: this.controles.target };
      this.vueAvantZoom = { p: dep.p.clone(), c: dep.c.clone() };
    }
    if (s.type === "camion") {
      const i = d.camions.findIndex((c) => c.vendeurId === s.vendeurId);
      const portes = this.positionsPortes(d.entrepot.largeur);
      const x = portes[[1, 0, 2][Math.max(0, i) % NB_PORTES] % portes.length];
      const z = d.entrepot.profondeur / 2 + 4.6 + Math.floor(Math.max(0, i) / NB_PORTES) * 12;
      // Du côté de la portière droite (à droite à l'écran dans la vue d'ensemble), un peu en hauteur pour voir la charge.
      this.allerA(new THREE.Vector3(x + 9, 4.4, z - 0.2), new THREE.Vector3(x + 0.2, 1.3, z - 1.2), 900);
      return;
    }
    const rack = d.racks.find((r) => r.id === s.rackId);
    if (!rack) return;
    const cible = s.type === "case" ? this.positionCase(rack, s.niveau, s.travee) : new THREE.Vector3(rack.x, hauteurRack(rack.niveaux) / 2, rack.z);
    // Du côté libre de l'étagère : celui de sa face avant (vers le centre du dépôt, ou de la chambre froide).
    const face = new THREE.Vector3(-Math.sin(angleRack(rack)), 0, Math.cos(angleRack(rack)));
    const decalage = new THREE.Vector3(face.x * 4.2, 0.6, face.z * 4.2);
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
    if (d.racks.some((r) => r.allee === "Frigo")) this.construireFrigo(d);

    // Luminaires au plafond : barres qui s'allument la nuit quand la lumière est mise.
    this.matLuminaire = new THREE.MeshBasicMaterial({ color: this.nuit && this.lampe ? 0xfff1c9 : 0x55524c });
    for (const fx of [-L / 3, 0, L / 3]) {
      for (const fz of [-P / 4, P / 4]) {
        const barre = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 3.2), this.matLuminaire);
        barre.position.set(fx, HAUTEUR_MURS - 0.15, fz);
        g.add(barre);
      }
    }
    // Rideau métallique (lamelles translucides pour garder la vue sur l'intérieur), accroché sous le linteau.
    const matLamelle = new THREE.MeshStandardMaterial({ color: 0x8d887d, roughness: 0.8, transparent: true, opacity: 0.5 });
    const hauteurRideau = 3.15;
    portes.forEach((px, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, hauteurRideau, P / 2);
      const nb = 8;
      for (let k = 0; k < nb; k++) {
        const lamelle = new THREE.Mesh(new THREE.BoxGeometry(PORTE_LARGEUR, hauteurRideau / nb - 0.03, 0.06), matLamelle);
        lamelle.position.y = -(k + 0.5) * (hauteurRideau / nb);
        pivot.add(lamelle);
      }
      const ouverture = this.ouverturesRideaux[i] ?? 0;
      pivot.scale.y = Math.max(0.04, 1 - ouverture * 0.96);
      g.add(pivot);
      this.rideaux.push({ pivot, x: px, ouverture });
    });
  }

  /** Chambre froide du coin du fond à droite : cloisons vitrées bleutées, sol givré, porte et étiquette. */
  private construireFrigo(d: EntrepotData) {
    const L = d.entrepot.largeur;
    const P = d.entrepot.profondeur;
    const g = this.contenu;
    const fx0 = L / 2 - FRIGO_LARGEUR;
    const fz1 = -P / 2 + FRIGO_PROFONDEUR;
    const matVerre = new THREE.MeshStandardMaterial({ color: 0xbfe3f5, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const matArete = new THREE.LineBasicMaterial({ color: 0x4a9cc7 });
    const mur = (l: number, x: number, z: number, ry: number) => {
      const geo = new THREE.BoxGeometry(l, HAUTEUR_MURS, 0.2);
      const m = new THREE.Mesh(geo, matVerre);
      m.position.set(x, HAUTEUR_MURS / 2, z);
      m.rotation.y = ry;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), matArete));
      g.add(m);
    };
    mur(FRIGO_PROFONDEUR, fx0, -P / 2 + FRIGO_PROFONDEUR / 2, Math.PI / 2);
    // Cloison avant avec l'ouverture de la porte.
    const [p0, p1] = FRIGO_PORTE;
    mur(p0, fx0 + p0 / 2, fz1, 0);
    mur(FRIGO_LARGEUR - p1, fx0 + (p1 + FRIGO_LARGEUR) / 2, fz1, 0);
    const linteau = this.boite(p1 - p0 + 0.3, 0.4, 0.3, 0x4a9cc7, false);
    linteau.position.set(fx0 + (p0 + p1) / 2, 2.8, fz1);
    g.add(linteau);

    const sol = new THREE.Mesh(new THREE.PlaneGeometry(FRIGO_LARGEUR, FRIGO_PROFONDEUR), new THREE.MeshStandardMaterial({ color: 0xd3e8f3, roughness: 0.6 }));
    sol.rotation.x = -Math.PI / 2;
    sol.position.set(fx0 + FRIGO_LARGEUR / 2, 0.015, -P / 2 + FRIGO_PROFONDEUR / 2);
    sol.receiveShadow = true;
    g.add(sol);

    const nom = this.etiquette("Frigo", 1.2, 0x4a9cc7);
    nom.position.set(fx0 + FRIGO_LARGEUR / 2, HAUTEUR_MURS + 0.4, -P / 2 + FRIGO_PROFONDEUR / 2);
    g.add(nom);
  }

  private positionsPortes(L: number) {
    // Portes côte à côte, centrées sur la façade (resserrées si le bâtiment est étroit).
    const pas = Math.min(PORTE_PAS, (L - PORTE_LARGEUR) / Math.max(1, NB_PORTES));
    return Array.from({ length: NB_PORTES }, (_, i) => (i - (NB_PORTES - 1) / 2) * pas);
  }

  /** Centre d'une case en coordonnées du monde. */
  private positionCase(rack: Rack, niveau: number, travee: number) {
    const lx = -longueurRack(rack.travees) / 2 + (travee + 0.5) * CASE_LARGEUR;
    const ly = SOCLE + niveau * NIVEAU_HAUTEUR + (NIVEAU_HAUTEUR - 0.06) / 2 + 0.03;
    const a = angleRack(rack);
    return new THREE.Vector3(rack.x + lx * Math.cos(a), ly, rack.z - lx * Math.sin(a));
  }

  private construireRack(rack: Rack) {
    const Lr = longueurRack(rack.travees);
    const Hr = hauteurRack(rack.niveaux);
    this.rangRack++;
    const groupe = new THREE.Group();
    groupe.position.set(rack.x, 0, rack.z);
    groupe.rotation.y = angleRack(rack);
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
    const pastille = this.chaleur
      ? couleurChaleur(this.chaleur.racks.get(rack.id) ?? 0)
      : this.peremption
        ? (this.peremption.racks.get(rack.id) ?? COULEUR_NON_SUIVI)
        : pire
          ? COULEURS_STATUT[pire]
          : undefined;
    const etiquette = this.etiquette(rack.nom, 0.5, pastille);
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
        const premierEnfant = groupe.children.length;
        // Jusqu'à trois cartons côte à côte, un par article ; couleur = statut de stock de l'article. Un article
        // en rupture n'a plus de carton : un bloc rouge translucide marque l'emplacement vide.
        const nb = Math.min(3, contenu.length);
        for (let k = 0; k < nb; k++) {
          const e = contenu[k];
          const l = (CASE_LARGEUR - 0.16) / Math.max(1, nb) - 0.04;
          const h = 0.34 + (hash(e.article.id) % 5) * 0.08;
          const x = lx - (CASE_LARGEUR - 0.16) / 2 + (k + 0.5) * ((CASE_LARGEUR - 0.16) / nb);
          const st = e.article.statut;
          const chaud = this.chaleur ? couleurChaleur(this.chaleur.cases.get(cleCase(rack.id, n, t)) ?? 0) : null;
          const colore = this.couleursStock && (this.filtreStatut === null || this.filtreStatut === st);
          if (chaud !== null) {
            // Carte de chaleur : tous les cartons de la case prennent sa couleur.
            const carton = this.boite(l, h, RACK_PROFONDEUR - 0.22, chaud);
            (carton.material as THREE.MeshStandardMaterial).emissive.setHex(chaud).multiplyScalar(0.22);
            carton.position.set(x, base + h / 2, 0);
            groupe.add(carton);
            this.cartons.set(`${rack.id}:${n}:${t}:${k}`, carton);
            continue;
          }
          if (this.peremption && chaud === null) {
            // Mode « Péremption » : un carton par article, de la couleur de son état ; les articles non suivis restent gris.
            const couleur = this.peremption.articles.get(e.article.id) ?? COULEUR_NON_SUIVI;
            const carton = this.boite(l, h, RACK_PROFONDEUR - 0.22, couleur);
            const m = carton.material as THREE.MeshStandardMaterial;
            if (couleur === COULEUR_NON_SUIVI) {
              m.transparent = true;
              m.opacity = 0.55;
            } else {
              m.emissive.setHex(couleur).multiplyScalar(0.25);
              if (couleur === COULEURS_PEREMPTION.EXPIRE) this.pulsants.push({ mat: m, type: "emissif", couleur, phase: hash(e.article.id) % 6 });
            }
            carton.position.set(x, base + h / 2, 0);
            groupe.add(carton);
            this.cartons.set(`${rack.id}:${n}:${t}:${k}`, carton);
            continue;
          }
          if (st === "RUPTURE" && this.couleursStock) {
            const fantome = new THREE.Mesh(
              new THREE.BoxGeometry(l, h, RACK_PROFONDEUR - 0.22),
              new THREE.MeshBasicMaterial({ color: COULEURS_STATUT.RUPTURE, transparent: true, opacity: colore ? 0.5 : 0.12, depthWrite: false }),
            );
            fantome.position.set(x, base + h / 2, 0);
            groupe.add(fantome);
            this.cartons.set(`${rack.id}:${n}:${t}:${k}`, fantome);
            if (colore) this.pulsants.push({ mat: fantome.material as THREE.MeshBasicMaterial, type: "opacite", couleur: 0, phase: hash(e.article.id) % 6 });
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
          this.cartons.set(`${rack.id}:${n}:${t}:${k}`, carton);
        }
        if (this.chaleur && contenu.length > 0) {
          // Un volume translucide aux couleurs de la case : lisible de loin, même quand les cartons sont petits.
          const chaud = couleurChaleur(this.chaleur.cases.get(cleCase(rack.id, n, t)) ?? 0);
          const volume = new THREE.Mesh(
            new THREE.BoxGeometry(CASE_LARGEUR - 0.1, NIVEAU_HAUTEUR - 0.14, RACK_PROFONDEUR - 0.1),
            new THREE.MeshBasicMaterial({ color: chaud, transparent: true, opacity: 0.3, depthWrite: false }),
          );
          volume.position.set(lx, base + (NIVEAU_HAUTEUR - 0.14) / 2 + 0.02, 0);
          groupe.add(volume);
        }
        if (this.entreeAnimee) {
          // Les cartons de la case sortent de l'allée en glissant, étage après étage, étagère après étagère.
          const debut = performance.now() + 300 + this.rangRack * 110 + n * 140 + (t % 3) * 40;
          for (let ci = premierEnfant; ci < groupe.children.length; ci++) {
            const o = groupe.children[ci];
            this.glissades.push({ o, z: o.position.z, debut, duree: 650 });
            o.visible = false;
            o.position.z += 1.8;
          }
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
      const camion = this.creerCamion(c, i);
      const zFinal = P / 2 + 1.4 + 3.2 + rangee * 12;
      camion.position.set(x, 0, zFinal);
      this.contenu.add(camion);
      const etiquette = this.etiquette(c.nom, 1.4);
      etiquette.position.set(x, 4.4, zFinal + 1);
      if (!this.camionsConnus.has(c.vendeurId) && !this.calme) {
        // Nouveau venu : il recule depuis la route jusqu'à son quai, l'un après l'autre.
        camion.position.z = zFinal + 46;
        etiquette.position.z = zFinal + 47;
        this.arrivees.set(c.vendeurId, { camion, etiquette, zFinal, debut: performance.now() + i * 700, duree: 3400 });
      }
      this.camionsConnus.add(c.vendeurId);
      this.camionsObj.push(camion);
      etiquette.userData.sel = { type: "camion", vendeurId: c.vendeurId } satisfies SelectionEntrepot;
      this.contenu.add(etiquette);
      this.cliquables.push(etiquette);
    });
  }

  /** Un employé en gilet orange et casque jaune, fait de formes simples, qui fait des allers-retours dans une allée. */
  private construireEmploye(d: EntrepotData) {
    this.employe = null;
    if (this.calme) return;
    // Il travaille la rangée du fond, dans le couloir libre qui la longe.
    const dos = d.racks.filter((r) => r.rotation === 0 && r.allee !== "Frigo");
    if (dos.length === 0) return;
    const zFond = Math.min(...dos.map((r) => r.z));
    const rangee = dos.filter((r) => r.z <= zFond + 0.3);
    const L = d.entrepot.largeur;
    const P = d.entrepot.profondeur;
    const z = zFond + RACK_PROFONDEUR / 2 + 0.9;
    const x0 = Math.max(-L / 2 + 2.4, Math.min(...rangee.map((r) => r.x - longueurRack(r.travees) / 2)));
    const x1 = Math.min(L / 2 - 2.4, Math.max(...rangee.map((r) => r.x + longueurRack(r.travees) / 2)));
    if (x1 - x0 < 3) return;

    // Entrée : de la rue par une porte sans camion (sinon à côté du camion garé), tout droit jusqu'au couloir du fond.
    const portes = this.positionsPortes(L);
    const prises = new Set(d.camions.slice(0, NB_PORTES).map((_, i) => [1, 0, 2][i % NB_PORTES] % portes.length));
    const libre = portes.findIndex((_, i) => !prises.has(i));
    const px = libre >= 0 ? portes[libre] : portes[Math.floor(portes.length / 2)] + 1.5;
    const chemin = [new THREE.Vector3(px, 0, P / 2 + 7), new THREE.Vector3(px, 0, z), new THREE.Vector3(x0, 0, z)];
    let longueur = 0;
    for (let k = 1; k < chemin.length; k++) longueur += chemin[k].distanceTo(chemin[k - 1]);

    const g = new THREE.Group();
    const piece = (geo: THREE.BufferGeometry, couleur: number, parent: THREE.Object3D, x: number, y: number, zz: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.8 }));
      m.position.set(x, y, zz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const jambes: THREE.Object3D[] = [];
    const bras: THREE.Object3D[] = [];
    for (const cote of [-1, 1]) {
      const jambe = new THREE.Group();
      jambe.position.set(cote * 0.11, 0.85, 0);
      piece(new THREE.BoxGeometry(0.15, 0.85, 0.17), 0x2f4a73, jambe, 0, -0.425, 0);
      g.add(jambe);
      jambes.push(jambe);
      const b = new THREE.Group();
      b.position.set(cote * 0.28, 1.4, 0);
      piece(new THREE.BoxGeometry(0.1, 0.55, 0.12), 0xe8731a, b, 0, -0.275, 0);
      g.add(b);
      bras.push(b);
    }
    piece(new THREE.BoxGeometry(0.42, 0.6, 0.24), 0xe8731a, g, 0, 1.15, 0);
    piece(new THREE.SphereGeometry(0.13, 14, 10), 0xe2b98f, g, 0, 1.62, 0);
    piece(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2c230, g, 0, 1.64, 0);
    const carton = piece(new THREE.BoxGeometry(0.42, 0.28, 0.34), CARTONS[0], g, 0, 1.0, 0.34);
    carton.visible = false;

    this.contenu.add(g);
    this.employe = { groupe: g, jambes, bras, carton, x0, x1, z, rot: this.etatEmp.rot, phase: 0, amp: 0, chemin, longueur };

    // Premier chargement : de jour il est déjà au travail ; de nuit, lumière éteinte, il n'est pas là.
    if (!this.etatEmp.initialise) {
      this.etatEmp.initialise = true;
      this.etatEmp.debut = performance.now();
      this.etatEmp.etat = !this.nuit || this.lampe ? "travail" : "dehors";
    }
    g.visible = this.etatEmp.etat !== "dehors";
  }

  /** Point et cap (angle autour de Y) à la distance `d` le long du chemin d'entrée. */
  private surChemin(chemin: THREE.Vector3[], d: number, inverse: boolean) {
    let reste = Math.max(0, d);
    for (let k = 1; k < chemin.length; k++) {
      const a = chemin[k - 1];
      const b = chemin[k];
      const l = a.distanceTo(b);
      if (reste <= l || k === chemin.length - 1) {
        const t = l > 0 ? Math.min(1, reste / l) : 1;
        const sens = inverse ? -1 : 1;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, cap: Math.atan2((b.x - a.x) * sens, (b.z - a.z) * sens) };
      }
      reste -= l;
    }
    const f = chemin[chemin.length - 1];
    return { x: f.x, z: f.z, cap: Math.PI / 2 };
  }

  private animerEmploye(now: number, dt: number) {
    const e = this.employe;
    if (!e) return;
    const st = this.etatEmp;
    const voulu = !this.nuit || this.lampe;
    const v = 1.0;
    const pause = 2.2;
    const tm = (e.x1 - e.x0) / v;
    const cycle = 2 * (tm + pause);

    if (st.etat === "dehors") {
      e.groupe.visible = false;
      if (voulu) {
        st.etat = "entre";
        st.d = 0;
      }
      return;
    }
    e.groupe.visible = true;

    let x: number;
    let z = e.z;
    let cap: number;
    let marche = true;
    let porte = false;
    if (st.etat === "entre" || st.etat === "sort") {
      // Il entre par la porte, ou ressort par le même chemin ; il a le pas un peu plus vif qu'au travail.
      st.d += (st.etat === "entre" ? 1 : -1) * dt * 1.5;
      const p = this.surChemin(e.chemin, st.d, st.etat === "sort");
      x = p.x;
      z = p.z;
      cap = p.cap;
      if (st.etat === "entre" && st.d >= e.longueur) {
        st.etat = "travail";
        st.debut = now;
      } else if (st.etat === "sort" && st.d <= 0) {
        st.etat = "dehors";
        e.groupe.visible = false;
        return;
      }
      if (st.etat === "sort" && voulu) st.etat = "entre";
    } else {
      const T = ((now - st.debut) / 1000) % cycle;
      if (T < tm) {
        x = e.x0 + T * v;
        cap = Math.PI / 2;
      } else if (T < tm + pause) {
        // Au fond de l'allée : il se tourne vers l'étagère et prend un carton.
        x = e.x1;
        cap = Math.PI;
        marche = false;
        porte = T > tm + pause * 0.55;
      } else if (T < 2 * tm + pause) {
        x = e.x1 - (T - tm - pause) * v;
        cap = -Math.PI / 2;
        porte = true;
      } else {
        x = e.x0;
        cap = 0;
        marche = false;
        // Lumière éteinte la nuit : sa tournée finie, il range et ressort.
        if (!voulu) {
          st.etat = "sort";
          st.d = e.longueur;
        }
      }
    }
    e.amp += ((marche ? 1 : 0) - e.amp) * Math.min(1, dt * 8);
    if (marche) e.phase += dt * v * 5.5;
    e.rot += Math.atan2(Math.sin(cap - e.rot), Math.cos(cap - e.rot)) * Math.min(1, dt * 6);
    st.rot = e.rot;
    e.groupe.position.set(x, Math.abs(Math.sin(e.phase)) * 0.03 * e.amp, z);
    e.groupe.rotation.y = e.rot;
    const balancement = Math.sin(e.phase) * 0.55 * e.amp;
    e.jambes[0].rotation.x = balancement;
    e.jambes[1].rotation.x = -balancement;
    const k = Math.min(1, dt * 10);
    e.bras[0].rotation.x += ((porte ? -1.2 : -balancement) - e.bras[0].rotation.x) * k;
    e.bras[1].rotation.x += ((porte ? -1.2 : balancement) - e.bras[1].rotation.x) * k;
    e.carton.visible = porte;
  }

  /** Allume ou éteint la lumière du hall (n'a d'effet que la nuit). */
  definirLampe(allumee: boolean) {
    this.lampe = allumee;
    this.appliquerLampe();
    this.mettreAJourCiel();
  }

  private positionnerLampes(d: EntrepotData) {
    const L = d.entrepot.largeur;
    const P = d.entrepot.profondeur;
    const pts = [
      [-L / 4, -P / 4],
      [L / 4, -P / 4],
      [-L / 4, P / 4],
      [L / 4, P / 4],
    ];
    this.lampes.forEach((l, k) => l.position.set(pts[k][0], HAUTEUR_MURS - 0.9, pts[k][1]));
    this.appliquerLampe();
  }

  private appliquerLampe() {
    const on = this.nuit && this.lampe;
    for (const l of this.lampes) {
      l.visible = on;
      l.intensity = on ? 60 : 0;
    }
    this.matLuminaire?.color.setHex(on ? 0xfff1c9 : 0x55524c);
  }

  /** Heure forcée (0..24) pour l'aperçu ; null : heure réelle de Tunis. */
  definirHeure(h: number | null) {
    this.heureForcee = h;
    this.mettreAJourCiel();
  }

  private heureLocale() {
    if (this.heureForcee !== null) return this.heureForcee;
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: "Africa/Tunis" }).formatToParts(new Date());
    const val = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
    return val("hour") + val("minute") / 60;
  }

  /** Soleil (position, couleur, intensité), lumière ambiante, ciel et brouillard selon l'heure : lever 6 h 30, coucher 19 h 30. */
  private mettreAJourCiel() {
    this.dernierCiel = performance.now();
    const h = this.heureLocale();
    const lever = 6.5;
    const coucher = 19.5;
    const f = Math.max(0, Math.min(1, (h - lever) / (coucher - lever)));
    const hauteur = Math.sin(Math.PI * f);
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    // 0 la nuit … 1 en plein jour, avec une demi-heure de crépuscule de chaque côté.
    const lum = clamp01((h - (lever - 0.6)) / 1.2) * clamp01((coucher + 0.6 - h) / 1.2);
    const dore = lum * (1 - clamp01(hauteur * 4));

    this.soleil.position.set(38 * Math.cos(Math.PI * f), 5 + 31 * hauteur, 22);
    this.soleil.color.set(0xffffff).lerp(new THREE.Color(0xffb066), 1 - clamp01(hauteur * 3)).lerp(new THREE.Color(0x8fa6d6), 1 - lum);
    this.soleil.intensity = 1.4 * lum * (0.35 + 0.65 * clamp01(hauteur * 2)) + 0.2 * (1 - lum);
    const nuit = lum < 0.35;
    if (nuit !== this.nuit) {
      this.nuit = nuit;
      this.appliquerLampe();
      this.surNuit?.(nuit);
    }
    this.hemi.intensity = 0.4 + 0.65 * lum + (this.nuit && this.lampe ? 0.35 : 0);

    const fond = new THREE.Color(0x27303f).lerp(this.fondJour, lum).lerp(new THREE.Color(0xf0cfae), dore * 0.6);
    (this.scene.background as THREE.Color).copy(fond);
    (this.scene.fog as THREE.Fog).color.copy(fond);
  }

  /** Compare les quantités par case avec le rafraîchissement précédent et anime les différences. */
  private animerChangements(d: EntrepotData) {
    const maintenant = new Map<string, { rack: Rack; niveau: number; travee: number; q: number }>();
    for (const rack of d.racks) {
      for (const e of rack.emplacements) {
        const k = cleCase(rack.id, e.niveau, e.travee);
        const cur = maintenant.get(k);
        if (cur) cur.q += e.quantite;
        else maintenant.set(k, { rack, niveau: e.niveau, travee: e.travee, q: e.quantite });
      }
    }
    const prec = this.quantitesPrec;
    this.quantitesPrec = maintenant;
    if (!prec || this.calme) return;

    const changes: { c: { rack: Rack; niveau: number; travee: number }; hausse: boolean }[] = [];
    for (const [k, v] of maintenant) {
      const avant = prec.get(k)?.q ?? 0;
      if (v.q !== avant) changes.push({ c: v, hausse: v.q > avant });
    }
    for (const [k, v] of prec) if (!maintenant.has(k)) changes.push({ c: v, hausse: false });

    const portes = this.positionsPortes(d.entrepot.largeur);
    const P = d.entrepot.profondeur;
    const now = performance.now();
    changes.slice(0, 14).forEach(({ c, hausse }, i) => {
      const cible = this.positionCase(c.rack, c.niveau, c.travee);
      const porte = portes.reduce((a, b) => (Math.abs(b - cible.x) < Math.abs(a - cible.x) ? b : a));
      const quai = new THREE.Vector3(porte, 1.0, P / 2 + 1.2);
      const debut = now + i * 180;
      const couleur = hausse ? 0x3fae6a : 0xf0922b;
      const eclat = () => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(CASE_LARGEUR - 0.04, NIVEAU_HAUTEUR - 0.1, RACK_PROFONDEUR - 0.04),
          new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0, depthWrite: false }),
        );
        m.position.copy(cible);
        m.rotation.y = angleRack(c.rack);
        this.scene.add(m);
        this.effets.push({ objet: m, debut: performance.now(), duree: 1800, type: "eclat" });
      };
      const carton = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: CARTONS[(c.niveau + c.travee) % CARTONS.length], roughness: 0.7 }));
      carton.castShadow = true;
      carton.visible = false;
      this.scene.add(carton);
      this.effets.push({
        objet: carton,
        debut,
        duree: 1500,
        type: "vol",
        de: hausse ? quai : cible.clone(),
        a: hausse ? cible.clone() : quai,
        fin: hausse ? eclat : undefined,
      });
      if (!hausse) setTimeout(eclat, Math.max(0, debut - now));
    });
  }

  private creerCamion(camion: CamionEntrepot, i: number) {
    const { vendeurId } = camion;
    const g = new THREE.Group();
    const sel = { type: "camion", vendeurId } satisfies SelectionEntrepot;
    const matCaisse = new THREE.MeshStandardMaterial({ color: CAMIONS[i % CAMIONS.length], roughness: 0.6 });
    const matToit = new THREE.MeshStandardMaterial({ color: CAMIONS[i % CAMIONS.length], roughness: 0.6, transparent: true, opacity: 1 });
    const matCabine = new THREE.MeshStandardMaterial({ color: CABINES[i % CABINES.length], roughness: 0.55 });
    const matVitre = new THREE.MeshStandardMaterial({ color: 0x2b3a46, roughness: 0.2, metalness: 0.3 });
    const matRoue = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.9 });
    const matPlancher = new THREE.MeshStandardMaterial({ color: 0xb59a6b, roughness: 0.9 });

    const ajouter = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.sel = sel;
      parent.add(m);
      this.cliquables.push(m);
      return m;
    };

    // Pick-up 4x4 à caisse frigorifique (cabine simple, caisse blanche à cadre aluminium, groupe froid sur le toit).
    // L'arrière de la caisse reste contre le quai (z négatif) ; la cabine est à l'opposé (z positif).
    const W = 2.0;
    const H = 1.8;
    const Lc = 3.1;
    const ep = 0.1;
    const yb = 0.9;
    const zc = -1.5;
    const matCab = new THREE.MeshStandardMaterial({ color: CAMIONS[i % CAMIONS.length], roughness: 0.5 });
    const matAlu = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.4, metalness: 0.5 });
    const matPare = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.7 });
    const matPhare = new THREE.MeshStandardMaterial({ color: 0xf5f2d8, roughness: 0.3, emissive: 0x2a2a1c });
    const matJante = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.4, metalness: 0.6 });
    const matFroid = new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.5 });
    this.camionsMat.set(vendeurId, [matCaisse, matCab]);

    // Caisse creuse : plancher, toit, fond, cloison, flanc gauche fixe et flanc droit qui se rabat.
    ajouter(new THREE.BoxGeometry(W, ep, Lc), matPlancher, 0, yb + ep / 2, zc);
    ajouter(new THREE.BoxGeometry(W + 0.06, ep, Lc + 0.06), matToit, 0, yb + H, zc);
    ajouter(new THREE.BoxGeometry(W, H, ep), matCaisse, 0, yb + H / 2, zc - Lc / 2 + ep / 2);
    ajouter(new THREE.BoxGeometry(W, H, ep), matCaisse, 0, yb + H / 2, zc + Lc / 2 - ep / 2);
    ajouter(new THREE.BoxGeometry(ep, H, Lc), matCaisse, -W / 2 + ep / 2, yb + H / 2, zc);
    ajouter(new THREE.BoxGeometry(0.03, 0.18, Lc - 0.2), matCabine, -W / 2 - 0.02, yb + 0.5, zc);
    // Cadre en aluminium : montants d'angle et lisses du toit et du bas.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) ajouter(new THREE.BoxGeometry(0.09, H + 0.1, 0.09), matAlu, (sx * W) / 2, yb + H / 2, zc + (sz * Lc) / 2);
    }
    for (const sz of [-1, 1]) ajouter(new THREE.BoxGeometry(W + 0.1, 0.09, 0.09), matAlu, 0, yb + H, zc + (sz * Lc) / 2);
    ajouter(new THREE.BoxGeometry(0.09, 0.09, Lc), matAlu, -W / 2, yb + H, zc);
    ajouter(new THREE.BoxGeometry(0.09, 0.09, Lc), matAlu, W / 2, yb + H, zc);
    ajouter(new THREE.BoxGeometry(0.09, 0.09, Lc), matAlu, -W / 2, yb, zc);
    // Groupe froid au-dessus de la caisse, côté cabine.
    ajouter(new THREE.BoxGeometry(1.3, 0.55, 0.4), matFroid, 0, yb + H + 0.32, zc + Lc / 2 - 0.35);
    ajouter(new THREE.BoxGeometry(0.9, 0.14, 0.02), matPare, 0, yb + H + 0.32, zc + Lc / 2 - 0.14);

    // Portière du flanc droit (à droite à l'écran dans la vue d'ensemble) : charnière sur l'arête basse, elle se rabat vers l'extérieur.
    const pivot = new THREE.Group();
    pivot.position.set(W / 2 - ep / 2, yb, zc);
    g.add(pivot);
    ajouter(new THREE.BoxGeometry(ep, H, Lc), matCaisse, 0, H / 2, 0, pivot);
    ajouter(new THREE.BoxGeometry(0.03, 0.18, Lc - 0.2), matCabine, 0.06, 0.5, 0, pivot);
    const depart = this.ouverturesPrecedentes.get(vendeurId) ?? 0;
    this.portieres.set(vendeurId, { pivot, toit: matToit, ouverture: depart, cible: depart });
    this.appliquerOuverture(vendeurId);

    // La charge : un carton par ligne de stock (les plus grosses d'abord), rangés dans la caisse.
    const colonnes = 3;
    const rangees = 4;
    const pas = 0.58;
    camion.stock.forEach((l, k) => {
      const couche = Math.floor(k / (colonnes * rangees));
      const idx = k % (colonnes * rangees);
      const col = idx % colonnes;
      const rang = Math.floor(idx / colonnes);
      const h = 0.28 + Math.min(0.12, Math.log10(l.quantite + 1) * 0.05);
      const carton = this.boite(pas - 0.05, h, pas - 0.05, CARTONS[hash(l.articleId) % CARTONS.length]);
      carton.position.set((col - (colonnes - 1) / 2) * pas, yb + ep + couche * 0.4 + h / 2, zc - Lc / 2 + ep + 0.35 + rang * pas);
      carton.userData.sel = sel;
      g.add(carton);
      this.cliquables.push(carton);
    });

    // Châssis, cabine simple blanche, capot, pare-chocs noir, phares.
    ajouter(new THREE.BoxGeometry(1.5, 0.25, 5.5), matPare, 0, 0.58, -0.25);
    ajouter(new THREE.BoxGeometry(W - 0.2, 0.2, Lc), matPare, 0, yb - 0.1, zc);
    ajouter(new THREE.BoxGeometry(1.9, 0.8, 1.15), matCab, 0, 0.9, 0.725);
    ajouter(new THREE.BoxGeometry(1.8, 0.65, 1.0), matVitre, 0, 1.625, 0.65);
    ajouter(new THREE.BoxGeometry(1.9, 0.08, 1.15), matCab, 0, 1.99, 0.725);
    ajouter(new THREE.BoxGeometry(1.9, 0.5, 1.2), matCab, 0, 0.8, 1.9);
    ajouter(new THREE.BoxGeometry(1.5, 0.3, 0.05), matPare, 0, 0.75, 2.52);
    ajouter(new THREE.BoxGeometry(2.0, 0.3, 0.25), matPare, 0, 0.5, 2.62);
    for (const sx of [-1, 1]) {
      ajouter(new THREE.BoxGeometry(0.4, 0.15, 0.06), matPhare, sx * 0.65, 0.92, 2.52);
      ajouter(new THREE.BoxGeometry(0.08, 0.2, 0.12), matPare, sx * 1.02, 1.4, 1.15);
    }
    // Roues : pneu noir et jante claire, deux essieux.
    for (const sx of [-1, 1]) {
      for (const z of [1.7, -1.5]) {
        const roue = ajouter(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 22), matRoue, sx * 1.0, 0.4, z);
        roue.rotation.z = Math.PI / 2;
        const jante = ajouter(new THREE.CylinderGeometry(0.23, 0.23, 0.3, 16), matJante, sx * 1.0, 0.4, z);
        jante.rotation.z = Math.PI / 2;
      }
    }
    return g;
  }

  /** Pose la portière d'un camion selon son degré d'ouverture (0 fermé … 1 ouvert). */
  private appliquerOuverture(vendeurId: string) {
    const p = this.portieres.get(vendeurId);
    if (!p) return;
    const k = 1 - Math.pow(1 - p.ouverture, 3);
    // Ridelle rabattable : charnière en bas, le flanc bascule vers l'extérieur et se pose à plat ; le toit ne bouge pas.
    p.pivot.rotation.z = -Math.PI / 2 * k;
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
    // Le camion sélectionné ouvre sa portière droite ; les autres se referment.
    for (const [id, p] of this.portieres) p.cible = this.selection?.type === "camion" && this.selection.vendeurId === id ? 1 : 0;
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
      g.rotation.y = angleRack(rack);
      g.scale.set(Lr + 0.2, Hr + 0.1, RACK_PROFONDEUR + 0.2);
      return;
    }
    const g = this.surlignageCase;
    g.visible = true;
    g.position.copy(this.positionCase(rack, s.niveau, s.travee));
    g.rotation.y = angleRack(rack);
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

  private toucher(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.lanceur.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.lanceur.intersectObjects(this.cliquables, false)[0];
  }

  private cible(e: PointerEvent): SelectionEntrepot | null {
    return (this.toucher(e)?.object.userData.sel as SelectionEntrepot | undefined) ?? null;
  }

  /** Article du carton situé sous le pointeur : les cartons d'une case sont côte à côte, un par article (trois au plus). */
  private articleSous(s: SelectionEntrepot & { type: "case" }, point: THREE.Vector3) {
    const rack = this.data?.racks.find((r) => r.id === s.rackId);
    if (!rack) return null;
    const contenu = rack.emplacements.filter((e) => e.niveau === s.niveau && e.travee === s.travee);
    if (contenu.length === 0) return null;
    const a = angleRack(rack);
    const lx = (point.x - rack.x) * Math.cos(a) - (point.z - rack.z) * Math.sin(a);
    const centre = -longueurRack(rack.travees) / 2 + (s.travee + 0.5) * CASE_LARGEUR;
    const nb = Math.min(3, contenu.length);
    const large = CASE_LARGEUR - 0.16;
    const k = Math.max(0, Math.min(nb - 1, Math.floor(((lx - centre + large / 2) / large) * nb)));
    return { e: contenu[k], place: `${rack.id}:${s.niveau}:${s.travee}:${k}` };
  }

  /** Entoure d'un trait orange le carton survolé (et l'éclaire un peu) ; null retire le contour. */
  private surlignerCarton(place: string | null) {
    const carton = place ? this.cartons.get(place) : undefined;
    if (this.contourSurvol && this.contourSurvol.carton === carton) return;
    const prec = this.contourSurvol;
    if (prec) {
      prec.carton.remove(prec.contour);
      prec.contour.geometry.dispose();
      (prec.contour.material as THREE.Material).dispose();
      const m = prec.carton.material as THREE.MeshStandardMaterial;
      if (prec.emissif !== undefined && m.emissive) m.emissive.setHex(prec.emissif);
      this.contourSurvol = null;
    }
    if (!carton) return;
    const contour = new THREE.LineSegments(new THREE.EdgesGeometry(carton.geometry), new THREE.LineBasicMaterial({ color: COULEURS.selection, depthTest: false }));
    contour.scale.setScalar(1.04);
    contour.renderOrder = 10;
    carton.add(contour);
    const m = carton.material as THREE.MeshStandardMaterial;
    let emissif: number | undefined;
    if (m.emissive) {
      emissif = m.emissive.getHex();
      m.emissive.setHex(COULEURS.selection).multiplyScalar(0.35);
    }
    this.contourSurvol = { carton, contour, emissif };
  }

  /** Infobulle au-dessus du carton survolé : nom de l'article, stock, etc., sans clic. */
  private montrerBulle(hit: THREE.Intersection | undefined, s: SelectionEntrepot | null, e: PointerEvent) {
    const info = hit && s?.type === "case" && !this.marche && this.formaterBulle ? this.articleSous(s, hit.point) : null;
    this.surlignerCarton(info ? info.place : null);
    if (!info || !this.formaterBulle) {
      this.bulle.hidden = true;
      this.cleBulle = "";
      return;
    }
    const cle = `${info.e.article.id}:${info.e.niveau}:${info.e.travee}:${info.e.quantite}`;
    if (cle !== this.cleBulle) {
      this.cleBulle = cle;
      const { titre, lignes } = this.formaterBulle(info.e);
      this.bulle.replaceChildren();
      const t = document.createElement("strong");
      t.textContent = titre;
      this.bulle.appendChild(t);
      for (const l of lignes) {
        const d = document.createElement("span");
        d.textContent = l;
        this.bulle.appendChild(d);
      }
    }
    this.bulle.hidden = false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const w = this.bulle.offsetWidth;
    const h = this.bulle.offsetHeight;
    let x = px + 16;
    let y = py + 18;
    if (x + w > r.width - 8) x = px - w - 12;
    if (y + h > r.height - 8) y = py - h - 12;
    this.bulle.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }

  /** Toucher la scène pendant un trajet de caméra : la main reprend la main. */
  private annulerTrajet = () => {
    this.anim = null;
  };

  /** Le clic molette ne doit pas lancer le défilement automatique du navigateur. */
  private sansDefilementAuto = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };

  private auPointeurBas = (e: PointerEvent) => {
    this.anim = null;
    this.bulle.hidden = true;
    this.surlignerCarton(null);
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
      const hit = this.toucher(e);
      const s = (hit?.object.userData.sel as SelectionEntrepot | undefined) ?? null;
      this.montrerBulle(hit, s, e);
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
    if (!g || g.deplace || e.button !== 0) return;
    const s = this.cible(e);
    this.selection = s;
    this.mettreAJourSurlignages();
    // Clic sur un camion : on zoome dessus ; clic dans le vide : retour à la vue d'avant.
    if (s?.type === "camion") this.focaliser(s);
    else if (!s) this.revenirDuZoom();
    this.surSelection(s);
  };

  private auPointeurQuitte = () => {
    this.bulle.hidden = true;
    this.surlignerCarton(null);
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
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(this.anim.depuis.p, this.anim.vers.p, k);
      this.camera.position.y += this.anim.bosse * Math.sin(Math.PI * k);
      this.controles.target.lerpVectors(this.anim.depuis.c, this.anim.vers.c, k);
      if (t >= 1) this.anim = null;
    }
    for (const [id, p] of this.portieres) {
      if (Math.abs(p.cible - p.ouverture) > 0.001) {
        p.ouverture += (p.cible - p.ouverture) * Math.min(1, dt * 4.5);
        this.appliquerOuverture(id);
      } else if (p.ouverture !== p.cible) {
        p.ouverture = p.cible;
        this.appliquerOuverture(id);
      }
    }
    this.animer(performance.now(), dt);
    if (this.marche) this.avancer(dt);
    else this.controles.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** Animations d'ambiance : camions qui arrivent, cartons qui volent, cases à surveiller qui pulsent. */
  private animer(now: number, dt: number) {
    if (now - this.dernierCiel > 30000) this.mettreAJourCiel();
    for (let i = this.glissades.length - 1; i >= 0; i--) {
      const g = this.glissades[i];
      const t = (now - g.debut) / g.duree;
      if (t < 0) continue;
      g.o.visible = true;
      if (t >= 1) {
        g.o.position.z = g.z;
        g.o.scale.setScalar(1);
        this.glissades.splice(i, 1);
        continue;
      }
      const k = 1 - Math.pow(1 - t, 3);
      g.o.position.z = g.z + 1.8 * (1 - k);
      g.o.scale.setScalar(0.55 + 0.45 * k);
    }
    // Rideaux de porte : ouverts tant qu'un camion est devant ou approche (à moins de 20 m).
    const zPorte = (this.data?.entrepot.profondeur ?? 22) / 2;
    for (const r of this.rideaux) {
      const emp = this.employe?.groupe;
      const employeLa = Boolean(emp && emp.visible && Math.abs(emp.position.x - r.x) < 2 && emp.position.z > zPorte - 3.5);
      const proche = employeLa || this.camionsObj.some((c) => Math.abs(c.position.x - r.x) < 2.2 && c.position.z - zPorte < 20);
      r.ouverture = this.calme ? (proche ? 1 : 0) : r.ouverture + ((proche ? 1 : 0) - r.ouverture) * Math.min(1, dt * 2.4);
      r.pivot.scale.y = Math.max(0.04, 1 - r.ouverture * 0.96);
    }
    this.animerEmploye(now, dt);
    for (const [id, a] of this.arrivees) {
      const t = Math.max(0, Math.min(1, (now - a.debut) / a.duree));
      const z = a.zFinal + 46 * Math.pow(1 - t, 3);
      a.camion.position.z = z;
      a.etiquette.position.z = z + 1;
      if (t >= 1) {
        this.arrivees.delete(id);
        // Arrivé : la portière s'ouvre un instant, puis se referme (sauf si le camion est sélectionné).
        const p = this.portieres.get(id);
        if (p) {
          p.cible = 1;
          this.fermetures.set(id, now + 2600);
        }
      }
    }
    for (const [id, quand] of this.fermetures) {
      if (now < quand) continue;
      this.fermetures.delete(id);
      const p = this.portieres.get(id);
      if (p && !(this.selection?.type === "camion" && this.selection.vendeurId === id)) p.cible = 0;
    }
    for (let i = this.effets.length - 1; i >= 0; i--) {
      const e = this.effets[i];
      const t = (now - e.debut) / e.duree;
      if (t < 0) continue;
      if (t >= 1) {
        e.objet.removeFromParent();
        e.objet.geometry.dispose();
        (e.objet.material as THREE.Material).dispose();
        this.effets.splice(i, 1);
        e.fin?.();
        continue;
      }
      if (e.type === "vol" && e.de && e.a) {
        e.objet.visible = true;
        const k = t * t * (3 - 2 * t);
        e.objet.position.lerpVectors(e.de, e.a, k);
        e.objet.position.y += Math.sin(Math.PI * k) * 2.2;
        e.objet.rotation.y = k * Math.PI;
      } else {
        (e.objet.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.abs(Math.sin(Math.PI * 2 * t)) * (1 - t);
      }
    }
    if (this.pulsants.length > 0) {
      const s = now / 1000;
      for (const p of this.pulsants) {
        const k = 0.5 + 0.5 * Math.sin(s * 3 + p.phase);
        if (p.type === "opacite") (p.mat as THREE.MeshBasicMaterial).opacity = 0.2 + 0.4 * k;
        else (p.mat as THREE.MeshStandardMaterial).emissive.setHex(p.couleur).multiplyScalar(0.1 + 0.5 * k);
      }
    }
  }

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
      const a = (r.rotation * Math.PI) / 180;
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
    el.removeEventListener("wheel", this.annulerTrajet);
    el.removeEventListener("mousedown", this.sansDefilementAuto);
    window.removeEventListener("keydown", this.auClavier);
    window.removeEventListener("keyup", this.auClavierHaut);
    this.controles.dispose();
    this.bulle.remove();
    for (const e of this.effets) {
      e.objet.removeFromParent();
      e.objet.geometry.dispose();
      (e.objet.material as THREE.Material).dispose();
    }
    this.effets = [];
    this.vider(this.contenu);
    this.vider(this.marqueurs);
    this.renderer.dispose();
    el.remove();
  }
}
