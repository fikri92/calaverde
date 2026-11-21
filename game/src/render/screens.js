// Every full-screen overlay that is not the world: the title screen with its menu column, the pause
// menu, the full-screen map with a legend, the settings panel and the busted / wasted cards. One
// module owns the DOM for all of them so the keyboard and pointer handling live in one place, and so
// the title screen can be posed for a screenshot without the boot flow being faked.

import { describeSaveTime } from '../systems/save.js';
import { DISTRICT_NAMES } from '../city/layout.js';

const $ = (id) => document.getElementById(id);

export const MENU_TITLE = [
  { id: 'continue', label: 'CONTINUAR', sub: 'saved game' },
  { id: 'new', label: 'PARTIDA NUEVA', sub: 'empezar de cero' },
  { id: 'map', label: 'MAPA', sub: 'la ciudad entera' },
  { id: 'settings', label: 'AJUSTES', sub: 'calidad, sonido, ratón' },
];

export const MENU_PAUSE = [
  { id: 'resume', label: 'SEGUIR JUGANDO' },
  { id: 'map', label: 'MAPA' },
  { id: 'settings', label: 'AJUSTES' },
  { id: 'save', label: 'GUARDAR PARTIDA' },
  { id: 'quit', label: 'SALIR AL TÍTULO' },
];

export class Screens {
  constructor({ layout, onAction }) {
    this.layout = layout;
    this.onAction = onAction;
    this.stack = [];
    this.settings = {
      quality: 'alto',
      volume: 0.7,
      invertY: false,
      sensitivity: 1.0,
    };
    this.buildTitle();
    this.buildPause();
    this.buildMap();
    this.buildSettings();
    this.buildEndCard();
  }

  // ---------------------------------------------------------------- title
  buildTitle() {
    const root = $('title-screen');
    root.innerHTML = `
      <div class="title-veil"></div>
      <div class="title-panel">
        <div class="title-kicker">UNA SAGA CRIMINAL AL SOL</div>
        <h1 class="title-logo">CALA<span>VERDE</span></h1>
        <div class="title-rule"></div>
        <p class="title-tag">Puerto Azul te da el sol. El resto te lo tienes que ganar.</p>
        <div class="title-menu" id="title-menu"></div>
        <div class="title-save" id="title-save">SIN PARTIDA GUARDADA</div>
        <div class="title-foot">
          <span class="title-key">WASD</span> mover
          <span class="title-key">RATÓN</span> mirar
          <span class="title-key">F</span> vehículo
          <span class="title-key">ESC</span> pausa
        </div>
      </div>
    `;
    this.titleMenu = $('title-menu');
    this.titleSave = $('title-save');
    this.titleIndex = 0;
    this.titleReady = false;
    this.drawTitleMenu();
  }

  drawTitleMenu() {
    this.titleMenu.innerHTML = MENU_TITLE.map((item, i) => {
      const disabled = item.id === 'continue' && !this.hasSave;
      return `
        <button type="button" class="title-item${i === this.titleIndex ? ' sel' : ''}${disabled ? ' off' : ''}"
                data-id="${item.id}" ${disabled ? 'disabled' : ''}>
          <span class="ti-dot"></span>
          <span class="ti-label">${item.label}</span>
          <span class="ti-sub">${item.sub}</span>
        </button>`;
    }).join('');
    [...this.titleMenu.children].forEach((el, i) => {
      el.addEventListener('mouseenter', () => {
        this.titleIndex = i;
        this.drawTitleMenu();
      });
      el.addEventListener('click', () => this.chooseTitle(i));
    });
  }

  // Called once at boot with the slot that was found, so Continue can be lit or dimmed.
  setSaveInfo(record) {
    this.hasSave = !!record;
    this.saveRecord = record;
    if (record) {
      const when = describeSaveTime(record.at);
      const cash = `$${(record.money ?? 0).toLocaleString('es-ES')}`;
      this.titleSave.innerHTML = `<b>PARTIDA GUARDADA</b> Ranura 1 · ${when} · ${cash}`;
    } else {
      this.titleSave.innerHTML = '<b>SIN PARTIDA</b> Ranura 1 vacía';
    }
    if (!this.titleReady) {
      // Continue is the default row when there is something to continue.
      this.titleIndex = record ? 0 : 1;
    }
    this.drawTitleMenu();
  }

  chooseTitle(index) {
    const item = MENU_TITLE[index];
    if (!item) return;
    if (item.id === 'continue' && !this.hasSave) return;
    this.titleIndex = index;
    this.onAction(item.id, 'title');
  }

  // The title is the one screen the game shows before it is running; the screenshot runner poses
  // it with ?shot=title and needs the menu drawn with a row lit.
  showTitle() {
    $('title-screen').classList.remove('hidden');
    this.titleReady = true;
  }

  hideTitle() {
    $('title-screen').classList.add('hidden');
  }

  moveTitle(delta) {
    const n = MENU_TITLE.length;
    let i = this.titleIndex;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if (MENU_TITLE[i].id !== 'continue' || this.hasSave) break;
    }
    this.titleIndex = i;
    this.drawTitleMenu();
  }

  // ---------------------------------------------------------------- pause
  buildPause() {
    const root = $('pause-menu');
    root.innerHTML = `
      <div class="pause-scrim"></div>
      <div class="pause-panel">
        <div class="pause-head">
          <div class="pause-kicker">CALA VERDE</div>
          <h2>PAUSA</h2>
        </div>
        <div class="pause-menu" id="pause-list"></div>
        <div class="pause-foot" id="pause-foot">Esc para seguir jugando</div>
      </div>
    `;
    this.pauseList = $('pause-list');
    this.pauseIndex = 0;
    this.drawPauseMenu();
  }

  drawPauseMenu() {
    this.pauseList.innerHTML = MENU_PAUSE.map((item, i) => `
      <button type="button" class="pause-item${i === this.pauseIndex ? ' sel' : ''}" data-id="${item.id}">
        <span class="ti-dot"></span><span class="ti-label">${item.label}</span>
      </button>`).join('');
    [...this.pauseList.children].forEach((el, i) => {
      el.addEventListener('mouseenter', () => {
        this.pauseIndex = i;
        this.drawPauseMenu();
      });
      el.addEventListener('click', () => this.choosePause(i));
    });
  }

  choosePause(index) {
    const item = MENU_PAUSE[index];
    if (!item) return;
    this.pauseIndex = index;
    this.onAction(item.id, 'pause');
  }

  movePause(delta) {
    this.pauseIndex = (this.pauseIndex + delta + MENU_PAUSE.length) % MENU_PAUSE.length;
    this.drawPauseMenu();
  }

  showPause() {
    $('pause-menu').hidden = false;
    this.pauseIndex = 0;
    this.drawPauseMenu();
  }

  hidePause() {
    $('pause-menu').hidden = true;
  }

  // ---------------------------------------------------------------- full map
  buildMap() {
    const root = $('map-screen');
    root.innerHTML = `
      <div class="map-panel">
        <div class="map-head">
          <div>
            <div class="map-kicker">PUERTO AZUL</div>
            <h2>MAPA DE LA CIUDAD</h2>
          </div>
          <div class="map-close">M o Esc para cerrar</div>
        </div>
        <div class="map-body">
          <canvas id="map-canvas" width="900" height="900"></canvas>
          <div class="map-legend" id="map-legend"></div>
        </div>
      </div>
    `;
    this.mapCanvas = $('map-canvas');
    this.mapLegend = $('map-legend');
    this.mapLegend.innerHTML = `
      <div class="lg-row"><i class="lg-blip you"></i><span>Tú</span></div>
      <div class="lg-row"><i class="lg-blip job"></i><span>Misión</span></div>
      <div class="lg-row"><i class="lg-blip cop"></i><span>Policía</span></div>
      <div class="lg-row"><i class="lg-blip car"></i><span>Vehículos</span></div>
      <div class="lg-row"><i class="lg-swatch sea"></i><span>Mar y marina</span></div>
      <div class="lg-row"><i class="lg-swatch park"></i><span>Parques</span></div>
      <div class="lg-dist" id="map-districts"></div>
    `;
  }

  showMap(renderer) {
    $('map-screen').classList.remove('hidden');
    this.mapRenderer = renderer;
    renderer?.drawFull(this.mapCanvas);
  }

  hideMap() {
    $('map-screen').classList.add('hidden');
  }

  // ---------------------------------------------------------------- settings
  buildSettings() {
    const root = $('settings-screen');
    root.innerHTML = `
      <div class="settings-panel">
        <div class="settings-head">
          <div class="map-kicker">CALA VERDE</div>
          <h2>AJUSTES</h2>
        </div>
        <div class="settings-list" id="settings-list"></div>
        <div class="settings-foot">Flechas cambian · Enter vuelve</div>
      </div>
    `;
    this.settingsList = $('settings-list');
    this.settingsIndex = 0;
    this.drawSettings();
  }

  settingRows() {
    return [
      { id: 'quality', label: 'CALIDAD GRÁFICA', value: this.settings.quality.toUpperCase() },
      { id: 'volume', label: 'VOLUMEN', value: `${Math.round(this.settings.volume * 100)}%` },
      { id: 'sensitivity', label: 'SENSIBILIDAD', value: `${this.settings.sensitivity.toFixed(2)}x` },
      { id: 'invertY', label: 'INVERTIR VERTICAL', value: this.settings.invertY ? 'SÍ' : 'NO' },
      { id: 'back', label: 'VOLVER', value: '' },
    ];
  }

  drawSettings() {
    this.settingsList.innerHTML = this.settingRows().map((row, i) => `
      <button type="button" class="settings-row${i === this.settingsIndex ? ' sel' : ''}" data-id="${row.id}">
        <span class="ti-label">${row.label}</span>
        <span class="ti-value">${row.value}</span>
      </button>`).join('');
    [...this.settingsList.children].forEach((el, i) => {
      el.addEventListener('click', () => {
        this.settingsIndex = i;
        this.changeSetting(1);
      });
    });
  }

  showSettings() {
    $('settings-screen').classList.remove('hidden');
    this.settingsIndex = 0;
    this.drawSettings();
  }

  hideSettings() {
    $('settings-screen').classList.add('hidden');
  }

  moveSettings(delta) {
    const n = this.settingRows().length;
    this.settingsIndex = (this.settingsIndex + delta + n) % n;
    this.drawSettings();
  }

  changeSetting(delta) {
    const rows = this.settingRows();
    const row = rows[this.settingsIndex];
    if (!row) return null;
    if (row.id === 'back') {
      this.hideSettings();
      return { action: 'close' };
    }
    if (row.id === 'quality') {
      const order = ['bajo', 'medio', 'alto'];
      const i = order.indexOf(this.settings.quality);
      this.settings.quality = order[(i + delta + order.length) % order.length];
    } else if (row.id === 'volume') {
      this.settings.volume = Math.max(0, Math.min(1, +(this.settings.volume + delta * 0.1).toFixed(2)));
    } else if (row.id === 'sensitivity') {
      this.settings.sensitivity = Math.max(0.4, Math.min(2.4, +(this.settings.sensitivity + delta * 0.1).toFixed(2)));
    } else if (row.id === 'invertY') {
      this.settings.invertY = !this.settings.invertY;
    }
    this.drawSettings();
    return { action: 'changed', id: row.id, value: this.settings[row.id] };
  }

  // ---------------------------------------------------------------- busted / wasted
  buildEndCard() {
    const root = $('end-card');
    root.innerHTML = `
      <div class="end-inner">
        <div class="end-kicker" id="end-kicker">LA POLICÍA TE HA DETENIDO</div>
        <h2 id="end-title">BUSTED</h2>
        <div class="end-body" id="end-body"></div>
      </div>
    `;
  }

  showEndCard(kind, { penalty, extra = '' } = {}) {
    const root = $('end-card');
    const busted = kind === 'busted';
    $('end-kicker').textContent = busted ? 'LA POLICÍA TE HA DETENIDO' : 'TE HAN DEJADO EN EL SUELO';
    const title = $('end-title');
    title.textContent = busted ? 'DETENIDO' : 'K.O.';
    title.className = busted ? 'busted' : 'wasted';
    $('end-body').innerHTML = `
      <div class="end-fee">-$${penalty}</div>
      <div class="end-note">${busted ? 'Comisaría de Vista Mar' : 'Hospital de la Playa'} · te han cobrado la factura</div>
      ${extra ? `<div class="end-extra">${extra}</div>` : ''}
    `;
    root.classList.remove('hidden');
  }

  hideEndCard() {
    $('end-card').classList.add('hidden');
  }

  // The district names on the map legend come from the same table the world uses, so the map and
  // the HUD can never disagree about what a neighbourhood is called.
  drawDistricts() {
    const host = $('map-districts');
    if (!host) return;
    host.innerHTML = DISTRICT_NAMES.map((name) => `<span>${name}</span>`).join('');
  }
}
