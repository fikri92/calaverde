// The heads-up display: health and armour arcs, cash, wanted stars, weapon and ammo, the objective
// line, a speedometer while driving, the dialogue box, the notification feed, and the phone. All of
// it is DOM over the canvas, styled in ui.css, so text stays crisp and costs no draw calls.

import { CAST } from '../data/missions.js';
import { Minimap } from './minimap.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(layout) {
    this.layout = layout;
    this.root = $('hud');
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="wanted" id="hud-wanted"></div>
          <div class="vitals">
            <div class="bar bar-health"><i id="hud-health"></i><span>VIDA</span></div>
            <div class="bar bar-armour"><i id="hud-armour"></i><span>CHALECO</span></div>
            <div class="bar bar-stamina"><i id="hud-stamina"></i></div>
          </div>
          <div class="cash" id="hud-cash">$0</div>
        </div>
        <div class="hud-right">
          <div class="minimap-wrap">
            <canvas id="hud-minimap" width="220" height="220"></canvas>
            <div class="minimap-ring"></div>
            <div class="district" id="hud-district">LA CUSTODIA</div>
          </div>
        </div>
      </div>
      <div class="hud-objective" id="hud-objective"></div>
      <div class="hud-weapon" id="hud-weapon">
        <div class="weapon-name" id="hud-weapon-name">PISTOLA</div>
        <div class="weapon-ammo"><b id="hud-ammo">12</b><span id="hud-reserve">/60</span></div>
      </div>
      <div class="speedo" id="hud-speedo" hidden>
        <div class="speedo-value"><b id="hud-speed">0</b><span>KM/H</span></div>
        <div class="speedo-bar"><i id="hud-speed-fill"></i></div>
        <div class="speedo-car" id="hud-car-name">SEDÁN</div>
      </div>
      <div class="dialogue" id="hud-dialogue" hidden>
        <div class="dlg-speaker" id="hud-speaker">RAFA</div>
        <div class="dlg-line" id="hud-line"></div>
      </div>
      <div class="feed" id="hud-feed"></div>
      <div class="crosshair" id="hud-crosshair"></div>
      <div class="hint" id="hud-hint"></div>
      <div class="phone" id="hud-phone" hidden>
        <div class="phone-head"><span>PUERTO AZUL CELL</span><b id="phone-signal">▮▮▮</b></div>
        <div class="phone-body" id="phone-body"></div>
        <div class="phone-foot">T — cerrar · M — iniciar misión · flechas — navegar</div>
      </div>
      <div class="bustbar" id="hud-bustbar" hidden><span>DETENCIÓN</span><i id="hud-bust-fill"></i></div>
    `;
    this.el = {
      wanted: $('hud-wanted'),
      health: $('hud-health'),
      armour: $('hud-armour'),
      stamina: $('hud-stamina'),
      cash: $('hud-cash'),
      objective: $('hud-objective'),
      weaponName: $('hud-weapon-name'),
      ammo: $('hud-ammo'),
      reserve: $('hud-reserve'),
      speedo: $('hud-speedo'),
      speed: $('hud-speed'),
      speedFill: $('hud-speed-fill'),
      carName: $('hud-car-name'),
      dialogue: $('hud-dialogue'),
      speaker: $('hud-speaker'),
      line: $('hud-line'),
      feed: $('hud-feed'),
      crosshair: $('hud-crosshair'),
      hint: $('hud-hint'),
      phone: $('hud-phone'),
      phoneBody: $('phone-body'),
      bustbar: $('hud-bustbar'),
      bustFill: $('hud-bust-fill'),
      district: $('hud-district'),
      weapon: $('hud-weapon'),
    };
    this.minimap = new Minimap($('hud-minimap'), layout, { span: 150 });
    this.feedItems = [];
    this.phoneOpen = false;
    this.phoneIndex = 0;
    this.hintTimer = 0;
    this.blipPhase = 0;
    this.lastStars = -1;
    this.showHint('WASD mover · ratón mirar · clic disparar · F vehículo', 9);
  }

  showHint(text, seconds = 6) {
    this.el.hint.textContent = text;
    this.el.hint.style.opacity = '1';
    this.hintTimer = seconds;
  }

  buildWanted(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="${i < stars ? 'on' : ''}">★</span>`;
    }
    this.el.wanted.innerHTML = html;
    this.el.wanted.classList.toggle('active', stars > 0);
    this.el.wanted.dataset.searching = '';
  }

  // `pin` keeps an item on screen until it is replaced: staged screenshots use it so a captured
  // frame always has its mission line and alert readable instead of caught mid-fade.
  pushFeed(title, body, tone = 'info', { pin = false } = {}) {
    const div = document.createElement('div');
    div.className = `feed-item ${tone}`;
    div.innerHTML = `<b>${escapeHtml(title)}</b>${body ? `<span>${escapeHtml(body)}</span>` : ''}`;
    this.el.feed.appendChild(div);
    if (pin) {
      for (const item of this.feedItems) item.div.remove();
      this.feedItems.length = 0;
    }
    this.feedItems.push({ div, life: pin ? Infinity : 5.5, pinned: pin });
    while (this.feedItems.length > 5) {
      const old = this.feedItems.shift();
      old.div.remove();
    }
  }

  togglePhone() {
    this.phoneOpen = !this.phoneOpen;
    this.el.phone.hidden = !this.phoneOpen;
    return this.phoneOpen;
  }

  renderPhone(missionData, selected = 0) {
    const rows = missionData.missions
      .map((m, i) => {
        const cls = m.done ? 'done' : m.active ? 'active' : i === selected ? 'sel' : '';
        const tag = m.done ? '✓' : m.active ? '▶' : '';
        return `<div class="phone-row ${cls}" data-i="${i}">
          <span class="pm-tag">${tag}</span>
          <span class="pm-title">${escapeHtml(m.title)}</span>
          <span class="pm-district">${escapeHtml(m.district)}</span>
        </div>`;
      })
      .join('');
    this.el.phoneBody.innerHTML = `
      <div class="phone-section">TRABAJOS</div>
      ${rows}
      <div class="phone-section">ACTIVIDADES</div>
      ${missionData.activities.map((a) => `<div class="phone-row act"><span class="pm-tag">·</span><span class="pm-title">${escapeHtml(a.title)}</span><span class="pm-district">${escapeHtml(a.where)}</span></div>`).join('')}
    `;
  }

  update(dt, state) {
    const { player, police, missions, city } = state;

    // Vitals.
    this.el.health.style.width = `${(player.health / player.maxHealth) * 100}%`;
    this.el.armour.style.width = `${player.armour}%`;
    this.el.stamina.style.width = `${player.stamina}%`;
    this.el.cash.textContent = `$${player.money.toLocaleString('en-US')}`;
    this.buildWanted(police.stars);
    this.el.wanted.classList.toggle('searching', police.searching);

    // Weapon.
    const w = player.weapon;
    this.el.weaponName.textContent = w.name.toUpperCase();
    this.el.ammo.textContent = String(w.ammo);
    this.el.reserve.textContent = `/${w.reserve}`;
    this.el.weapon.classList.toggle('low', w.ammo <= Math.ceil(w.mag * 0.25));

    // Objective and marker distance.
    const m = missions;
    if (m.active) {
      const d = m.markerDistance;
      this.el.objective.innerHTML = `<b>OBJETIVO</b> ${escapeHtml(m.objective)}${d !== null ? `<span class="obj-dist">${Math.round(d)} m</span>` : ''}`;
      this.el.objective.classList.add('on');
    } else {
      const next = m.nextMissionTitle;
      this.el.objective.innerHTML = next ? `<b>Rafa</b> Tienes trabajo: ${escapeHtml(next)} <span class="obj-hint">TELÉFONO (T)</span>` : '';
      this.el.objective.classList.toggle('on', !!next);
    }

    // Speedometer.
    const car = player.vehicle;
    this.el.speedo.hidden = !car;
    if (car) {
      const kmh = Math.round(car.speed * 3.6);
      this.el.speed.textContent = String(kmh);
      this.el.speedFill.style.width = `${Math.min(100, (car.speed / car.spec.maxSpeed) * 100)}%`;
      this.el.carName.textContent = car.spec.label.toUpperCase();
      this.el.speedo.classList.toggle('fast', kmh > 120);
    }

    // Crosshair while aiming on foot.
    this.el.crosshair.style.opacity = player.aiming && !car ? '1' : '0';

    // Dialogue.
    const line = m.currentLine;
    if (line) {
      this.el.dialogue.hidden = false;
      const who = CAST[line.who] ?? { short: line.who, color: '#fff' };
      this.el.speaker.textContent = who.short;
      this.el.speaker.style.color = who.color;
      this.el.line.textContent = line.line;
      this.el.dialogue.style.setProperty('--speaker', who.color);
    } else {
      this.el.dialogue.hidden = true;
    }

    // District name.
    this.el.district.textContent = (city.layout.districtAt(player.pos.x, player.pos.z) || 'PUERTO AZUL').toUpperCase();

    // Bust bar.
    const bust = Math.min(1, police.bustTimer / 2.4);
    this.el.bustbar.hidden = bust <= 0.02;
    this.el.bustFill.style.width = `${bust * 100}%`;

    // Feed lifetimes.
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      if (f.pinned) continue;
      f.life -= dt;
      f.div.style.opacity = f.life > 4.6 ? String(1 - (f.life - 4.6) / 0.9) : f.life < 0.8 ? String(Math.max(0, f.life / 0.8)) : '1';
      if (f.life <= 0) {
        f.div.remove();
        this.feedItems.splice(i, 1);
      }
    }

    // Hint fade.
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.style.opacity = '0';
    }

    // Minimap.
    const heading = player.yaw;
    this.minimap.draw(
      { x: player.pos.x, z: player.pos.z },
      {
        heading,
        objective: m.marker,
        cops: police.officers.filter((c) => !c.dead && !c.gone).map((c) => ({ x: c.pos.x, z: c.pos.z }))
          .concat(police.units.filter((u) => u.car && !u.car.disposed).map((u) => ({ x: u.car.pos.x, z: u.car.pos.z }))),
        vehicles: state.vehicles.slice(0, 40).map((v) => ({ x: v.pos.x, z: v.pos.z })),
      },
    );
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
