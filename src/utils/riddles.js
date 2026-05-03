import { CHALLENGES } from '../data/challenges';
import { PUZZLES, WORDLE_WORDS, EQUATION_PUZZLES } from '../data/puzzles';
import { DIFFICULTY_CONFIG } from './hints';

export const RIDDLE_COUNT = 24; // 12 photo + 12 logic, interleaved

function shuffleSlice(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function randomCode(length, range) {
  return Array.from({ length }, () => Math.floor(Math.random() * range) + 1).join('');
}

export function buildRiddles() {
  const photoEasy   = shuffleSlice(CHALLENGES.easy,   12);
  const photoMedium = shuffleSlice(CHALLENGES.medium, 12);
  const photoHard   = shuffleSlice(CHALLENGES.hard,   12);

  const photoSlots = Array.from({ length: 12 }, (_, i) => ({
    type: 'photo',
    options: [
      { difficulty: 'easy',   reduction: DIFFICULTY_CONFIG.easy.reduction,   ...photoEasy[i]   },
      { difficulty: 'medium', reduction: DIFFICULTY_CONFIG.medium.reduction,  ...photoMedium[i] },
      { difficulty: 'hard',   reduction: DIFFICULTY_CONFIG.hard.reduction,    ...photoHard[i]   },
    ],
  }));

  const puzzleEasy   = shuffleSlice(PUZZLES.easy,   3);
  const puzzleMedium = shuffleSlice(PUZZLES.medium, 3);
  const puzzleHard   = shuffleSlice(PUZZLES.hard,   3);

  const mkPuzzleOpt = (p, diff) => ({
    difficulty: diff,
    question: p.question,
    answer: p.answer,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const puzzleSlots = Array.from({ length: 3 }, (_, i) => ({
    type: 'puzzle',
    options: {
      easy:   mkPuzzleOpt(puzzleEasy[i],   'easy'),
      medium: mkPuzzleOpt(puzzleMedium[i], 'medium'),
      hard:   mkPuzzleOpt(puzzleHard[i],   'hard'),
    },
  }));

  const wordleEasy   = shuffleSlice(WORDLE_WORDS.easy,   3);
  const wordleMedium = shuffleSlice(WORDLE_WORDS.medium, 3);
  const wordleHard   = shuffleSlice(WORDLE_WORDS.hard,   3);

  const mkWordleOpt = (w, diff) => ({
    difficulty: diff,
    answer: w.answer,
    hint: w.hint,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const wordleSlots = Array.from({ length: 3 }, (_, i) => ({
    type: 'wordle',
    options: {
      easy:   mkWordleOpt(wordleEasy[i],   'easy'),
      medium: mkWordleOpt(wordleMedium[i], 'medium'),
      hard:   mkWordleOpt(wordleHard[i],   'hard'),
    },
  }));

  const MASTERMIND_SETTINGS = {
    easy:   { codeLength: 3, digitRange: 4, maxAttempts: 10 },
    medium: { codeLength: 4, digitRange: 6, maxAttempts: 8 },
    hard:   { codeLength: 4, digitRange: 6, maxAttempts: 6 },
  };

  const mkMastermindOpt = (diff) => {
    const s = MASTERMIND_SETTINGS[diff];
    return {
      difficulty: diff,
      answer: randomCode(s.codeLength, s.digitRange),
      codeLength: s.codeLength,
      digitRange: s.digitRange,
      maxAttempts: s.maxAttempts,
      points: DIFFICULTY_CONFIG[diff].points,
      reduction: DIFFICULTY_CONFIG[diff].reduction,
    };
  };

  const mastermindSlots = Array.from({ length: 3 }, () => ({
    type: 'mastermind',
    options: {
      easy:   mkMastermindOpt('easy'),
      medium: mkMastermindOpt('medium'),
      hard:   mkMastermindOpt('hard'),
    },
  }));

  const equationEasy   = shuffleSlice(EQUATION_PUZZLES.easy,   3);
  const equationMedium = shuffleSlice(EQUATION_PUZZLES.medium, 3);
  const equationHard   = shuffleSlice(EQUATION_PUZZLES.hard,   3);

  const mkEquationOpt = (p, diff) => ({
    difficulty: diff,
    tiles: p.tiles,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const equationSlots = Array.from({ length: 3 }, (_, i) => ({
    type: 'equation',
    options: {
      easy:   mkEquationOpt(equationEasy[i],   'easy'),
      medium: mkEquationOpt(equationMedium[i], 'medium'),
      hard:   mkEquationOpt(equationHard[i],   'hard'),
    },
  }));

  const shuffledRiddles = [...puzzleSlots, ...wordleSlots, ...mastermindSlots, ...equationSlots]
    .sort(() => Math.random() - 0.5);
  const shuffledPhotos = [...photoSlots].sort(() => Math.random() - 0.5);

  const allSlots = [];
  for (let i = 0; i < 12; i++) {
    allSlots.push(shuffledRiddles[i]);
    allSlots.push(shuffledPhotos[i]);
  }

  const riddles = {};
  allSlots.forEach((slot, i) => { riddles[i] = slot; });
  return riddles;
}
