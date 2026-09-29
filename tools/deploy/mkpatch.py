import difflib, hashlib, sys, re
def md5(s): return hashlib.md5(s.encode('utf-8')).hexdigest()
def patch_sql(path, old, new, ctx=2):
    a = old.splitlines(keepends=True); b = new.splitlines(keepends=True)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = [op for op in sm.get_opcodes() if op[0] != 'equal']
    # merge nearby changes whose context windows would overlap
    merged = []
    for tag, i1, i2, j1, j2 in ops:
        if merged and i1 - merged[-1][1] <= 2 * ctx + 1:
            m = merged[-1]; merged[-1] = (m[0], i2, m[2], j2)
        else:
            merged.append((i1, i2, j1, j2))
    reps = []
    for i1, i2, j1, j2 in merged:
        k = ctx
        while True:
            s1, e1 = max(0, i1-k), min(len(a), i2+k)
            s2, e2 = max(0, j1-k), min(len(b), j2+k)
            o = ''.join(a[s1:e1]); n = ''.join(b[s2:e2])
            if o and old.count(o) == 1: break
            k += 1
            if k > 60: raise SystemExit('cannot make unique')
        reps.append((o, n))
    # apply from the end of the file backwards, checking uniqueness at apply time
    cur = old
    applied = []
    for o, n in reversed(reps):
        if cur.count(o) != 1:
            raise SystemExit(f'not unique at apply time in {path}')
        cur = cur.replace(o, n); applied.append((o, n))
    assert cur == new, 'result mismatch'
    tags = []
    body = []
    for idx, (o, n) in enumerate(applied):
        for t in (f'$o{idx}$', f'$n{idx}$'):
            assert t not in o and t not in n
        body.append(f"  n := replace(n, $o{idx}${o}$o{idx}$, $n{idx}${n}$n{idx}$);")
    sql = (f"do $do$\ndeclare c text; n text;\nbegin\n"
           f"  select content into c from public.app_sources where path = '{path}';\n"
           f"  if md5(c) <> '{md5(old)}' then raise exception 'base md5 mismatch for {path}: %', md5(c); end if;\n"
           f"  n := c;\n" + "\n".join(body) + "\n"
           f"  if md5(n) <> '{md5(new)}' then raise exception 'result md5 mismatch for {path}: %', md5(n); end if;\n"
           f"  update public.app_sources set content = n, updated_at = now() where path = '{path}';\n"
           f"end $do$;\n")
    assert '$do$' not in old and '$do$' not in new
    return sql, len(applied)
if __name__ == '__main__':
    base, src, name, out = sys.argv[1:5]
    old = open(f'{base}/{name}', encoding='utf-8').read()
    new = open(f'{src}/{name}', encoding='utf-8').read()
    sql, k = patch_sql('src/' + name, old, new)
    open(out, 'w', encoding='utf-8').write(sql)
    print(name, 'hunks', k, 'sql bytes', len(sql.encode()), 'old', md5(old), 'new', md5(new))
