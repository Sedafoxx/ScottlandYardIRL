export const STAR_COLLECTION_RADIUS = 20;
const R = STAR_COLLECTION_RADIUS;
export const STAR_TRADE_COST = 3;
export const STAR_VOTE_DURATION_MS = 3 * 60 * 1000;

// Coords marked (est) may need field verification
export const STARS = [
  {
    id: 0,
    station: 'Wien Mitte',
    clue: { type: 'text', text: 'Was ein cutes Baby. Doch TIM WEINTE nur.' },
    lat: 48.20676065747161, lng: 16.38372635467606, // das süßes Kind — exact
    radius: R,
  },
  {
    id: 1,
    station: 'Praterstern',
    clue: { type: 'image', imageUrl: '/star-clues/pink-mug.jpg', caption: 'So, jetzt kommt ein ERNSTER PART:' },
    lat: 48.21750711441079, lng: 16.390295382490727, // AIDA Praterstern — exact
    radius: R,
  },
  {
    id: 2,
    station: 'Schottentor',
    clue: { type: 'text', text: 'Wo tief etwas verborgen war, stieg ein Gott empor, und er brachte unendliches Gold hervor.' },
    lat: 48.21613, lng: 16.36056, // Votivkirche Haupteingang
    radius: R,
  },
  {
    id: 3,
    station: 'Herrengasse',
    clue: { type: 'text', text: 'Ich bin nur von Männern umgeben... yeah, ich ertrage sämtliches Leid dieser Welt.' },
    lat: 48.20858, lng: 16.37065, // Pestsäule, Graben
    radius: R,
  },
  {
    id: 4,
    station: 'Westbahnhof',
    clue: { type: 'text', text: 'Im Osten geht die Sonne auf. Im Süden nimmt sie ihren Lauf. Im Westen wird sie untergehn. Im Norden... kann man über Wien sehn.' },
    lat: 48.19579854278985, lng: 16.338031879060992, // IKEA Westbahnhof — exact
    radius: 30,
  },
  {
    id: 5,
    station: 'Winckelmannstraße',
    clue: { type: 'image', imageUrl: '/star-clues/tree-clue.png', caption: null },
    lat: 48.18982, lng: 16.31659, // Feenbaum — exact
    radius: R,
  },
  {
    id: 6,
    station: 'Schloss Schönbrunn',
    clue: { type: 'text', text: '🎵 „Am Brunnen vor dem Tore, da steht ein Lindenbaum..."' },
    lat: 48.181278401764736, lng: 16.310326912014034, // Neptunbrunnen — exact
    radius: R,
  },
];
