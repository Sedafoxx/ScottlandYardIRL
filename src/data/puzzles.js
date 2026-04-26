export const POWER_UP_RIDDLES = [
  { question: 'What has hands but cannot clap?', answer: 'CLOCK' },
  { question: 'What gets wetter the more it dries?', answer: 'TOWEL' },
  { question: 'What can you catch but not throw?', answer: 'COLD' },
  { question: 'What has teeth but cannot bite?', answer: 'COMB' },
  { question: 'What runs but never walks, has a mouth but never talks?', answer: 'RIVER' },
  { question: 'I have cities but no houses, mountains but no trees, water but no fish. What am I?', answer: 'MAP' },
  { question: 'The more you take, the more you leave behind. What am I?', answer: 'FOOTSTEPS' },
  { question: 'What comes once in a minute, twice in a moment, never in a thousand years?', answer: 'M' },
  { question: 'What is always in front of you but cannot be seen?', answer: 'FUTURE' },
  { question: 'What has a neck but no head?', answer: 'BOTTLE' },
  { question: 'What has an eye but cannot see?', answer: 'NEEDLE' },
  { question: 'What goes up but never comes down?', answer: 'AGE' },
  { question: 'What can fill a room but takes up no space?', answer: 'LIGHT' },
  { question: 'What has keys but no locks, space but no room?', answer: 'KEYBOARD' },
  { question: 'What can travel the world without moving?', answer: 'STAMP' },
];

export const WORDLE_WORDS = {
  easy: [
    { answer: 'CHASE', hint: 'What hunters do to a fugitive.' },
    { answer: 'CLOCK', hint: 'Time is ticking — what counts it?' },
    { answer: 'TRAIN', hint: 'A common escape route through Vienna.' },
    { answer: 'NIGHT', hint: 'When shadows hide the most.' },
    { answer: 'SCOUT', hint: 'To explore ahead of the group.' },
    { answer: 'TRACK', hint: 'To follow someone\'s trail.' },
    { answer: 'GHOST', hint: 'Someone who vanishes without a trace.' },
    { answer: 'MATCH', hint: 'When clue meets suspect.' },
    { answer: 'TOWER', hint: 'A tall landmark — great for a lookout.' },
    { answer: 'LIGHT', hint: 'What gives away movement in the dark.' },
    { answer: 'CATCH', hint: 'The goal of every hunter.' },
    { answer: 'TRAIL', hint: 'A path of clues left behind.' },
  ],
  medium: [
    { answer: 'FRAUD', hint: 'A crime of deception.' },
    { answer: 'QUEST', hint: 'A mission with a single objective.' },
    { answer: 'VAULT', hint: 'A place where secrets are kept locked.' },
    { answer: 'SNEAK', hint: 'To move without being seen.' },
    { answer: 'DODGE', hint: 'To avoid capture at the last second.' },
    { answer: 'HEIST', hint: 'A well-planned crime.' },
    { answer: 'BADGE', hint: 'What identifies an officer.' },
    { answer: 'PROWL', hint: 'To move stealthily through the streets.' },
    { answer: 'BLUFF', hint: 'To mislead with false confidence.' },
    { answer: 'EVADE', hint: 'To slip away from pursuit.' },
    { answer: 'ROUTE', hint: 'A planned path through the city.' },
    { answer: 'WATCH', hint: 'To observe without being noticed.' },
  ],
  hard: [
    { answer: 'KNAVE', hint: 'An untrustworthy trickster.' },
    { answer: 'RECON', hint: 'Intelligence gathering before a move.' },
    { answer: 'DECOY', hint: 'A distraction to mislead pursuers.' },
    { answer: 'ROGUE', hint: 'An agent who operates outside the rules.' },
    { answer: 'SKULK', hint: 'To lurk in the shadows.' },
    { answer: 'ALIBI', hint: 'A suspect\'s claim to innocence.' },
    { answer: 'GUILE', hint: 'Clever deception and cunning.' },
    { answer: 'TAUNT', hint: 'To provoke from a safe distance.' },
    { answer: 'COZEN', hint: 'To deceive with charm.' },
    { answer: 'MOLES', hint: 'Spies embedded in your organisation.' },
  ],
};

export const EQUATION_PUZZLES = {
  // 2 operations
  easy: [
    { tiles: ['2', '3', '4', '10', '×', '+', '='] },  // 2 × 3 + 4 = 10
    { tiles: ['3', '4', '2', '10', '×', '-', '='] },  // 3 × 4 - 2 = 10
    { tiles: ['8', '2', '3', '7', '÷', '+', '='] },   // 8 ÷ 2 + 3 = 7
    { tiles: ['12', '3', '5', '9', '÷', '+', '='] },  // 12 ÷ 3 + 5 = 9
    { tiles: ['4', '2', '3', '11', '×', '+', '='] },  // 4 × 2 + 3 = 11
    { tiles: ['6', '3', '4', '14', '×', '-', '='] },  // 6 × 3 - 4 = 14
  ],
  // 3 operations
  medium: [
    { tiles: ['3', '4', '2', '6', '8', '×', '+', '-', '='] },   // 3 × 4 + 2 - 6 = 8
    { tiles: ['2', '5', '3', '4', '9', '×', '+', '-', '='] },   // 2 × 5 + 3 - 4 = 9
    { tiles: ['20', '4', '3', '1', '7', '÷', '+', '-', '='] },  // 20 ÷ 4 + 3 - 1 = 7
    { tiles: ['3', '5', '6', '1', '10', '×', '-', '+', '='] },  // 3 × 5 - 6 + 1 = 10
    { tiles: ['2', '6', '3', '1', '14', '×', '+', '-', '='] },  // 2 × 6 + 3 - 1 = 14
    { tiles: ['3', '6', '4', '2', '12', '×', '-', '-', '='] },  // 3 × 6 - 4 - 2 = 12
  ],
  // 4 operations
  hard: [
    { tiles: ['2', '5', '3', '4', '1', '10', '×', '+', '-', '+', '='] },  // 2 × 5 + 3 - 4 + 1 = 10
    { tiles: ['4', '5', '6', '3', '2', '13', '×', '-', '-', '+', '='] },  // 4 × 5 - 6 - 3 + 2 = 13
    { tiles: ['3', '6', '5', '1', '4', '10', '×', '-', '+', '-', '='] },  // 3 × 6 - 5 + 1 - 4 = 10
    { tiles: ['2', '7', '4', '3', '5', '10', '×', '+', '-', '-', '='] },  // 2 × 7 + 4 - 3 - 5 = 10
    { tiles: ['4', '3', '5', '2', '1', '16', '×', '+', '-', '+', '='] },  // 4 × 3 + 5 - 2 + 1 = 16
    { tiles: ['2', '8', '3', '5', '6', '12', '×', '-', '+', '-', '='] },  // 2 × 8 - 3 + 5 - 6 = 12
  ],
};

export const PUZZLES = {
  easy: [
    { question: 'O, T, T, F, F, S, S, E, ?', answer: 'N' },
    { question: 'J, F, M, A, M, J, J, A, S, O, N, ?', answer: 'D' },
    { question: 'M, T, W, T, F, S, ?', answer: 'S' },
    { question: 'YLHQQD', answer: 'VIENNA' },
    { question: 'KHOOR', answer: 'HELLO' },
    { question: 'What has keys but no locks, space but no room — you can enter but never go inside?', answer: 'KEYBOARD' },
    { question: 'What gets wetter the more it dries?', answer: 'TOWEL' },
    { question: 'What has to be broken before you can use it?', answer: 'EGG' },
  ],
  medium: [
    { question: 'A, Z, B, Y, C, X, D, ?', answer: 'W' },
    { question: '1, 2, 4, 7, 11, 16, 22, ?', answer: '29' },
    { question: '2, 3, 5, 7, 11, 13, ?', answer: '17' },
    { question: '1, 3, 6, 10, 15, 21, ?', answer: '28' },
    { question: 'URYYB', answer: 'HELLO' },
    { question: 'I have hands but cannot clap. A face but no eyes. What am I?', answer: 'CLOCK' },
    { question: "I'm not alive but I grow. No lungs but I need air. No mouth but water kills me. What am I?", answer: 'FIRE' },
    { question: '1, 1, 2, 3, 5, 8, 13, 21, ?', answer: '34' },
  ],
  hard: [
    { question: '1, 11, 21, 1211, 111221, ?', answer: '312211' },
    { question: 'GSVIV', answer: 'THERE' },
    { question: 'ERVMMZ', answer: 'VIENNA' },
    { question: 'The one who makes it does not need it. The one who buys it does not want it. The one who uses it does not know it. What is it?', answer: 'COFFIN' },
    { question: 'A, B, D, G, K, P, ?', answer: 'V' },
    { question: '31, 28, 31, 30, 31, 30, ?', answer: '31' },
    { question: 'The more you remove from me, the bigger I get. What am I?', answer: 'HOLE' },
    { question: 'I have cities but no houses. Mountains but no trees. Water but no fish. What am I?', answer: 'MAP' },
  ],
};
