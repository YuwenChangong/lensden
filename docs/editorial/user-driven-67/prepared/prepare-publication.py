"""Local editorial asset assembly; never connects to a provider or publishes."""
import csv, hashlib, html, json, re, shutil
from pathlib import Path

base=Path(__file__).resolve().parent
root=base.parents[3]
assets=root/'public'/'news-images'
assets.mkdir(parents=True,exist_ok=True)
rows=json.loads((base/'batch-01-drafts.json').read_text(encoding='utf-8'))
rows[4]['summary']='An Air 4 Pro owner later reported that connecting the required power cable resolved the adapter heat problem. Separate that update from fit and audio questions.'
rows[5]['content']+='\n\nCompare the device classes in the [Lensden model checklist](/guides/ar-ai-glasses-specifications-compatibility/).'
diagrams=[
('Source scaling','Readable text','Colour sample','Second source'),
('Centre visible','Top edge','Bottom edge','Frame position'),
('Centre distortion','Supported fit','Second source','Support record'),
('Large workspace','Readable type','Visible corners','Useful size'),
('Physical M or L','Measured IPD','OSD setting','Actual fit'),
('Coloured text','Neutral sample','Ultrawide mode','Cause unknown'),
('Demo hardware','Retail model','Own prescription','Return terms'),
('Travel task','Readable session','Power chain','Fallback screen'),
('Initial position','Ordinary movement','Nose slip','Clarity changes'),
('Frame pressure','Supported fit','Session comfort','Stop if painful'),
('Frame price','Correct insert','Optical quote','Complete budget'),
('Prescription','Correct carrier','Cylinder needs','Optician check'),
('Activity log','Discomfort','Stop session','Seek advice'),
('Reclined position','Screen mode','Recenter','Visible edges'),
('Ordinary frames','Clearance','Correct insert','Supported fit'),
('Original Switch game','Boost mode','Video path','Power path'),
('Video signal','Audio output','Adapter support','Glasses speakers'),
('PS5 HDMI out','Powered converter','Old Beam','Original Air'),
('Picture starts','Minutes pass','Signal lost','Cause unknown'),
('Historical adapter','Exact revision','Source mode','Current support'),
('Handheld only','Glasses attached','Same activity','Battery context'),
('Charger rating','Hub limit','Display output','Handheld demand'),
('Recorded frames','Playback timing','Display refresh','Different rates'),
('Transport turns','Anchor behaviour','Recenter','Comfort check'),
('Real 3D toggle','DeX context','Black screen','Fix unverified'),
('Direct PC display','Beam Pro path','Tearing report','Version context'),
('Remote computer','Network path','Decoded stream','Display path'),
('App version','Requested permission','Needed feature','User choice'),
('PC desktop','Two streams','Two Android apps','Not two monitors'),
('Last frame held','Black screen','Source state','Support evidence'),
('Stored glasses','Companion app','Reconnection','Files retained'),
('Glasses capture','Wi-Fi transfer','Foreground state','Playable file'),
('Before departure','App readiness','Offline capability','Fallback access'),
('First pair','Account rules','Second pair','Policy unknown'),
('Air 4 Pro fit','Bottom edge','Readable task','Personal result'),
('Wake phrase','Recognition','Online request','Spoken answer'),
('Phone audio route','Wireless V3','Wired Air','Different paths'),
('Image impression','Nose pressure','Supported fit','Session comfort'),
('One or One Pro','Text task','Optical fit','No universal winner'),
('First unit','Replacement unit','Different symptoms','No failure rate'),
('Screen off','Input lock','Power behaviour','Separate controls'),
('Apple device','USB-C video','Direct display','Optional software'),
('Update report','Initial workaround','Later recurrence','Fix withdrawn'),
('Spatial anchor','Vertical position','Recenter option','Build context'),
('Basic video','Supported host','Optional app','Regional availability'),
('Camera warning','Exact generation','Build unknown','Supported support'),
('Media volume','Alert volume','Adaptive setting','Different controls'),
('App storage','Downloaded media','Possible cache','Cause unknown'),
('Capture choice','Visible indicator','Bystander context','Respectful consent'),
('Music session','Capture session','Charging breaks','Different runtime'),
('Glasses footage','Phone import','Open copied file','Then reset decision'),
('Required task','Phone ecosystem','Supported integration','Fallback task'),
('Speaker phrase','Translation delay','Wait for turn','Confirm meaning'),
('Language list','Available download','Installed pack','Offline check'),
('Wake heard?','Words recognised?','Request succeeds?','Reply audible?'),
('Connection works','Answer arrives','Current source?','Verify fact'),
('Speech input','Translated line','Display timing','Conversation turn'),
('Local capture','Phone import','Cloud feature','Public sharing'),
('Smart frame','Prescription quote','Future lenses','Supported service'),
('Arrival condition','Ordinary tasks','Playable backup','Return terms'),
]
assert len(diagrams)==60
for row in rows:
    slug=row['slug']
    for ext in ('svg','png'):
        src=base.parent/'illustrations'/f'{slug}.{ext}'
        if ext=='svg':
            assert not re.search(r'<script|onload=|<foreignObject|https?://(?!www.w3.org)',src.read_text(encoding='utf-8'),re.I)
        shutil.copyfile(src,assets/src.name)
    row['illustration_alt']='Conceptual glasses illustration: '+row['title']+'. Not a product photo.'
    row['illustration_license']='Owner-supplied original; publication authorized'

for idx,p in enumerate(sorted((base/'articles').glob('[0-9][0-9]-*.md')),8):
    text=p.read_text(encoding='utf-8')
    title,content=text.split('\n',1)
    title=title.removeprefix('# ').strip()
    content=content.strip()
    slug=p.stem[3:]
    labels=diagrams[idx-8]
    alt='Conceptual decision diagram: '+'; '.join(labels)+'. Not a product photograph.'
    esc=html.escape
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc"><title id="title">{esc(title)}</title><desc id="desc">{esc(alt)}</desc><rect width="1200" height="630" fill="#111519"/><text x="64" y="74" font-family="Arial,sans-serif" font-size="24" fill="#8edac9">LENSDEN / EVIDENCE AND EVERYDAY USE</text>'
    words=title.split();lines=[];line=''
    for word in words:
        if len(line+' '+word)>48: lines.append(line);line=word
        else: line=(line+' '+word).strip()
    lines.append(line)
    for n,line in enumerate(lines): svg+=f'<text x="64" y="{135+n*48}" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#f5f7f8">{esc(line)}</text>'
    for n,label in enumerate(labels):
        x=64+n*278
        svg+=f'<rect x="{x}" y="320" width="250" height="120" rx="16" fill="#1b282d" stroke="#62c9b1" stroke-width="2"/><text x="{x+125}" y="355" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#9bb0b8">{n+1:02}</text><text x="{x+125}" y="396" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#f5f7f8">{esc(label)}</text>'
        if n<3: svg+=f'<path d="M{x+257} 380 h14 m-5 -5 5 5 -5 5" fill="none" stroke="#9bb0b8" stroke-width="2"/>'
    svg+='<text x="64" y="550" font-family="Arial,sans-serif" font-size="22" fill="#acbcc4">Keep the model, software and reported outcome together.</text><text x="64" y="592" font-family="Arial,sans-serif" font-size="18" fill="#62c9b1">ORIGINAL CONCEPTUAL ILLUSTRATION / NOT A PRODUCT PHOTO OR TEST RESULT</text></svg>'
    (assets/f'{slug}.svg').write_text(svg,encoding='utf-8')
    external=re.findall(r'\[[^\]]+\]\((https://[^)]+)\)',content)
    plain=re.sub(r'\[([^\]]+)\]\([^)]+\)',r'\1',content.split('\n\n')[0])
    summary=plain.split('. ')[0]+'.'
    if len(summary)>270: summary=plain[:265].rsplit(' ',1)[0]+'…'
    category='ai_glasses' if idx in list(range(38,42))+[43,44]+list(range(53,68)) else 'ar_glasses'
    if idx in [34,35,36,49,52]:category='developer'
    rows.append(dict(slug=slug,title=title,summary=summary,content=content,category=category,source_name='Lensden Editorial',source_url=external[0],cover_image_url=f'https://lensden.net/news-images/{slug}.svg',status='draft',published_at=None,author_id=None,featured=False,pinned=False,illustration_alt=alt,illustration_license='Original Lensden editorial SVG created for this article'))

assert len(rows)==67
assert len({r['slug'] for r in rows})==67
receipt=[];links=[]
for i,row in enumerate(rows,1):
    # The existing cover component supplies title alt; SVG itself adds a full description.
    content=row['content']
    visible=re.sub(r'\[([^\]]+)\]\([^)]+\)',r'\1',content)
    words=len(re.findall(r"\b[\w’-]+\b",visible))
    assert 350<=words<=650,(i,words)
    assert 4<=len(row['title'])<=180 and len(row['summary'])<=280
    assert not re.search(r'(?im)^\|.*\||\*\*|<script|commissioning|approval pending|prepared for publication',content),(i,'markup/preparation')
    assert re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*',row['slug'])
    assert (assets/row['cover_image_url'].rsplit('/',1)[1]).is_file()
    row['editorial_id']=i
    # Separate raster cover and vector body illustration fit the existing News renderer.
    # That renderer excludes a body image with exactly the same URL as the cover.
    image_url=f"https://lensden.net/news-images/{row['slug']}.svg"
    row['cover_image_url']=f"https://lensden.net/news-images/{row['slug']}.png"
    row['content']=f"![{row['illustration_alt']}]({image_url})\n\n"+content
    receipt.append(dict(id=i,slug=row['slug'],words=words,researched=True,written=True,edited=True,illustrated=True,published=False,externally_promoted=False,public_url='',published_at='',body_sha256=hashlib.sha256(row['content'].encode()).hexdigest()))
    for url in dict.fromkeys(re.findall(r'\[[^\]]+\]\(([^)]+)\)',content)):
        links.append(dict(id=i,slug=row['slug'],url=url,kind='internal' if url.startswith('/') else 'external',context='Cited in reviewed manuscript; source-specific model and outcome limits retained'))
(base/'all-67-drafts.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for filename,data in [('progress.csv',receipt),('article-source-links.csv',links)]:
    with (base/filename).open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(data[0]));w.writeheader();w.writerows(data)
(base/'local-editorial-checks.json').write_text(json.dumps(dict(target=67,articles=len(rows),words_min=min(r['words'] for r in receipt),words_max=max(r['words'] for r in receipt),unique_slugs=67,source_links=len(links),assets=sum(1 for _ in assets.iterdir()),published=0,checks='Content lengths, unique URLs, renderer-compatible markup, source URLs, local asset existence; not proof of publication or search indexing'),indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(articles=len(rows),assets=sum(1 for _ in assets.iterdir()),words_min=min(r['words'] for r in receipt),words_max=max(r['words'] for r in receipt))))
