"""Build the player's guide: bug-survivors/GUIDE.md -> public/guide.html (shipped in the build: the title's GUIDE choice
opens it over the game, on the web and in the Android app). Markdown -> HTML with a sidebar contents list and brand art
from the kit sheets, in tools/guide_template.html. Run after editing GUIDE.md:
    uv run -q --with markdown --with beautifulsoup4 --with pillow python bug-survivors/tools/build_guide.py
"""
import base64, io, json, os, re
import markdown
from bs4 import BeautifulSoup
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
md = open(f'{ROOT}/GUIDE.md').read()
brand = json.load(open(f'{ROOT}/src/brand.json'))
HOG = {h['id']: i for i, h in enumerate(brand['hoggies'])}
CREST = {c['id']: i for i, c in enumerate(brand['crests'])}
hogs64 = Image.open(f'{ROOT}/public/assets/kit/hoggies64.png').convert('RGBA')
crests64 = Image.open(f'{ROOT}/public/assets/kit/crests64.png').convert('RGBA')


def cell(sheet, i, cols):
    im = sheet.crop(((i % cols) * 64, (i // cols) * 64, (i % cols) * 64 + 64, (i // cols) * 64 + 64))
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    b = io.BytesIO(); im.quantize(48, method=Image.Quantize.FASTOCTREE).save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


cache = {}
def hog(id_):
    if id_ not in cache: cache[id_] = cell(hogs64, HOG[id_], 16)
    return cache[id_]
def crest(id_):
    k = 'c:' + id_
    if k not in cache: cache[k] = cell(crests64, CREST[id_], 11)
    return cache[k]


body = markdown.markdown(md, extensions=['tables', 'fenced_code', 'toc', 'sane_lists'])
soup = BeautifulSoup(body, 'html.parser')

# The title and intro become the hero; drop the markdown contents list (the sidebar replaces it).
h1 = soup.find('h1')
intro = []
n = h1.find_next_sibling()
while n and n.name != 'hr':
    intro.append(n); n = n.find_next_sibling()
contents = soup.find('h2', id='contents')
for x in [contents, contents.find_next_sibling('ol')]: x.decompose()
hrs = soup.find_all('hr')
hrs[0].decompose(); hrs[1].decompose()
for x in intro: x.extract()
h1.decompose()

# Number the sections, wrap each h2 + its content in a <section>.
sections = []
for i, h2 in enumerate(soup.find_all('h2'), 1):
    kick = soup.new_tag('span', attrs={'class': 'kick'}); kick.string = f'{i:02d}'
    h2.insert(0, kick)
    sec = soup.new_tag('section', attrs={'id': h2['id']})
    del h2['id']
    h2.insert_before(sec)
    nodes = []
    s = h2
    while s is not None and not (getattr(s, 'name', None) == 'h2' and s is not h2):
        nxt = s.next_sibling
        if getattr(s, 'name', None) == 'hr': s.decompose()
        else: nodes.append(s)
        s = nxt
    for x in nodes: sec.append(x.extract())
    subs = [(h3.get('id'), h3.get_text()) for h3 in sec.find_all('h3')]
    sections.append((sec['id'], h2.get_text()[2:], subs))

# Tables scroll inside a wrapper on small screens.
for t in soup.find_all('table'):
    th = t.find('thead')
    if th and not th.get_text(strip=True): th.decompose(); t['class'] = ['kv']
    cols = len(t.find('tr').find_all(['td', 'th']))
    if cols >= 4: t['class'] = t.get('class', []) + ['wide']
    w = soup.new_tag('div', attrs={'class': 'tbl'}); t.wrap(w)

# Crest table: an icon per row (rows are in crests.ts order, which the md follows).
CREST_ORDER = re.findall(r"\{ id: '([^']+)'", open(f'{ROOT}/src/crests.ts').read())
CREST_HOG = dict(re.findall(r"\{ id: '([^']+)', desc: '[^']*', hog: '([^']+)'", open(f'{ROOT}/src/crests.ts').read().replace("\\'", '')))
ct = soup.find('section', id='crests-achievements').find('table')
for row, cid in zip(ct.find('tbody').find_all('tr'), CREST_ORDER):
    tds = row.find_all('td')
    img = soup.new_tag('img', attrs={'src': crest(cid), 'alt': '', 'class': 'ic crest'})
    tds[0].insert(0, img)
    hid = CREST_HOG.get(cid)
    if hid in HOG:
        tds[2].insert(0, soup.new_tag('img', attrs={'src': hog(hid), 'alt': '', 'class': 'ic'}))

# Signature hoggie table: a portrait per row.
SIG_ROWS = ['im-the-driver', 'wizard-1', 'wizard-4', 'self-driving', 'driving-hogzilla', 'terminator', 'reaper', 'burning-money',
            'dadd-ai-1', 'noir-1', 'x-ray', 'data-thief', 'desk-wizard', 'doc-brown', 'caveman', 'robot', 'superhero',
            'stamp-approved', 'stamp-denied', '996', 'panic', 'asleep', 'dynamite', 'angel', 'error', 'experiment', 'survey',
            'chart', 'workflows']
st = soup.find('section', id='hoggies-characters').find('table')
rows = st.find('tbody').find_all('tr')
assert len(rows) == len(SIG_ROWS), (len(rows), len(SIG_ROWS))
for row, hid in zip(rows, SIG_ROWS):
    row.find('td').insert(0, soup.new_tag('img', attrs={'src': hog(hid), 'alt': '', 'class': 'ic'}))

for pre in soup.find_all('pre'):
    pre['class'] = pre.get('class', []) + ['formula']

toc = []
for sid, title, subs in sections:
    toc.append(f'<li><a href="#{sid}" data-s="{sid}"><span class="n">{len(toc) + 1:02d}</span>{title}</a></li>')
toc_html = '\n'.join(toc)

HERO_HOGS = ['im-the-driver', 'wizard-1', 'terminator', 'driving-hogzilla', 'noir-1', 'desk-wizard', 'caveman', 'reaper', 'angel']
hero_imgs = ''.join(f'<img src="{hog(h)}" alt="" style="--i:{i}">' for i, h in enumerate(HERO_HOGS))
intro_html = ''.join(str(x) for x in intro)

html = open(f'{ROOT}/tools/guide_template.html').read()
html = html.replace('{{TOC}}', toc_html).replace('{{BODY}}', str(soup)).replace('{{INTRO}}', intro_html).replace('{{HERO}}', hero_imgs)
open(f'{ROOT}/public/guide.html', 'w').write(html)
print('ok', len(html) // 1024, 'KB', len(sections), 'sections')
