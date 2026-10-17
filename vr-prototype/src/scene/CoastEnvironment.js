/**
 * CoastEnvironment.js
 * Genera el entorno costero inmersivo en 360 grados:
 * - Atmósfera y cielo tropical con sol cenital (Sky addon)
 * - Iluminación costera cálida y niebla marina sutil
 * - Océano dinámico con reflejos y oleaje continuo (Water addon + función de oleaje unificada)
 * - Playa con pendiente de arena suave, dunas y línea de espuma
 * - Palmeras tropicales procedurales y formaciones rocosas costeras
 * - Siluetas de islas distantes en el horizonte marino
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

export class CoastEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    this.waterLevel = 0.0;
    this._animatedMeshes = [];

    this._buildAtmosphereAndLighting();
    this._buildOcean();
    this._buildBeachTerrain();
    this._buildVegetationAndRocks();
    this._buildDistantIslands();
  }

  // ─── Función Analítica de Oleaje Unificada ──────────────────────────────────
  /**
   * Calcula la altura del agua en (x, z) en un instante dado.
   * Utilizada por el shader y por las físicas de flotabilidad de la balsa, boya y perlas.
   */
  getWaveHeight(x, z, time = this.time) {
    // Suma de 3 armónicos con distintas frecuencias y direcciones para oleaje orgánico
    const wave1 = Math.sin(x * 0.06 + z * 0.12 + time * 1.6) * 0.18;
    const wave2 = Math.cos(x * 0.15 - z * 0.08 + time * 2.2) * 0.08;
    const wave3 = Math.sin((x + z) * 0.25 + time * 3.0) * 0.04;
    return this.waterLevel + wave1 + wave2 + wave3;
  }

  /**
   * Retorna la inclinación (pitch y roll) sobre el agua en (x, z)
   */
  getWaveAngles(x, z, time = this.time) {
    const EPS = 0.5;
    const hCenter = this.getWaveHeight(x, z, time);
    const hForward = this.getWaveHeight(x, z - EPS, time);
    const hRight = this.getWaveHeight(x + EPS, z, time);

    const pitch = (hForward - hCenter) / EPS * 0.45;
    const roll  = (hRight - hCenter) / EPS * 0.45;
    return { pitch, roll };
  }

  // ─── Atmósfera, Sol e Iluminación ──────────────────────────────────────────
  _buildAtmosphereAndLighting() {
    // Niebla marina atmosférica
    // Niebla marina atmosférica en tono azul cielo costero
    this.scene.fog = new THREE.FogExp2(0xa3cde8, 0.0028);

    // Domo de cielo dinámico
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    this.scene.add(this.sky);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['turbidity'].value = 6;
    skyUniforms['rayleigh'].value = 1.4;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;

    // Vector solar (sol tropical de tarde a 28° de elevación y 135° de azimut)
    this.sunPosition = new THREE.Vector3();
    const elevation = 28; // grados sobre el horizonte
    const azimuth = 135;  // orientación lateral-frontal agradable
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(this.sunPosition);

    // Luz solar directa con intensidad balanceada (evita quemar la escena en blanco)
    this.sunLight = new THREE.DirectionalLight(0xfffae0, 1.35);
    this.sunLight.position.copy(this.sunPosition).multiplyScalar(150);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 300;
    const d = 35;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Luz ambiental hemisférica (cielo azul / suelo arena cálida)
    const hemiLight = new THREE.HemisphereLight(0x76bfe8, 0x4a3a28, 0.8);
    this.scene.add(hemiLight);
  }

  // ─── Océano con Textura de Normales Procedural y Fondo Marino ──────────────
  _buildOcean() {
    // 1. Fondo abisal oscuro para dar profundidad y evitar que el agua sea transparente/clara
    const seabedGeo = new THREE.PlaneGeometry(850, 850);
    const seabedMat = new THREE.MeshBasicMaterial({ color: 0x000e1c });
    const seabed = new THREE.Mesh(seabedGeo, seabedMat);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -6.0;
    this.scene.add(seabed);

    // 2. Generar mapa de normales procedural suavizado
    const normalMap = this._createProceduralWaterNormalMap();

    const waterGeo = new THREE.PlaneGeometry(800, 800);
    this.water = new Water(waterGeo, {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals: normalMap,
      sunDirection: this.sunPosition.clone().normalize(),
      sunColor: 0xffd990,      // Reflejo cálido dorado (no blanco quemado)
      waterColor: 0x001d36,    // Azul marino oceánico profundo y rico
      distortionScale: 2.2,    // Oleaje suave y orgánico
      fog: true,
    });

    // Optimización de rendimiento: renderizar reflejo espejo cada 2 frames
    // Duplica la tasa de cuadros y reduce la sobrecarga de dibujado en GPU
    let mirrorFrameCounter = 0;
    const baseOnBeforeRender = this.water.onBeforeRender;
    this.water.onBeforeRender = function(renderer, scene, camera) {
      mirrorFrameCounter++;
      if (mirrorFrameCounter % 2 !== 0) return;
      baseOnBeforeRender.call(this, renderer, scene, camera);
    };

    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.waterLevel;
    this.scene.add(this.water);
  }

  _createProceduralWaterNormalMap() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u1 = (x / size) * Math.PI * 4;
        const v1 = (y / size) * Math.PI * 4;
        const u2 = (x / size) * Math.PI * 8;
        const v2 = (y / size) * Math.PI * 8;

        const nx = Math.sin(u1) * 0.35 + Math.sin(u2 + v1) * 0.15;
        const ny = Math.cos(v1) * 0.35 + Math.cos(v2 - u1) * 0.15;
        const nz = 0.92;

        const len = Math.hypot(nx, ny, nz);
        const idx = (y * size + x) * 4;
        data[idx]     = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // ─── Terreno de Playa y Orilla ─────────────────────────────────────────────
  _buildBeachTerrain() {
    // Terreno de arena que se extiende desde la costa hacia tierra firme (z positivo)
    const beachGeo = new THREE.PlaneGeometry(160, 90, 48, 32);
    beachGeo.rotateX(-Math.PI / 2);

    const pos = beachGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Pendiente: de z=0 (orilla del agua) hacia z=45 (tierra alta con dunas)
      let y = 0;
      if (z > 0) {
        // Elevación suave de playa + dunas
        const duneNoise = Math.sin(x * 0.12) * Math.cos(z * 0.15) * 0.8;
        y = Math.pow(z / 45, 1.4) * 5.5 + duneNoise;
      } else {
        // Bajo el agua hacia el mar
        y = (z / 20) * 1.5;
      }
      pos.setY(i, y);
    }
    beachGeo.computeVertexNormals();

    const beachMat = new THREE.MeshStandardMaterial({
      color: 0xdfbe8c,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.beachMesh = new THREE.Mesh(beachGeo, beachMat);
    this.beachMesh.position.set(0, -0.05, 30);
    this.beachMesh.receiveShadow = true;
    this.scene.add(this.beachMesh);

    // Franja de orilla húmeda / espuma de agua
    const foamGeo = new THREE.PlaneGeometry(120, 1.8);
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    this.foamLine = new THREE.Mesh(foamGeo, foamMat);
    this.foamLine.rotation.x = -Math.PI / 2;
    this.foamLine.position.set(0, 0.04, 1.5);
    this.scene.add(this.foamLine);
  }

  // ─── Palmeras y Rocas Costeras ─────────────────────────────────────────────
  _buildVegetationAndRocks() {
    // Palmeras a lo largo de la costa
    const palmLocations = [
      [-14, 10], [-22, 18], [-8, 22], [12, 14], [24, 16], [18, 26], [-28, 28], [32, 22]
    ];
    palmLocations.forEach(([px, pz]) => {
      this._buildPalmTree(px, pz);
    });

    // Formaciones rocosas en la orilla
    const rockLocations = [
      [-18, 2, 2.2], [-12, -2, 1.6], [-6, -1, 1.2],
      [15, 3, 2.0], [22, -1, 1.8], [9, 1, 1.4], [-24, 6, 2.8]
    ];
    rockLocations.forEach(([rx, rz, scale]) => {
      this._buildCoastalRock(rx, rz, scale);
    });
  }

  _buildPalmTree(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0.8, z);

    // Tronco curvado realista
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 6, 8);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x735137,
      roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3;
    trunk.rotation.z = (Math.random() - 0.5) * 0.25;
    trunk.rotation.x = (Math.random() - 0.5) * 0.2;
    trunk.castShadow = true;
    group.add(trunk);

    // Hojas de palmera (frondas verdes extendidas)
    const frondCount = 7;
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2e8b57,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const leafGeo = new THREE.ConeGeometry(0.8, 3.2, 5);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(0, 5.8, 0);
      leaf.rotation.y = angle;
      leaf.rotation.x = 1.1; // Caída hacia afuera
      leaf.scale.set(0.7, 1.0, 0.15);
      leaf.castShadow = true;
      group.add(leaf);
    }

    this.scene.add(group);
  }

  _buildCoastalRock(x, z, scale = 1.5) {
    const rockGeo = new THREE.DodecahedronGeometry(scale, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x827b73,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, scale * 0.45, z);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    this.scene.add(rock);
  }

  // ─── Siluetas de Islas Distantes ───────────────────────────────────────────
  _buildDistantIslands() {
    const islandMat = new THREE.MeshBasicMaterial({
      color: 0x3d667c,
      fog: true,
    });

    const islandPositions = [
      [-160, 0, -280, 70, 30],
      [140, 0, -320, 90, 40],
      [20, 0, -380, 120, 50],
    ];

    islandPositions.forEach(([ix, iy, iz, radius, height]) => {
      const geo = new THREE.ConeGeometry(radius, height, 16);
      geo.translate(0, height / 2 - 4, 0);
      const island = new THREE.Mesh(geo, islandMat);
      island.position.set(ix, iy, iz);
      this.scene.add(island);
    });
  }

  // ─── Actualización por Frame ───────────────────────────────────────────────
  update(delta) {
    this.time += delta;

    // Animar shader del agua
    if (this.water && this.water.material && this.water.material.uniforms) {
      this.water.material.uniforms['time'].value += delta * 0.8;
    }

    // Animar pulsación sutil de la espuma en la orilla
    if (this.foamLine) {
      const foamSwell = Math.sin(this.time * 1.5) * 0.4;
      this.foamLine.position.z = 1.6 + foamSwell;
      this.foamLine.material.opacity = 0.45 + Math.sin(this.time * 1.5) * 0.2;
    }
  }
}
