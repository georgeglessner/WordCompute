import {data} from './wordlist.js';
import {validWords} from './validwords.js';
import {
    COLS, ROWS, evaluate, fitsSlot, isLetter, isLetterSlot, keyMarks, letterValue, msUntilNextSeed,
    puzzleFor, score, seedFor, wordOf,
} from './game.js';

const seed = seedFor();
const puzzle = puzzleFor(seed, data);
const dictionary = new Set([...data, ...validWords]);

const STATE_KEY = `gameState-${seed}`;
const STATS_KEY = 'stats';
const HELP_KEY = 'helpSeen';
const DISPLAY = {'+': '+', '-': '−', '*': '×'};
const EMOJI = {correct: '🟩', present: '🟨', absent: '⬛'};
const WIN_WORDS = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

const $ = (id) => document.getElementById(id);
const blankDraft = () => Array(COLS).fill('');

const storage = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Private mode or full storage: the game still works for this session.
        }
    },
};

const isWellFormed = (row) => typeof row === 'string' && row.length === COLS && [...row].every(fitsSlot);

// Pre-redesign saves stored rendered tiles; recover the submitted rows from their colour classes.
function fromLegacy(saved) {
    const cells = Array.isArray(saved.gridState) ? saved.gridState : [];
    const rowAt = (r) => cells.slice(r * COLS, (r + 1) * COLS);
    const guesses = [];
    for (let r = 0; r < ROWS; r++) {
        const row = rowAt(r);
        if (!/green|yellow|grey/.test(row[0]?.className ?? '')) break;
        guesses.push(row.map((cell) => cell.text ?? '').join(''));
    }
    const draft = rowAt(guesses.length).map((cell, i) => (fitsSlot(cell?.text ?? '', i) ? cell.text : ''));
    return {guesses, draft};
}

function loadState() {
    const saved = storage.get(STATE_KEY) ?? {};
    const {guesses = [], draft = []} = saved.v === 2 ? saved : fromLegacy(saved);
    const state = {
        guesses: guesses.filter(isWellFormed).slice(0, ROWS),
        draft: blankDraft().map((_, i) => (fitsSlot(draft[i] ?? '', i) ? draft[i] : '')),
        cursor: 0,
    };
    state.cursor = Math.max(0, state.draft.findIndex((ch) => !ch));
    return state;
}

const state = loadState();

function status() {
    if (state.guesses.at(-1) === puzzle.solution) return 'won';
    return state.guesses.length >= ROWS ? 'lost' : 'playing';
}

function save() {
    storage.set(STATE_KEY, {v: 2, guesses: state.guesses, draft: state.draft});
}

function pruneOldSaves() {
    try {
        Object.keys(localStorage)
            .filter((key) => key.startsWith('gameState-') && key !== STATE_KEY)
            .forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem('lastSeed');
    } catch {
        // Storage unavailable.
    }
}

function loadStats() {
    return {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, gamesPlayed: 0, wins: 0, currentStreak: 0, maxStreak: 0, ...storage.get(STATS_KEY)};
}

const streakBroken = (stats) => stats.lastPlayedSeed != null && stats.lastPlayedSeed < seed - 1;

function recordResult(result) {
    const stats = loadStats();
    if (stats.lastPlayedSeed === seed) return;
    if (streakBroken(stats)) stats.currentStreak = 0;
    stats.gamesPlayed++;
    if (result === 'won') {
        stats[state.guesses.length]++;
        stats.wins++;
        stats.currentStreak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    } else {
        stats.currentStreak = 0;
    }
    stats.lastPlayedSeed = seed;
    storage.set(STATS_KEY, stats);
}

// Board and keyboard are built once; render() only updates them.
const board = $('board');
const rows = Array.from({length: ROWS}, (_, r) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'row');
    const tiles = Array.from({length: COLS}, (_, c) => {
        const tile = document.createElement('div');
        tile.className = `tile ${isLetterSlot(c) ? 'letter-slot' : 'op-slot'}`;
        tile.setAttribute('role', 'gridcell');
        tile.addEventListener('click', () => r === state.guesses.length && moveTo(c));
        row.append(tile);
        return tile;
    });
    const value = document.createElement('div');
    value.className = 'row-value';
    row.append(value);
    board.append(row);
    return {row, tiles, value};
});

const KEY_ROWS = [
    [...'QWERTYUIOP'],
    [...'ASDFGHJKL'],
    ['Enter', ...'ZXCVBNM', 'Backspace'],
    ['+', '-', '*'],
];
const keyboard = $('keyboard');
const keys = {};
for (const keyRow of KEY_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'key-row';
    for (const key of keyRow) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.key = key;
        if (key === 'Enter') {
            button.textContent = 'Enter';
            button.className = 'key wide';
        } else if (key === 'Backspace') {
            button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>';
            button.className = 'key wide';
            button.setAttribute('aria-label', 'Backspace');
        } else if (isLetter(key)) {
            button.innerHTML = `${key}<sub>${letterValue(key)}</sub>`;
            button.className = 'key';
            button.setAttribute('aria-label', `${key}, value ${letterValue(key)}`);
        } else {
            button.textContent = DISPLAY[key];
            button.className = 'key op';
        }
        keys[key] = button;
        rowEl.append(button);
    }
    keyboard.append(rowEl);
}
keyboard.addEventListener('mousedown', (event) => event.preventDefault());
keyboard.addEventListener('click', (event) => {
    const key = event.target.closest('[data-key]')?.dataset.key;
    if (key) press(key);
});

function fillTile(tile, ch) {
    if (isLetter(ch)) tile.innerHTML = `${ch}<sub>${letterValue(ch)}</sub>`;
    else tile.textContent = DISPLAY[ch] ?? '';
}

function render({reveal = -1} = {}) {
    const current = status();
    const playing = current === 'playing';
    rows.forEach(({row, tiles, value}, r) => {
        const guess = state.guesses[r];
        const isDraft = playing && r === state.guesses.length;
        const chars = guess ?? (isDraft ? state.draft : blankDraft());
        const marks = guess ? score(guess, puzzle.solution) : [];
        row.classList.toggle('active', isDraft);
        tiles.forEach((tile, c) => {
            fillTile(tile, chars[c]);
            tile.classList.remove('correct', 'present', 'absent', 'filled', 'cursor', 'reveal');
            if (marks[c]) tile.classList.add(marks[c]);
            if (chars[c]) tile.classList.add('filled');
            if (isDraft && c === state.cursor) tile.classList.add('cursor');
            if (r === reveal) {
                tile.style.animationDelay = `${c * 90}ms`;
                tile.classList.add('reveal');
            }
        });
        const complete = guess ?? (isDraft && state.draft.every(Boolean) ? state.draft.join('') : null);
        const total = complete ? String(evaluate(complete)) : '';
        value.textContent = total;
        value.classList.toggle('long', total.length > 5);
        value.classList.toggle('preview', !guess);
        value.classList.toggle('hit', Boolean(guess) && evaluate(guess) === puzzle.target);
        row.setAttribute('aria-label', guess ? `Guess ${r + 1}: ${guess}, value ${evaluate(guess)}` : `Row ${r + 1}`);
    });

    const marks = keyMarks(state.guesses, puzzle.solution);
    for (const [key, button] of Object.entries(keys)) {
        button.classList.remove('correct', 'present', 'absent', 'off');
        if (marks[key]) button.classList.add(marks[key]);
        if (key.length === 1 && playing && !fitsSlot(key, state.cursor)) button.classList.add('off');
    }
    keyboard.classList.toggle('done', !playing);
}

function moveTo(col) {
    if (status() !== 'playing') return;
    state.cursor = Math.min(Math.max(col, 0), COLS - 1);
    render();
}

function type(ch) {
    if (status() !== 'playing') return;
    if (!fitsSlot(ch, state.cursor)) {
        toast(isLetterSlot(state.cursor) ? 'A letter goes here' : 'An operator goes here');
        shake();
        return;
    }
    state.draft[state.cursor] = ch;
    state.cursor = Math.min(state.cursor + 1, COLS - 1);
    save();
    render();
}

function erase() {
    if (status() !== 'playing') return;
    if (!state.draft[state.cursor] && state.cursor > 0) state.cursor--;
    state.draft[state.cursor] = '';
    save();
    render();
}

function submit() {
    if (status() !== 'playing') return;
    if (!state.draft.every(Boolean)) return reject('Not enough letters and operators');
    const guess = state.draft.join('');
    if (!dictionary.has(wordOf(guess).toLowerCase())) return reject('Not in word list');

    state.guesses.push(guess);
    state.draft = blankDraft();
    state.cursor = 0;
    const result = status();
    if (result !== 'playing') recordResult(result);
    save();
    render({reveal: state.guesses.length - 1});

    const revealMs = COLS * 90 + 300;
    if (result === 'won') setTimeout(() => toast(WIN_WORDS[state.guesses.length - 1]), revealMs);
    if (result === 'lost') setTimeout(() => toast(formatRow(puzzle.solution), 4000), revealMs);
    if (result !== 'playing') setTimeout(() => openStats(), revealMs + 1200);
}

function press(key) {
    if (key === 'Enter') submit();
    else if (key === 'Backspace') erase();
    else type(key);
}

function reject(message) {
    toast(message);
    shake();
}

function shake() {
    const row = rows[state.guesses.length]?.row;
    if (!row) return;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
}

function toast(message, duration = 1600) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    $('toasts').prepend(el);
    setTimeout(() => el.remove(), duration);
}

const formatRow = (row) => [...row].map((ch) => DISPLAY[ch] ?? ch).join(' ');

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    const actions = {
        Enter: submit,
        Backspace: erase,
        Delete: erase,
        ArrowLeft: () => moveTo(state.cursor - 1),
        ArrowRight: () => moveTo(state.cursor + 1),
        Home: () => moveTo(0),
        End: () => moveTo(COLS - 1),
    };
    if (actions[key]) actions[key]();
    else if (isLetter(key) || key in DISPLAY) type(key);
    else return;
    event.preventDefault();
});

function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
}

for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
        const box = dialog.getBoundingClientRect();
        const outside = event.clientX < box.left || event.clientX > box.right
            || event.clientY < box.top || event.clientY > box.bottom;
        if (outside && event.target === dialog) dialog.close();
    });
}

$('help-button').addEventListener('click', () => openDialog($('help-modal')));
$('stats-button').addEventListener('click', () => openStats());
$('help-modal').addEventListener('close', () => storage.set(HELP_KEY, true));

let countdownTimer;

function openStats() {
    renderStats();
    openDialog($('stats-modal'));
    clearInterval(countdownTimer);
    if (status() !== 'playing') {
        tick();
        countdownTimer = setInterval(tick, 1000);
    }
}

$('stats-modal').addEventListener('close', () => clearInterval(countdownTimer));

function tick() {
    if (seedFor() !== seed) location.reload();
    const total = Math.max(0, Math.ceil(msUntilNextSeed() / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    $('countdown').textContent = `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

function renderStats() {
    const stats = loadStats();
    const current = status();
    $('games-played').textContent = stats.gamesPlayed;
    $('win-percentage').textContent = stats.gamesPlayed ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
    $('current-streak').textContent = streakBroken(stats) ? 0 : stats.currentStreak;
    $('max-streak').textContent = stats.maxStreak;

    const counts = Array.from({length: ROWS}, (_, i) => stats[i + 1] || 0);
    const max = Math.max(1, ...counts);
    $('distribution').replaceChildren(...counts.map((count, i) => {
        const line = document.createElement('div');
        line.className = 'bar-line';
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.classList.toggle('today', current === 'won' && state.guesses.length === i + 1);
        bar.style.width = `${Math.max(8, (count / max) * 100)}%`;
        bar.textContent = count;
        line.append(Object.assign(document.createElement('span'), {textContent: i + 1}), bar);
        return line;
    }));

    const message = $('result-message');
    message.hidden = current === 'playing';
    message.textContent = current === 'won'
        ? `Solved in ${state.guesses.length}/${ROWS}: ${formatRow(puzzle.solution)}`
        : `The answer was ${formatRow(puzzle.solution)} = ${puzzle.target}`;
    $('stats-footer').hidden = current === 'playing';
}

function shareText() {
    const tally = status() === 'won' ? state.guesses.length : 'X';
    const grid = state.guesses.map((guess) => score(guess, puzzle.solution).map((mark) => EMOJI[mark]).join('')).join('\n');
    return `WordCompute #${seed} ${tally}/${ROWS}\nTarget ${puzzle.target}\n\n${grid}\n\nhttps://wordcompute.com`;
}

$('share-button').addEventListener('click', async () => {
    const text = shareText();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try {
            await navigator.share({text});
            return;
        } catch (error) {
            if (error.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        toast('Copied results to clipboard');
    } catch {
        toast('Could not copy results');
    }
});

// A tab left open overnight should move on to the new puzzle.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && seedFor() !== seed) location.reload();
});

$('target-number').textContent = puzzle.target;
$('puzzle-number').textContent = `#${seed}`;
pruneOldSaves();
save();
render();
if (status() === 'playing' && !storage.get(HELP_KEY) && !storage.get(STATS_KEY)) openDialog($('help-modal'));
