"""Generate Lucid Standard Import specs for d1 (overview) in two layouts.

Every box and arrow is defined once, in "layered" terms: the major axis runs
across the page (columns), the minor axis runs down it (bands). The "columns"
layout is the same grid transposed, so both versions carry identical content.

Style follows the reference diagram the owner picked: white boxes, 2 pt black
outlines, Inter, thin dark-grey connectors with small bold labels.

Usage: python3 generate_d1.py <out_dir>   -> writes d1-layered.json, d1-columns.json
"""

import json
import sys

BOX_W, BOX_H = 200, 80
LINE = '#3A414A'
FONT = 'font-family:Inter'

# --- content -------------------------------------------------------------
# id: (title, subtitle, major index, band index, major span)
NODES = {
    'folder': ('Project folder', '.env, config.json, manifest, AI files', 0, 1, 1),
    'screens': ('Wizard and dashboard', 'webview screens', 3, 1, 1),
    'agent': ('Agent tools (MCP)', 'the AI agent', 5, 1, 1),
    'core': ('Extension core',
             'handlers and services, driven by the catalogs '
             '(components, stacks, demo packages)', 0, 2, 9),
    'ims': ('Adobe sign-in (IMS)', None, 0, 3, 1),
    'console': ('Developer Console', 'App Builder and Runtime', 1, 3, 1),
    'mesh': ('API Mesh', None, 2, 3, 1),
    'installer': ('Data installer', 'service', 3, 3, 1),
    'commerce': ('Commerce', 'Catalog Service and ACO', 1, 4, 4),
    'github': ('GitHub', 'templates, components, the SC\'s repo', 5, 3, 1),
    'dalive': ('DA.live', 'page content', 6, 3, 1),
    'aem': ('AEM admin', 'publish and site config', 7, 3, 1),
    'live': ('Live storefront', 'aem.live', 7, 4, 2),
}

# (from, to, major index the line runs along, label, both directions)
STRAIGHT = [
    ('screens', 'core', 3, 'clicks out /<br>progress back', True),
    ('agent', 'core', 5, 'tool calls, into the<br>same handlers', False),
    ('core', 'folder', 0, 'writes project files', False),
    ('ims', 'core', 0, 'sign-in token,<br>one Adobe org', False),
    ('core', 'console', 1, 'projects, APIs, deploys /<br>app URLs back', True),
    ('core', 'mesh', 2, 'mesh definition /<br>endpoint URL back', True),
    ('core', 'installer', 3, 'datapack jobs /<br>job status back', True),
    ('core', 'commerce', 4, 'store discovery /<br>store structure back', True),
    ('github', 'core', 5, 'templates, code /<br>new repo, commits', True),
    ('core', 'dalive', 6, 'pages copied,<br>site config', False),
    ('core', 'aem', 7, 'preview, publish,<br>site registration', False),
    ('live', 'core', 8, 'template pages<br>read for copying', False),
    ('console', 'commerce', 1, 'apps install,<br>receive events', False),
    ('mesh', 'commerce', 2, 'storefront<br>queries', False),
    ('installer', 'commerce', 3, 'sample products,<br>customers', False),
    ('aem', 'live', 7, 'published<br>pages', False),
]

GROUPS = {  # container id: (title, first major, last major, first band, last band)
    'g_machine': (None, 0, 8, 1, 2),
    'g_adobe': ('Adobe cloud', 0, 4, 3, 4),
    'g_code': ('Code and content', 5, 8, 3, 4),
}

NOTES = {
    'machine': ('On the SC\'s machine', [
        'Passwords and keys stay in VS Code\'s secret store.',
        'Shared project files carry no credentials.',
        'Adding support for something is usually a catalog row, not new code.',
    ]),
    'cloud': ('In the cloud', [
        'Everything created here has a reverse:',
        'reset and delete take it back off the internet.',
    ]),
}

# --- geometry ------------------------------------------------------------
# Layered: major = x, band = y.  Columns: major = y, band = x.
PITCH = {'layered': 280, 'columns': 130}
SPLIT_GAP = {'layered': 60, 'columns': 100}   # extra gap between Adobe and code groups
MAJOR0 = {'layered': 320, 'columns': 180}
# band -> (start, size) along the minor axis
BANDS = {
    'layered': {1: (220, 80), 2: (420, 80), 3: (720, 80), 4: (960, 80)},
    'columns': {1: (380, 200), 2: (840, 220), 3: (1340, 200), 4: (1800, 200)},
}


def major_start(layout, m):
    return MAJOR0[layout] + m * PITCH[layout] + (SPLIT_GAP[layout] if m >= 5 else 0)


def major_len(layout, m, span):
    base = BOX_W if layout == 'layered' else BOX_H
    return major_start(layout, m + span - 1) + base - major_start(layout, m)


def major_center(layout, m):
    base = BOX_W if layout == 'layered' else BOX_H
    return major_start(layout, m) + base / 2


def rect(layout, m, band, span):
    a, alen = major_start(layout, m), major_len(layout, m, span)
    b, blen = BANDS[layout][band]
    if layout == 'layered':
        return {'x': a, 'y': b, 'w': alen, 'h': blen}
    return {'x': b, 'y': a, 'w': blen, 'h': alen}


def box_text(title, sub):
    s = f'<p style="font-size:10pt;{FONT};text-align:center">{title}'
    if sub:
        s += f'<br><span style="font-size:6pt">({sub})</span>'
    return s + '</p>'


def label(text):
    return (f'<p style="font-size:8pt;{FONT};font-weight:bold;color:#333333;'
            f'text-align:center">{text}</p>')


def box(sid, bb, text):
    return {
        'id': sid, 'type': 'rectangle', 'boundingBox': bb, 'text': text,
        'style': {'fill': {'type': 'color', 'color': '#FFFFFF'},
                  'stroke': {'color': '#000000', 'width': 2,
                             'style': 'solid'}},
    }


def text_shape(sid, bb, html):
    return {'id': sid, 'type': 'text', 'boundingBox': bb, 'text': html}


def rel(layout, along, across):
    """Relative endpoint position given (along major, across band) fractions."""
    if layout == 'layered':
        return {'x': along, 'y': across}
    return {'x': across, 'y': along}


def build(layout):
    shapes, lines, geo, titles = [], [], {}, []

    for gid, (title, m0, m1, b0, b1) in GROUPS.items():
        lo, hi = rect(layout, m0, b0, 1), rect(layout, m1, b1, 1)
        pad, foot = 30, (70 if title else 30)   # room for a title along the bottom
        bb = {'x': lo['x'] - pad, 'y': lo['y'] - pad,
              'w': hi['x'] + hi['w'] - lo['x'] + 2 * pad,
              'h': hi['y'] + hi['h'] - lo['y'] + pad + foot}
        shapes.append({'id': gid, 'type': 'rectangleContainer', 'boundingBox': bb,
                       'style': {'fill': {'type': 'color', 'color': '#FFFFFF00'},
                                 'stroke': {'color': '#000000', 'width': 2,
                                            'style': 'solid'}}})
        geo[gid] = bb
        if title:  # Lucid's containerTitle renders as a black tag; plain text matches the reference
            titles.append(text_shape(
                f'{gid}_title',
                {'x': bb['x'] + 15, 'y': bb['y'] + bb['h'] - 45, 'w': 220, 'h': 35},
                f'<p style="font-size:10pt;{FONT};font-weight:bold;text-align:left">{title}</p>'))

    for nid, (title, sub, m, band, span) in NODES.items():
        bb = rect(layout, m, band, span)
        geo[nid] = (bb, m, band, span)
        shapes.append(box(nid, bb, box_text(title, sub)))
    shapes.extend(titles)

    # The SC, as a plain bold label above (layered) or left of (columns) the machine.
    if layout == 'layered':
        sc_bb = {'x': major_center(layout, 4) - 100, 'y': 40, 'w': 200, 'h': 50}
    else:
        sc_bb = {'x': 40, 'y': major_center(layout, 4) - 25, 'w': 200, 'h': 50}
    shapes.append(box('sc', sc_bb, box_text('The SC', 'Solution Consultant')))

    def edge_pos(nid, m, toward_higher_band):
        bb, m0, band, span = geo[nid]
        start = major_start(layout, m0)
        along = (major_center(layout, m) - start) / major_len(layout, m0, span)
        return rel(layout, round(along, 4), 1 if toward_higher_band else 0)

    def line(lid, a, b, pa, pb, text, both, kind='straight', lpos=0.5):
        ln = {'id': lid, 'lineType': kind,
              'endpoint1': {'type': 'shapeEndpoint', 'style': 'arrow' if both else 'none',
                            'shapeId': a, 'position': pa},
              'endpoint2': {'type': 'shapeEndpoint', 'style': 'arrow',
                            'shapeId': b, 'position': pb},
              'stroke': {'color': LINE, 'width': 1, 'style': 'solid'}}
        if text:
            ln['text'] = [{'text': label(text), 'position': lpos, 'side': 'middle'}]
        lines.append(ln)

    def band_edge(nid, far):
        bb = geo[nid][0]
        if layout == 'layered':
            return bb['y'] + (bb['h'] if far else 0)
        return bb['x'] + (bb['w'] if far else 0)

    for i, (a, b, m, text, both) in enumerate(STRAIGHT):
        ba, bb_ = geo[a][2], geo[b][2]
        down = bb_ > ba
        pa, pb = edge_pos(a, m, down), edge_pos(b, m, not down)
        # Put the label in the middle of the gap right after the upper box.
        upper, lower = (a, b) if down else (b, a)
        u_end = band_edge(upper, True)
        next_band = BANDS[layout][geo[upper][2] + 1][0]
        target = (u_end + next_band) / 2
        start, end = band_edge(a, down), band_edge(b, not down)
        lpos = round((target - start) / (end - start), 3)
        line(f'e{i}', a, b, pa, pb, text, both, lpos=lpos)

    # SC uses the screens and the agent.
    for lid, nid, along, text in (('sc1', 'screens', 0.3, 'clicks'),
                                  ('sc2', 'agent', 0.7, 'asks')):
        line(lid, 'sc', nid, rel(layout, along, 1), rel(layout, 0.5, 0), text,
             False, kind='elbow')

    # Code reaches the live site through AEM Code Sync.
    line('codesync', 'github', 'live', rel(layout, 0.5, 1), rel(layout, 0, 0.5),
         'code (AEM Code Sync)', False, kind='elbow', lpos=0.3)

    # Margin notes, one per group of bands.
    for key, bands in (('machine', (1, 2)), ('cloud', (3, 4))):
        title, items = NOTES[key]
        html = (f'<p style="font-size:10pt;{FONT};font-weight:bold;text-align:left">'
                f'{title}</p><p style="font-size:7pt;{FONT};text-align:left">'
                + '<br>'.join(items) + '</p>')
        b0, b1 = BANDS[layout][bands[0]], BANDS[layout][bands[1]]
        if layout == 'layered':
            bb = {'x': 20, 'y': b0[0], 'w': 230, 'h': b1[0] + b1[1] - b0[0]}
        else:
            last = major_start(layout, 8) + BOX_H + 120
            bb = {'x': b0[0], 'y': last, 'w': b1[0] + b1[1] - b0[0], 'h': 90}
        shapes.append(text_shape(f'note_{key}', bb, html))

    return {'version': 1, 'pages': [{'id': 'p1', 'title': 'Overview', 'shapes': shapes,
                                     'lines': lines}]}


if __name__ == '__main__':
    out = sys.argv[1]
    for layout in ('layered', 'columns'):
        with open(f'{out}/d1-{layout}.json', 'w') as f:
            json.dump(build(layout), f, indent=1)
        print(out, layout)
