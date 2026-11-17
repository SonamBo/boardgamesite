# Turns trends-raw.txt into map-data.json for the video.
#   python3 tools/map-video/build-data.py
#
# Two maps:
#   top:       each country's most-searched board game (Chess included)
#   signature: each country's "signature" game: of the games it searches at least 8% as much as Chess,
#              the one it searches most compared with the world as a whole (at least 1.5x the world's rate)
#
# Some Google topics pick up searches that aren't about the game, so they are left out:
#   Dominoes (mostly Domino's Pizza, and gambling apps), Go (the word "go"), Clue (the word "clue"),
#   Tic-tac-toe (Google's doodle games), Jenga ("build" in Swahili), and Mahjong in Indonesia and
#   Timor-Leste (slot-machine games named after it). Checked against each topic's related queries.
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {'CK': 'Checkers', 'BG': 'Backgammon', 'LU': 'Ludo', 'DO': 'Dominoes', 'MJ': 'Mahjong', 'MO': 'Monopoly',
         'SC': 'Scrabble', 'GO': 'Go', 'CA': 'Carrom', 'MA': 'Mancala', 'OK': 'Okey', 'RK': 'Rummikub', 'SH': 'Shogi',
         'XQ': 'Xiangqi', 'JG': 'Janggi', 'SL': 'Snakes and Ladders', 'C4': 'Connect Four', 'BS': 'Battleship',
         'CT': 'Catan', 'JE': 'Jenga', 'CC': 'Chinese checkers', 'RV': 'Reversi', 'YA': 'Yahtzee',
         'PI': 'Pictionary', 'PC': 'Parcheesi', 'PS': 'Parchís', 'PA': 'Pachisi', 'ME': 'Mensch ärgere dich nicht',
         'CL': 'Clue', 'ST': 'Stratego', 'MM': 'Mastermind', 'CS': 'Carcassonne', 'TR': 'Ticket to Ride',
         'TT': 'Tic-tac-toe', 'OW': 'Oware', 'SM': 'Congkak', 'CH': 'Chess'}
LEFT_OUT = {'DO', 'GO', 'CL', 'TT', 'JE'}
LEFT_OUT_IN = {'ID': {'MJ'}, 'TL': {'MJ'}}
FAMILY = {'CH': 'chess', 'LU': 'ludo', 'PS': 'ludo', 'ME': 'ludo', 'PC': 'ludo', 'PA': 'ludo',
          'CK': 'checkers', 'BG': 'backgammon', 'SC': 'scrabble', 'CA': 'carrom', 'MJ': 'mahjong',
          'XQ': 'cousins', 'JG': 'cousins', 'SH': 'cousins', 'OW': 'mancala', 'SM': 'mancala', 'MA': 'mancala',
          'RK': 'rummy', 'OK': 'rummy', 'YA': 'yahtzee', 'MO': 'monopoly', 'CT': 'catan'}
MIN_SHARE, MIN_RAW, MIN_INDEX = 0.08, 3, 1.5

rows, world = {}, {}
for line in open(os.path.join(HERE, 'trends-raw.txt'), encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    code, rest = line.split('|', 1)
    if code == 'WORLD':
        world = {k: float(v) for k, v in (p.split(':') for p in rest.split(','))}
        continue
    _, games = rest.split('|')
    rows[code] = {k: (float(r), int(raw)) for k, r, raw in (p.split(':') for p in games.split(',') if p)}

top, sig = {}, {}
for code, g in rows.items():
    ok = {k: v for k, v in g.items() if k not in LEFT_OUT and k not in LEFT_OUT_IN.get(code, ())}
    best = max(ok.items(), key=lambda kv: kv[1][0], default=None)
    top[code] = best[0] if best and best[1][0] > 1 else 'CH'
    cands = [(r / max(world.get(k, 0), 0.003), k, r) for k, (r, raw) in ok.items() if r >= MIN_SHARE and raw >= MIN_RAW]
    cands.sort(reverse=True)
    if cands and cands[0][0] >= MIN_INDEX:
        x, k, r = cands[0]
        sig[code] = {'g': k, 'x': round(x, 1), 'r': round(r, 2)}

out = {'source': 'Google Trends, worldwide web search, Nov 2025 to Nov 2026, by country; Google search topics (all languages)',
       'names': NAMES, 'family': FAMILY, 'top': top, 'sig': sig}
json.dump(out, open(os.path.join(HERE, 'map-data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

from collections import Counter
print('countries', len(rows))
print('top', Counter(top.values()).most_common())
print('sig', Counter(v['g'] for v in sig.values()).most_common())
print('no signature', sorted(set(rows) - set(sig)))
for c in ['TR', 'GR', 'ES', 'DE', 'IN', 'JP', 'KR', 'CN', 'VN', 'IR', 'NG', 'GH', 'US', 'GB', 'FR', 'BR', 'MX', 'AR', 'RU', 'IT', 'NL', 'PL', 'SE', 'AU', 'CA', 'EG', 'SA', 'PK', 'ID', 'ZA', 'KE', 'CU']:
    print(c, top.get(c), sig.get(c))
