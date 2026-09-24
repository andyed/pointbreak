# Usage: python3 scripts/analyze_classic_wave.py [outdir]
from pathlib import Path
import json
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else 'qa/classic-motion-2026-09-15').resolve()
j=json.loads((ROOT/'motion.json').read_text())
arms=['default','first-classic','revised-classic']
index={(r['arm'],r['t'],r['x']):r for r in j['rows']}
# The same source stations and clocks enter every arm. Never let an arm's
# improvement remove its difficult samples from its own evaluation set.
keys=[(r['t'],r['x']) for r in j['rows'] if r['arm']=='first-classic' and r['active'] and r['curl']>27]
summary={}
for arm in arms:
    rows=[index[arm,t,x] for t,x in keys]
    summary[arm]={'matched_lip_samples':len(rows)}
    for key in ['fold','stray','flatFold','reach','drop','extent','curl','crest']:
        a=np.array([r[key] for r in rows])
        summary[arm][key]={'median':float(np.median(a)),'p90':float(np.percentile(a,90)),'max':float(a.max())}
active_keys=[(r['t'],r['x']) for r in j['rows'] if r['arm']=='first-classic' and r['active']]
for arm in arms:
    rows=[index[arm,t,x] for t,x in active_keys]
    summary[arm]['active_samples']=len(rows)
    summary[arm]['strong_turn_samples']=sum(r['curl']>27 for r in rows)
    summary[arm]['outside_turn_fold_p90']=float(np.percentile([r['stray'] for r in rows],90))
assert all(abs(index['first-classic',t,x]['crest']-index['revised-classic',t,x]['crest'])<1e-4 for t,x in active_keys)
assert all(abs(index['first-classic',t,x]['curl']-index['revised-classic',t,x]['curl'])<1e-4 for t,x in active_keys)
(ROOT/'summary.json').write_text(json.dumps({'matched_keys':keys,'summary':summary},indent=2))

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,2,figsize=(12,4.8),gridspec_kw={'width_ratios':[1.2,1]},layout='constrained')
colors={'default':'#687580','first-classic':'#bb5436','revised-classic':'#087e8b'}
labels={'default':'Default','first-classic':'First classic','revised-classic':'Revised classic'}
for arm in arms:
    tr=next(a for a in j['traces'][arm] if a['t']==48)
    s=[a for a in tr['s'] if -245<a['z0']<-212]
    axes[0].plot([a['z'] for a in s],[a['y'] for a in s],color=colors[arm],label=labels[arm],lw=2)
axes[0].set(xlim=(-246,-207),ylim=(0,12),xlabel='Shoreward position (model m)',ylabel='Rendered height (model m)',title='The shelf contracts; the curl is still shallow')
axes[0].set_aspect('equal',adjustable='box');axes[0].legend(loc='upper right',frameon=False,fontsize=9)
axes[0].grid(alpha=.15)
metrics=[('reach','Fold reach'),('flatFold','Nearly flat portion'),('extent','Vertical extent')]
x=np.arange(len(metrics));width=.35
for k,arm in enumerate(arms[1:]):
    vals=[summary[arm][m]['median'] for m,l in metrics]
    bars=axes[1].bar(x+(k-.5)*width,vals,width,color=colors[arm],label=labels[arm])
    axes[1].bar_label(bars,fmt='%.2f',padding=4,fontsize=10)
axes[1].set(xticks=x,xticklabels=[l for m,l in metrics],ylim=(0,11.8),ylabel='Median length (model m)',title='27 matched samples during active curl')
axes[1].legend(frameon=False);axes[1].grid(axis='y',alpha=.15);axes[1].set_axisbelow(True)
fig.suptitle('Pointbreak · measured progress across a 16-second window',fontsize=16,fontweight='bold')
fig.supxlabel('Left: GPU source transect x = −52, t = 48 s, projected into z/height. Heights include the renderer’s exaggeration.\nRight: same clocks and stations in both arms; these are model diagnostics, not field-video residuals.',fontsize=10)
fig.savefig(ROOT/'progress.png',dpi=160)
print(json.dumps(summary,indent=2))
