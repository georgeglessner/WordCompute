export const ROWS = 6;
export const COLS = 9;
export const OPERATORS = ['+', '-', '*'];

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.parse('2019-01-01');

export const isLetter = (ch) => ch.length === 1 && ch >= 'A' && ch <= 'Z';
export const isOperator = (ch) => OPERATORS.includes(ch);
export const isLetterSlot = (col) => col % 2 === 0;
export const fitsSlot = (ch, col) => (isLetterSlot(col) ? isLetter(ch) : isOperator(ch));
export const letterValue = (letter) => letter.charCodeAt(0) - 64;

export function seedFor(date = new Date()) {
    return Math.floor((date - EPOCH) / DAY_MS);
}

export function msUntilNextSeed(date = new Date()) {
    return EPOCH + (seedFor(date) + 1) * DAY_MS - date;
}

// Puzzle generation must stay byte-for-byte compatible with the shipped game,
// including the shuffle reusing one seed for every swap.
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function shuffle(array, seed) {
    // https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#JavaScript_Implementation
    for (let i = array.length - 1; i >= 1; i--) {
        const j = Math.floor(seededRandom(seed) * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function puzzleFor(seed, words) {
    const word = words[seed % words.length].toUpperCase();
    const ops = shuffle([...OPERATORS], seed);
    let solution = '';
    for (let i = 0; i < word.length; i++) {
        solution += word[i];
        if (i < word.length - 1) solution += ops[Math.floor(seededRandom(seed + i) * ops.length)];
    }
    return {seed, word, solution, target: evaluate(solution)};
}

export function evaluate(row) {
    let total = 0;
    let sign = 1;
    let term = letterValue(row[0]);
    for (let i = 1; i < row.length; i += 2) {
        const value = letterValue(row[i + 1]);
        if (row[i] === '*') {
            term *= value;
        } else {
            total += sign * term;
            sign = row[i] === '+' ? 1 : -1;
            term = value;
        }
    }
    return total + sign * term;
}

export const wordOf = (row) => [...row].filter(isLetter).join('');

export function score(guess, solution) {
    const marks = Array(COLS).fill('absent');
    const remaining = {};
    for (let i = 0; i < COLS; i++) {
        if (guess[i] === solution[i]) marks[i] = 'correct';
        else remaining[solution[i]] = (remaining[solution[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
        if (marks[i] === 'correct' || !remaining[guess[i]]) continue;
        marks[i] = 'present';
        remaining[guess[i]]--;
    }
    return marks;
}

const RANK = {absent: 1, present: 2, correct: 3};

export function keyMarks(guesses, solution) {
    const marks = {};
    for (const guess of guesses) {
        score(guess, solution).forEach((mark, i) => {
            const ch = guess[i];
            if (!marks[ch] || RANK[mark] > RANK[marks[ch]]) marks[ch] = mark;
        });
    }
    return marks;
}
