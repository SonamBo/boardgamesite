import random, json, sys
from collections import deque
random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
D = [(0,1),(0,-1),(1,0),(-1,0)]

def reach(floor, boxes, start):
    seen = {start}; q = deque([start])
    while q:
        r,c = q.popleft()
        for dr,dc in D:
            n = (r+dr,c+dc)
            if n in floor and n not in boxes and n not in seen:
                seen.add(n); q.append(n)
    return seen

def dead_squares(floor, goals):
    # squares from which a box can never reach a goal (pull-reachability from goals)
    ok = set()
    q = deque(goals); ok |= set(goals)
    while q:
        r,c = q.popleft()
        for dr,dc in D:
            b = (r+dr,c+dc); p = (r+2*dr,c+2*dc)
            if b in floor and p in floor and b not in ok:
                ok.add(b); q.append(b)
    return floor - ok

def solve(floor, goals, boxes, player, limit=40000):
    dead = dead_squares(floor, set(goals))
    goals = frozenset(goals)
    def key(bx, pl):
        reg = reach(floor, bx, pl)
        return (bx, min(reg)), reg
    start_b = frozenset(boxes)
    k, reg = key(start_b, player)
    q = deque([(start_b, reg, 0)]); seen = {k}
    while q:
        bx, reg, d = q.popleft()
        if bx == goals: return d
        for (r,c) in bx:
            for dr,dc in D:
                stand = (r-dr,c-dc); to = (r+dr,c+dc)
                if stand in reg and to in floor and to not in bx and to not in dead:
                    nb = (bx - {(r,c)}) | {to}
                    nk, nreg = key(nb, (r,c))
                    if nk in seen: continue
                    seen.add(nk)
                    if len(seen) > limit: return None
                    q.append((nb, nreg, d+1))
    return None

def make(h, w, nbox, wall_p):
    floor = set()
    for r in range(1,h+1):
        for c in range(1,w+1):
            if random.random() > wall_p: floor.add((r,c))
    # keep the largest connected piece
    best = set()
    left = set(floor)
    while left:
        s = left.pop(); comp = reach(floor, set(), s); left -= comp
        if len(comp) > len(best): best = comp
    floor = best
    if len(floor) < nbox*4 + 6: return None
    cells = list(floor)
    goals = random.sample(cells, nbox)
    # pull boxes backwards from the goals with random moves
    boxes = set(goals)
    player = random.choice([c for c in cells if c not in boxes])
    for _ in range(random.randint(60, 220)):
        reg = reach(floor, boxes, player)
        pulls = []
        for (r,c) in boxes:
            for dr,dc in D:
                p = (r+dr,c+dc); p2 = (r+2*dr,c+2*dc)
                if p in reg and p2 in floor and p2 not in boxes:
                    pulls.append(((r,c),p,p2))
        if not pulls: break
        b,p,p2 = random.choice(pulls)
        boxes.remove(b); boxes.add(p); player = p2
    if boxes & set(goals) == boxes: return None
    if sum(1 for b in boxes if b in goals) > 0 and nbox <= 2: return None
    d = solve(floor, goals, boxes, player)
    if d is None: return None
    return floor, goals, boxes, player, d

def render(floor, goals, boxes, player):
    rows = [r for r,_ in floor]; cols = [c for _,c in floor]
    r0,r1,c0,c1 = min(rows)-1, max(rows)+1, min(cols)-1, max(cols)+1
    out = []
    for r in range(r0, r1+1):
        line = ''
        for c in range(c0, c1+1):
            p = (r,c)
            if p not in floor:
                # wall only if next to floor, else outside (space)
                near = any((r+dr,c+dc) in floor for dr in (-1,0,1) for dc in (-1,0,1))
                line += '#' if near else ' '
            elif p == player: line += '+' if p in goals else '@'
            elif p in boxes: line += '*' if p in goals else '$'
            elif p in goals: line += '.'
            else: line += ' '
        out.append(line.rstrip())
    return out

found = {2: [], 3: [], 4: []}
tries = 0
import time
T0=time.time()
while time.time()-T0 < 240:
    tries += 1
    nb = random.choice([2,3,4])
    h, w = random.randint(5,7), random.randint(5,8)
    res = make(h, w, nb, random.uniform(0.12, 0.28))
    if not res: continue
    floor, goals, boxes, player, d = res
    if d < 6 + nb * 2: continue
    found[nb].append((d, render(floor, goals, boxes, player)))
for k in found:
    found[k].sort()
    print(k, len(found[k]), [d for d,_ in found[k]])
json.dump({k: v for k, v in found.items()}, open('/home/claude/work/boxlevels-%s.json' % sys.argv[1],'w'))
