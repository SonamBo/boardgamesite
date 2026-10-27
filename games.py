"""Every game on the site, and the categories they're grouped into.

Read by build.py (home page shelves, category pages, structured data, the account page's list)
and tools/make_share_images.py (share images and thumbnails).

Adding a game: add it here, write its art in tools/make_share_images.py and run that script,
then add src/pages/<slug>.html and src/pages/learn/<slug>.html.

Fields:
  name     short name used on cards and in menus
  full     the full name for search engines (structured data)
  cat      category key (see CATS)
  genre    genres for structured data
  blurb    one line for "more games" strips
  card     two lines for the game's card on the home and category pages
  chips    up to three short labels on the card
  friend   True if two people can play on one device (it then also appears under Multiplayer)
  record   "wld" (wins/losses/draws against the computer) or "solo" (games played/won, best time or score)
  key      the browser-storage key holding the player's record (synced to their account)
  minutes  typical length of one game, for the card
"""

CATS = {
    "strategy": {
        "name": "Strategy",
        "icon": "cat-strategy.svg",
        "title": "Strategy Games – Play Free Online | BoardGameSite",
        "description": "Free strategy board games in your browser: Checkers, Reversi, Four in a Row and more on the way. Play the computer at three levels or a friend on one device.",
        "intro": "Classic two-player board games where every move counts. Play the computer at three levels, or hand the device to a friend.",
    },
    "cards": {
        "name": "Cards",
        "icon": "cat-cards.svg",
        "title": "Card Games – Play Free Online | BoardGameSite",
        "description": "Free card games in your browser: Solitaire and more classics. No download, no sign-up, unlimited undo.",
        "intro": "Solitaire and the classic card games, dealt in one click.",
    },
    "puzzles": {
        "name": "Puzzles",
        "icon": "cat-puzzles.svg",
        "title": "Puzzle Games – Play Free Online | BoardGameSite",
        "description": "Free puzzle games in your browser. Logic, number and tile puzzles to play in a few minutes, on any device.",
        "intro": "Logic, number and tile puzzles for a quick break.",
    },
    "dice": {
        "name": "Dice",
        "icon": "cat-dice.svg",
        "title": "Dice Games – Play Free Online | BoardGameSite",
        "description": "Free dice games in your browser. Roll, push your luck and outscore the computer, on any device.",
        "intro": "Roll the dice, push your luck and beat the computer.",
    },
    "word": {
        "name": "Word",
        "icon": "cat-word.svg",
        "title": "Word Games – Play Free Online | BoardGameSite",
        "description": "Free word games in your browser. Guess, search and unscramble words on any device.",
        "intro": "Guess, find and unscramble words.",
    },
    "multiplayer": {
        "name": "Multiplayer",
        "icon": "cat-multiplayer.svg",
        "title": "Two-Player Games – Play a Friend Free | BoardGameSite",
        "description": "Free two-player board games: play a friend on one phone, tablet or computer: Checkers, Reversi, Four in a Row and more.",
        "intro": "Two players, one device. Pick a game, choose “2 players” and take turns. Online play with friends is coming next.",
    },
}

GAMES = {
    "solitaire": {
        "name": "Solitaire",
        "full": "Klondike Solitaire",
        "cat": "cards",
        "genre": ["Card game", "Solitaire"],
        "blurb": "Classic Klondike with draw 1 or draw 3 and unlimited undo.",
        "card": "Classic Klondike. Build each suit from Ace to King, with draw 1 or draw 3 and unlimited undo.",
        "chips": ["Cards", "Single player", "5 min"],
        "friend": False,
        "record": "solo",
        "key": "bgs-sol-stats",
    },
    "checkers": {
        "name": "Checkers",
        "full": "Checkers",
        "cat": "strategy",
        "genre": ["Board game", "Strategy"],
        "blurb": "Jump pieces, crown kings and clear the board.",
        "card": "Jump your opponent’s pieces, crown kings and clear the board. Captures are compulsory.",
        "chips": ["Strategy", "vs Computer", "2 players"],
        "friend": True,
        "record": "wld",
        "key": "bgs-ck-score",
    },
    "reversi": {
        "name": "Reversi",
        "full": "Reversi",
        "cat": "strategy",
        "genre": ["Board game", "Strategy"],
        "blurb": "Trap discs between yours to flip them to your colour.",
        "card": "Trap your opponent’s discs between yours to flip them. Most discs when the board fills wins.",
        "chips": ["Strategy", "vs Computer", "2 players"],
        "friend": True,
        "record": "wld",
        "key": "bgs-rv-score",
    },
    "four-in-a-row": {
        "name": "Four in a Row",
        "full": "Four in a Row",
        "cat": "strategy",
        "genre": ["Board game", "Strategy", "Puzzle"],
        "blurb": "Drop discs and line up four, plus a new daily puzzle.",
        "card": "Drop your discs and line up four before your opponent: across, down or diagonally. Plus a daily puzzle.",
        "chips": ["Strategy", "vs Computer", "2 players"],
        "friend": True,
        "record": "wld",
        "key": "bgs-c4-score",
    },
}


def players(g):
    """schema.org playMode for a game."""
    return ["SinglePlayer", "MultiPlayer"] if g["friend"] else "SinglePlayer"


def in_cat(cat):
    """Games shown on a category page, in display order."""
    if cat == "multiplayer":
        return [(s, g) for s, g in GAMES.items() if g["friend"]]
    return [(s, g) for s, g in GAMES.items() if g["cat"] == cat]
