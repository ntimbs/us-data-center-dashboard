"""Check catalogue, legislative, and runtime precinct source URLs using HTTP GET.

Run from any directory: python3 scripts/check_source_links.py
Writes dist/sources/link-checks.csv. Requires internet access, no dependencies.
A successful response is not a license or a full validation of remote data.
Further requests stop after five host denials; in-flight requests may finish.
The remaining URLs are unverified.
Only the first 12 KB of each response are read. Alternate manual verification
belongs in SOURCE_AUDIT.md; do not overwrite HTTP failures with assumed success.
"""
from datetime import date
CHECKED=date.today().isoformat()
import json,csv,time,threading,urllib.request,urllib.error,concurrent.futures,re
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/sources'
cat=json.loads((ROOT/'dist/sources/catalog.json').read_text())
urls={}
for s in cat['sources']:
 for x in s['links']:
  if x['url'].startswith('http'): urls.setdefault(x['url'],set()).add('catalog:'+s['id'])
for b in csv.DictReader((ROOT/'dist/sources/legislation-sources.csv').open()):urls.setdefault(b['source_url'],set()).add('bill')
# Source references explicitly linked in the application but not yet in the catalogue.
urls.setdefault('https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html',set()).add('app-reference')
manifest=json.loads((ROOT/'dist/votes/manifest.json').read_text())
for state in manifest['states']:
 url=f'https://int.nyt.com/newsgraphics/elections/map-data/2024/national/{state}-precincts-with-results.topojson.gz'
 urls.setdefault(url,set()).add('runtime-precinct:'+state)
lock=threading.Lock(); gates={}; failures={}
def check(item):
 url,contexts=item;host=urlsplit(url).netloc
 with lock: gate=gates.setdefault(host,threading.Semaphore(2))
 with gate:
  with lock: blocked=failures.get(host,0)>=5
  if blocked:return dict(url=url,contexts=';'.join(sorted(contexts)),status='not_tested_host_blocked',http_status='',final_url='',note='Further requests stopped after five access denials or rate limits from this host.',checked=CHECKED)
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; SourceLinkAudit/1.0)','Accept':'*/*'})
   with urllib.request.urlopen(req,timeout=18) as r:
    body=r.read(12000);code=r.status;final=r.url;ctype=r.headers.get('Content-Type','')
   txt=body.decode('utf-8',errors='replace'); title=re.search(r'<title[^>]*>(.*?)</title>',txt,re.S|re.I)
   title=re.sub(r'\s+',' ',title.group(1)).strip()[:180] if title else ''
   if any(c.startswith('runtime-precinct:') for c in contexts) and body[:2]!=b'\x1f\x8b':
    return dict(url=url,contexts=';'.join(sorted(contexts)),status='unexpected_content',http_status=code,final_url=final,note='Runtime feed did not begin with a gzip header.',checked=CHECKED)
   suspicious=bool(re.search(r'(just a moment|access denied|verify you are human|page not found|404 not found)',title,re.I))
   return dict(url=url,contexts=';'.join(sorted(contexts)),status='challenge_or_error_page' if suspicious else 'http_ok',http_status=code,final_url=final,note=title or ctype,checked=CHECKED)
  except urllib.error.HTTPError as e:
   if e.code in (401,403,429):
    with lock:failures[host]=failures.get(host,0)+1
   return dict(url=url,contexts=';'.join(sorted(contexts)),status='http_error',http_status=e.code,final_url=e.url,note=str(e),checked=CHECKED)
  except Exception as e:return dict(url=url,contexts=';'.join(sorted(contexts)),status='request_failed',http_status='',final_url='',note=str(e)[:200],checked=CHECKED)
  finally:
   if host=='legiscan.com':time.sleep(.25)
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for row in pool.map(check,sorted(urls.items())):
  rows.append(row)
  if len(rows)%100==0:print('Processed',len(rows),'of',len(urls),flush=True)
with (OUT/'link-checks.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
from collections import Counter
print('RESULTS',len(rows),dict(Counter(r['status'] for r in rows)),dict(Counter(str(r['http_status']) for r in rows)),flush=True)
for r in rows:
 if r['status']!='http_ok' and 'bill' not in r['contexts']:print(r['http_status'],r['url'],r['note'],flush=True)
