// The story of Cala Verde: who you meet, what they want, and the six jobs that carry the plot
// from stealing a car in La Custodia to robbing the marina at Muelle Viejo. Everything here is
// data: missions.js runs it, so dialogue and objectives can be edited without touching systems.

export const CAST = {
  rafa: { name: 'Rafa Quintero', short: 'RAFA', color: '#ffcf6b', voice: 'low' },
  lena: { name: 'Lena Vidal', short: 'LENA', color: '#35c4b5', voice: 'mid' },
  chucho: { name: 'Chucho', short: 'CHUCHO', color: '#ef6b4a', voice: 'high' },
  marisol: { name: 'Marisol Reyes', short: 'MARISOL', color: '#f6ecd8', voice: 'mid' },
  aguilar: { name: 'Capitán Aguilar', short: 'AGUILAR', color: '#8fb8d6', voice: 'low' },
  you: { name: 'Tú', short: 'TÚ', color: '#ffffff', voice: 'you' },
};

// Mission shape:
//   id, title, giver, district, blurb (the brief shown on the phone)
//   steps: ordered objectives, each with a type the mission runner understands:
//     drive -> {to:[x,z], radius, label}     walk -> same, on foot
//     steal -> {car, radius, label}          take a specific car
//     kill  -> {count, label}                kill N gang members / cops
//     survive -> {seconds, label}            hold out
//     escape -> {stars, label}               lose the wanted level
//     collect -> {count, label}              grab packages near a point
//     goto  -> {marker, label}               reach a story marker
//   reward, heat (stars added on completion if any), and dialogue beats.

export const MISSIONS = [
  {
    id: 'first_ride',
    title: 'Un coche prestado',
    giver: 'rafa',
    district: 'La Custodia',
    blurb: 'Rafa needs a car that is not his, and he is not fussy about whose it is.',
    reward: 350,
    steps: [
      { type: 'walk', to: [-214, -128], radius: 12, label: 'Ve a la calle trasera de La Custodia', marker: true },
      { type: 'steal', car: 'muscle', radius: 4.5, label: 'Roba el músculo rojo aparcado', marker: true },
      { type: 'drive', to: [-64, 208], radius: 14, label: 'Llévalo al taller de Rafa en Vista Mar', marker: true },
    ],
    dialogue: [
      { who: 'rafa', line: '¿Oye, tú! Sí, tú. ¿Ese coche es tuyo? No, no lo es. Perfecto.' },
      { who: 'you', line: '¿Y por qué debería hacerte caso?' },
      { who: 'rafa', line: 'Porque te pago. Y porque el dueño es un tipo que no te va a caer bien.' },
      { who: 'rafa', line: 'Tráelo al taller de Vista Mar y hablamos de dinero de verdad.' },
    ],
    outro: [
      { who: 'rafa', line: 'Limpio. Sin un rasguño. ¿Sabes lo raro que es eso por aquí?' },
      { who: 'rafa', line: 'Toma. Y no gastes todo en ron.' },
    ],
  },
  {
    id: 'shakedown',
    title: 'Cobro a domicilio',
    giver: 'rafa',
    district: 'Barrio del Sol',
    blurb: 'Two dealers are sitting on Rafa\'s money. Convince them politely. Or not.',
    reward: 600,
    steps: [
      { type: 'walk', to: [88, -168], radius: 16, label: 'Reúnete con Rafa en Barrio del Sol', marker: true },
      { type: 'kill', count: 3, label: 'Aplaca a los matones (3)', marker: true },
      { type: 'escape', stars: 1, label: 'Pierde a la policía' },
    ],
    dialogue: [
      { who: 'rafa', line: 'Tres payasos me deben cuatro mil. Están en el callejón, jugando a ser duros.' },
      { who: 'you', line: '¿Y quieres que les pida el dinero por favor?' },
      { who: 'rafa', line: 'Quiero que se lo pidas como tú sabes pedir.' },
      { who: 'lena', line: 'Rafa, mandas al chico a un tiroteo el primer día. Muy elegante.' },
      { who: 'rafa', line: 'Lena, cariño, nadie te ha pedido opinión.' },
    ],
    outro: [
      { who: 'lena', line: 'No está mal. Tienes pulso. Eso te va a servir.' },
      { who: 'rafa', line: 'Aquí tienes. Y un consejo: cuando dispares, corre. Siempre.' },
    ],
  },
  {
    id: 'harbour_lookout',
    title: 'El mirador del puerto',
    giver: 'lena',
    district: 'Muelle Viejo',
    blurb: 'Lena wants eyes on the marina docks. Get up high, count the crates, get out clean.',
    reward: 900,
    steps: [
      { type: 'walk', to: [214, 176], radius: 20, label: 'Sube al mirador del puerto', marker: true },
      { type: 'goto', marker: 'crane', radius: 9, label: 'Fotografía la grúa desde el muelle' },
      { type: 'escape', stars: 2, label: 'Sal del puerto sin que te sigan' },
    ],
    dialogue: [
      { who: 'lena', line: 'Los de Aguilar mueven cajas de noche. Muchas cajas. Quiero saber qué hay dentro.' },
      { who: 'you', line: '¿Y por qué no lo miras tú?' },
      { who: 'lena', line: 'Porque a mí me conocen. A ti no. Todavía.' },
      { who: 'lena', line: 'Mirador del puerto, lado norte. No te acerques a las luces.' },
    ],
    outro: [
      { who: 'lena', line: 'Armas. Cajas y cajas de armas. Aguilar no está importando pescado.' },
      { who: 'lena', line: 'Esto ya no es un trabajo de cobros. Esto es otra cosa.' },
    ],
  },
  {
    id: 'the_ledger',
    title: 'El libro de Aguilar',
    giver: 'lena',
    district: 'El Faro',
    blurb: 'Aguilar keeps a ledger of every bribe in the city. It is in a safe in the lighthouse office.',
    reward: 1400,
    steps: [
      { type: 'drive', to: [286, -104], radius: 14, label: 'Conduce hasta el faro' },
      { type: 'collect', count: 3, label: 'Recoge los documentos del faro', marker: true },
      { type: 'kill', count: 4, label: 'Elimina a los guardias de Aguilar' },
      { type: 'escape', stars: 3, label: 'Escapa con el libro' },
    ],
    dialogue: [
      { who: 'lena', line: 'El faro de El Faro. Sí, se llama igual. Aguilar tiene ahí su oficina y su caja fuerte.' },
      { who: 'you', line: '¿Y qué hay en la caja fuerte, además de dinero?' },
      { who: 'lena', line: 'Un libro. Nombres, fechas, cuentas. Con eso, media ciudad nos debe un favor.' },
      { who: 'marisol', line: 'Asegúrate de que no te vean la cara. Aguilar tiene memoria.' },
    ],
    outro: [
      { who: 'lena', line: 'Déjame ver... Madre mía. Hay un juez en esta lista. Un juez.' },
      { who: 'marisol', line: 'Entonces ya no podemos parar. Lo sabe, y va a venir a por nosotros.' },
    ],
  },
  {
    id: 'convoy',
    title: 'El convoy de la autopista',
    giver: 'marisol',
    district: 'Cerro Azul',
    blurb: 'Aguilar is moving the ledger\'s backup through Cerro Azul. Stop the convoy, take the case.',
    reward: 2200,
    steps: [
      { type: 'drive', to: [-248, 236], radius: 22, label: 'Intercepta el convoy en Cerro Azul' },
      { type: 'kill', count: 5, label: 'Neutraliza la escolta' },
      { type: 'goto', marker: 'convoy', radius: 8, label: 'Recoge el maletín del convoy' },
      { type: 'escape', stars: 4, label: 'Desaparece con el maletín' },
    ],
    dialogue: [
      { who: 'marisol', line: 'Tres furgonetas, dos motos, y un tipo con muy mala cara en la última.' },
      { who: 'you', line: '¿Y qué quieres que haga, que les pida la hora?' },
      { who: 'marisol', line: 'Quiero que pares la primera. El resto se para solo.' },
      { who: 'marisol', line: 'Y si sale mal, no me llames. Llama a Lena.' },
    ],
    outro: [
      { who: 'marisol', line: 'Lo tienes. Aguilar se va a quedar sin respaldo y sin uñas.' },
      { who: 'lena', line: 'Marisol, esto es tu guerra. Pero te va a costar.' },
    ],
  },
  {
    id: 'marina_heist',
    title: 'El golpe del muelle',
    giver: 'lena',
    district: 'Muelle Viejo',
    blurb: 'Aguilar\'s boat, the Estrella Negra, is loaded and waiting. Take it, and take his money.',
    reward: 6000,
    steps: [
      { type: 'drive', to: [232, 128], radius: 18, label: 'Llega al muelle al anochecer' },
      { type: 'kill', count: 6, label: 'Toma el muelle (6 guardias)' },
      { type: 'collect', count: 5, label: 'Carga el dinero en la furgoneta' },
      { type: 'escape', stars: 5, label: 'Huye de Puerto Azul' },
    ],
    dialogue: [
      { who: 'lena', line: 'Esta es la última. Después de esto, o somos ricos o estamos muertos.' },
      { who: 'you', line: 'Qué optimista.' },
      { who: 'lena', line: 'Realista. Aguilar tiene a media comisaría en nómina. No va a venir la mitad.' },
      { who: 'rafa', line: 'Va a venir toda. Por eso llevas el músculo.' },
      { who: 'marisol', line: 'Y por eso voy yo. Alguien tiene que conducir.' },
    ],
    outro: [
      { who: 'lena', line: 'Estrella Negra, fuera del puerto. Mira atrás, mira la ciudad.' },
      { who: 'you', line: '¿Y ahora qué?' },
      { who: 'lena', line: 'Ahora, por primera vez, decidimos nosotros.' },
      { who: 'rafa', line: 'Yo voto por una isla. Con palmeras. Y sin policía.' },
    ],
  },
];

// A few side jobs that are always available, shown in the phone's activity list.
export const ACTIVITIES = [
  { id: 'street_race', title: 'Carrera callejera', where: 'Vista Mar', blurb: 'Three laps around the Vista Mar circuit. Beat the pack.', reward: 800 },
  { id: 'rampage', title: 'Locura armada', where: 'Barrio del Sol', blurb: 'Survive two minutes of pure chaos with a shotgun.', reward: 1200 },
  { id: 'taxi', title: 'Taxi pirata', where: 'Puerto Azul', blurb: 'Take fares across the city without wrecking the car.', reward: 400 },
  { id: 'stunt', title: 'Saltos de rampa', where: 'Playa Dorada', blurb: 'Hit all four ramps on the beach road before the timer runs out.', reward: 600 },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

export function speakerName(who) {
  return CAST[who]?.name ?? who;
}

export function speakerShort(who) {
  return CAST[who]?.short ?? who.toUpperCase();
}

export function speakerColor(who) {
  return CAST[who]?.color ?? '#f6ecd8';
}
